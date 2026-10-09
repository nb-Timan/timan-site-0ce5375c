begin;

alter table public.configurations
  add column if not exists sales_source_type text not null default 'STANDARD';
alter table public.configurations drop constraint if exists configurations_sales_source_type_check;
alter table public.configurations add constraint configurations_sales_source_type_check
  check (sales_source_type in ('STANDARD','SALES_STOCK_DEMO'));

alter table public.crm_leads
  add column if not exists sales_source_type text not null default 'STANDARD';
alter table public.crm_leads drop constraint if exists crm_leads_sales_source_type_check;
alter table public.crm_leads add constraint crm_leads_sales_source_type_check
  check (sales_source_type in ('STANDARD','SALES_STOCK_DEMO'));

create table if not exists public.sales_stock_configuration_assets (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.configurations(id) on delete restrict,
  lead_id uuid references public.crm_leads(id) on delete set null,
  source_asset_id uuid not null references public.fabric_loan_assets_current(asset_id) on delete restrict,
  asset_instance_id text not null,
  configurator_unit_number integer not null check (configurator_unit_number > 0),
  item_number text not null,
  item_text text not null,
  item_type text not null check (item_type in ('machine','equipment')),
  serial_number text,
  brik_number integer,
  warehouse_location_code text not null,
  warehouse_location_name text,
  account_number text,
  source_order_number text,
  source_classification text not null,
  pricing_method text not null check (pricing_method in ('adjusted_base','sales_stock_discount')),
  original_list_price numeric(16,2) not null check (original_list_price >= 0),
  pricing_currency text not null check (pricing_currency in ('DKK','EUR','SEK')),
  adjusted_base_price numeric(16,2),
  sales_stock_discount_pct numeric(7,4),
  pricing_reason text not null default '',
  reservation_status text not null default 'ACTIVE' check (reservation_status in ('ACTIVE','SOLD','RELEASED')),
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (configuration_id, source_asset_id),
  unique (configuration_id, configurator_unit_number)
);

create unique index if not exists sales_stock_asset_one_live_sale_idx
  on public.sales_stock_configuration_assets(source_asset_id)
  where reservation_status in ('ACTIVE','SOLD');
create index if not exists sales_stock_assets_configuration_idx
  on public.sales_stock_configuration_assets(configuration_id);
create index if not exists sales_stock_assets_lead_idx
  on public.sales_stock_configuration_assets(lead_id) where lead_id is not null;

create table if not exists public.sales_stock_pricing_audit (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.configurations(id) on delete restrict,
  source_asset_id uuid not null references public.fabric_loan_assets_current(asset_id) on delete restrict,
  actor_app_user_id uuid not null references public.app_users(id) on delete restrict,
  old_pricing_method text,
  new_pricing_method text not null,
  old_adjusted_base_price numeric(16,2),
  new_adjusted_base_price numeric(16,2),
  old_sales_stock_discount_pct numeric(7,4),
  new_sales_stock_discount_pct numeric(7,4),
  pricing_reason text not null,
  changed_at timestamptz not null default now()
);
create index if not exists sales_stock_pricing_audit_configuration_idx
  on public.sales_stock_pricing_audit(configuration_id, changed_at desc);

alter table public.sales_stock_configuration_assets enable row level security;
alter table public.sales_stock_pricing_audit enable row level security;
revoke all on public.sales_stock_configuration_assets from public, anon, authenticated;
revoke all on public.sales_stock_pricing_audit from public, anon, authenticated;
grant select on public.sales_stock_configuration_assets to authenticated;
grant select on public.sales_stock_pricing_audit to authenticated;

drop policy if exists sales_stock_assets_internal_read on public.sales_stock_configuration_assets;
create policy sales_stock_assets_internal_read on public.sales_stock_configuration_assets for select to authenticated
using (exists (
  select 1 from public.app_users u where u.auth_user_id=auth.uid()
    and u.approved is true and u.is_active is true
    and u.portal_role::text in ('timan_backend','timan_seller')
));
drop policy if exists sales_stock_pricing_audit_internal_read on public.sales_stock_pricing_audit;
create policy sales_stock_pricing_audit_internal_read on public.sales_stock_pricing_audit for select to authenticated
using (exists (
  select 1 from public.app_users u where u.auth_user_id=auth.uid()
    and u.approved is true and u.is_active is true
    and u.portal_role::text in ('timan_backend','timan_seller')
));

create or replace function public.sales_stock_actor_can_manage()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.app_users u where u.auth_user_id=auth.uid()
      and u.approved is true and u.is_active is true
      and u.portal_role::text in ('timan_backend','timan_seller')
  )
$$;
revoke all on function public.sales_stock_actor_can_manage() from public, anon, authenticated;

create or replace function public.guard_sales_stock_configuration()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_channel text := coalesce(new.state_json->>'salesChannel','standard');
  v_assets jsonb := coalesce(new.state_json->'salesStockAssets','[]'::jsonb);
  v_asset jsonb;
  v_source uuid;
  v_existing public.sales_stock_configuration_assets%rowtype;
  v_fabric record;
  v_method text;
  v_original numeric;
  v_adjusted numeric;
  v_discount numeric;
  v_reason text;
begin
  if jsonb_typeof(v_assets) <> 'array' then raise exception 'Invalid sales-stock asset snapshot'; end if;
  if v_channel <> 'sales_stock_demo' then
    if jsonb_array_length(v_assets) > 0 then raise exception 'Sales-stock assets require sales-stock mode'; end if;
    new.sales_source_type := 'STANDARD';
    return new;
  end if;
  if not public.sales_stock_actor_can_manage() then raise exception 'Sales-stock pricing access denied'; end if;
  if jsonb_array_length(v_assets) = 0 then raise exception 'Sales-stock mode requires at least one physical asset'; end if;

  for v_asset in select value from jsonb_array_elements(v_assets) loop
    v_source := (v_asset->>'sourceAssetId')::uuid;
    if (select count(*) from jsonb_array_elements(v_assets) x where x->>'sourceAssetId'=v_asset->>'sourceAssetId') <> 1 then
      raise exception 'Duplicate sales-stock physical asset';
    end if;
    select * into v_existing from public.sales_stock_configuration_assets
      where configuration_id=new.id and source_asset_id=v_source;
    if found then
      if v_existing.asset_instance_id is distinct from v_asset->>'assetInstanceId'
        or v_existing.item_number is distinct from v_asset->>'itemNumber'
        or v_existing.serial_number is distinct from nullif(btrim(v_asset->>'serialNumber'),'')
        or v_existing.brik_number is distinct from nullif(v_asset->>'brikNumber','')::integer
        or v_existing.warehouse_location_code is distinct from v_asset->>'warehouseLocationCode'
        or v_existing.account_number is distinct from nullif(btrim(v_asset->>'accountNumber'),'')
        or v_existing.source_order_number is distinct from nullif(btrim(v_asset->>'sourceOrderNumber'),'') then
        raise exception 'Physical sales-stock identity is immutable';
      end if;
    else
      select f.*, m.brik_number into v_fabric
      from public.fabric_loan_assets_current f
      left join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
      where f.asset_id=v_source;
      if not found or not v_fabric.source_present or v_fabric.classification <> 'LOAN_CANDIDATE'
        or v_fabric.review_required or v_fabric.identity_conflict
        or v_fabric.warehouse_location_code not in ('2','4') then
        raise exception 'Physical asset is not eligible for sales-stock sale';
      end if;
      if v_fabric.asset_instance_id is distinct from v_asset->>'assetInstanceId'
        or v_fabric.item_number is distinct from v_asset->>'itemNumber'
        or v_fabric.serial_number is distinct from nullif(btrim(v_asset->>'serialNumber'),'')
        or v_fabric.brik_number is distinct from nullif(v_asset->>'brikNumber','')::integer
        or v_fabric.warehouse_location_code is distinct from v_asset->>'warehouseLocationCode'
        or v_fabric.account_number is distinct from nullif(btrim(v_asset->>'accountNumber'),'')
        or v_fabric.order_number is distinct from nullif(btrim(v_asset->>'sourceOrderNumber'),'') then
        raise exception 'Physical asset snapshot does not match Fabric projection';
      end if;
      if exists (select 1 from public.sales_stock_configuration_assets s
        where s.source_asset_id=v_source and s.configuration_id<>new.id
          and s.reservation_status in ('ACTIVE','SOLD')) then
        raise exception 'Physical asset is already reserved or sold';
      end if;
    end if;

    v_method := v_asset->>'pricingMethod';
    v_original := (v_asset->>'originalListPrice')::numeric;
    v_adjusted := nullif(v_asset->>'adjustedBasePrice','')::numeric;
    v_discount := nullif(v_asset->>'salesStockDiscountPct','')::numeric;
    v_reason := btrim(coalesce(v_asset->>'pricingReason',''));
    if v_method not in ('adjusted_base','sales_stock_discount') or v_original < 0 then raise exception 'Invalid sales-stock pricing method'; end if;
    if v_method='adjusted_base' and (v_discount is not null or v_adjusted is null or v_adjusted < 0 or v_adjusted > v_original) then
      raise exception 'Adjusted base price is invalid';
    end if;
    if v_method='sales_stock_discount' and (v_adjusted is not null or (v_discount is not null and (v_discount < 0 or v_discount > 100))) then
      raise exception 'Sales-stock discount is invalid';
    end if;
    if (v_adjusted is not null or v_discount is not null) and v_reason='' then raise exception 'Pricing reason is required'; end if;
    if (v_asset->>'pricingCurrency') not in ('DKK','EUR','SEK') then raise exception 'Invalid sales-stock pricing currency'; end if;
  end loop;
  new.sales_source_type := 'SALES_STOCK_DEMO';
  return new;
end;
$$;
revoke all on function public.guard_sales_stock_configuration() from public, anon, authenticated;

create or replace function public.sync_sales_stock_configuration_assets()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_assets jsonb := coalesce(new.state_json->'salesStockAssets','[]'::jsonb);
  v_asset jsonb;
  v_source uuid;
  v_actor uuid := public.loan_actor_id();
  v_previous public.sales_stock_configuration_assets%rowtype;
  v_status text;
begin
  if new.sales_source_type <> 'SALES_STOCK_DEMO' then
    update public.sales_stock_configuration_assets set reservation_status='RELEASED', updated_at=now()
      where configuration_id=new.id and reservation_status='ACTIVE';
    if new.lead_id is not null then update public.crm_leads set sales_source_type='STANDARD' where id=new.lead_id; end if;
    return new;
  end if;
  if v_actor is null then raise exception 'Sales-stock audit actor is required'; end if;
  v_status := case when new.submitted_at is not null or new.order_sent_at is not null then 'SOLD'
    when lower(coalesce(new.case_status,''))='deleted' then 'RELEASED' else 'ACTIVE' end;

  for v_asset in select value from jsonb_array_elements(v_assets) loop
    v_source := (v_asset->>'sourceAssetId')::uuid;
    select * into v_previous from public.sales_stock_configuration_assets
      where configuration_id=new.id and source_asset_id=v_source;
    if (not found and (nullif(v_asset->>'adjustedBasePrice','') is not null
        or nullif(v_asset->>'salesStockDiscountPct','') is not null))
      or (found and (v_previous.pricing_method is distinct from v_asset->>'pricingMethod'
        or v_previous.adjusted_base_price is distinct from nullif(v_asset->>'adjustedBasePrice','')::numeric
        or v_previous.sales_stock_discount_pct is distinct from nullif(v_asset->>'salesStockDiscountPct','')::numeric)) then
      insert into public.sales_stock_pricing_audit (
        configuration_id,source_asset_id,actor_app_user_id,old_pricing_method,new_pricing_method,
        old_adjusted_base_price,new_adjusted_base_price,old_sales_stock_discount_pct,new_sales_stock_discount_pct,pricing_reason
      ) values (
        new.id,v_source,v_actor,v_previous.pricing_method,v_asset->>'pricingMethod',
        v_previous.adjusted_base_price,nullif(v_asset->>'adjustedBasePrice','')::numeric,
        v_previous.sales_stock_discount_pct,nullif(v_asset->>'salesStockDiscountPct','')::numeric,
        btrim(coalesce(v_asset->>'pricingReason',''))
      );
    end if;
    insert into public.sales_stock_configuration_assets (
      configuration_id,lead_id,source_asset_id,asset_instance_id,configurator_unit_number,item_number,item_text,item_type,
      serial_number,brik_number,warehouse_location_code,warehouse_location_name,account_number,source_order_number,
      source_classification,pricing_method,original_list_price,pricing_currency,adjusted_base_price,
      sales_stock_discount_pct,pricing_reason,reservation_status,created_by
    ) values (
      new.id,new.lead_id,v_source,v_asset->>'assetInstanceId',(v_asset->>'configuratorUnitNumber')::integer,
      v_asset->>'itemNumber',v_asset->>'itemText',v_asset->>'itemType',nullif(btrim(v_asset->>'serialNumber'),''),
      nullif(v_asset->>'brikNumber','')::integer,v_asset->>'warehouseLocationCode',nullif(btrim(v_asset->>'warehouseLocationName'),''),
      nullif(btrim(v_asset->>'accountNumber'),''),nullif(btrim(v_asset->>'sourceOrderNumber'),''),v_asset->>'classification',
      v_asset->>'pricingMethod',(v_asset->>'originalListPrice')::numeric,v_asset->>'pricingCurrency',
      nullif(v_asset->>'adjustedBasePrice','')::numeric,nullif(v_asset->>'salesStockDiscountPct','')::numeric,
      btrim(coalesce(v_asset->>'pricingReason','')),v_status,v_actor
    ) on conflict (configuration_id,source_asset_id) do update set
      lead_id=excluded.lead_id, pricing_method=excluded.pricing_method,
      adjusted_base_price=excluded.adjusted_base_price,sales_stock_discount_pct=excluded.sales_stock_discount_pct,
      pricing_reason=excluded.pricing_reason,reservation_status=excluded.reservation_status,updated_at=now();
  end loop;
  update public.sales_stock_configuration_assets s set reservation_status='RELEASED',updated_at=now()
    where s.configuration_id=new.id and s.reservation_status='ACTIVE'
      and not exists (select 1 from jsonb_array_elements(v_assets) x where (x->>'sourceAssetId')::uuid=s.source_asset_id);
  if new.lead_id is not null then update public.crm_leads set sales_source_type='SALES_STOCK_DEMO' where id=new.lead_id; end if;
  return new;
end;
$$;
revoke all on function public.sync_sales_stock_configuration_assets() from public, anon, authenticated;

create or replace function public.prevent_sales_stock_audit_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Sales-stock pricing audit is append-only'; end;
$$;
revoke all on function public.prevent_sales_stock_audit_mutation() from public, anon, authenticated;

drop trigger if exists guard_sales_stock_configuration on public.configurations;
create trigger guard_sales_stock_configuration before insert or update on public.configurations
for each row execute function public.guard_sales_stock_configuration();
drop trigger if exists sync_sales_stock_configuration_assets on public.configurations;
create trigger sync_sales_stock_configuration_assets after insert or update on public.configurations
for each row execute function public.sync_sales_stock_configuration_assets();
drop trigger if exists prevent_sales_stock_pricing_audit_mutation on public.sales_stock_pricing_audit;
create trigger prevent_sales_stock_pricing_audit_mutation before update or delete on public.sales_stock_pricing_audit
for each row execute function public.prevent_sales_stock_audit_mutation();

create or replace view public.crm_configurations_view
with (security_invoker = true) as
select c.id,c.created_by_user_id,c.created_by_email,c.created_by_role,c.title,
  c.customer_name,c.customer_email,c.customer_phone,c.customer_company,c.language,
  c.case_type,c.document_type,c.case_status,c.status,c.state_json,c.note,c.internal_note,
  c.delivery_method,c.delivery_date,c.delivery_startup_option,c.subtotal,c.total_price,c.currency,
  c.quote_number,c.order_number,c.source_quote_id,c.source_quote_number,c.created_case_at,
  c.submitted_at,c.quote_sent_at,c.order_sent_at,c.pdf_downloaded,c.pdf_downloaded_at,
  c.sent_pdf_bucket,c.sent_pdf_path,c.sent_pdf_filename,c.payment_terms,c.lead_id,
  c.seller_initials,c.seller_email,c.seller_name,c.assigned_seller_id,c.dealer_number,
  c.dealer_name,c.dealer_account_id,c.active_mode,c.owner_status,c.last_saved_at,c.created_at,c.updated_at,
  coalesce(c.document_type,c.case_type) as effective_document_type,
  da.company_name as dealer_company_name,au.full_name as assigned_seller_full_name,
  c.sales_source_type
from public.configurations c
left join public.dealer_accounts da on da.id=c.dealer_account_id
left join public.app_users au on au.id=c.assigned_seller_id;

create or replace function public.loan_stock_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_assets jsonb;
begin
  if not public.loan_can_browse_stock() then raise exception 'Loan stock access denied'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.warehouse_location_code,q.item_number,
    q.serial_number nulls last,q.instance_ordinal),'[]'::jsonb) into v_assets
  from (
    select f.*,m.brik_number,public.loan_resolve_fabric_item_type(f.item_number) as item_type,s.sales_committed,
      (exists(select 1 from public.loan_asset_allocations a
        left join public.planning_supply_units p on p.id=a.supply_unit_id
        where a.allocation_status='active' and (a.fabric_asset_id=f.asset_id or
          (f.serial_number_normalized is not null and upper(btrim(p.serial_number))=f.serial_number_normalized)))
      or exists(select 1 from public.planning_reservations r join public.planning_supply_units p on p.id=r.supply_unit_id
        where r.status='active' and f.serial_number_normalized is not null
          and upper(btrim(p.serial_number))=f.serial_number_normalized)
      or s.sales_committed) as allocated
    from public.fabric_loan_assets_current f
    left join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
    cross join lateral (select exists(select 1 from public.sales_stock_configuration_assets x
      where x.source_asset_id=f.asset_id and x.reservation_status in ('ACTIVE','SOLD')) as sales_committed) s
    where f.source_present and (public.can_administer_loans()
      or (f.classification='LOAN_CANDIDATE' and not f.review_required and not f.identity_conflict
        and (f.serial_number_normalized is not null or m.brik_number is not null)))
  ) q;
  return jsonb_build_object('assets',v_assets,'sync',public.loan_stock_status());
end;
$$;
revoke all on function public.loan_stock_snapshot() from public,anon;
grant execute on function public.loan_stock_snapshot() to authenticated;

comment on table public.sales_stock_configuration_assets is 'Portal-owned immutable physical asset snapshots and sale reservations; Fabric remains ERP source.';
comment on table public.sales_stock_pricing_audit is 'Append-only audit of transaction-specific sales-stock pricing changes.';

commit;
