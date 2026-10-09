-- Follow-up to the scoped contact editor: use a portable dot matcher in the
-- server-side email validation. The first deployed function used an escaped
-- regex literal that rejected valid email addresses.
create or replace function public.update_submitted_order_contact_details(
  p_configuration_id uuid,
  p_contact jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  target public.configurations;
  next_state jsonb;
  stored_payload jsonb;
  next_note text;
  requested_delivery_date date;
  company_name text;
  contact_name text;
  contact_email text;
begin
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can edit submitted-order contact details' using errcode = '42501';
  end if;
  if p_contact is null or jsonb_typeof(p_contact) <> 'object' then
    raise exception 'Contact details must be an object' using errcode = '22023';
  end if;

  company_name := btrim(coalesce(p_contact ->> 'firmanavn', ''));
  contact_name := btrim(coalesce(p_contact ->> 'kontaktperson', ''));
  contact_email := btrim(coalesce(p_contact ->> 'email', ''));
  if company_name = '' or contact_name = '' or contact_email = '' then
    raise exception 'Company, contact person and email are required' using errcode = '22023';
  end if;
  if contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'A valid email address is required' using errcode = '22023';
  end if;

  select * into target from public.configurations where id = p_configuration_id for update;
  if not found or not public.is_submitted_configurator_order(target) then
    raise exception 'Only submitted orders can be edited here' using errcode = '22023';
  end if;

  requested_delivery_date := nullif(btrim(coalesce(p_contact ->> 'date', '')), '')::date;
  next_state := coalesce(target.state_json, '{}'::jsonb) || jsonb_build_object(
    'firmanavn', company_name,
    'kontaktperson', contact_name,
    'telefon', btrim(coalesce(p_contact ->> 'telefon', '')),
    'email', contact_email,
    'address', btrim(coalesce(p_contact ->> 'address', '')),
    'postalCode', btrim(coalesce(p_contact ->> 'postalCode', '')),
    'city', btrim(coalesce(p_contact ->> 'city', '')),
    'country', btrim(coalesce(p_contact ->> 'country', '')),
    'comment', btrim(coalesce(p_contact ->> 'comment', '')),
    'alternativeDeliveryAddress', btrim(coalesce(p_contact ->> 'alternativeDeliveryAddress', '')),
    'purchaseOrderNumber', btrim(coalesce(p_contact ->> 'purchaseOrderNumber', '')),
    'date', coalesce(requested_delivery_date::text, '')
  );

  begin
    stored_payload := target.note::jsonb;
  exception when others then
    stored_payload := null;
  end;
  next_note := case
    when stored_payload ->> '__kind' = 'configurator_state'
      then jsonb_set(stored_payload, '{state}', next_state, true)::text
    else target.note
  end;

  perform set_config('app.submitted_order_contact_edit', target.id::text, true);
  update public.configurations
     set state_json = next_state,
         note = next_note,
         delivery_date = requested_delivery_date
   where id = target.id;
end;
$$;

revoke all on function public.update_submitted_order_contact_details(uuid, jsonb) from public, anon;
grant execute on function public.update_submitted_order_contact_details(uuid, jsonb) to authenticated;
