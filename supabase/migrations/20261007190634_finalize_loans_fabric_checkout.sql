-- Finalize the Fabric-backed checkout contract without rewriting historical Loans data.
alter table public.loan_case_items
  add column if not exists warehouse_location_code_snapshot text,
  add column if not exists fabric_account_number_snapshot text,
  add column if not exists fabric_order_number_snapshot text;

alter table public.loan_case_version_items
  add column if not exists fabric_asset_id uuid references public.fabric_loan_assets_current(asset_id),
  add column if not exists warehouse_location_code_snapshot text,
  add column if not exists fabric_account_number_snapshot text,
  add column if not exists fabric_order_number_snapshot text;

comment on column public.loan_case_items.fabric_account_number_snapshot is
  'Immutable Fabric account snapshot captured when the serialized asset is selected.';
comment on column public.loan_case_items.fabric_order_number_snapshot is
  'Immutable optional Fabric order snapshot captured when the serialized asset is selected.';

create or replace function public.loan_add_fabric_asset_item(p_case_id uuid,p_asset_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_item uuid;
  f public.fabric_loan_assets_current%rowtype;
  v_type text;
  v_status text;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select status into v_status from public.loan_cases where id=p_case_id for update;
  if v_status is distinct from 'DRAFT' then raise exception 'Only draft cases can be edited'; end if;

  perform 1 from public.fabric_loan_sync_state
  where singleton and enabled and source_as_of>=now()-make_interval(secs=>stale_after_seconds)
  for share;
  if not found then raise exception 'FABRIC_STALE'; end if;

  select * into f from public.fabric_loan_assets_current where asset_id=p_asset_id for share;
  if not found or not f.source_present or f.classification<>'LOAN_CANDIDATE' or f.review_required or f.identity_conflict
    or f.warehouse_location_code not in ('2','4') then raise exception 'Asset is not loan eligible'; end if;

  if exists(select 1 from public.planning_machine_products where item_number=f.item_number)
    and not exists(select 1 from public.planning_accessory_products where item_number=f.item_number) then v_type:='machine';
  elsif exists(select 1 from public.planning_accessory_products where item_number=f.item_number)
    and not exists(select 1 from public.planning_machine_products where item_number=f.item_number) then v_type:='equipment';
  else raise exception 'Asset has no canonical Planning classification'; end if;

  if exists(
    select 1 from public.planning_reservations r
    join public.planning_supply_units p on p.id=r.supply_unit_id
    where r.status='active' and upper(btrim(p.serial_number))=f.serial_number_normalized
  ) then raise exception 'Asset is already allocated'; end if;

  insert into public.loan_case_items(
    case_id,item_type,product_sku,fabric_asset_id,serial_snapshot,product_name_snapshot,
    warehouse_snapshot,warehouse_location_code_snapshot,fabric_account_number_snapshot,
    fabric_order_number_snapshot,expected_return_date,created_by
  )
  select p_case_id,v_type,f.item_number,f.asset_id,f.serial_number,f.item_name,
    f.warehouse_location_name,f.warehouse_location_code,f.account_number,f.order_number,
    c.expected_return_date,v_actor
  from public.loan_cases c where c.id=p_case_id
  returning id into v_item;

  insert into public.loan_asset_allocations(case_item_id,fabric_asset_id,allocated_by)
  values(v_item,f.asset_id,v_actor);
  update public.loan_cases
  set serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now()
  where id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'ASSET_ADDED',v_actor,jsonb_build_object('case_item_id',v_item,'fabric_asset_id',f.asset_id));
  return v_item;
exception when unique_violation then raise exception 'Asset is already allocated';
end;
$$;
revoke all on function public.loan_add_fabric_asset_item(uuid,uuid) from public, anon;
grant execute on function public.loan_add_fabric_asset_item(uuid,uuid) to authenticated;

create or replace function public.loan_update_item_usage(
  p_case_id uuid,
  p_case_item_id uuid,
  p_usage_reading_value numeric,
  p_usage_reading_unit text,
  p_driving_use_limit text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  perform 1 from public.loan_cases where id=p_case_id and status='DRAFT' for update;
  if not found then raise exception 'Only draft cases can be edited'; end if;
  if p_usage_reading_value is not null and p_usage_reading_value < 0 then raise exception 'Invalid usage reading'; end if;
  if (p_usage_reading_value is null) <> (p_usage_reading_unit is null) then
    raise exception 'Usage reading and unit must be supplied together';
  end if;
  if p_usage_reading_unit is not null and p_usage_reading_unit not in ('km','hours') then raise exception 'Invalid usage unit'; end if;

  update public.loan_case_items set
    usage_reading_value=p_usage_reading_value,
    usage_reading_unit=p_usage_reading_unit,
    driving_use_limit=nullif(btrim(p_driving_use_limit),''),
    serial_verified=false,serial_verified_by=null,serial_verified_at=null,updated_at=now()
  where id=p_case_item_id and case_id=p_case_id and item_type='machine'
    and exists(select 1 from public.loan_cases c where c.id=p_case_id and c.status='DRAFT');
  if not found then raise exception 'Machine item is not editable'; end if;

  update public.loan_cases
  set serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now()
  where id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'CHECKOUT_USAGE_UPDATED',v_actor,jsonb_build_object(
    'case_item_id',p_case_item_id,'usage_reading_unit',p_usage_reading_unit
  ));
end;
$$;
revoke all on function public.loan_update_item_usage(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.loan_update_item_usage(uuid,uuid,numeric,text,text) to authenticated;

create or replace function public.loan_register_item_photo(
  p_case_id uuid,
  p_case_item_id uuid,
  p_storage_path text,
  p_photo_kind text,
  p_file_name text,
  p_content_type text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_id uuid;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan photo access denied'; end if;
  perform 1 from public.loan_cases c where c.id=p_case_id and c.status='DRAFT' for update;
  if not found then raise exception 'Only draft photos can be edited'; end if;
  if not exists(select 1 from public.loan_case_items i where i.id=p_case_item_id and i.case_id=p_case_id) then raise exception 'Invalid loan item'; end if;
  if p_storage_path not like p_case_id::text || '/%' then raise exception 'Invalid storage path'; end if;
  if p_photo_kind not in ('serial_plate','overview') then raise exception 'Invalid photo kind'; end if;
  if exists(select 1 from public.loan_case_item_photos p where p.case_item_id=p_case_item_id and p.photo_kind=p_photo_kind) then
    raise exception 'Replace the existing photo for this category';
  end if;
  if (
    select count(*) from public.loan_case_item_photos p
    where p.case_item_id=p_case_item_id and p.photo_kind in ('serial_plate','overview')
  ) >= 2 then raise exception 'Maximum two photos per loan item'; end if;

  insert into public.loan_case_item_photos(case_id,case_item_id,storage_path,photo_kind,file_name,content_type,uploaded_by)
  values(p_case_id,p_case_item_id,p_storage_path,p_photo_kind,p_file_name,p_content_type,v_actor)
  returning id into v_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'PHOTO_ADDED',v_actor,jsonb_build_object('case_item_id',p_case_item_id,'photo_kind',p_photo_kind));
  return v_id;
end;
$$;
revoke all on function public.loan_register_item_photo(uuid,uuid,text,text,text,text) from public, anon;
grant execute on function public.loan_register_item_photo(uuid,uuid,text,text,text,text) to authenticated;

create or replace function public.loan_confirm_draft_serials(p_case_id uuid,p_confirmed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  perform 1 from public.loan_cases where id=p_case_id and status='DRAFT' for update;
  if not found then raise exception 'Only draft cases can be edited'; end if;
  if p_confirmed is true and (
    not exists(select 1 from public.loan_case_items where case_id=p_case_id)
    or exists(select 1 from public.loan_case_items i where i.case_id=p_case_id and (
      nullif(btrim(i.serial_snapshot),'') is null
      or not exists(select 1 from public.loan_asset_allocations a where a.case_item_id=i.id and a.allocation_status='active')
    ))
  ) then raise exception 'Every item requires an active canonical serialized asset'; end if;
  update public.loan_cases set
    serial_numbers_confirmed_by=case when p_confirmed is true then v_actor end,
    serial_numbers_confirmed_at=case when p_confirmed is true then now() end,updated_at=now()
  where id=p_case_id;
  update public.loan_case_items set serial_verified=p_confirmed is true,
    serial_verified_by=case when p_confirmed is true then v_actor end,
    serial_verified_at=case when p_confirmed is true then now() end,updated_at=now()
  where case_id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'DRAFT_SERIALS_CONFIRMED',v_actor,jsonb_build_object('confirmed',p_confirmed is true));
end;
$$;
revoke all on function public.loan_confirm_draft_serials(uuid,boolean) from public, anon;
grant execute on function public.loan_confirm_draft_serials(uuid,boolean) to authenticated;

create or replace function public.loan_create_case_version(
  p_case_id uuid,
  p_serial_numbers_confirmed boolean default false
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_case public.loan_cases%rowtype;
  v_number integer;
  v_version uuid;
  v_terms uuid;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select * into v_case from public.loan_cases where id=p_case_id for update;
  if v_case.status<>'READY_FOR_REVIEW' then raise exception 'Checkout review is required before partner acceptance'; end if;
  if p_serial_numbers_confirmed is distinct from true or v_case.serial_numbers_confirmed_by is null
    or v_case.serial_numbers_confirmed_at is null then raise exception 'Serial number confirmation is required'; end if;

  select t.id into v_terms
  from public.loan_term_versions t
  join public.loan_term_translations x on x.term_version_id=t.id and x.language_code=v_case.language_code
  where t.status='APPROVED'
  order by t.version_number desc limit 1;
  if v_terms is null then raise exception 'No approved loan terms exist'; end if;

  v_number:=v_case.current_version_number+1;
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
    case_version_id,source_item_id,item_type,product_sku,planning_supply_unit_id,fabric_asset_id,serial_snapshot,
    product_name_snapshot,warehouse_snapshot,warehouse_location_code_snapshot,fabric_account_number_snapshot,
    fabric_order_number_snapshot,usage_reading_value,usage_reading_unit,driving_use_limit,
    responsible_person,expected_return_date,serial_verified
  )
  select v_version,i.id,i.item_type,i.product_sku,i.planning_supply_unit_id,i.fabric_asset_id,i.serial_snapshot,
    i.product_name_snapshot,i.warehouse_snapshot,i.warehouse_location_code_snapshot,i.fabric_account_number_snapshot,
    i.fabric_order_number_snapshot,i.usage_reading_value,i.usage_reading_unit,i.driving_use_limit,
    i.responsible_person,i.expected_return_date,i.serial_verified
  from public.loan_case_items i where i.case_id=p_case_id;

  update public.loan_cases set current_version_number=v_number,status='AWAITING_ACCEPTANCE',updated_at=now()
  where id=p_case_id;
  insert into public.loan_case_events(case_id,case_version_id,event_type,actor_user_id,from_status,to_status,metadata)
  values(p_case_id,v_version,'VERSION_CREATED',v_actor,'READY_FOR_REVIEW','AWAITING_ACCEPTANCE',
    jsonb_build_object('version_number',v_number,'term_version_id',v_terms));
  return v_number;
end;
$$;
revoke all on function public.loan_create_case_version(uuid,boolean) from public, anon;
grant execute on function public.loan_create_case_version(uuid,boolean) to authenticated;
