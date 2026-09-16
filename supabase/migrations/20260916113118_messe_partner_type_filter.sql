-- Messe follow-up may link only a canonical partner account. This keeps
-- Forhandlerkunder and all CRM-only/internal account types out of both the
-- limited lookup and forged lead inserts without broadening Messe access.

create schema if not exists private;

create or replace function private.messe_partner_type_for_account(p_account_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case regexp_replace(
      lower(replace(replace(replace(
        coalesce(
          nullif(trim(da.customer_type_label), ''),
          nullif(trim(da.customer_type), ''),
          nullif(trim(da.dealer_type), ''),
          ''
        ),
        'ø', 'oe'
      ), 'æ', 'ae'), 'å', 'aa')),
      '[^a-z0-9]+', '', 'g'
    )
      when 'dealer' then 'dealer'
      when 'forhandler' then 'dealer'
      when 'servicepartner' then 'service_partner'
      when 'service' then 'service_partner'
      when 'importer' then 'importer'
      when 'importoer' then 'importer'
      when 'importor' then 'importer'
      when 'supplier' then 'supplier'
      when 'leverandoer' then 'supplier'
      when 'leverandoermv' then 'supplier'
      when 'leverandormv' then 'supplier'
      when 'dealercustomer' then 'dealer_customer'
      when 'forhandlerkunde' then 'dealer_customer'
      else 'other_partner'
    end
    from public.dealer_accounts da
    where da.id = p_account_id
  ), 'other_partner');
$$;

revoke all on function private.messe_partner_type_for_account(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.messe_partner_type_for_account(uuid) to authenticated;

drop function if exists public.list_messe_dealer_accounts_for_seller(uuid);
create function public.list_messe_dealer_accounts_for_seller(
  p_seller_id uuid
)
returns table(
  id uuid,
  account_number text,
  company_name text,
  country text,
  partner_type text,
  assigned_seller_id uuid,
  assigned_seller_initials text,
  assigned_seller_name text,
  assigned_seller_email text,
  is_active boolean,
  is_blocked boolean,
  is_deleted boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_seller_id is null then
    return;
  end if;
  if not exists (
    select 1
    from public.app_users actor
    where actor.auth_user_id = (select auth.uid())
      and actor.is_active = true
      and actor.approved = true
      and lower(actor.status) in ('active', 'approved')
      and (
        lower(coalesce(actor.portal_variant, '')) = 'messe'
        or actor.portal_role::text = 'exhibition_user'
        or actor.portal_role::text in ('timan_backend', 'timan_seller', 'timan_service')
        or 'messe_portal' = any(actor.allowed_modules)
        or 'messe_portal' = any(actor.module_access)
      )
  ) then
    return;
  end if;
  if not exists (
    select 1
    from public.app_users seller
    where seller.id = p_seller_id
      and seller.is_active = true
      and seller.approved = true
      and lower(seller.status) in ('active', 'approved')
      and seller.portal_role::text in ('timan_seller', 'timan_backend')
  ) then
    return;
  end if;

  return query
  select
    da.id,
    da.account_number,
    da.company_name,
    da.country,
    private.messe_partner_type_for_account(da.id) as partner_type,
    da.assigned_seller_id,
    da.assigned_seller_initials,
    da.assigned_seller_name,
    da.assigned_seller_email,
    coalesce(da.is_active, true) as is_active,
    coalesce(da.is_blocked, false) as is_blocked,
    coalesce(da.is_deleted, false) as is_deleted
  from public.dealer_accounts da
  where da.assigned_seller_id = p_seller_id
    and coalesce(da.is_deleted, false) = false
    and coalesce(da.is_blocked, false) = false
    and coalesce(da.is_active, true) = true
    and private.messe_partner_type_for_account(da.id) in (
      'dealer', 'service_partner', 'importer', 'supplier'
    )
  order by da.company_name, da.account_number;
end;
$$;

revoke all on function public.list_messe_dealer_accounts_for_seller(uuid) from public, anon;
grant execute on function public.list_messe_dealer_accounts_for_seller(uuid) to authenticated;

create or replace function private.can_messe_actor_assign_crm_lead(
  p_owner_user_id uuid,
  p_owner_email text,
  p_linked_dealer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.app_users actor
      where actor.auth_user_id = (select auth.uid())
        and actor.is_active = true
        and actor.approved = true
        and lower(actor.status) in ('active', 'approved')
        and (
          lower(coalesce(actor.portal_variant, '')) = 'messe'
          or actor.portal_role::text = 'exhibition_user'
        )
    )
    and exists (
      select 1
      from public.app_users seller
      where seller.id = p_owner_user_id
        and seller.is_active = true
        and seller.approved = true
        and lower(seller.status) in ('active', 'approved')
        and seller.portal_role::text in ('timan_seller', 'timan_backend')
        and (
          p_owner_email is null
          or lower(trim(p_owner_email)) = lower(trim(coalesce(seller.email, '')))
        )
    )
    and (
      p_linked_dealer_id is null
      or exists (
        select 1
        from public.dealer_accounts dealer
        where dealer.id = p_linked_dealer_id
          and dealer.assigned_seller_id = p_owner_user_id
          and coalesce(dealer.is_active, true) = true
          and coalesce(dealer.is_deleted, false) = false
          and coalesce(dealer.is_blocked, false) = false
          and private.messe_partner_type_for_account(dealer.id) in (
            'dealer', 'service_partner', 'importer', 'supplier'
          )
      )
    );
$$;

revoke all on function private.can_messe_actor_assign_crm_lead(uuid, text, uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.can_messe_actor_assign_crm_lead(uuid, text, uuid) to authenticated;

create or replace function public.enforce_messe_lead_country_seller_eligibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_country text := lower(trim(coalesce(new.country, '')));
  seller_initials text;
  seller_role text;
  dealer_country text;
  is_messe_actor boolean := false;
begin
  select exists (
    select 1
    from public.app_users actor
    where actor.auth_user_id = (select auth.uid())
      and actor.is_active = true
      and actor.approved = true
      and lower(actor.status) in ('active', 'approved')
      and (
        lower(coalesce(actor.portal_variant, '')) = 'messe'
        or actor.portal_role::text = 'exhibition_user'
      )
  ) into is_messe_actor;

  if not is_messe_actor
    and lower(trim(coalesce(new.trade_fair, ''))) not in ('messe / exhibition', 'messe / udstilling') then
    return new;
  end if;

  select upper(trim(seller.initials)), seller.portal_role::text
  into seller_initials, seller_role
  from public.app_users seller
  where seller.id = new.owner_user_id
    and seller.is_active = true
    and seller.approved = true
    and lower(seller.status) in ('active', 'approved');

  if seller_initials is null or seller_role not in ('timan_seller', 'timan_backend') then
    raise exception 'Messe lead requires an active assignable Timan seller.'
      using errcode = '23514';
  end if;

  if selected_country in ('germany', 'deutschland', 'tyskland', 'de')
    and seller_initials not in ('AKR', 'JTN') then
    raise exception 'Messe leads for Germany require seller AKR or JTN.'
      using errcode = '23514';
  end if;

  if selected_country in ('denmark', 'danmark', 'dk')
    and seller_initials <> 'EM' then
    raise exception 'Messe leads for Denmark require seller EM.'
      using errcode = '23514';
  end if;

  if new.linked_dealer_id is not null then
    select lower(trim(coalesce(dealer.country, '')))
    into dealer_country
    from public.dealer_accounts dealer
    where dealer.id = new.linked_dealer_id
      and dealer.assigned_seller_id = new.owner_user_id
      and coalesce(dealer.is_deleted, false) = false
      and coalesce(dealer.is_blocked, false) = false
      and private.messe_partner_type_for_account(dealer.id) in (
        'dealer', 'service_partner', 'importer', 'supplier'
      );

    if dealer_country is null then
      raise exception 'Messe lead dealer must be an active selectable partner assigned to the selected Timan seller.'
        using errcode = '23514';
    end if;

    if selected_country in ('germany', 'deutschland', 'tyskland', 'de')
      and dealer_country not in ('germany', 'deutschland', 'tyskland', 'de') then
      raise exception 'Messe lead dealer must match the selected country.'
        using errcode = '23514';
    end if;

    if selected_country in ('denmark', 'danmark', 'dk')
      and dealer_country not in ('denmark', 'danmark', 'dk') then
      raise exception 'Messe lead dealer must match the selected country.'
        using errcode = '23514';
    end if;

    if selected_country not in ('', 'germany', 'deutschland', 'tyskland', 'de', 'denmark', 'danmark', 'dk')
      and dealer_country <> selected_country then
      raise exception 'Messe lead dealer must match the selected country.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_messe_lead_country_seller_eligibility() from public, anon, authenticated;
