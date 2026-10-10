begin;

-- Nullable business facts stay unknown; existing snapshots are not backfilled.
alter table public.sales_stock_configuration_assets
  alter column item_type drop not null,
  alter column original_list_price drop not null,
  add column if not exists catalog_item_number text,
  add column if not exists quantity numeric not null default 1,
  add column if not exists price_source text not null default 'catalogue';
alter table public.sales_stock_configuration_assets alter column catalog_item_number drop not null;
alter table public.sales_stock_configuration_assets
  add constraint sales_stock_quantity_positive check (quantity > 0 and quantity::text not in ('NaN','Infinity','-Infinity')) not valid,
  add constraint sales_stock_price_source_valid check (price_source in ('catalogue','manual')) not valid,
  add constraint sales_stock_original_finite check (original_list_price is null
    or (original_list_price >= 0 and original_list_price::text not in ('NaN','Infinity','-Infinity'))) not valid;

alter table public.sales_stock_pricing_audit
  add column if not exists old_original_list_price numeric(16,2),
  add column if not exists new_original_list_price numeric(16,2),
  add column if not exists old_price_source text,
  add column if not exists new_price_source text,
  add column if not exists old_quantity numeric,
  add column if not exists new_quantity numeric,
  add column if not exists old_pricing_currency text,
  add column if not exists new_pricing_currency text;

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
  v_quantity numeric;
  v_unit numeric;
  v_reason text;
  v_catalog text;
  v_type text;
  v_price_source text;
  v_currency text;
  v_catalog_price numeric;
  v_has_existing boolean;
  v_commercial boolean;
begin
  if jsonb_typeof(v_assets) <> 'array' then raise exception 'Invalid sales-stock asset snapshot'; end if;
  if v_channel <> 'sales_stock_demo' then
    if jsonb_array_length(v_assets) > 0 then raise exception 'Sales-stock assets require sales-stock mode'; end if;
    new.sales_source_type := 'STANDARD';
    return new;
  end if;
  if not public.sales_stock_actor_can_manage() then raise exception 'Sales-stock pricing access denied'; end if;
  if jsonb_array_length(v_assets) = 0 then raise exception 'Sales-stock mode requires at least one physical asset'; end if;
  v_commercial := new.quote_number is not null or new.order_number is not null
    or new.submitted_at is not null or new.order_sent_at is not null;

  for v_asset in select value from jsonb_array_elements(v_assets) loop
    if jsonb_typeof(v_asset) <> 'object' then raise exception 'Invalid sales-stock asset snapshot'; end if;
    v_source := (v_asset->>'sourceAssetId')::uuid;
    if v_source is null or (select count(*) from jsonb_array_elements(v_assets) x
      where (x->>'sourceAssetId')::uuid=v_source) <> 1 then raise exception 'Duplicate sales-stock physical asset'; end if;
    v_catalog := nullif(btrim(v_asset->>'catalogItemNumber'),'');
    v_type := nullif(v_asset->>'itemType','');
    v_currency := v_asset->>'pricingCurrency';
    v_price_source := case when v_asset ? 'priceSource' then v_asset->>'priceSource' else 'catalogue' end;
    v_method := v_asset->>'pricingMethod';
    v_original := nullif(v_asset->>'originalListPrice','')::numeric;
    v_adjusted := nullif(v_asset->>'adjustedBasePrice','')::numeric;
    v_discount := nullif(v_asset->>'salesStockDiscountPct','')::numeric;
    v_quantity := coalesce((v_asset->>'quantity')::numeric,1);
    v_unit := nullif(v_asset->>'configuratorUnitNumber','')::numeric;
    v_reason := btrim(coalesce(v_asset->>'pricingReason',''));
    if v_unit is null or v_unit <= 0 or v_unit::text in ('NaN','Infinity','-Infinity')
      or v_unit <> trunc(v_unit) or v_unit > 2147483647 then raise exception 'Invalid sales-stock unit position'; end if;
    if (select count(*) from jsonb_array_elements(v_assets) x
      where (x->>'configuratorUnitNumber')::numeric=v_unit) <> 1 then raise exception 'Duplicate sales-stock unit position'; end if;
    if v_asset ? 'priceSource' and (new.state_json->>'pricingMode'='direct'
      or new.state_json->'direct'='true'::jsonb) then
      raise exception 'Direct pricing is not allowed for source-priced sales-stock snapshots';
    end if;
    if v_type is not null and v_type not in ('machine','equipment') then raise exception 'Invalid sales-stock item type'; end if;
    if v_price_source is null or v_price_source not in ('catalogue','manual') then raise exception 'Invalid sales-stock price source'; end if;
    if v_currency is null or v_currency not in ('DKK','EUR','SEK') then raise exception 'Invalid sales-stock pricing currency'; end if;
    if v_currency is distinct from coalesce(new.state_json->>'currency',
      case new.state_json->>'language' when 'sv' then 'SEK' when 'en' then 'EUR'
        when 'de' then 'EUR' when 'it' then 'EUR' when 'hu' then 'EUR' else 'DKK' end) then
      raise exception 'Sales-stock currency must match configuration currency';
    end if;
    if v_method is null or v_method not in ('adjusted_base','sales_stock_discount')
      or (v_original is not null and (v_original < 0 or v_original::text in ('NaN','Infinity','-Infinity'))) then
      raise exception 'Invalid sales-stock pricing method';
    end if;
    if v_quantity <= 0 or v_quantity::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid sales-stock quantity'; end if;
    if v_catalog is not null and upper(v_catalog) not in (upper(btrim(v_asset->>'itemNumber')),
      regexp_replace(upper(btrim(v_asset->>'itemNumber')),'-[0-9]{2}$','')) then
      raise exception 'Sales-stock catalogue identity does not match source SKU';
    end if;

    select * into v_existing from public.sales_stock_configuration_assets
      where configuration_id=new.id and source_asset_id=v_source;
    v_has_existing := found;
    select f.*, m.brik_number into v_fabric
    from public.fabric_loan_assets_current f
    left join public.loan_asset_portal_metadata m on m.asset_id=f.asset_id
    where f.asset_id=v_source;
    if v_has_existing then
      if v_existing.asset_instance_id is distinct from v_asset->>'assetInstanceId'
        or v_existing.item_number is distinct from v_asset->>'itemNumber'
        or v_existing.item_text is distinct from v_asset->>'itemText'
        or v_existing.item_type is distinct from v_type
        or v_existing.quantity is distinct from v_quantity
        or v_existing.configurator_unit_number is distinct from v_unit
        or v_existing.source_classification is distinct from v_asset->>'classification'
        or v_existing.serial_number is distinct from nullif(btrim(v_asset->>'serialNumber'),'')
        or v_existing.brik_number is distinct from nullif(v_asset->>'brikNumber','')::integer
        or v_existing.warehouse_location_code is distinct from v_asset->>'warehouseLocationCode'
        or v_existing.account_number is distinct from nullif(btrim(v_asset->>'accountNumber'),'')
        or v_existing.source_order_number is distinct from nullif(btrim(v_asset->>'sourceOrderNumber'),'') then
        raise exception 'Physical sales-stock identity is immutable';
      end if;
    else
      if not found or v_fabric.source_present is not true or v_fabric.classification is distinct from 'LOAN_CANDIDATE'
        or v_fabric.review_required is distinct from false or v_fabric.identity_conflict is distinct from false
        or coalesce(v_fabric.warehouse_location_code,'') not in ('2','4')
        or coalesce(v_fabric.account_number,'') not in ('1010','1020')
        or nullif(btrim(v_fabric.asset_instance_id),'') is null
        or (nullif(btrim(v_fabric.serial_number),'') is null and v_fabric.brik_number is null)
        or (v_fabric.brik_number is not null and v_fabric.brik_number not between 1 and 999999) then
        raise exception 'Physical asset is not eligible for sales-stock sale';
      end if;
      if v_fabric.asset_instance_id is distinct from v_asset->>'assetInstanceId'
        or v_fabric.item_number is distinct from v_asset->>'itemNumber'
        or coalesce(nullif(btrim(v_fabric.line_text),''),nullif(btrim(v_fabric.item_name),''),v_fabric.item_number)
          is distinct from v_asset->>'itemText'
        or v_fabric.classification is distinct from v_asset->>'classification'
        or v_fabric.serial_number is distinct from nullif(btrim(v_asset->>'serialNumber'),'')
        or v_fabric.brik_number is distinct from nullif(v_asset->>'brikNumber','')::integer
        or v_fabric.warehouse_location_code is distinct from v_asset->>'warehouseLocationCode'
        or v_fabric.account_number is distinct from nullif(btrim(v_asset->>'accountNumber'),'')
        or v_fabric.order_number is distinct from nullif(btrim(v_asset->>'sourceOrderNumber'),'') then
        raise exception 'Physical asset snapshot does not match Fabric projection';
      end if;
      if v_type is distinct from public.loan_resolve_fabric_item_type(v_fabric.item_number) then
        raise exception 'Sales-stock item type must match source classification';
      end if;
      if v_fabric.inventory_qty is null or v_fabric.inventory_qty <= 0
        or v_fabric.inventory_qty::text in ('NaN','Infinity','-Infinity')
        or v_quantity is distinct from v_fabric.inventory_qty then
        raise exception 'Sales-stock quantity must match Fabric projection';
      end if;
      if exists (select 1 from public.sales_stock_configuration_assets s
        where s.source_asset_id=v_source and s.configuration_id<>new.id
          and s.reservation_status in ('ACTIVE','SOLD')) then
        raise exception 'Physical asset is already reserved or sold';
      end if;
    end if;

    -- Recheck live reservations on saved drafts too, without revalidating historical prices/quantities.
    if lower(coalesce(new.case_status,'')) <> 'deleted' and (exists (
        select 1 from public.loan_asset_allocations a
        left join public.fabric_loan_assets_current af on af.asset_id=a.fabric_asset_id
        left join public.loan_asset_portal_metadata am on am.asset_id=af.asset_id
        left join public.planning_supply_units p on p.id=a.supply_unit_id
        where a.allocation_status='active' and (
          a.fabric_asset_id=v_source or
          (v_fabric.serial_number_normalized is not null
            and (af.company is null or af.company=v_fabric.company)
            and coalesce(af.serial_number_normalized,upper(btrim(p.serial_number)))=v_fabric.serial_number_normalized) or
          (v_fabric.brik_number is not null and am.company=v_fabric.company and am.brik_number=v_fabric.brik_number)
        )
      ) or exists (
        select 1 from public.planning_reservations r join public.planning_supply_units p on p.id=r.supply_unit_id
        where r.status='active' and v_fabric.serial_number_normalized is not null
          and upper(btrim(p.serial_number))=v_fabric.serial_number_normalized
      )) then raise exception 'Physical asset is already allocated to Loans or Planning'; end if;

    if v_price_source='manual' and v_original is not null then raise exception 'Manual pricing cannot supply an unverified original price'; end if;
    if (v_catalog is null or v_original is null or v_price_source='manual')
      and v_method <> 'adjusted_base' then raise exception 'Unverified assets require an adjusted base price'; end if;

    -- A stored original is a historical price fact, not today's catalogue value.
    if v_original is not null and not (v_has_existing
      and v_existing.original_list_price is not distinct from v_original
      and v_existing.pricing_currency=v_currency and v_existing.price_source='catalogue') then
      if v_catalog is null then raise exception 'Catalogue price requires a verified catalogue SKU'; end if;
      select case v_currency when 'DKK' then p.price_dkk when 'EUR' then p.price_eur when 'SEK' then p.price_sek end
        into v_catalog_price from public.price_list_published p where p.item_number=v_catalog;
      if not found or v_catalog_price is null or v_catalog_price::text in ('NaN','Infinity','-Infinity')
        or v_catalog_price <= 0 or v_original is distinct from round(v_catalog_price,2) then
        raise exception 'Original sales-stock price is not verified';
      end if;
    end if;

    if v_method='adjusted_base' then
      if v_discount is not null or (v_adjusted is not null and (v_adjusted <= 0
        or v_adjusted::text in ('NaN','Infinity','-Infinity')
        or round(v_adjusted,2) <= 0
        or (v_original is not null and v_original > 0 and v_adjusted > v_original))) then
        raise exception 'Adjusted base price is invalid';
      end if;
      if v_commercial and v_adjusted is null then raise exception 'Sales-stock commercial documents require a positive price'; end if;
    else
      if v_original is null or v_original <= 0 or v_price_source <> 'catalogue' then
        raise exception 'Sales-stock discount requires a positive verified original price';
      end if;
      if v_adjusted is not null or (v_discount is not null and (v_discount < 0 or v_discount >= 100
        or v_discount::text in ('NaN','Infinity','-Infinity') or round(v_discount,4) >= 100))
        or round(v_original * (1-coalesce(round(v_discount,4),0)/100),2) <= 0 then
        raise exception 'Sales-stock discount is invalid';
      end if;
    end if;
    if (v_adjusted is not null or v_discount is not null) and v_reason='' then raise exception 'Pricing reason is required'; end if;
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
  v_original numeric;
  v_quantity numeric;
  v_price_source text;
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
    v_original := nullif(v_asset->>'originalListPrice','')::numeric;
    v_quantity := coalesce((v_asset->>'quantity')::numeric,1);
    v_price_source := coalesce(v_asset->>'priceSource','catalogue');
    select * into v_previous from public.sales_stock_configuration_assets
      where configuration_id=new.id and source_asset_id=v_source;
    if (not found and (nullif(v_asset->>'adjustedBasePrice','') is not null or nullif(v_asset->>'salesStockDiscountPct','') is not null))
      or (found and (v_previous.pricing_method is distinct from v_asset->>'pricingMethod'
        or v_previous.adjusted_base_price is distinct from nullif(v_asset->>'adjustedBasePrice','')::numeric
        or v_previous.sales_stock_discount_pct is distinct from nullif(v_asset->>'salesStockDiscountPct','')::numeric
        or v_previous.original_list_price is distinct from v_original or v_previous.price_source is distinct from v_price_source
        or v_previous.quantity is distinct from v_quantity or v_previous.pricing_currency is distinct from v_asset->>'pricingCurrency')) then
      insert into public.sales_stock_pricing_audit (
        configuration_id,source_asset_id,actor_app_user_id,old_pricing_method,new_pricing_method,
        old_adjusted_base_price,new_adjusted_base_price,old_sales_stock_discount_pct,new_sales_stock_discount_pct,pricing_reason,
        old_original_list_price,new_original_list_price,old_price_source,new_price_source,old_quantity,new_quantity,
        old_pricing_currency,new_pricing_currency
      ) values (
        new.id,v_source,v_actor,v_previous.pricing_method,v_asset->>'pricingMethod',
        v_previous.adjusted_base_price,nullif(v_asset->>'adjustedBasePrice','')::numeric,
        v_previous.sales_stock_discount_pct,nullif(v_asset->>'salesStockDiscountPct','')::numeric,btrim(coalesce(v_asset->>'pricingReason','')),
        v_previous.original_list_price,v_original,v_previous.price_source,v_price_source,v_previous.quantity,v_quantity,
        v_previous.pricing_currency,v_asset->>'pricingCurrency'
      );
    end if;
    -- Reuse the row ID so the unchanged BEFORE INSERT Brik guard excludes this same sale during upsert.
    insert into public.sales_stock_configuration_assets (
      id,configuration_id,lead_id,source_asset_id,asset_instance_id,configurator_unit_number,item_number,item_text,item_type,
      serial_number,brik_number,warehouse_location_code,warehouse_location_name,account_number,source_order_number,
      source_classification,pricing_method,original_list_price,pricing_currency,adjusted_base_price,
      sales_stock_discount_pct,pricing_reason,reservation_status,created_by,catalog_item_number,quantity,price_source
    ) values (
      coalesce(v_previous.id,gen_random_uuid()),new.id,new.lead_id,v_source,v_asset->>'assetInstanceId',(v_asset->>'configuratorUnitNumber')::integer,
      v_asset->>'itemNumber',v_asset->>'itemText',nullif(v_asset->>'itemType',''),nullif(btrim(v_asset->>'serialNumber'),''),
      nullif(v_asset->>'brikNumber','')::integer,v_asset->>'warehouseLocationCode',nullif(btrim(v_asset->>'warehouseLocationName'),''),
      nullif(btrim(v_asset->>'accountNumber'),''),nullif(btrim(v_asset->>'sourceOrderNumber'),''),v_asset->>'classification',
      v_asset->>'pricingMethod',v_original,v_asset->>'pricingCurrency',nullif(v_asset->>'adjustedBasePrice','')::numeric,
      nullif(v_asset->>'salesStockDiscountPct','')::numeric,btrim(coalesce(v_asset->>'pricingReason','')),v_status,v_actor,
      nullif(btrim(v_asset->>'catalogItemNumber'),''),v_quantity,v_price_source
    ) on conflict (configuration_id,source_asset_id) do update set
      lead_id=excluded.lead_id,pricing_method=excluded.pricing_method,original_list_price=excluded.original_list_price,
      pricing_currency=excluded.pricing_currency,adjusted_base_price=excluded.adjusted_base_price,
      sales_stock_discount_pct=excluded.sales_stock_discount_pct,pricing_reason=excluded.pricing_reason,
      catalog_item_number=excluded.catalog_item_number,quantity=excluded.quantity,price_source=excluded.price_source,
      reservation_status=excluded.reservation_status,updated_at=now();
  end loop;
  update public.sales_stock_configuration_assets s set reservation_status='RELEASED',updated_at=now()
    where s.configuration_id=new.id and s.reservation_status='ACTIVE'
      and not exists (select 1 from jsonb_array_elements(v_assets) x where (x->>'sourceAssetId')::uuid=s.source_asset_id);
  if new.lead_id is not null then update public.crm_leads set sales_source_type='SALES_STOCK_DEMO' where id=new.lead_id; end if;
  return new;
end;
$$;
revoke all on function public.sync_sales_stock_configuration_assets() from public, anon, authenticated;

comment on column public.sales_stock_configuration_assets.catalog_item_number is 'Optional catalogue link; raw Fabric item_number remains the physical source identity.';
comment on column public.sales_stock_configuration_assets.quantity is 'Transaction quantity. Legacy snapshots with no quantity retain the default of one.';
comment on column public.sales_stock_configuration_assets.price_source is 'Catalogue or explicit manual pricing. Missing legacy snapshot source means catalogue; no Fabric price is inferred.';

commit;
