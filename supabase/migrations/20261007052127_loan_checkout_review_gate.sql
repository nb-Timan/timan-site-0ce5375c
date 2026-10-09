-- Keep checkout review separate from the later partner-acceptance stage.
alter table public.loan_cases
  drop constraint if exists loan_cases_status_check;
alter table public.loan_cases
  add constraint loan_cases_status_check check (status in (
    'DRAFT','READY_FOR_REVIEW','AWAITING_ACCEPTANCE','ACCEPTED','ON_LOAN',
    'RETURN_INSPECTION','CLOSED_OK','CLOSED_WITH_DEVIATION','CANCELLED'
  ));

create or replace function public.loan_submit_for_review(
  p_case_id uuid,
  p_serial_numbers_confirmed boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_case public.loan_cases%rowtype;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then
    raise exception 'Loan case management denied';
  end if;

  select * into v_case
  from public.loan_cases
  where id = p_case_id
  for update;

  if v_case.status <> 'DRAFT' then raise exception 'Only draft cases can be submitted for review'; end if;
  if v_case.responsible_user_id is null or v_case.dealer_account_id is null or v_case.dealer_contact_id is null then
    raise exception 'Seller, partner and contact are required';
  end if;
  if v_case.loan_date is null then raise exception 'Loan date is required'; end if;
  if v_case.expected_return_date is null then raise exception 'Expected return date is required'; end if;
  if v_case.expected_return_date < v_case.loan_date then raise exception 'Expected return must be on or after loan date'; end if;
  if not exists(select 1 from public.loan_case_items where case_id = p_case_id) then
    raise exception 'At least one item is required';
  end if;
  if exists(
    select 1
    from public.loan_case_items i
    where i.case_id = p_case_id
      and (
        (i.planning_supply_unit_id is null and i.fabric_asset_id is null)
        or nullif(btrim(i.serial_snapshot), '') is null
        or not exists(
          select 1 from public.loan_asset_allocations a
          where a.case_item_id = i.id and a.allocation_status = 'active'
        )
      )
  ) then raise exception 'Every item requires an active canonical serialized asset'; end if;
  if exists(
    select 1
    from public.loan_case_items i
    where i.case_id = p_case_id
      and not exists(
        select 1 from public.loan_case_item_photos p
        where p.case_item_id = i.id and p.photo_kind = 'serial_plate'
      )
  ) then raise exception 'A type plate photo is required for every item'; end if;
  if exists(
    select 1
    from public.loan_case_items i
    where i.case_id = p_case_id
      and i.item_type = 'machine'
      and (
        i.usage_reading_value is null
        or coalesce(i.usage_reading_unit not in ('km','hours'),true)
      )
  ) then raise exception 'Machine checkout meter value and unit are required'; end if;
  if p_serial_numbers_confirmed is distinct from true then raise exception 'Serial number confirmation is required'; end if;

  update public.loan_cases
  set status = 'READY_FOR_REVIEW',
      serial_numbers_confirmed_by = v_actor,
      serial_numbers_confirmed_at = now(),
      updated_at = now()
  where id = p_case_id;

  update public.loan_case_items
  set serial_verified = true,
      serial_verified_by = v_actor,
      serial_verified_at = now(),
      updated_at = now()
  where case_id = p_case_id;

  insert into public.loan_case_events(case_id,event_type,actor_user_id,from_status,to_status,metadata)
  values(p_case_id,'CHECKOUT_READY_FOR_REVIEW',v_actor,'DRAFT','READY_FOR_REVIEW',jsonb_build_object('serial_numbers_confirmed',true));
end;
$$;
revoke all on function public.loan_submit_for_review(uuid,boolean) from public, anon;
grant execute on function public.loan_submit_for_review(uuid,boolean) to authenticated;

create or replace function public.loan_create_case_version(
  p_case_id uuid,
  p_serial_numbers_confirmed boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_case public.loan_cases%rowtype;
  v_number integer;
  v_version uuid;
  v_terms uuid;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select * into v_case from public.loan_cases where id = p_case_id for update;
  if v_case.status <> 'READY_FOR_REVIEW' then raise exception 'Checkout review is required before partner acceptance'; end if;
  if p_serial_numbers_confirmed is distinct from true or v_case.serial_numbers_confirmed_by is null or v_case.serial_numbers_confirmed_at is null then
    raise exception 'Serial number confirmation is required';
  end if;

  select t.id into v_terms
  from public.loan_term_versions t
  join public.loan_term_translations x on x.term_version_id = t.id and x.language_code = v_case.language_code
  where t.status = 'APPROVED'
  order by t.version_number desc
  limit 1;
  if v_terms is null then raise exception 'No approved loan terms exist'; end if;

  v_number := v_case.current_version_number + 1;
  insert into public.loan_case_versions(
    case_id,version_number,status_snapshot,responsible_user_id,dealer_account_id,dealer_contact_id,
    language_code,loan_date,expected_return_date,alternative_delivery_address,delivery_address,
    delivery_postal_code,delivery_city,delivery_country,delivery_contact,delivery_note,notes,
    serial_numbers_confirmed_by,serial_numbers_confirmed_at,term_version_id,created_by
  ) values (
    v_case.id,v_number,v_case.status,v_case.responsible_user_id,v_case.dealer_account_id,v_case.dealer_contact_id,
    v_case.language_code,v_case.loan_date,v_case.expected_return_date,v_case.alternative_delivery_address,
    v_case.delivery_address,v_case.delivery_postal_code,v_case.delivery_city,v_case.delivery_country,
    v_case.delivery_contact,v_case.delivery_note,v_case.notes,v_case.serial_numbers_confirmed_by,
    v_case.serial_numbers_confirmed_at,v_terms,v_actor
  ) returning id into v_version;

  insert into public.loan_case_version_items(
    case_version_id,source_item_id,item_type,product_sku,planning_supply_unit_id,serial_snapshot,
    product_name_snapshot,warehouse_snapshot,usage_reading_value,usage_reading_unit,driving_use_limit,
    responsible_person,expected_return_date,serial_verified
  )
  select v_version,i.id,i.item_type,i.product_sku,i.planning_supply_unit_id,i.serial_snapshot,
    i.product_name_snapshot,i.warehouse_snapshot,i.usage_reading_value,i.usage_reading_unit,
    i.driving_use_limit,i.responsible_person,i.expected_return_date,i.serial_verified
  from public.loan_case_items i
  where i.case_id = p_case_id;

  update public.loan_cases
  set current_version_number = v_number,
      status = 'AWAITING_ACCEPTANCE',
      updated_at = now()
  where id = p_case_id;

  insert into public.loan_case_events(case_id,case_version_id,event_type,actor_user_id,from_status,to_status,metadata)
  values(p_case_id,v_version,'VERSION_CREATED',v_actor,'READY_FOR_REVIEW','AWAITING_ACCEPTANCE',jsonb_build_object('version_number',v_number,'term_version_id',v_terms));
  return v_number;
end;
$$;
revoke all on function public.loan_create_case_version(uuid,boolean) from public, anon;
grant execute on function public.loan_create_case_version(uuid,boolean) to authenticated;
