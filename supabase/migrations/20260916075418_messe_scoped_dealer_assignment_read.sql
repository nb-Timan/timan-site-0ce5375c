-- Messe users cannot read dealer_accounts directly. Keep the follow-up form
-- on the canonical dealer assignment by exposing only the selected seller's
-- active dealer options and the country values needed to filter them.
create or replace function public.list_messe_dealer_countries()
returns table(country text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
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

  return query
  select distinct da.country
  from public.dealer_accounts da
  join public.app_users seller
    on seller.id = da.assigned_seller_id
   and seller.is_active = true
   and seller.approved = true
   and lower(seller.status) in ('active', 'approved')
   and seller.portal_role::text in ('timan_seller', 'timan_backend')
  where coalesce(da.is_deleted, false) = false
    and coalesce(da.is_blocked, false) = false
    and coalesce(da.is_active, true) = true
    and nullif(trim(coalesce(da.country, '')), '') is not null
  order by da.country;
end;
$$;

revoke all on function public.list_messe_dealer_countries() from public, anon;
grant execute on function public.list_messe_dealer_countries() to authenticated;

create or replace function public.list_messe_dealer_accounts_for_seller(
  p_seller_id uuid
)
returns table(
  id uuid,
  account_number text,
  company_name text,
  country text,
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
  order by da.company_name, da.account_number;
end;
$$;

revoke all on function public.list_messe_dealer_accounts_for_seller(uuid) from public, anon;
grant execute on function public.list_messe_dealer_accounts_for_seller(uuid) to authenticated;
