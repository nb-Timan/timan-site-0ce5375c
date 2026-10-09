-- Partnerdata writes use the canonical assigned_seller_id relation. The
-- effective actor parameter lets Backend View-as use the selected seller's
-- scope without changing the authenticated session or weakening Backend's
-- normal global access.

create or replace function public.can_manage_partner_admin_fields(
  p_assigned_seller_id uuid,
  p_assigned_seller_email text,
  p_assigned_seller_initials text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.current_timan_app_user() actor
    where actor.portal_role in ('timan_backend', 'timan_service')
      or (
        actor.portal_role = 'timan_seller'
        and actor.id = p_assigned_seller_id
      )
  );
$$;

comment on function public.can_manage_partner_admin_fields(uuid, text, text) is
  'Authorizes Timan staff partner writes. Seller scope is canonical assigned_seller_id only; legacy email/initials parameters remain for signature compatibility.';

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
    and au.portal_role::text = 'timan_seller';

  if not found then
    raise exception 'Requested View-as seller is not active'
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
        actor.portal_role::text in ('timan_backend', 'timan_service')
        or (
          actor.portal_role::text = 'timan_seller'
          and da.assigned_seller_id = actor.id
        )
        or (
          actor.portal_role::text in (
            'timan_dealer',
            'timan_importer',
            'timan_service_partner',
            'dealer_customer',
            'dealer_user'
          )
          and
          nullif(trim(actor.dealer_number), '') is not null
          and da.account_number = actor.dealer_number
        )
      )
  );
$$;

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

create or replace function public.upsert_partnerdata_contact(
  p_dealer_account_id uuid,
  p_contact_area text,
  p_contact_id uuid default null,
  p_role_title text default null,
  p_name text default null,
  p_email text default null,
  p_phone text default null,
  p_is_primary boolean default false,
  p_effective_user_id uuid default null
)
returns public.dealer_contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_actor_id uuid;
  v_existing public.dealer_contacts%rowtype;
begin
  if p_contact_area not in ('director', 'sales', 'workshop', 'parts', 'marketing', 'finance') then
    raise exception 'Invalid Partnerdata contact area' using errcode = '23514';
  end if;

  v_effective_actor_id := public.partnerdata_effective_actor_id(p_effective_user_id);
  if not public.can_edit_partnerdata_account_as(p_dealer_account_id, v_effective_actor_id) then
    raise exception 'Partner account is outside the effective user scope'
      using errcode = '42501';
  end if;

  if p_contact_id is null then
    insert into public.dealer_contacts (
      dealer_account_id, contact_area, role_title, name, email, phone, is_primary
    ) values (
      p_dealer_account_id, p_contact_area, p_role_title, p_name, p_email, p_phone, coalesce(p_is_primary, false)
    ) returning * into v_existing;
  else
    select * into v_existing
    from public.dealer_contacts
    where id = p_contact_id
    for update;
    if not found then
      raise exception 'Partner contact not found' using errcode = 'P0002';
    end if;
    if v_existing.dealer_account_id <> p_dealer_account_id then
      raise exception 'Partner contact cannot move outside its canonical account'
        using errcode = '42501';
    end if;

    update public.dealer_contacts
    set
      contact_area = p_contact_area,
      role_title = p_role_title,
      name = p_name,
      email = p_email,
      phone = p_phone,
      is_primary = coalesce(p_is_primary, false)
    where id = p_contact_id
    returning * into v_existing;
  end if;

  return v_existing;
end;
$$;

create or replace function public.delete_partnerdata_contact(
  p_contact_id uuid,
  p_effective_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_actor_id uuid;
  v_contact public.dealer_contacts%rowtype;
begin
  select * into v_contact
  from public.dealer_contacts
  where id = p_contact_id
  for update;
  if not found then
    return false;
  end if;

  v_effective_actor_id := public.partnerdata_effective_actor_id(p_effective_user_id);
  if not public.can_edit_partnerdata_account_as(v_contact.dealer_account_id, v_effective_actor_id) then
    raise exception 'Partner contact is outside the effective user scope'
      using errcode = '42501';
  end if;

  delete from public.dealer_contacts where id = p_contact_id;
  return true;
end;
$$;

-- The direct table policy remains the defense for a real seller session.
-- View-as writes use the RPCs above because the authenticated JWT remains the
-- Backend actor while the effective scope is the selected seller.
drop policy if exists dealer_contacts_delete_scope on public.dealer_contacts;
create policy dealer_contacts_delete_scope
on public.dealer_contacts
for delete
to authenticated
using (
  public.is_timan_backend()
  or exists (
    select 1
    from public.dealer_accounts da
    where da.id = dealer_contacts.dealer_account_id
      and da.account_number is not null
      and da.account_number = public.current_user_dealer_number()
  )
  or exists (
    select 1
    from public.dealer_accounts da
    cross join public.current_timan_app_user() actor
    where da.id = dealer_contacts.dealer_account_id
      and actor.portal_role = 'timan_seller'
      and da.assigned_seller_id = actor.id
  )
);

revoke all on function public.partnerdata_effective_actor_id(uuid) from public, anon;
revoke all on function public.can_edit_partnerdata_account_as(uuid, uuid) from public, anon;
revoke all on function public.update_partnerdata_account_profile(uuid, jsonb, uuid) from public, anon;
revoke all on function public.upsert_partnerdata_contact(uuid, text, uuid, text, text, text, text, boolean, uuid) from public, anon;
revoke all on function public.delete_partnerdata_contact(uuid, uuid) from public, anon;

grant execute on function public.partnerdata_effective_actor_id(uuid) to service_role;
grant execute on function public.can_edit_partnerdata_account_as(uuid, uuid) to service_role;
grant execute on function public.update_partnerdata_account_profile(uuid, jsonb, uuid) to authenticated, service_role;
grant execute on function public.upsert_partnerdata_contact(uuid, text, uuid, text, text, text, text, boolean, uuid) to authenticated, service_role;
grant execute on function public.delete_partnerdata_contact(uuid, uuid) to authenticated, service_role;
