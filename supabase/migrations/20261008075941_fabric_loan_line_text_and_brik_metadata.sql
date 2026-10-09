-- Carry C5 SALESLINE.TXT as source metadata while keeping Timan-owned asset tags
-- outside the replaceable Fabric snapshot.
alter table public.fabric_loan_assets_current
  add column if not exists line_text text;

create table public.loan_asset_portal_metadata (
  company text not null check (btrim(company) <> ''),
  serial_number_normalized text not null check (
    btrim(serial_number_normalized) <> ''
    and serial_number_normalized = upper(btrim(serial_number_normalized))
  ),
  brik_number integer not null check (brik_number between 1 and 999999),
  updated_by_app_user_id uuid not null references public.app_users(id),
  updated_at timestamptz not null default now(),
  primary key (company, serial_number_normalized)
);

alter table public.loan_asset_portal_metadata enable row level security;
revoke all on public.loan_asset_portal_metadata from public, anon, authenticated;
grant all on public.loan_asset_portal_metadata to service_role;

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
    or nullif(btrim(r->>'serial_number'),'') is null or nullif(btrim(r->>'item_number'),'') is null
    or not (r ?& array['review_required','identity_conflict','warehouse_location_code','classification'])
    or (r - array['company','account_number','order_number','line_number','item_number','item_name','line_text',
      'serial_number','warehouse_location_code','warehouse_location_name','inventory_qty','reserved_qty',
      'stock_last_changed','source_row_number','classification','review_required','review_reason','identity_conflict']) <> '{}'::jsonb
  ) then raise exception 'INVALID_SNAPSHOT'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r
    group by btrim(r->>'company'),upper(btrim(r->>'serial_number')) having count(*)>1) then
    raise exception 'INVALID_SNAPSHOT';
  end if;

  insert into public.fabric_loan_assets_current (
    company,account_number,order_number,line_number,item_number,item_name,line_text,serial_number,
    warehouse_location_code,warehouse_location_name,inventory_qty,reserved_qty,stock_last_changed,
    source_row_number,classification,review_required,review_reason,identity_conflict,source_as_of,
    sync_run_id,synced_at,source_present
  ) select btrim(r.company),r.account_number,r.order_number,r.line_number,r.item_number,r.item_name,r.line_text,
    r.serial_number,r.warehouse_location_code,r.warehouse_location_name,r.inventory_qty,r.reserved_qty,
    r.stock_last_changed,r.source_row_number,r.classification,r.review_required,r.review_reason,
    r.identity_conflict,p_source_as_of,p_run_id,now(),true
  from jsonb_to_recordset(p_rows) as r(company text,account_number text,order_number text,line_number numeric,
    item_number text,item_name text,line_text text,serial_number text,warehouse_location_code text,
    warehouse_location_name text,inventory_qty numeric,reserved_qty numeric,stock_last_changed timestamp,
    source_row_number bigint,classification text,review_required boolean,review_reason text,identity_conflict boolean)
  on conflict(company,serial_number_normalized) do update set
    account_number=excluded.account_number,order_number=excluded.order_number,line_number=excluded.line_number,
    item_number=excluded.item_number,item_name=excluded.item_name,line_text=excluded.line_text,
    serial_number=excluded.serial_number,warehouse_location_code=excluded.warehouse_location_code,
    warehouse_location_name=excluded.warehouse_location_name,inventory_qty=excluded.inventory_qty,
    reserved_qty=excluded.reserved_qty,stock_last_changed=excluded.stock_last_changed,
    source_row_number=excluded.source_row_number,classification=excluded.classification,
    review_required=excluded.review_required,review_reason=excluded.review_reason,
    identity_conflict=excluded.identity_conflict,source_as_of=excluded.source_as_of,
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

create or replace function public.loan_stock_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_assets jsonb;
begin
  if not public.loan_can_browse_stock() then raise exception 'Loan stock access denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.warehouse_location_code,q.item_number,q.serial_number),'[]'::jsonb) into v_assets
  from (
    select f.*, m.brik_number, public.loan_resolve_fabric_item_type(f.item_number) as item_type,
    exists(select 1 from public.loan_asset_allocations a
      left join public.planning_supply_units p on p.id=a.supply_unit_id
      where a.allocation_status='active' and (a.fabric_asset_id=f.asset_id or upper(btrim(p.serial_number))=f.serial_number_normalized)
    ) or exists(select 1 from public.planning_reservations r join public.planning_supply_units p on p.id=r.supply_unit_id
      where r.status='active' and upper(btrim(p.serial_number))=f.serial_number_normalized) as allocated
    from public.fabric_loan_assets_current f
    left join public.loan_asset_portal_metadata m
      on m.company=f.company and m.serial_number_normalized=f.serial_number_normalized
    where f.source_present and (public.can_administer_loans()
      or (f.classification='LOAN_CANDIDATE' and not f.review_required and not f.identity_conflict))
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

  select company, serial_number_normalized into v_company, v_serial
  from public.fabric_loan_assets_current
  where asset_id=p_asset_id and source_present
  for share;
  if not found then raise exception 'Loan asset not found'; end if;

  if p_brik_number is null then
    delete from public.loan_asset_portal_metadata
    where company=v_company and serial_number_normalized=v_serial;
  else
    insert into public.loan_asset_portal_metadata(
      company,serial_number_normalized,brik_number,updated_by_app_user_id,updated_at
    ) values(v_company,v_serial,p_brik_number,v_actor,now())
    on conflict(company,serial_number_normalized) do update set
      brik_number=excluded.brik_number,
      updated_by_app_user_id=excluded.updated_by_app_user_id,
      updated_at=excluded.updated_at;
  end if;

  return jsonb_build_object('asset_id',p_asset_id,'brik_number',p_brik_number);
end;
$$;
revoke all on function public.loan_set_asset_brik_number(uuid,integer) from public, anon;
grant execute on function public.loan_set_asset_brik_number(uuid,integer) to authenticated;

comment on table public.loan_asset_portal_metadata is
  'Portal-owned physical-asset metadata keyed independently of replaceable Fabric snapshots.';
comment on column public.fabric_loan_assets_current.line_text is
  'Original C5 SALESLINE.TXT source metadata; never used as product identity.';
