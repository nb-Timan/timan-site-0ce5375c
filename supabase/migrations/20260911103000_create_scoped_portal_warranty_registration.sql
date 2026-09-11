-- Dealer-submitted demo/warranty registrations use the existing canonical
-- warranty register. The dealer association is intentionally derived from
-- the authenticated app user; it is never accepted from the browser.
create or replace function public.create_scoped_portal_warranty_registration(
  p_registration jsonb
)
returns public.warranty_registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
  v_dealer public.dealer_accounts%rowtype;
  v_registration public.warranty_registrations%rowtype;
  v_id uuid := gen_random_uuid();
  v_machine_serial text := nullif(btrim(coalesce(p_registration ->> 'machine_serial_number', '')), '');
  v_delivery_date date;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select au.*
    into v_user
    from public.app_users au
   where coalesce(au.is_active, false)
     and coalesce(au.approved, false)
     and (
       au.auth_user_id = auth.uid()
       or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
     )
   order by case when au.auth_user_id = auth.uid() then 0 else 1 end
   limit 1;

  if not found or v_user.portal_role <> 'timan_dealer'::public.portal_role then
    raise exception 'Only active dealer accounts may create portal warranty registrations'
      using errcode = '42501';
  end if;

  select da.*
    into v_dealer
    from public.dealer_accounts da
   where lower(trim(da.account_number)) = lower(trim(coalesce(v_user.dealer_number, '')))
     and coalesce(da.is_active, true)
     and not coalesce(da.is_deleted, false)
     and not coalesce(da.is_blocked, false)
   limit 1;

  if not found then
    raise exception 'The authenticated dealer does not have an active canonical account'
      using errcode = '42501';
  end if;

  if v_machine_serial is null
     or nullif(btrim(coalesce(p_registration ->> 'machine_model', '')), '') is null
     or nullif(btrim(coalesce(p_registration ->> 'customer_name', '')), '') is null then
    raise exception 'Machine serial, machine model and customer name are required'
      using errcode = '22023';
  end if;

  begin
    v_delivery_date := nullif(btrim(coalesce(p_registration ->> 'delivery_date', '')), '')::date;
  exception when invalid_text_representation then
    raise exception 'Delivery date is invalid' using errcode = '22023';
  end;

  if v_delivery_date is null then
    raise exception 'Delivery date is required' using errcode = '22023';
  end if;

  insert into public.warranty_registrations (
    id,
    sharepoint_item_id,
    source,
    certificate_number,
    machine_serial_number,
    machine_serial_raw,
    machine_model,
    tool_serials,
    dealer_name_snapshot,
    dealer_account_id,
    dealer_account_number,
    dealer_match_status,
    dealer_match_confidence,
    dealer_match_method,
    customer_name,
    customer_address,
    customer_postal_code,
    customer_city,
    customer_country,
    customer_phone,
    customer_email,
    delivery_date,
    registration_date,
    language,
    is_demo,
    replacement_brand,
    comment,
    is_active_in_source
  ) values (
    v_id,
    'portal_manual:' || v_id::text,
    'portal_manual',
    'PORTAL-' || extract(year from current_date)::text || '-' || upper(left(replace(v_id::text, '-', ''), 8)),
    v_machine_serial,
    v_machine_serial,
    nullif(btrim(coalesce(p_registration ->> 'machine_model', '')), ''),
    coalesce(array(select nullif(btrim(value), '') from jsonb_array_elements_text(coalesce(p_registration -> 'tool_serials', '[]'::jsonb)) value where nullif(btrim(value), '') is not null), '{}'::text[]),
    v_dealer.company_name,
    v_dealer.id,
    v_dealer.account_number,
    'matched',
    1,
    'authenticated_portal_dealer',
    nullif(btrim(coalesce(p_registration ->> 'customer_name', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_address', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_postal_code', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_city', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_country', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_phone', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_email', '')), ''),
    v_delivery_date,
    now(),
    nullif(btrim(coalesce(p_registration ->> 'language', '')), ''),
    coalesce((p_registration ->> 'is_demo')::boolean, false),
    nullif(btrim(coalesce(p_registration ->> 'replacement_brand', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'comment', '')), ''),
    true
  ) returning * into v_registration;

  insert into public.warranty_registration_history (registration_id, change_source, snapshot, diff)
  values (
    v_registration.id,
    'portal_manual_create',
    to_jsonb(v_registration) || jsonb_build_object('_actor', auth.uid()),
    jsonb_build_object('event', 'Dealer portal warranty registration created', '_actor', auth.uid())
  );

  return v_registration;
end;
$$;

revoke all on function public.create_scoped_portal_warranty_registration(jsonb) from public;
revoke execute on function public.create_scoped_portal_warranty_registration(jsonb) from anon;
grant execute on function public.create_scoped_portal_warranty_registration(jsonb) to authenticated;
