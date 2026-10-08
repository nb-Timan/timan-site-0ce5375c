-- Resolve Fabric's physical item revisions (for example 410040-01) against
-- the canonical Portal catalogue without changing the Fabric snapshot value.
create or replace function public.loan_resolve_fabric_item_type(p_item_number text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item text := upper(btrim(p_item_number));
  v_base_item text;
  v_machine boolean;
  v_equipment boolean;
begin
  if nullif(v_item, '') is null then return null; end if;
  v_base_item := regexp_replace(v_item, '-[0-9]{2}$', '');

  select exists(
    select 1 from public.planning_machine_products m
    where upper(btrim(m.item_number)) in (v_item, v_base_item)
  ) into v_machine;

  select exists(
    select 1 from public.planning_accessory_products a
    where upper(btrim(a.item_number)) in (v_item, v_base_item)
  ) into v_equipment;

  if v_machine and not v_equipment then return 'machine'; end if;
  if v_equipment and not v_machine then return 'equipment'; end if;

  -- A serialized Lager 2/4 asset that exists in the released catalogue is a
  -- physical equipment item when it is not a canonical machine.
  if not v_machine and exists(
    select 1 from public.price_list_published p
    where upper(btrim(p.item_number)) in (v_item, v_base_item)
  ) then return 'equipment'; end if;

  return null;
end;
$$;
revoke all on function public.loan_resolve_fabric_item_type(text) from public, anon, authenticated;
grant execute on function public.loan_resolve_fabric_item_type(text) to service_role;

create or replace function public.loan_stock_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_assets jsonb;
begin
  if not public.loan_can_browse_stock() then raise exception 'Loan stock access denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.warehouse_location_code,q.item_number,q.serial_number),'[]'::jsonb) into v_assets
  from (
    select f.*, public.loan_resolve_fabric_item_type(f.item_number) as item_type,
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

  v_type:=public.loan_resolve_fabric_item_type(f.item_number);
  if v_type is null then raise exception 'Asset has no canonical Portal classification'; end if;

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
