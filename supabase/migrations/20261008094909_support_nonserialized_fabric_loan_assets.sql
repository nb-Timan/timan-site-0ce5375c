-- Keep Fabric as source of inventory facts while giving every physical loan unit
-- a stable identity, including C5 lines that do not have a serial number.
alter table public.fabric_loan_assets_current
  add column asset_instance_id text,
  add column instance_ordinal integer not null default 1;

update public.fabric_loan_assets_current
set asset_instance_id = 'SERIAL|' || btrim(company) || '|' || serial_number_normalized;

alter table public.fabric_loan_assets_current
  alter column asset_instance_id set not null,
  alter column serial_number drop not null,
  drop constraint fabric_loan_assets_current_serial_number_check,
  add constraint fabric_loan_assets_current_asset_instance_id_check check (btrim(asset_instance_id) <> ''),
  add constraint fabric_loan_assets_current_instance_ordinal_check check (instance_ordinal between 1 and 10000),
  add constraint fabric_loan_assets_current_serial_number_check check (
    serial_number is null or btrim(serial_number) <> ''
  ),
  add constraint fabric_loan_assets_current_asset_instance_id_key unique (asset_instance_id);

alter table public.loan_asset_portal_metadata
  add column asset_id uuid references public.fabric_loan_assets_current(asset_id);

update public.loan_asset_portal_metadata m
set asset_id = f.asset_id
from public.fabric_loan_assets_current f
where f.company = m.company
  and f.serial_number_normalized = m.serial_number_normalized;

alter table public.loan_asset_portal_metadata
  drop constraint loan_asset_portal_metadata_pkey,
  drop constraint loan_asset_portal_metadata_serial_number_normalized_check,
  alter column serial_number_normalized drop not null,
  alter column asset_id set not null,
  add constraint loan_asset_portal_metadata_pkey primary key (asset_id),
  add constraint loan_asset_portal_metadata_serial_number_normalized_check check (
    serial_number_normalized is null or (
      btrim(serial_number_normalized) <> ''
      and serial_number_normalized = upper(btrim(serial_number_normalized))
    )
  ),
  add constraint loan_asset_portal_metadata_brik_number_key unique (brik_number);

create unique index loan_asset_portal_metadata_serial_unique
  on public.loan_asset_portal_metadata(company, serial_number_normalized)
  where serial_number_normalized is not null;

alter table public.loan_case_items
  add column asset_instance_id_snapshot text,
  add column brik_number_snapshot integer;

alter table public.loan_case_version_items
  add column asset_instance_id_snapshot text,
  add column brik_number_snapshot integer;

update public.loan_case_items i
set asset_instance_id_snapshot = f.asset_instance_id,
    brik_number_snapshot = m.brik_number
from public.fabric_loan_assets_current f
left join public.loan_asset_portal_metadata m on m.asset_id = f.asset_id
where i.fabric_asset_id = f.asset_id;

update public.loan_case_version_items i
set asset_instance_id_snapshot = f.asset_instance_id,
    brik_number_snapshot = m.brik_number
from public.fabric_loan_assets_current f
left join public.loan_asset_portal_metadata m on m.asset_id = f.asset_id
where i.fabric_asset_id = f.asset_id;

create or replace function public.fabric_loan_sync_publish(
  p_run_id uuid,
  p_source_as_of timestamptz,
  p_rows jsonb
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s public.fabric_loan_sync_state%rowtype;
  n integer;
begin
  select * into s from public.fabric_loan_sync_state where singleton for update;
  if p_run_id is null or not s.enabled or s.running_run_id is distinct from p_run_id
    or s.lease_until is null or s.lease_until <= now() then
    raise exception 'STALE_SYNC_LEASE';
  end if;
  if p_source_as_of is null or p_source_as_of < now()-interval '10 minutes'
    or p_source_as_of > now()+interval '1 minute'
    or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>10000 then
    raise exception 'INVALID_SNAPSHOT';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where
    jsonb_typeof(r) <> 'object' or nullif(btrim(r->>'company'),'') is null
    or nullif(btrim(r->>'asset_instance_id'),'') is null
    or nullif(btrim(r->>'item_number'),'') is null
    or coalesce((r->>'instance_ordinal') ~ '^[1-9][0-9]{0,3}$',false) is not true
    or (r->>'serial_number' is not null and nullif(btrim(r->>'serial_number'),'') is null)
    or not (r ?& array['review_required','identity_conflict','warehouse_location_code','classification'])
    or (r - array['asset_instance_id','instance_ordinal','company','account_number','order_number','line_number',
      'item_number','item_name','line_text','serial_number','warehouse_location_code','warehouse_location_name',
      'inventory_qty','reserved_qty','stock_last_changed','source_row_number','classification','review_required',
      'review_reason','identity_conflict']) <> '{}'::jsonb
  ) then raise exception 'INVALID_SNAPSHOT'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r
    group by btrim(r->>'asset_instance_id') having count(*)>1) then
    raise exception 'INVALID_SNAPSHOT';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r
    where nullif(btrim(r->>'serial_number'),'') is not null
    group by btrim(r->>'company'),upper(btrim(r->>'serial_number')) having count(*)>1) then
    raise exception 'INVALID_SNAPSHOT';
  end if;

  insert into public.fabric_loan_assets_current (
    asset_instance_id,instance_ordinal,company,account_number,order_number,line_number,item_number,item_name,
    line_text,serial_number,warehouse_location_code,warehouse_location_name,inventory_qty,reserved_qty,
    stock_last_changed,source_row_number,classification,review_required,review_reason,identity_conflict,
    source_as_of,sync_run_id,synced_at,source_present
  ) select btrim(r.asset_instance_id),r.instance_ordinal,btrim(r.company),r.account_number,r.order_number,r.line_number,
    r.item_number,r.item_name,r.line_text,r.serial_number,r.warehouse_location_code,r.warehouse_location_name,
    r.inventory_qty,r.reserved_qty,r.stock_last_changed,r.source_row_number,r.classification,r.review_required,
    r.review_reason,r.identity_conflict,p_source_as_of,p_run_id,now(),true
  from jsonb_to_recordset(p_rows) as r(asset_instance_id text,instance_ordinal integer,company text,
    account_number text,order_number text,line_number numeric,item_number text,item_name text,line_text text,
    serial_number text,warehouse_location_code text,warehouse_location_name text,inventory_qty numeric,
    reserved_qty numeric,stock_last_changed timestamp,source_row_number bigint,classification text,
    review_required boolean,review_reason text,identity_conflict boolean)
  on conflict(asset_instance_id) do update set
    instance_ordinal=excluded.instance_ordinal,company=excluded.company,account_number=excluded.account_number,
    order_number=excluded.order_number,line_number=excluded.line_number,item_number=excluded.item_number,
    item_name=excluded.item_name,line_text=excluded.line_text,serial_number=excluded.serial_number,
    warehouse_location_code=excluded.warehouse_location_code,warehouse_location_name=excluded.warehouse_location_name,
    inventory_qty=excluded.inventory_qty,reserved_qty=excluded.reserved_qty,
    stock_last_changed=excluded.stock_last_changed,source_row_number=excluded.source_row_number,
    classification=excluded.classification,review_required=excluded.review_required,
    review_reason=excluded.review_reason,identity_conflict=excluded.identity_conflict,
    source_as_of=excluded.source_as_of,sync_run_id=excluded.sync_run_id,synced_at=excluded.synced_at,
    source_present=true;
  get diagnostics n = row_count;
  update public.fabric_loan_assets_current set source_present=false where sync_run_id<>p_run_id and source_present;
  update public.fabric_loan_sync_runs set status='SUCCEEDED',completed_at=now(),row_count=n where id=p_run_id;
  update public.fabric_loan_sync_state set running_run_id=null,lease_until=null,last_success_at=now(),
    source_as_of=p_source_as_of,last_error_code=null where singleton;
  return n;
end;
$$;
revoke all on function public.fabric_loan_sync_publish(uuid,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.fabric_loan_sync_publish(uuid,timestamptz,jsonb) to service_role;

create or replace function public.loan_guard_asset_allocation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_serial text;
  v_company text;
  v_instance text;
begin
  if new.allocation_status<>'active' then return new; end if;
  if new.fabric_asset_id is not null then
    select serial_number_normalized,company,asset_instance_id into v_serial,v_company,v_instance
    from public.fabric_loan_assets_current where asset_id=new.fabric_asset_id;
    if nullif(v_instance,'') is null then raise exception 'Invalid physical asset'; end if;
    perform pg_advisory_xact_lock(hashtextextended('loan-asset:'||v_instance,0));
  else
    select upper(btrim(serial_number)) into v_serial from public.planning_supply_units where id=new.supply_unit_id;
    if nullif(v_serial,'') is null then raise exception 'Invalid serialized asset'; end if;
    perform pg_advisory_xact_lock(hashtextextended('loan-serial:'||v_serial,0));
  end if;
  if v_serial is not null and exists (
    select 1 from public.loan_asset_allocations a
    left join public.fabric_loan_assets_current f on f.asset_id=a.fabric_asset_id
    left join public.planning_supply_units p on p.id=a.supply_unit_id
    where a.allocation_status='active' and a.id<>new.id
      and coalesce(f.serial_number_normalized,upper(btrim(p.serial_number)))=v_serial
      and (v_company is null or f.company is null or f.company=v_company)
  ) then raise exception 'Asset is already allocated'; end if;
  return new;
end;
$$;
revoke all on function public.loan_guard_asset_allocation() from public, anon, authenticated;

create or replace function public.loan_stock_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_assets jsonb;
begin
  if not public.loan_can_browse_stock() then raise exception 'Loan stock access denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.warehouse_location_code,q.item_number,
    q.serial_number nulls last,q.instance_ordinal),'[]'::jsonb) into v_assets
  from (
    select f.*, m.brik_number, public.loan_resolve_fabric_item_type(f.item_number) as item_type,
    exists(select 1 from public.loan_asset_allocations a
      left join public.planning_supply_units p on p.id=a.supply_unit_id
      where a.allocation_status='active' and (a.fabric_asset_id=f.asset_id or
        (f.serial_number_normalized is not null and upper(btrim(p.serial_number))=f.serial_number_normalized))
    ) or exists(select 1 from public.planning_reservations r join public.planning_supply_units p on p.id=r.supply_unit_id
      where r.status='active' and f.serial_number_normalized is not null
        and upper(btrim(p.serial_number))=f.serial_number_normalized) as allocated
    from public.fabric_loan_assets_current f
    left join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
    where f.source_present and (public.can_administer_loans()
      or (f.classification='LOAN_CANDIDATE' and not f.review_required and not f.identity_conflict
        and (f.serial_number_normalized is not null or m.brik_number is not null)))
  ) q;
  return jsonb_build_object('assets',v_assets,'sync',public.loan_stock_status());
end;
$$;
revoke all on function public.loan_stock_snapshot() from public, anon;
grant execute on function public.loan_stock_snapshot() to authenticated;

create or replace function public.loan_set_asset_brik_number(p_asset_id uuid, p_brik_number integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_company text;
  v_serial text;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.can_administer_loans() then
    raise exception 'Loan asset metadata access denied';
  end if;
  if p_brik_number is not null and (p_brik_number < 1 or p_brik_number > 999999) then
    raise exception 'Invalid brik number';
  end if;
  select company,serial_number_normalized into v_company,v_serial
  from public.fabric_loan_assets_current where asset_id=p_asset_id and source_present for share;
  if not found then raise exception 'Loan asset not found'; end if;

  if p_brik_number is null then
    delete from public.loan_asset_portal_metadata where asset_id=p_asset_id;
  else
    insert into public.loan_asset_portal_metadata(
      asset_id,company,serial_number_normalized,brik_number,updated_by_app_user_id,updated_at
    ) values(p_asset_id,v_company,v_serial,p_brik_number,v_actor,now())
    on conflict(asset_id) do update set
      company=excluded.company,serial_number_normalized=excluded.serial_number_normalized,
      brik_number=excluded.brik_number,updated_by_app_user_id=excluded.updated_by_app_user_id,
      updated_at=excluded.updated_at;
  end if;
  return jsonb_build_object('asset_id',p_asset_id,'brik_number',p_brik_number);
exception when unique_violation then raise exception 'Brik number is already assigned';
end;
$$;
revoke all on function public.loan_set_asset_brik_number(uuid,integer) from public, anon;
grant execute on function public.loan_set_asset_brik_number(uuid,integer) to authenticated;

create or replace function public.loan_add_fabric_asset_item(p_case_id uuid,p_asset_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_item uuid;
  f public.fabric_loan_assets_current%rowtype;
  v_type text;
  v_status text;
  v_brik integer;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select status into v_status from public.loan_cases where id=p_case_id for update;
  if v_status is distinct from 'DRAFT' then raise exception 'Only draft cases can be edited'; end if;
  perform 1 from public.fabric_loan_sync_state
  where singleton and enabled and source_as_of>=now()-make_interval(secs=>stale_after_seconds) for share;
  if not found then raise exception 'FABRIC_STALE'; end if;
  select * into f from public.fabric_loan_assets_current where asset_id=p_asset_id for share;
  if not found or not f.source_present or f.classification<>'LOAN_CANDIDATE' or f.review_required
    or f.identity_conflict or f.warehouse_location_code not in ('2','4') then
    raise exception 'Asset is not loan eligible';
  end if;
  select brik_number into v_brik from public.loan_asset_portal_metadata where asset_id=f.asset_id;
  if f.serial_number_normalized is null and v_brik is null then raise exception 'Asset requires a Brik number'; end if;

  v_type:=public.loan_resolve_fabric_item_type(f.item_number);
  if v_type is null then raise exception 'Asset has no canonical Portal classification'; end if;
  if f.serial_number_normalized is not null and exists(
    select 1 from public.planning_reservations r
    join public.planning_supply_units p on p.id=r.supply_unit_id
    where r.status='active' and upper(btrim(p.serial_number))=f.serial_number_normalized
  ) then raise exception 'Asset is already allocated'; end if;

  insert into public.loan_case_items(
    case_id,item_type,product_sku,fabric_asset_id,serial_snapshot,asset_instance_id_snapshot,
    brik_number_snapshot,product_name_snapshot,warehouse_snapshot,warehouse_location_code_snapshot,
    fabric_account_number_snapshot,fabric_order_number_snapshot,expected_return_date,created_by
  ) select p_case_id,v_type,f.item_number,f.asset_id,f.serial_number,f.asset_instance_id,v_brik,f.item_name,
    f.warehouse_location_name,f.warehouse_location_code,f.account_number,f.order_number,
    c.expected_return_date,v_actor from public.loan_cases c where c.id=p_case_id
  returning id into v_item;
  insert into public.loan_asset_allocations(case_item_id,fabric_asset_id,allocated_by)
  values(v_item,f.asset_id,v_actor);
  update public.loan_cases set serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now()
  where id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'ASSET_ADDED',v_actor,jsonb_strip_nulls(jsonb_build_object(
    'case_item_id',v_item,'fabric_asset_id',f.asset_id,'asset_instance_id',f.asset_instance_id,
    'serial_number',f.serial_number,'brik_number',v_brik
  )));
  return v_item;
exception when unique_violation then raise exception 'Asset is already allocated';
end;
$$;
revoke all on function public.loan_add_fabric_asset_item(uuid,uuid) from public, anon;
grant execute on function public.loan_add_fabric_asset_item(uuid,uuid) to authenticated;

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
      (nullif(btrim(i.serial_snapshot),'') is null and
        (i.fabric_asset_id is null or nullif(btrim(i.asset_instance_id_snapshot),'') is null or i.brik_number_snapshot is null))
      or not exists(select 1 from public.loan_asset_allocations a
        where a.case_item_id=i.id and a.allocation_status='active')
    ))
  ) then raise exception 'Every item requires an active canonical physical identity'; end if;
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

create or replace function public.loan_submit_for_review(
  p_case_id uuid,
  p_serial_numbers_confirmed boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_case public.loan_cases%rowtype;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select * into v_case from public.loan_cases where id=p_case_id for update;
  if v_case.status<>'DRAFT' then raise exception 'Only draft cases can be submitted for review'; end if;
  if v_case.responsible_user_id is null or v_case.dealer_account_id is null or v_case.dealer_contact_id is null then
    raise exception 'Seller, partner and contact are required';
  end if;
  if v_case.loan_date is null then raise exception 'Loan date is required'; end if;
  if v_case.expected_return_date is null then raise exception 'Expected return date is required'; end if;
  if v_case.expected_return_date<v_case.loan_date then raise exception 'Expected return must be on or after loan date'; end if;
  if not exists(select 1 from public.loan_case_items where case_id=p_case_id) then
    raise exception 'At least one item is required';
  end if;
  if exists(select 1 from public.loan_case_items i where i.case_id=p_case_id and (
    (i.planning_supply_unit_id is null and i.fabric_asset_id is null)
    or (nullif(btrim(i.serial_snapshot),'') is null and
      (i.fabric_asset_id is null or nullif(btrim(i.asset_instance_id_snapshot),'') is null or i.brik_number_snapshot is null))
    or not exists(select 1 from public.loan_asset_allocations a
      where a.case_item_id=i.id and a.allocation_status='active')
  )) then raise exception 'Every item requires an active canonical physical identity'; end if;
  if exists(select 1 from public.loan_case_items i where i.case_id=p_case_id and not exists(
    select 1 from public.loan_case_item_photos p where p.case_item_id=i.id and p.photo_kind='serial_plate'
  )) then raise exception 'A type plate photo is required for every item'; end if;
  if exists(select 1 from public.loan_case_items i where i.case_id=p_case_id and i.item_type='machine' and (
    i.usage_reading_value is null or coalesce(i.usage_reading_unit not in ('km','hours'),true)
  )) then raise exception 'Machine checkout meter value and unit are required'; end if;
  if p_serial_numbers_confirmed is distinct from true then raise exception 'Physical identity confirmation is required'; end if;

  update public.loan_cases set status='READY_FOR_REVIEW',serial_numbers_confirmed_by=v_actor,
    serial_numbers_confirmed_at=now(),updated_at=now() where id=p_case_id;
  update public.loan_case_items set serial_verified=true,serial_verified_by=v_actor,
    serial_verified_at=now(),updated_at=now() where case_id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,from_status,to_status,metadata)
  values(p_case_id,'CHECKOUT_READY_FOR_REVIEW',v_actor,'DRAFT','READY_FOR_REVIEW',
    jsonb_build_object('physical_identities_confirmed',true));
end;
$$;
revoke all on function public.loan_submit_for_review(uuid,boolean) from public, anon;
grant execute on function public.loan_submit_for_review(uuid,boolean) to authenticated;

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
    or v_case.serial_numbers_confirmed_at is null then raise exception 'Physical identity confirmation is required'; end if;
  select t.id into v_terms from public.loan_term_versions t
  join public.loan_term_translations x on x.term_version_id=t.id and x.language_code=v_case.language_code
  where t.status='APPROVED' order by t.version_number desc limit 1;
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
    case_version_id,source_item_id,item_type,product_sku,planning_supply_unit_id,fabric_asset_id,
    serial_snapshot,asset_instance_id_snapshot,brik_number_snapshot,product_name_snapshot,warehouse_snapshot,
    warehouse_location_code_snapshot,fabric_account_number_snapshot,fabric_order_number_snapshot,
    usage_reading_value,usage_reading_unit,driving_use_limit,responsible_person,expected_return_date,serial_verified
  ) select v_version,i.id,i.item_type,i.product_sku,i.planning_supply_unit_id,i.fabric_asset_id,
    i.serial_snapshot,i.asset_instance_id_snapshot,i.brik_number_snapshot,i.product_name_snapshot,
    i.warehouse_snapshot,i.warehouse_location_code_snapshot,i.fabric_account_number_snapshot,
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

comment on column public.fabric_loan_assets_current.asset_instance_id is
  'Stable Fabric-owned physical-unit identity; serial-based or source-line plus instance ordinal.';
comment on column public.fabric_loan_assets_current.instance_ordinal is
  'One-based physical-unit ordinal used when a non-serialized C5 line has quantity greater than one.';
comment on column public.loan_case_items.brik_number_snapshot is
  'Immutable Portal-owned Brik number captured when a non-serialized asset is selected.';
