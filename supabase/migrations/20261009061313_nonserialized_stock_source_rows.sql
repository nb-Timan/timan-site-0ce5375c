-- Quantity alone cannot identify physical units. Preserve source rows and all
-- historical references; normal snapshot publication retires obsolete expansion.
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
  if exists(select 1 from jsonb_array_elements(p_rows) r
    where r->>'serial_number' is null and (
      r->>'instance_ordinal' is distinct from '1'
      or coalesce((r->>'source_row_number') ~ '^-?[0-9]+$',false) is not true
    )) or exists(select 1 from jsonb_array_elements(p_rows) r
    where r->>'serial_number' is null
    group by btrim(r->>'company'),(r->>'source_row_number')::bigint having count(*)>1) then
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

comment on column public.fabric_loan_assets_current.asset_instance_id is
  'Stable source identity: a serialized asset or one non-serialized inventory source row. Quantity is not physical identity.';
comment on column public.fabric_loan_assets_current.instance_ordinal is
  'Legacy ordinal retained for historical references; new non-serialized source rows always use 1.';
