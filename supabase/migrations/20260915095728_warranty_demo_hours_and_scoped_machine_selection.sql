alter table public.warranty_submissions
  add column if not exists demo_hours_at_sale integer;

alter table public.warranty_registrations
  add column if not exists demo_hours_at_sale integer;

alter table public.warranty_submissions
  drop constraint if exists warranty_submissions_demo_hours_at_sale_check;
alter table public.warranty_submissions
  add constraint warranty_submissions_demo_hours_at_sale_check
  check (demo_hours_at_sale is null or demo_hours_at_sale >= 0);

alter table public.warranty_registrations
  drop constraint if exists warranty_registrations_demo_hours_at_sale_check;
alter table public.warranty_registrations
  add constraint warranty_registrations_demo_hours_at_sale_check
  check (demo_hours_at_sale is null or demo_hours_at_sale >= 0);

create or replace function public.create_scoped_portal_warranty_registration(
  p_registration jsonb
)
returns public.warranty_submissions
language plpgsql
security definer
set search_path = public
as $dealer_warranty_submit$
declare
  v_user public.app_users%rowtype;
  v_dealer public.dealer_accounts%rowtype;
  v_existing public.warranty_registrations%rowtype;
  v_submission public.warranty_submissions%rowtype;
  v_machine_serial text := nullif(btrim(coalesce(p_registration ->> 'machine_serial_number', '')), '');
  v_machine_model text := nullif(btrim(coalesce(p_registration ->> 'machine_model', '')), '');
  v_requested_dealer_number text := nullif(btrim(coalesce(p_registration ->> 'dealer_account_number', '')), '');
  v_normalized_serial text;
  v_delivery_date date;
  v_demo_hours_at_sale integer;
  v_is_demo boolean;
  v_machine_registration_id uuid;
  v_actor record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select au.* into v_user
  from public.app_users au
  where coalesce(au.is_active, false)
    and coalesce(au.approved, false)
    and (au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', ''))))
  order by case when au.auth_user_id = auth.uid() then 0 else 1 end
  limit 1;

  if not found then
    raise exception 'Only active dealer accounts may submit portal warranty registrations'
      using errcode = '42501';
  end if;

  if v_user.portal_role = 'timan_dealer'::public.portal_role then
    v_requested_dealer_number := v_user.dealer_number;
  elsif not public.is_timan_global_warranty() or v_requested_dealer_number is null then
    raise exception 'Choose an active dealer before creating a warranty registration'
      using errcode = '42501';
  end if;

  select da.* into v_dealer
  from public.dealer_accounts da
  where lower(trim(da.account_number)) = lower(trim(v_requested_dealer_number))
    and coalesce(da.is_active, true)
    and not coalesce(da.is_deleted, false)
    and not coalesce(da.is_blocked, false)
  limit 1;

  if not found then
    raise exception 'The authenticated dealer does not have an active canonical account'
      using errcode = '42501';
  end if;

  if v_machine_serial is null
     or nullif(btrim(coalesce(p_registration ->> 'customer_name', '')), '') is null then
    raise exception 'Machine serial and customer name are required' using errcode = '22023';
  end if;

  begin
    v_delivery_date := nullif(btrim(coalesce(p_registration ->> 'delivery_date', '')), '')::date;
  exception when invalid_text_representation then
    raise exception 'Delivery date is invalid' using errcode = '22023';
  end;
  if v_delivery_date is null then
    raise exception 'Delivery date is required' using errcode = '22023';
  end if;

  v_normalized_serial := upper(regexp_replace(v_machine_serial, '[^A-Za-z0-9]+', '', 'g'));
  if v_normalized_serial = '' then
    raise exception 'Machine serial is invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.warranty_registrations wr
    where wr.is_active_in_source
      and wr.certificate_number ~ '^SP-[0-9]+$'
      and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_normalized_serial
  ) then
    raise exception 'This serial already has an approved SP warranty' using errcode = '23505';
  end if;

  select wr.* into v_existing
  from public.warranty_registrations wr
  where wr.is_active_in_source
    and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_normalized_serial
  order by (wr.source = 'legacy_machine_import') desc, wr.created_at desc
  limit 1;

  if found then
    if (v_existing.dealer_account_id is not null and v_existing.dealer_account_id <> v_dealer.id)
      or (
        v_existing.dealer_account_id is null
        and nullif(btrim(coalesce(v_existing.dealer_account_number, '')), '') is not null
        and lower(btrim(v_existing.dealer_account_number)) <> lower(btrim(v_dealer.account_number))
      ) then
      raise exception 'The machine is not available for this dealer' using errcode = '42501';
    end if;
    v_machine_registration_id := v_existing.id;
    v_machine_model := coalesce(nullif(btrim(v_existing.machine_model), ''), v_machine_model);
  end if;

  if v_machine_model is null then
    raise exception 'Machine model is required' using errcode = '22023';
  end if;

  begin
    v_demo_hours_at_sale := nullif(btrim(coalesce(p_registration ->> 'demo_hours_at_sale', '')), '')::integer;
  exception when invalid_text_representation then
    raise exception 'Demo machine operating hours are invalid' using errcode = '22023';
  end;
  if v_demo_hours_at_sale is not null and v_demo_hours_at_sale < 0 then
    raise exception 'Demo machine operating hours cannot be negative' using errcode = '22023';
  end if;

  v_is_demo := coalesce((p_registration ->> 'is_demo')::boolean, false)
    or coalesce(v_existing.is_demo, false);
  if v_is_demo and v_demo_hours_at_sale is null then
    raise exception 'Demo machine operating hours at sale are required' using errcode = '22023';
  end if;

  insert into public.warranty_submissions (
    machine_serial_number, machine_serial_raw, machine_model, tool_serials,
    is_demo, demo_hours_at_sale, replacement_brand,
    dealer_account_id, dealer_account_number, dealer_name_snapshot,
    submitted_by_user_id, submitted_by_email,
    customer_name, customer_address, customer_postal_code, customer_city,
    customer_country, customer_phone, customer_email, delivery_date, language,
    comment, matched_machine_registration_id
  ) values (
    upper(regexp_replace(v_machine_serial, '\\s+', '', 'g')), v_machine_serial,
    v_machine_model,
    coalesce(array(select nullif(btrim(value), '')
      from jsonb_array_elements_text(coalesce(p_registration -> 'tool_serials', '[]'::jsonb)) value
      where nullif(btrim(value), '') is not null), '{}'::text[]),
    v_is_demo, v_demo_hours_at_sale,
    nullif(btrim(coalesce(p_registration ->> 'replacement_brand', '')), ''),
    v_dealer.id, v_dealer.account_number, v_dealer.company_name,
    v_user.id, v_user.email,
    nullif(btrim(coalesce(p_registration ->> 'customer_name', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_address', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_postal_code', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_city', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_country', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_phone', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'customer_email', '')), ''),
    v_delivery_date, nullif(btrim(coalesce(p_registration ->> 'language', '')), ''),
    nullif(btrim(coalesce(p_registration ->> 'comment', '')), ''),
    v_machine_registration_id
  ) returning * into v_submission;

  select * into v_actor from public.audit_current_actor();
  insert into public.audit_log (
    actor_user_id, actor_email, actor_name, actor_role,
    action, module, record_type, record_id, record_label, new_value, changed_fields, status
  ) values (
    v_actor.actor_user_id, v_actor.actor_email, v_actor.actor_name, v_actor.actor_role,
    'submit', 'warranty', 'warranty_submission', v_submission.id::text,
    v_submission.machine_serial_number,
    jsonb_build_object('submission_status', 'pending', 'dealer_account_number', v_dealer.account_number,
      'matched_machine_registration_id', v_machine_registration_id,
      'is_demo', v_is_demo, 'demo_hours_at_sale', v_demo_hours_at_sale),
    array['submission_status', 'machine_serial_number', 'dealer_account_id', 'is_demo', 'demo_hours_at_sale'], 'success'
  );

  return v_submission;
end;
$dealer_warranty_submit$;
revoke all on function public.create_scoped_portal_warranty_registration(jsonb) from public;
revoke execute on function public.create_scoped_portal_warranty_registration(jsonb) from anon;
grant execute on function public.create_scoped_portal_warranty_registration(jsonb) to authenticated;

create or replace function public.sync_approved_warranty_demo_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $sync_approved_warranty_demo_hours$
begin
  if new.submission_status = 'approved'
    and new.approved_registration_id is not null
    and (old.submission_status is distinct from new.submission_status
      or old.approved_registration_id is distinct from new.approved_registration_id) then
    update public.warranty_registrations
       set demo_hours_at_sale = new.demo_hours_at_sale
     where id = new.approved_registration_id;
  end if;
  return new;
end;
$sync_approved_warranty_demo_hours$;
revoke all on function public.sync_approved_warranty_demo_hours() from public;
revoke all on function public.sync_approved_warranty_demo_hours() from anon, authenticated;

drop trigger if exists trg_sync_approved_warranty_demo_hours on public.warranty_submissions;
create trigger trg_sync_approved_warranty_demo_hours
after update of submission_status, approved_registration_id on public.warranty_submissions
for each row execute function public.sync_approved_warranty_demo_hours();
