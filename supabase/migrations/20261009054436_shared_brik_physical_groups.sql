begin;

-- Brik nr. groups Portal-owned physical implements. Multiple Fabric source rows
-- may therefore share one Brik while retaining their own source identities.
alter table public.loan_asset_portal_metadata
  drop constraint if exists loan_asset_portal_metadata_brik_number_key;

create index if not exists loan_asset_portal_metadata_company_brik_idx
  on public.loan_asset_portal_metadata(company, brik_number);

create table if not exists public.loan_asset_brik_audit (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.fabric_loan_assets_current(asset_id) on delete restrict,
  company text not null check (btrim(company) <> ''),
  asset_instance_id text not null check (btrim(asset_instance_id) <> ''),
  old_brik_number integer check (old_brik_number between 1 and 999999),
  new_brik_number integer check (new_brik_number between 1 and 999999),
  actor_app_user_id uuid not null references public.app_users(id),
  changed_at timestamptz not null default now(),
  check (old_brik_number is distinct from new_brik_number)
);

create index if not exists loan_asset_brik_audit_asset_changed_idx
  on public.loan_asset_brik_audit(asset_id, changed_at desc);

alter table public.loan_asset_brik_audit enable row level security;
revoke all on public.loan_asset_brik_audit from public, anon, authenticated;
grant all on public.loan_asset_brik_audit to service_role;

create or replace function public.loan_set_asset_brik_number(p_asset_id uuid, p_brik_number integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_company text;
  v_serial text;
  v_instance text;
  v_old_brik integer;
  v_shared_count integer;
  v_serial_conflict boolean;
begin
  v_actor := public.loan_actor_id();
  if v_actor is null or not public.can_administer_loans() then
    raise exception 'Loan asset metadata access denied';
  end if;
  if p_brik_number is not null and (p_brik_number < 1 or p_brik_number > 999999) then
    raise exception 'Invalid brik number';
  end if;

  select f.company,f.serial_number_normalized,f.asset_instance_id,m.brik_number
    into v_company,v_serial,v_instance,v_old_brik
  from public.fabric_loan_assets_current f
  left join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
  where f.asset_id=p_asset_id and f.source_present
  for update of f;
  if not found then raise exception 'Loan asset not found'; end if;

  if v_old_brik is not null then
    perform pg_advisory_xact_lock(hashtextextended('loan-brik:'||v_company||':'||v_old_brik,0));
  end if;
  if p_brik_number is not null and p_brik_number is distinct from v_old_brik then
    perform pg_advisory_xact_lock(hashtextextended('loan-brik:'||v_company||':'||p_brik_number,0));
  end if;

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

  if v_old_brik is distinct from p_brik_number then
    insert into public.loan_asset_brik_audit(
      asset_id,company,asset_instance_id,old_brik_number,new_brik_number,actor_app_user_id
    ) values(p_asset_id,v_company,v_instance,v_old_brik,p_brik_number,v_actor);
  end if;

  select count(*)::integer,
    count(distinct f.serial_number_normalized) filter (where f.serial_number_normalized is not null)>1
    into v_shared_count,v_serial_conflict
  from public.loan_asset_portal_metadata m
  join public.fabric_loan_assets_current f on f.asset_id=m.asset_id and f.source_present
  where p_brik_number is not null and m.company=v_company and m.brik_number=p_brik_number;

  return jsonb_build_object(
    'asset_id',p_asset_id,
    'brik_number',p_brik_number,
    'physical_asset_group_key',case when p_brik_number is null then null
      else v_company||':BRIK:'||p_brik_number end,
    'shared_row_count',coalesce(v_shared_count,0),
    'serial_identity_conflict',coalesce(v_serial_conflict,false)
  );
end;
$$;
revoke all on function public.loan_set_asset_brik_number(uuid,integer) from public, anon;
grant execute on function public.loan_set_asset_brik_number(uuid,integer) to authenticated;

create or replace function public.loan_guard_asset_allocation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_serial text;
  v_company text;
  v_instance text;
  v_brik integer;
begin
  if new.allocation_status<>'active' then return new; end if;
  if new.fabric_asset_id is not null then
    select f.serial_number_normalized,f.company,f.asset_instance_id,m.brik_number
      into v_serial,v_company,v_instance,v_brik
    from public.fabric_loan_assets_current f
    left join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
    where f.asset_id=new.fabric_asset_id;
    if nullif(v_instance,'') is null then raise exception 'Invalid physical asset'; end if;
    if v_brik is not null then
      perform pg_advisory_xact_lock(hashtextextended('loan-brik:'||v_company||':'||v_brik,0));
      if (select count(distinct f.serial_number_normalized)
          from public.loan_asset_portal_metadata m
          join public.fabric_loan_assets_current f on f.asset_id=m.asset_id and f.source_present
          where m.company=v_company and m.brik_number=v_brik and f.serial_number_normalized is not null)>1 then
        raise exception 'Physical asset group has conflicting serial identities';
      end if;
      if exists (
        select 1 from public.loan_asset_allocations a
        join public.fabric_loan_assets_current f on f.asset_id=a.fabric_asset_id
        join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
        where a.allocation_status='active' and a.id<>new.id
          and m.company=v_company and m.brik_number=v_brik
      ) or exists (
        select 1 from public.sales_stock_configuration_assets s
        join public.fabric_loan_assets_current f on f.asset_id=s.source_asset_id
        join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
        where s.reservation_status in ('ACTIVE','SOLD')
          and m.company=v_company and m.brik_number=v_brik
      ) then raise exception 'Physical asset group is already allocated'; end if;
    else
      perform pg_advisory_xact_lock(hashtextextended('loan-asset:'||v_instance,0));
    end if;
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

create or replace function public.sales_stock_guard_physical_group()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_company text;
  v_instance text;
  v_serial text;
  v_brik integer;
begin
  if new.reservation_status not in ('ACTIVE','SOLD') then return new; end if;
  select f.company,f.asset_instance_id,f.serial_number_normalized,m.brik_number
    into v_company,v_instance,v_serial,v_brik
  from public.fabric_loan_assets_current f
  left join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
  where f.asset_id=new.source_asset_id;
  if nullif(v_instance,'') is null then raise exception 'Invalid physical sales-stock asset'; end if;

  if v_brik is not null then
    perform pg_advisory_xact_lock(hashtextextended('loan-brik:'||v_company||':'||v_brik,0));
    if (select count(distinct f.serial_number_normalized)
        from public.loan_asset_portal_metadata m
        join public.fabric_loan_assets_current f on f.asset_id=m.asset_id and f.source_present
        where m.company=v_company and m.brik_number=v_brik and f.serial_number_normalized is not null)>1 then
      raise exception 'Physical asset group has conflicting serial identities';
    end if;
    if exists (
      select 1 from public.sales_stock_configuration_assets s
      join public.fabric_loan_assets_current f on f.asset_id=s.source_asset_id
      join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
      where s.id<>new.id and s.reservation_status in ('ACTIVE','SOLD')
        and m.company=v_company and m.brik_number=v_brik
    ) or exists (
      select 1 from public.loan_asset_allocations a
      join public.fabric_loan_assets_current f on f.asset_id=a.fabric_asset_id
      join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
      where a.allocation_status='active' and m.company=v_company and m.brik_number=v_brik
    ) then raise exception 'Physical asset group is already reserved or sold'; end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('loan-asset:'||v_instance,0));
    if exists(select 1 from public.loan_asset_allocations a
      where a.allocation_status='active' and a.fabric_asset_id=new.source_asset_id) then
      raise exception 'Physical asset is already allocated';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sales_stock_guard_physical_group() from public, anon, authenticated;

drop trigger if exists sales_stock_guard_physical_group_trigger on public.sales_stock_configuration_assets;
create trigger sales_stock_guard_physical_group_trigger
before insert or update of source_asset_id,reservation_status on public.sales_stock_configuration_assets
for each row execute function public.sales_stock_guard_physical_group();

create or replace function public.loan_stock_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_assets jsonb;
begin
  if not public.loan_can_browse_stock() then raise exception 'Loan stock access denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.warehouse_location_code,q.item_number,
    q.serial_number nulls last,q.instance_ordinal),'[]'::jsonb) into v_assets
  from (
    select f.*,m.brik_number,
      case when m.brik_number is null then null else f.company||':BRIK:'||m.brik_number end as physical_asset_group_key,
      coalesce(g.group_size,0) as brik_group_size,
      coalesce(g.serial_identity_conflict,false) as brik_group_serial_conflict,
      public.loan_resolve_fabric_item_type(f.item_number) as item_type,
      exists(
        select 1 from public.sales_stock_configuration_assets x
        join public.fabric_loan_assets_current xf on xf.asset_id=x.source_asset_id
        left join public.loan_asset_portal_metadata xm on xm.asset_id=xf.asset_id
        where x.reservation_status in ('ACTIVE','SOLD') and (
          x.source_asset_id=f.asset_id or
          (m.brik_number is not null and xm.company=m.company and xm.brik_number=m.brik_number)
        )
      ) as sales_committed,
      (exists(
        select 1 from public.loan_asset_allocations a
        left join public.fabric_loan_assets_current af on af.asset_id=a.fabric_asset_id
        left join public.loan_asset_portal_metadata am on am.asset_id=af.asset_id
        left join public.planning_supply_units p on p.id=a.supply_unit_id
        where a.allocation_status='active' and (
          a.fabric_asset_id=f.asset_id or
          (f.serial_number_normalized is not null and upper(btrim(p.serial_number))=f.serial_number_normalized) or
          (m.brik_number is not null and am.company=m.company and am.brik_number=m.brik_number)
        )
      ) or exists(
        select 1 from public.planning_reservations r join public.planning_supply_units p on p.id=r.supply_unit_id
        where r.status='active' and f.serial_number_normalized is not null
          and upper(btrim(p.serial_number))=f.serial_number_normalized
      ) or exists(
        select 1 from public.sales_stock_configuration_assets x
        join public.fabric_loan_assets_current xf on xf.asset_id=x.source_asset_id
        left join public.loan_asset_portal_metadata xm on xm.asset_id=xf.asset_id
        where x.reservation_status in ('ACTIVE','SOLD') and (
          x.source_asset_id=f.asset_id or
          (m.brik_number is not null and xm.company=m.company and xm.brik_number=m.brik_number)
        )
      )) as allocated
    from public.fabric_loan_assets_current f
    left join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
    left join lateral (
      select count(*)::integer as group_size,
        count(distinct gf.serial_number_normalized) filter (where gf.serial_number_normalized is not null)>1
          as serial_identity_conflict
      from public.loan_asset_portal_metadata gm
      join public.fabric_loan_assets_current gf on gf.asset_id=gm.asset_id and gf.source_present
      where m.brik_number is not null and gm.company=m.company and gm.brik_number=m.brik_number
    ) g on true
    where f.source_present and (public.can_administer_loans()
      or (f.classification='LOAN_CANDIDATE' and not f.review_required and not f.identity_conflict
        and (f.serial_number_normalized is not null or m.brik_number is not null)))
  ) q;
  return jsonb_build_object('assets',v_assets,'sync',public.loan_stock_status());
end;
$$;
revoke all on function public.loan_stock_snapshot() from public,anon;
grant execute on function public.loan_stock_snapshot() to authenticated;

comment on table public.loan_asset_brik_audit is
  'Append-only audit of Portal-owned Brik grouping changes; Fabric source identities remain unchanged.';
comment on column public.loan_asset_portal_metadata.brik_number is
  'Portal-owned physical implement grouping identifier; multiple source item rows may share one value within a company.';

commit;
