-- Derived read-cache only. No Fabric writes, finance fields or user permission changes.
create table public.fabric_loan_sync_state (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  running_run_id uuid,
  lease_until timestamptz,
  last_success_at timestamptz,
  source_as_of timestamptz,
  last_error_code text,
  refresh_requested_at timestamptz,
  stale_after_seconds integer not null default 900 check (stale_after_seconds between 300 and 3600)
);
insert into public.fabric_loan_sync_state(singleton) values(true);
create table public.fabric_loan_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('SCHEDULED','MANUAL')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'RUNNING' check (status in ('RUNNING','SUCCEEDED','FAILED')),
  row_count integer,
  error_code text,
  external_snapshot_id uuid unique,
  payload_hash text
);
create table public.fabric_loan_assets_current (
  asset_id uuid primary key default gen_random_uuid(),
  company text not null check (btrim(company) <> ''),
  account_number text,
  order_number text,
  line_number numeric,
  item_number text not null check (btrim(item_number) <> ''),
  item_name text,
  serial_number text not null check (btrim(serial_number) <> ''),
  serial_number_normalized text generated always as (upper(btrim(serial_number))) stored,
  warehouse_location_code text not null,
  warehouse_location_name text,
  inventory_qty numeric,
  reserved_qty numeric,
  stock_last_changed timestamp,
  source_row_number bigint,
  classification text not null check (classification in ('LOAN_CANDIDATE','REVIEW_REQUIRED','IDENTITY_CONFLICT','SOLD','EXCLUDED')),
  review_required boolean not null,
  review_reason text,
  identity_conflict boolean not null,
  source_as_of timestamptz not null,
  sync_run_id uuid not null references public.fabric_loan_sync_runs(id),
  synced_at timestamptz not null default now(),
  source_present boolean not null default true,
  unique(company, serial_number_normalized)
);

create function public.loan_can_browse_stock()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_access_loans() and exists (
    select 1 from public.app_users u where u.auth_user_id=auth.uid()
    and u.portal_role::text in ('timan_backend','timan_seller','timan_service')
  )
$$;
revoke all on function public.loan_can_browse_stock() from public, anon;
grant execute on function public.loan_can_browse_stock() to authenticated;

alter table public.fabric_loan_assets_current enable row level security;
alter table public.fabric_loan_sync_state enable row level security;
alter table public.fabric_loan_sync_runs enable row level security;
revoke all on public.fabric_loan_assets_current, public.fabric_loan_sync_state, public.fabric_loan_sync_runs from public, anon, authenticated;
grant select on public.fabric_loan_assets_current to authenticated;
grant all on public.fabric_loan_assets_current, public.fabric_loan_sync_state, public.fabric_loan_sync_runs to service_role;
create policy fabric_loan_stock_read on public.fabric_loan_assets_current for select to authenticated using (
  (select public.loan_can_browse_stock()) and source_present and (
    (select public.can_administer_loans()) or
    (classification='LOAN_CANDIDATE' and not review_required and not identity_conflict)
  )
);

-- One lease covers both the scheduled and on-demand paths. Expired workers cannot publish.
create function public.fabric_loan_sync_begin(p_trigger_type text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.fabric_loan_sync_state%rowtype; v_id uuid;
begin
  select * into s from public.fabric_loan_sync_state where singleton for update;
  if not s.enabled then raise exception 'FABRIC_NOT_CONFIGURED'; end if;
  if s.running_run_id is not null and s.lease_until > now() then return null; end if;
  if s.running_run_id is not null then
    update public.fabric_loan_sync_runs set status='FAILED',completed_at=now(),error_code='SYNC_TIMEOUT'
    where id=s.running_run_id and status='RUNNING';
  end if;
  insert into public.fabric_loan_sync_runs(trigger_type) values(p_trigger_type) returning id into v_id;
  update public.fabric_loan_sync_state set running_run_id=v_id,lease_until=now()+interval '2 minutes' where singleton;
  return v_id;
end;
$$;
revoke all on function public.fabric_loan_sync_begin(text) from public, anon, authenticated;
grant execute on function public.fabric_loan_sync_begin(text) to service_role;

create function public.fabric_loan_sync_fail(p_run_id uuid, p_error_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.fabric_loan_sync_state where singleton for update;
  update public.fabric_loan_sync_runs set status='FAILED',completed_at=now(),error_code=case
    when p_error_code in ('SOURCE_UNAVAILABLE','INVALID_SNAPSHOT','SYNC_TIMEOUT') then p_error_code else 'SYNC_FAILED' end
  where id=p_run_id and status='RUNNING';
  update public.fabric_loan_sync_state set running_run_id=null,lease_until=null,last_error_code='SYNC_FAILED'
  where singleton and running_run_id=p_run_id;
  -- Deliberately do not touch the last successful snapshot or its timestamp.
end;
$$;
revoke all on function public.fabric_loan_sync_fail(uuid,text) from public, anon, authenticated;
grant execute on function public.fabric_loan_sync_fail(uuid,text) to service_role;

create function public.fabric_loan_sync_publish(p_run_id uuid, p_source_as_of timestamptz, p_rows jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare s public.fabric_loan_sync_state%rowtype; n integer;
begin
  select * into s from public.fabric_loan_sync_state where singleton for update;
  if p_run_id is null or not s.enabled or s.running_run_id is distinct from p_run_id or s.lease_until is null or s.lease_until <= now() then raise exception 'STALE_SYNC_LEASE'; end if;
  if p_source_as_of is null or p_source_as_of < now()-interval '10 minutes' or p_source_as_of > now()+interval '1 minute'
    or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>10000 then
    raise exception 'INVALID_SNAPSHOT';
  end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where
    jsonb_typeof(r) <> 'object' or nullif(btrim(r->>'company'),'') is null
    or nullif(btrim(r->>'serial_number'),'') is null or nullif(btrim(r->>'item_number'),'') is null
    or not (r ?& array['review_required','identity_conflict','warehouse_location_code','classification'])
    or (r - array['company','account_number','order_number','line_number','item_number','item_name','serial_number',
      'warehouse_location_code','warehouse_location_name','inventory_qty','reserved_qty','stock_last_changed',
      'source_row_number','classification','review_required','review_reason','identity_conflict']) <> '{}'::jsonb
  ) then raise exception 'INVALID_SNAPSHOT'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r group by btrim(r->>'company'),upper(btrim(r->>'serial_number')) having count(*)>1) then
    raise exception 'INVALID_SNAPSHOT';
  end if;
  insert into public.fabric_loan_assets_current (
    company,account_number,order_number,line_number,item_number,item_name,serial_number,warehouse_location_code,
    warehouse_location_name,inventory_qty,reserved_qty,stock_last_changed,source_row_number,classification,
    review_required,review_reason,identity_conflict,source_as_of,sync_run_id,synced_at,source_present
  ) select btrim(r.company),r.account_number,r.order_number,r.line_number,r.item_number,r.item_name,r.serial_number,
    r.warehouse_location_code,r.warehouse_location_name,r.inventory_qty,r.reserved_qty,r.stock_last_changed,
    r.source_row_number,r.classification,r.review_required,r.review_reason,r.identity_conflict,p_source_as_of,p_run_id,now(),true
  from jsonb_to_recordset(p_rows) as r(company text,account_number text,order_number text,line_number numeric,item_number text,
    item_name text,serial_number text,warehouse_location_code text,warehouse_location_name text,inventory_qty numeric,
    reserved_qty numeric,stock_last_changed timestamp,source_row_number bigint,classification text,review_required boolean,
    review_reason text,identity_conflict boolean)
  on conflict(company,serial_number_normalized) do update set
    account_number=excluded.account_number,order_number=excluded.order_number,line_number=excluded.line_number,
    item_number=excluded.item_number,item_name=excluded.item_name,serial_number=excluded.serial_number,
    warehouse_location_code=excluded.warehouse_location_code,warehouse_location_name=excluded.warehouse_location_name,
    inventory_qty=excluded.inventory_qty,reserved_qty=excluded.reserved_qty,stock_last_changed=excluded.stock_last_changed,
    source_row_number=excluded.source_row_number,classification=excluded.classification,review_required=excluded.review_required,
    review_reason=excluded.review_reason,identity_conflict=excluded.identity_conflict,source_as_of=excluded.source_as_of,
    sync_run_id=excluded.sync_run_id,synced_at=excluded.synced_at,source_present=true;
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

create function public.loan_stock_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('configured',enabled,'running',(running_run_id is not null and lease_until>now()) or refresh_requested_at is not null,
    'refresh_requested_at',refresh_requested_at,
    'last_success_at',last_success_at,'source_as_of',source_as_of,'stale_after_seconds',stale_after_seconds,
    'failed',last_error_code is not null or (running_run_id is not null and lease_until<=now()),
    'stale',source_as_of is null or source_as_of<now()-make_interval(secs=>stale_after_seconds))
  from public.fabric_loan_sync_state where singleton and public.loan_can_browse_stock()
$$;
revoke all on function public.loan_stock_status() from public, anon;
grant execute on function public.loan_stock_status() to authenticated;

-- Fabric owns scheduling and source reads. Portal can only request the next push.
create function public.loan_request_fabric_refresh()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.fabric_loan_sync_state%rowtype;
begin
  if not public.can_administer_loans() then raise exception 'Loan refresh access denied'; end if;
  select * into s from public.fabric_loan_sync_state where singleton for update;
  if not s.enabled then raise exception 'FABRIC_NOT_CONFIGURED'; end if;
  update public.fabric_loan_sync_state
    set refresh_requested_at=coalesce(refresh_requested_at,now()) where singleton;
  return jsonb_build_object('status','QUEUED');
end;
$$;
revoke all on function public.loan_request_fabric_refresh() from public, anon;
grant execute on function public.loan_request_fabric_refresh() to authenticated;

-- A transaction publishes the entire validated snapshot or nothing. External IDs fence retries.
create function public.fabric_loan_ingest_snapshot(p_snapshot_id uuid,p_source_as_of timestamptz,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.fabric_loan_sync_state%rowtype;
  previous public.fabric_loan_sync_runs%rowtype;
  v_run uuid;
  v_hash text;
  v_count integer;
begin
  select * into s from public.fabric_loan_sync_state where singleton for update;
  if not s.enabled then raise exception 'FABRIC_NOT_CONFIGURED'; end if;
  if p_snapshot_id is null or p_source_as_of is null or jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows)>10000 then raise exception 'INVALID_SNAPSHOT'; end if;
  v_hash:=md5(p_source_as_of::text||':'||p_rows::text);
  select * into previous from public.fabric_loan_sync_runs where external_snapshot_id=p_snapshot_id;
  if found then
    if previous.payload_hash is distinct from v_hash then raise exception 'SNAPSHOT_ID_REUSED'; end if;
    if previous.status='SUCCEEDED' then
      return jsonb_build_object('status','SUCCEEDED','rowCount',previous.row_count,'duplicate',true);
    end if;
    raise exception 'SYNC_IN_PROGRESS';
  end if;
  if s.source_as_of is not null and p_source_as_of<=s.source_as_of then raise exception 'STALE_SNAPSHOT'; end if;
  v_run:=public.fabric_loan_sync_begin(case when s.refresh_requested_at is not null then 'MANUAL' else 'SCHEDULED' end);
  if v_run is null then raise exception 'SYNC_IN_PROGRESS'; end if;
  update public.fabric_loan_sync_runs set external_snapshot_id=p_snapshot_id,payload_hash=v_hash where id=v_run;
  v_count:=public.fabric_loan_sync_publish(v_run,p_source_as_of,p_rows);
  update public.fabric_loan_sync_state set refresh_requested_at=null
    where singleton and refresh_requested_at<=p_source_as_of;
  return jsonb_build_object('status','SUCCEEDED','rowCount',v_count,'duplicate',false);
end;
$$;
revoke all on function public.fabric_loan_ingest_snapshot(uuid,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.fabric_loan_ingest_snapshot(uuid,timestamptz,jsonb) to service_role;

alter table public.loan_case_items add column fabric_asset_id uuid references public.fabric_loan_assets_current(asset_id);
alter table public.loan_case_items drop constraint loan_case_items_check;
alter table public.loan_case_items add constraint loan_case_items_check check (
  item_type='equipment' or planning_supply_unit_id is not null or fabric_asset_id is not null
);
alter table public.loan_asset_allocations add column fabric_asset_id uuid references public.fabric_loan_assets_current(asset_id);
alter table public.loan_asset_allocations alter column supply_unit_id drop not null;
alter table public.loan_asset_allocations add constraint loan_allocation_source_required
  check (num_nonnulls(supply_unit_id,fabric_asset_id)=1);
create unique index loan_allocations_fabric_active_unique on public.loan_asset_allocations(fabric_asset_id)
  where allocation_status='active' and fabric_asset_id is not null;

-- The projection has one stable asset_id per company + normalized serial. Bridge legacy
-- Planning allocations conservatively by exact normalized serial; never infer their company.
create function public.loan_guard_asset_allocation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_serial text; v_company text;
begin
  if new.allocation_status<>'active' then return new; end if;
  if new.fabric_asset_id is not null then
    select serial_number_normalized,company into v_serial,v_company from public.fabric_loan_assets_current where asset_id=new.fabric_asset_id;
  else
    select upper(btrim(serial_number)) into v_serial from public.planning_supply_units where id=new.supply_unit_id;
  end if;
  if nullif(v_serial,'') is null then raise exception 'Invalid serialized asset'; end if;
  perform pg_advisory_xact_lock(hashtextextended('loan-serial:'||v_serial,0));
  if exists (
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
create trigger loan_allocation_serial_guard before insert or update on public.loan_asset_allocations
  for each row execute function public.loan_guard_asset_allocation();

create function public.loan_stock_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_assets jsonb;
begin
  if not public.loan_can_browse_stock() then raise exception 'Loan stock access denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.warehouse_location_code,q.item_number,q.serial_number),'[]'::jsonb) into v_assets
  from (
    select f.*, case
      when exists(select 1 from public.planning_machine_products m where m.item_number=f.item_number)
        and not exists(select 1 from public.planning_accessory_products a where a.item_number=f.item_number) then 'machine'
      when exists(select 1 from public.planning_accessory_products a where a.item_number=f.item_number)
        and not exists(select 1 from public.planning_machine_products m where m.item_number=f.item_number) then 'equipment'
    end as item_type,
    exists(select 1 from public.loan_asset_allocations a
      left join public.planning_supply_units p on p.id=a.supply_unit_id
      where a.allocation_status='active' and (a.fabric_asset_id=f.asset_id or upper(btrim(p.serial_number))=f.serial_number_normalized)
    ) or exists(select 1 from public.planning_reservations r join public.planning_supply_units p on p.id=r.supply_unit_id
      where r.status='active' and upper(btrim(p.serial_number))=f.serial_number_normalized) as allocated
    from public.fabric_loan_assets_current f
    where f.source_present and (public.can_administer_loans()
      or (f.classification='LOAN_CANDIDATE' and not f.review_required and not f.identity_conflict))
  ) q;
  return jsonb_build_object('assets',v_assets,'sync',public.loan_stock_status());
end;
$$;
revoke all on function public.loan_stock_snapshot() from public, anon;
grant execute on function public.loan_stock_snapshot() to authenticated;

create function public.loan_add_fabric_asset_item(p_case_id uuid,p_asset_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_item uuid; f public.fabric_loan_assets_current%rowtype; v_type text; v_status text;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select status into v_status from public.loan_cases where id=p_case_id for update;
  if v_status is distinct from 'DRAFT' then raise exception 'Only draft cases can be edited'; end if;
  -- Share lock prevents snapshot publication between freshness/eligibility check and allocation.
  perform 1 from public.fabric_loan_sync_state where singleton and enabled and source_as_of>=now()-make_interval(secs=>stale_after_seconds) for share;
  if not found then raise exception 'FABRIC_STALE'; end if;
  select * into f from public.fabric_loan_assets_current where asset_id=p_asset_id for share;
  if not found or not f.source_present or f.classification<>'LOAN_CANDIDATE' or f.review_required or f.identity_conflict
    or f.warehouse_location_code not in ('2','4') then raise exception 'Asset is not loan eligible'; end if;
  if exists(select 1 from public.planning_machine_products where item_number=f.item_number)
    and not exists(select 1 from public.planning_accessory_products where item_number=f.item_number) then v_type:='machine';
  elsif exists(select 1 from public.planning_accessory_products where item_number=f.item_number)
    and not exists(select 1 from public.planning_machine_products where item_number=f.item_number) then v_type:='equipment';
  else raise exception 'Asset has no canonical Planning classification'; end if;
  if exists(select 1 from public.planning_reservations r join public.planning_supply_units p on p.id=r.supply_unit_id
    where r.status='active' and upper(btrim(p.serial_number))=f.serial_number_normalized) then raise exception 'Asset is already allocated'; end if;
  insert into public.loan_case_items(case_id,item_type,product_sku,fabric_asset_id,serial_snapshot,product_name_snapshot,
    warehouse_snapshot,expected_return_date,created_by)
  select p_case_id,v_type,f.item_number,f.asset_id,f.serial_number,f.item_name,f.warehouse_location_name,c.expected_return_date,v_actor
  from public.loan_cases c where c.id=p_case_id returning id into v_item;
  insert into public.loan_asset_allocations(case_item_id,fabric_asset_id,allocated_by) values(v_item,f.asset_id,v_actor);
  update public.loan_cases set serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now() where id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'ASSET_ADDED',v_actor,jsonb_build_object('case_item_id',v_item,'fabric_asset_id',f.asset_id));
  return v_item;
exception when unique_violation then raise exception 'Asset is already allocated';
end;
$$;
revoke all on function public.loan_add_fabric_asset_item(uuid,uuid) from public, anon;
grant execute on function public.loan_add_fabric_asset_item(uuid,uuid) to authenticated;

create or replace function public.loan_remove_draft_item(p_case_id uuid,p_case_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_status text;
begin
  v_actor:=public.loan_actor_id();
  if v_actor is null or not public.loan_can_manage_case(p_case_id) then raise exception 'Loan case management denied'; end if;
  select status into v_status from public.loan_cases where id=p_case_id for update;
  if v_status is distinct from 'DRAFT' then raise exception 'Only draft cases can be edited'; end if;
  if not exists(select 1 from public.loan_case_items where id=p_case_item_id and case_id=p_case_id) then raise exception 'Invalid loan item'; end if;
  update public.loan_asset_allocations set allocation_status='released',released_by=v_actor,released_at=now(),release_reason='DRAFT_ITEM_REMOVED'
  where case_item_id=p_case_item_id and allocation_status='active';
  delete from public.loan_case_items where id=p_case_item_id and case_id=p_case_id;
  update public.loan_cases set serial_numbers_confirmed_by=null,serial_numbers_confirmed_at=null,updated_at=now() where id=p_case_id;
  insert into public.loan_case_events(case_id,event_type,actor_user_id,metadata)
  values(p_case_id,'ASSET_REMOVED',v_actor,jsonb_build_object('case_item_id',p_case_item_id));
end;
$$;
