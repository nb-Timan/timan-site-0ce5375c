-- Normal Partnerdata maintenance belongs to every active, approved internal
-- Timan employee who has Partnerdata area access. Account ownership continues
-- to scope CRM/Mine forhandlere, but is not a Partnerdata write boundary.

create or replace function public.can_maintain_partnerdata_as(
  p_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users actor
    where actor.id = p_actor_id
      and coalesce(actor.approved, false) = true
      and coalesce(actor.is_active, false) = true
      and actor.portal_role::text in ('timan_backend', 'timan_seller', 'timan_service')
      and (
        actor.portal_role::text = 'timan_backend'
        or case
          when actor.allowed_areas is not null
            then 'dealer_data' = any(actor.allowed_areas)
          when actor.allowed_modules is not null
            then 'dealer_data' = any(actor.allowed_modules)
          when actor.module_access is not null
            then 'dealer_data' = any(actor.module_access)
          else true
        end
      )
  );
$$;

comment on function public.can_maintain_partnerdata_as(uuid) is
  'Canonical Partnerdata maintenance capability for active internal Timan employees with Partnerdata access.';

create or replace function public.can_maintain_partnerdata()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.current_timan_app_user() actor
    where public.can_maintain_partnerdata_as(actor.id)
  );
$$;

comment on function public.can_maintain_partnerdata() is
  'Authenticated-session wrapper for the canonical internal Partnerdata maintenance capability.';

-- A Backend View-as session may resolve any active canonical portal user.
-- Authorization is still evaluated from that effective user below, so an
-- external preview never inherits the authenticated Backend actor's scope.
create or replace function public.partnerdata_effective_actor_id(
  p_effective_user_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor public.app_users%rowtype;
  v_effective public.app_users%rowtype;
begin
  select au.* into v_actor
  from public.app_users au
  join public.current_timan_app_user() current_actor on current_actor.id = au.id;

  if not found then
    raise exception 'Authenticated Timan portal user not found'
      using errcode = '42501';
  end if;

  if p_effective_user_id is null or p_effective_user_id = v_actor.id then
    return v_actor.id;
  end if;

  if coalesce(v_actor.portal_role::text, v_actor.role::text) <> 'timan_backend' then
    raise exception 'Only Timan Backend may use a View-as Partnerdata scope'
      using errcode = '42501';
  end if;

  select * into v_effective
  from public.app_users au
  where au.id = p_effective_user_id
    and coalesce(au.approved, false) = true
    and coalesce(au.is_active, false) = true
    and au.portal_role::text in (
      'timan_backend', 'timan_seller', 'timan_service',
      'timan_dealer', 'timan_importer', 'timan_service_partner',
      'dealer_customer', 'dealer_user'
    );

  if not found then
    raise exception 'Requested View-as Partnerdata user is not active'
      using errcode = '42501';
  end if;

  return v_effective.id;
end;
$$;

create or replace function public.can_edit_partnerdata_account_as(
  p_dealer_account_id uuid,
  p_effective_actor_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dealer_accounts da
    join public.app_users actor on actor.id = p_effective_actor_id
    where da.id = p_dealer_account_id
      and coalesce(actor.approved, false) = true
      and coalesce(actor.is_active, false) = true
      and (
        public.can_maintain_partnerdata_as(actor.id)
        or (
          actor.portal_role::text in (
            'timan_dealer',
            'timan_importer',
            'timan_service_partner',
            'dealer_customer',
            'dealer_user'
          )
          and nullif(trim(actor.dealer_number), '') is not null
          and da.account_number = actor.dealer_number
        )
      )
  );
$$;

-- The established RPC remains the only Partnerdata profile write path. Keep
-- its existing field whitelist and protected financial-field roles unchanged.
create or replace function public.update_partnerdata_account_profile(
  p_dealer_account_id uuid,
  p_patch jsonb,
  p_effective_user_id uuid default null
)
returns public.dealer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_actor_id uuid;
  v_effective_actor_role text;
  v_existing public.dealer_accounts%rowtype;
  v_patch public.dealer_accounts%rowtype;
  v_key text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Partnerdata profile patch must be an object'
      using errcode = '22023';
  end if;

  v_effective_actor_id := public.partnerdata_effective_actor_id(p_effective_user_id);
  select au.portal_role::text into v_effective_actor_role
  from public.app_users au
  where au.id = v_effective_actor_id;

  for v_key in select jsonb_object_keys(p_patch)
  loop
    if not (v_key = any (array[
      'address_line_1', 'postal_code', 'city', 'country',
      'vat_number', 'director_name', 'phone', 'email',
      'primary_contact_name', 'primary_contact_email', 'primary_contact_phone',
      'latitude', 'longitude', 'google_place_id', 'geocoded_at',
      'geocoding_status', 'geocoding_error', 'geocoding_address_hash', 'geocoding_retry_after',
      'finance_contact_name', 'finance_contact_phone', 'finance_contact_email',
      'invoice_email', 'payment_terms_override', 'currency_code',
      'website', 'social_facebook', 'social_linkedin', 'social_tiktok',
      'social_youtube', 'social_instagram',
      'sales_contact_name', 'sales_contact_phone', 'sales_contact_email', 'sales_has_multiple',
      'workshop_contact_name', 'workshop_contact_phone', 'workshop_contact_email', 'workshop_has_multiple',
      'marketing_contact_name', 'marketing_contact_phone', 'marketing_contact_email'
    ]::text[])) then
      raise exception 'Partnerdata field % is not writable through the profile flow', v_key
        using errcode = '42501';
    end if;
    if v_effective_actor_role not in ('timan_backend', 'timan_service')
      and v_key in ('payment_terms_override', 'currency_code') then
      raise exception 'Financial Partnerdata fields require internal Backend access'
        using errcode = '42501';
    end if;
  end loop;

  if not public.can_edit_partnerdata_account_as(p_dealer_account_id, v_effective_actor_id) then
    raise exception 'Partner account is outside the effective user scope'
      using errcode = '42501';
  end if;

  select * into v_existing
  from public.dealer_accounts
  where id = p_dealer_account_id
  for update;
  if not found then
    raise exception 'Partner account not found' using errcode = 'P0002';
  end if;

  v_patch := jsonb_populate_record(v_existing, p_patch);

  update public.dealer_accounts
  set
    address_line_1 = v_patch.address_line_1,
    postal_code = v_patch.postal_code,
    city = v_patch.city,
    country = v_patch.country,
    vat_number = v_patch.vat_number,
    director_name = v_patch.director_name,
    phone = v_patch.phone,
    email = v_patch.email,
    primary_contact_name = v_patch.primary_contact_name,
    primary_contact_email = v_patch.primary_contact_email,
    primary_contact_phone = v_patch.primary_contact_phone,
    latitude = v_patch.latitude,
    longitude = v_patch.longitude,
    google_place_id = v_patch.google_place_id,
    geocoded_at = v_patch.geocoded_at,
    geocoding_status = v_patch.geocoding_status,
    geocoding_error = v_patch.geocoding_error,
    geocoding_address_hash = v_patch.geocoding_address_hash,
    geocoding_retry_after = v_patch.geocoding_retry_after,
    finance_contact_name = v_patch.finance_contact_name,
    finance_contact_phone = v_patch.finance_contact_phone,
    finance_contact_email = v_patch.finance_contact_email,
    invoice_email = v_patch.invoice_email,
    payment_terms_override = v_patch.payment_terms_override,
    currency_code = v_patch.currency_code,
    website = v_patch.website,
    social_facebook = v_patch.social_facebook,
    social_linkedin = v_patch.social_linkedin,
    social_tiktok = v_patch.social_tiktok,
    social_youtube = v_patch.social_youtube,
    social_instagram = v_patch.social_instagram,
    sales_contact_name = v_patch.sales_contact_name,
    sales_contact_phone = v_patch.sales_contact_phone,
    sales_contact_email = v_patch.sales_contact_email,
    sales_has_multiple = v_patch.sales_has_multiple,
    workshop_contact_name = v_patch.workshop_contact_name,
    workshop_contact_phone = v_patch.workshop_contact_phone,
    workshop_contact_email = v_patch.workshop_contact_email,
    workshop_has_multiple = v_patch.workshop_has_multiple,
    marketing_contact_name = v_patch.marketing_contact_name,
    marketing_contact_phone = v_patch.marketing_contact_phone,
    marketing_contact_email = v_patch.marketing_contact_email,
    updated_at = now()
  where id = p_dealer_account_id
  returning * into v_existing;

  return v_existing;
end;
$$;

-- Direct authenticated writes retain the trigger-based protected-field guard.
-- This merely lets cross-owner internal staff reach normal operational fields.
drop policy if exists dealer_accounts_update_timan_staff on public.dealer_accounts;
create policy dealer_accounts_update_timan_staff
on public.dealer_accounts
for update
to authenticated
using (
  public.can_manage_partner_admin_fields(assigned_seller_id, assigned_seller_email, assigned_seller_initials)
  or public.can_maintain_partnerdata()
)
with check (
  public.can_manage_partner_admin_fields(assigned_seller_id, assigned_seller_email, assigned_seller_initials)
  or public.can_maintain_partnerdata()
);

drop policy if exists dealer_contacts_insert_scope on public.dealer_contacts;
create policy dealer_contacts_insert_scope
on public.dealer_contacts
for insert
to authenticated
with check (
  public.can_maintain_partnerdata()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
);

drop policy if exists dealer_contacts_update_scope on public.dealer_contacts;
create policy dealer_contacts_update_scope
on public.dealer_contacts
for update
to authenticated
using (
  public.can_maintain_partnerdata()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
)
with check (
  public.can_maintain_partnerdata()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
);

drop policy if exists dealer_contacts_delete_scope on public.dealer_contacts;
create policy dealer_contacts_delete_scope
on public.dealer_contacts
for delete
to authenticated
using (
  public.can_maintain_partnerdata()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
);

revoke all on function public.can_maintain_partnerdata_as(uuid) from public, anon, authenticated;
revoke all on function public.can_maintain_partnerdata() from public, anon;
revoke all on function public.partnerdata_effective_actor_id(uuid) from public, anon, authenticated;
revoke all on function public.can_edit_partnerdata_account_as(uuid, uuid) from public, anon, authenticated;

grant execute on function public.can_maintain_partnerdata_as(uuid) to service_role;
grant execute on function public.can_maintain_partnerdata() to authenticated, service_role;
grant execute on function public.partnerdata_effective_actor_id(uuid) to service_role;
grant execute on function public.can_edit_partnerdata_account_as(uuid, uuid) to service_role;
