-- Model corrections must use the same canonical values as the Portal's
-- SERVICE_MACHINE_TYPES list. Source warranty/MO values remain untouched.
create or replace function public.is_canonical_machine_model(p_model text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $fn$
  select p_model = any(array[
    'RC-1000',
    'RC-1000s',
    'RC-751',
    'Timan 3330',
    'Timan 2620',
    'TC-750',
    'Timan Tool-Trac'
  ]::text[])
$fn$;

revoke all on function public.is_canonical_machine_model(text) from public, anon, authenticated;

create or replace function public.save_machine_registry_correction(p_serial text, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_serial text := upper(regexp_replace(coalesce(p_serial, ''), '[^A-Za-z0-9]+', '', 'g'));
  v_actor public.app_users%rowtype;
  v_source public.warranty_registrations%rowtype;
  v_old public.machine_registry_corrections%rowtype;
  v_dealer_id uuid;
  v_warranty_id uuid;
  v_model text;
  v_delivery date;
  v_new public.machine_registry_corrections%rowtype;
begin
  if auth.uid() is null or not public.machine_registry_can_correct() then
    raise exception 'Machine registry correction requires internal Teknik & Service access' using errcode = '42501';
  end if;
  if v_serial = '' then
    raise exception 'Machine serial is required' using errcode = '22023';
  end if;
  select * into v_actor from public.machine_registry_correction_actor();
  select * into v_source from public.warranty_registrations wr
   where wr.is_active_in_source
     and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_serial
   order by (wr.source <> 'legacy_machine_import') desc, wr.created_at desc
   limit 1;
  if not found then
    raise exception 'Machine does not exist in the registry' using errcode = 'P0002';
  end if;

  select * into v_old from public.machine_registry_corrections where normalized_serial = v_serial;
  v_dealer_id := nullif(p_patch ->> 'dealer_account_id', '')::uuid;
  v_warranty_id := nullif(p_patch ->> 'approved_warranty_registration_id', '')::uuid;
  v_model := nullif(btrim(coalesce(p_patch ->> 'machine_model', '')), '');
  v_delivery := nullif(p_patch ->> 'delivery_date', '')::date;

  if v_model is null or not public.is_canonical_machine_model(v_model) then
    raise exception 'Choose a canonical Timan machine model' using errcode = '22023';
  end if;
  if v_dealer_id is not null and not exists (
    select 1 from public.dealer_accounts da
     where da.id = v_dealer_id and coalesce(da.is_active, true)
       and not coalesce(da.is_deleted, false) and not coalesce(da.is_blocked, false)
  ) then
    raise exception 'Choose an active dealer account' using errcode = '22023';
  end if;
  if v_warranty_id is not null and not exists (
    select 1 from public.warranty_registrations wr
     where wr.id = v_warranty_id and wr.is_active_in_source
       and wr.source <> 'legacy_machine_import'
       and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_serial
  ) then
    raise exception 'Approved warranty must belong to this machine' using errcode = '22023';
  end if;

  insert into public.machine_registry_corrections (
    normalized_serial, dealer_account_id, approved_warranty_registration_id,
    machine_model, delivery_date, created_by_user_id, updated_by_user_id
  ) values (v_serial, v_dealer_id, v_warranty_id, v_model, v_delivery, v_actor.id, v_actor.id)
  on conflict (normalized_serial) do update set
    dealer_account_id = excluded.dealer_account_id,
    approved_warranty_registration_id = excluded.approved_warranty_registration_id,
    machine_model = excluded.machine_model,
    delivery_date = excluded.delivery_date,
    updated_by_user_id = excluded.updated_by_user_id,
    updated_at = now()
  returning * into v_new;

  insert into public.machine_registry_correction_history(normalized_serial, actor_user_id, actor_email, old_values, new_values)
  values (v_serial, v_actor.id, v_actor.email,
    coalesce(to_jsonb(v_old) - array['created_at','updated_at'], '{}'::jsonb),
    to_jsonb(v_new) - array['created_at','updated_at']);

  insert into public.audit_log(actor_user_id, actor_email, actor_name, actor_role, action, module, record_type, record_id, record_label, old_value, new_value, changed_fields, status)
  values (v_actor.id, v_actor.email, coalesce(v_actor.display_name, v_actor.full_name, v_actor.email), v_actor.portal_role::text,
    'update', 'service', 'machine_registry_correction', v_serial, v_source.machine_serial_number,
    coalesce(to_jsonb(v_old), '{}'::jsonb), to_jsonb(v_new), array['dealer_account_id','approved_warranty_registration_id','machine_model','delivery_date'], 'success');
  return to_jsonb(v_new);
end
$fn$;

revoke all on function public.save_machine_registry_correction(text, jsonb) from public, anon;
grant execute on function public.save_machine_registry_correction(text, jsonb) to authenticated;
