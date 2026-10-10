// In-memory only. Uses the existing node_modules/.cache/loans-sql PGlite runtime.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(resolve(process.env.LOANS_SQL_PGLITE_MODULE
  ?? 'node_modules/.cache/loans-sql/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const migration = '20261010160651_sales_stock_optional_catalogue.sql';
const sql = (name) => readFileSync(`supabase/migrations/${name}`, 'utf8');
const scalar = async (query, params = []) => (await db.query(query, params)).rows[0]?.value;
const backend = randomUUID();
const seller = randomUUID();
let passed = 0;
const test = async (name, fn) => { await fn(); passed += 1; console.log(`PASS ${name}`); };
const owner = () => db.exec('reset role');
const actor = async (id = backend) => {
  await owner();
  await db.query("select set_config('qa.actor_id',$1,false)", [id]);
  await db.exec('set role authenticated');
};
const source = async (patch = {}) => {
  await owner();
  const asset = {
    sourceAssetId: randomUUID(), assetInstanceId: `LINE|QA|${randomUUID()}`,
    itemNumber: 'UNKNOWN-RAW-00', catalogItemNumber: null, itemText: 'Nr.82 raw source implement',
    itemType: null, quantity: 1, priceSource: 'manual', serialNumber: null, brikNumber: 82,
    warehouseLocationCode: '2', warehouseLocationName: 'Lager 2', accountNumber: '1010',
    sourceOrderNumber: '133225', classification: 'LOAN_CANDIDATE', configuratorUnitNumber: 1,
    originalListPrice: null, pricingCurrency: 'DKK', pricingMethod: 'adjusted_base',
    adjustedBasePrice: 450, salesStockDiscountPct: null, pricingReason: 'Physical condition reviewed', ...patch,
  };
  await db.query(`insert into public.fabric_loan_assets_current
    (asset_id,asset_instance_id,company,item_number,item_name,line_text,serial_number,
      warehouse_location_code,warehouse_location_name,account_number,order_number,inventory_qty)
    values($1,$2,$3,$4,'Fallback name',$5,$6,$7,$8,$9,$10,$11)`,
  [asset.sourceAssetId, asset.assetInstanceId, `QA-${asset.sourceAssetId}`, asset.itemNumber,
    asset.itemText, asset.serialNumber, asset.warehouseLocationCode, asset.warehouseLocationName,
    asset.accountNumber, asset.sourceOrderNumber, asset.quantity]);
  if (asset.brikNumber !== null) await db.query(`insert into public.loan_asset_portal_metadata
    (asset_id,company,brik_number,updated_by_app_user_id) select asset_id,company,$2,$3
    from public.fabric_loan_assets_current where asset_id=$1`, [asset.sourceAssetId, asset.brikNumber, backend]);
  await actor();
  return asset;
};
const save = async (assets, options = {}) => {
  const id = options.id ?? randomUUID();
  await db.query(`insert into public.configurations
    (id,created_by_user_id,assigned_seller_id,dealer_number,state_json,quote_number,order_number,submitted_at,order_sent_at,document_type)
    values($1,$2,$3,'1010',$4::jsonb,$5,$6,$7,$8,$9)`,
  [id, options.creator ?? backend, options.assigned ?? null,
    JSON.stringify({ salesChannel: 'sales_stock_demo', language: 'da', currency: 'DKK', salesStockAssets: assets, ...options.state }),
    options.quote ?? null, options.order ?? null, options.submitted ?? null, options.sent ?? null, options.document ?? 'quote']);
  return id;
};
const change = (id, assets, state = {}) => db.query('update public.configurations set state_json=$2::jsonb where id=$1',
  [id, JSON.stringify({ salesChannel: 'sales_stock_demo', language: 'da', currency: 'DKK', salesStockAssets: assets, ...state })]);
const persisted = async (id) => (await db.query('select * from public.sales_stock_configuration_assets where configuration_id=$1', [id])).rows;
const known = () => source({ itemNumber: '410040-01', catalogItemNumber: '410040', itemType: 'machine',
  priceSource: 'catalogue', originalListPrice: 600, pricingMethod: 'sales_stock_discount', adjustedBasePrice: null, pricingReason: '' });

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('qa.actor_id',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table public.app_users(id uuid primary key,auth_user_id uuid,email text,portal_role text,role text,
      dealer_number text,approved boolean default true,is_active boolean default true);
    insert into public.app_users(id,auth_user_id,email,portal_role) values
      ('${backend}','${backend}','backend@qa.invalid','timan_backend'),('${seller}','${seller}','seller@qa.invalid','timan_seller');
    create function public.loan_actor_id() returns uuid language sql stable security definer set search_path='' as $$
      select id from public.app_users where auth_user_id=auth.uid() and approved and is_active $$;
    create function public.can_administer_loans() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.app_users where auth_user_id=auth.uid() and approved and is_active and portal_role='timan_backend') $$;
    create function public.loan_can_browse_stock() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.app_users where auth_user_id=auth.uid() and approved and is_active and portal_role in ('timan_backend','timan_seller')) $$;
    create function public.loan_stock_status() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create function public.resolve_collaboration_manager_accounts() returns table(id uuid,account_number text)
      language sql stable as $$ select null::uuid,null::text where false $$;
    create table public.crm_leads(id uuid primary key default gen_random_uuid());
    create table public.configurations(id uuid primary key default gen_random_uuid(),created_by_user_id uuid,
      assigned_seller_id uuid,seller_email text,dealer_number text,lead_id uuid references public.crm_leads(id),
      state_json jsonb,quote_number text,order_number text,submitted_at timestamptz,order_sent_at timestamptz,
      case_status text,status text,document_type text,case_type text);
    create table public.configuration_items(id uuid primary key default gen_random_uuid(),configuration_id uuid references public.configurations(id));
    create table public.fabric_loan_assets_current(asset_id uuid primary key,asset_instance_id text unique not null,
      company text,item_number text,item_name text,line_text text,serial_number text,
      serial_number_normalized text generated always as (nullif(upper(btrim(serial_number)),'')) stored,
      warehouse_location_code text,warehouse_location_name text,account_number text,order_number text,
      inventory_qty numeric,instance_ordinal integer default 1,source_present boolean default true,
      classification text default 'LOAN_CANDIDATE',review_required boolean default false,identity_conflict boolean default false);
    create table public.loan_asset_portal_metadata(asset_id uuid primary key references public.fabric_loan_assets_current(asset_id),
      company text,serial_number_normalized text,brik_number integer,updated_by_app_user_id uuid,updated_at timestamptz default now());
    create table public.planning_supply_units(id uuid primary key,serial_number text);
    create table public.planning_reservations(id uuid primary key default gen_random_uuid(),supply_unit_id uuid,status text);
    create table public.loan_asset_allocations(id uuid primary key default gen_random_uuid(),fabric_asset_id uuid,
      supply_unit_id uuid,allocation_status text default 'active');
    create table public.planning_machine_products(item_number text);
    create table public.planning_accessory_products(item_number text);
    create table public.price_list_published(item_number text primary key,price_dkk numeric,price_eur numeric,price_sek numeric);
    insert into public.planning_machine_products values('410040'),('312010');
    insert into public.price_list_published values('410040',600,80,900);
    grant usage on schema public,auth to authenticated,anon,service_role;
    grant select on public.app_users to authenticated;
    grant select,insert,update,delete on public.configurations to authenticated;
    alter table public.configurations enable row level security;
  `);
  // Execute the actual scoped configuration policy; unrelated CRM policies/views are outside this fixture.
  const rls = sql('20260911100000_replace_global_crm_partner_rls.sql');
  await db.exec(rls.slice(rls.indexOf('drop policy if exists configurations_scoped_access'), rls.indexOf('drop policy if exists dealer_accounts_select_scoped')));
  const original = sql('20261008115114_sales_stock_configurator_flow.sql');
  await db.exec(`${original.slice(0, original.indexOf('create or replace view public.crm_configurations_view'))}\ncommit;`);
  const resolver = sql('20261008070522_resolve_fabric_loan_item_type.sql');
  await db.exec(resolver.slice(0, resolver.indexOf('create or replace function public.loan_stock_snapshot()')));
  await db.exec(sql('20261009054436_shared_brik_physical_groups.sql'));
  await db.exec(`create trigger loan_guard_asset_allocation before insert or update on public.loan_asset_allocations
    for each row execute function public.loan_guard_asset_allocation()`);
  await db.exec(sql('20260904083236_lock_submitted_configurator_orders.sql'));
  await db.exec(sql('20261001125857_guard_configurator_order_direct_state.sql'));
  await actor();

  const historical = await known();
  historical.salesStockDiscountPct = 10;
  historical.pricingReason = 'Frozen historical condition';
  delete historical.priceSource;
  delete historical.quantity;
  const historyId = await save([historical], { order: 'QA-HISTORICAL', submitted: '2026-10-08T10:00:00Z', document: 'order' });
  const historyState = await scalar('select state_json as value from public.configurations where id=$1', [historyId]);
  const historyNative = (await persisted(historyId))[0];
  const historyAudit = (await db.query('select * from public.sales_stock_pricing_audit where configuration_id=$1', [historyId])).rows[0];
  const legacyStatic = await source({ itemNumber: '312010-00', catalogItemNumber: '312010', itemType: 'machine',
    originalListPrice: 3210, pricingMethod: 'sales_stock_discount', adjustedBasePrice: null, pricingReason: '' });
  delete legacyStatic.priceSource;
  delete legacyStatic.quantity;
  const legacyDraftId = await save([legacyStatic]);
  const legacyDraftState = await scalar('select state_json as value from public.configurations where id=$1', [legacyDraftId]);
  const functions = async () => (await db.query(`select proname,pg_get_functiondef(oid) as definition from pg_proc
    where pronamespace='public'::regnamespace and proname in ('sales_stock_guard_physical_group','loan_guard_asset_allocation',
      'loan_resolve_fabric_item_type','prevent_submitted_configurator_order_changes','guard_configurator_order_direct_state',
      'sales_stock_actor_can_manage') order by proname`)).rows;
  const frozenFunctions = await functions();
  await owner();
  await db.exec(sql(migration));
  await db.exec(readFileSync('supabase/tests/sales_stock_optional_catalogue_security.sql', 'utf8'));
  await actor();

  await test('migration preserves historical JSON, old native facts and shared identity/permission functions', async () => {
    assert.deepEqual(await scalar('select state_json as value from public.configurations where id=$1', [historyId]), historyState);
    const row = (await persisted(historyId))[0];
    for (const [key, value] of Object.entries(historyNative)) assert.deepEqual(row[key], value, key);
    assert.equal(row.catalog_item_number, null);
    assert.equal(Number(row.quantity), 1);
    assert.equal(row.price_source, 'catalogue');
    const audit = (await db.query('select * from public.sales_stock_pricing_audit where configuration_id=$1', [historyId])).rows[0];
    for (const [key, value] of Object.entries(historyAudit)) assert.deepEqual(audit[key], value, key);
    assert.equal(audit.new_original_list_price, null);
    assert.equal(audit.new_price_source, null);
    assert.deepEqual(await functions(), frozenFunctions);
    await assert.rejects(change(historyId, [historical]), /read-only/);
  });

  await test('unknown asset commercial save needs no catalogue and preserves raw SKU, null facts and one native row', async () => {
    const asset = await source({ itemNumber: 'raw-unknown-00', quantity: 18, adjustedBasePrice: 1750 });
    const id = await save([asset], { quote: 'QA-UNKNOWN' });
    const rows = await persisted(id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].item_number, 'raw-unknown-00');
    assert.equal(rows[0].item_text, asset.itemText);
    assert.equal(rows[0].item_type, null);
    assert.equal(rows[0].catalog_item_number, null);
    assert.equal(rows[0].original_list_price, null);
    assert.equal(Number(rows[0].quantity), 18);
    assert.equal(rows[0].price_source, 'manual');
    await change(id, [{ ...asset, adjustedBasePrice: 1700, pricingReason: 'Updated condition' }]);
    assert.equal((await persisted(id)).length, 1);
    const audit = (await db.query('select * from public.sales_stock_pricing_audit where configuration_id=$1 order by changed_at', [id])).rows;
    assert.equal(audit.length, 2);
    assert.equal(audit[1].new_original_list_price, null);
    assert.equal(audit[1].new_price_source, 'manual');
    assert.equal(Number(audit[1].new_quantity), 18);
    assert.equal(Number(audit[1].old_adjusted_base_price), 1750);
    await assert.rejects(change(id, [{ ...asset, quantity: 1 }]), /immutable/);
    await assert.rejects(save([asset]), /already reserved or sold/);
  });

  await test('unpriced draft allowed; quote, order, submission and sent order require positive price', async () => {
    const asset = await source({ adjustedBasePrice: null, pricingReason: '' });
    const id = await save([asset]);
    assert.equal((await persisted(id))[0].adjusted_base_price, null);
    for (const header of ['quote_number','order_number','submitted_at','order_sent_at']) {
      const value = header.endsWith('_at') ? '2026-10-10T10:00:00Z' : 'QA-NUMBER';
      await assert.rejects(db.query(`update public.configurations set ${header}=$2 where id=$1`, [id, value]), /require a positive price/);
    }
    await change(id, [{ ...asset, adjustedBasePrice: 900, pricingReason: 'Reviewed manually' }]);
    await db.query("update public.configurations set order_number='QA-READY',submitted_at=now(),document_type='order' where id=$1", [id]);
    assert.equal((await persisted(id))[0].reservation_status, 'SOLD');
    await assert.rejects(save([asset]), /already reserved or sold/);
  });

  await test('legacy absent quantity and priceSource default to one and catalogue', async () => {
    const asset = await known();
    delete asset.priceSource;
    delete asset.quantity;
    const row = (await persisted(await save([asset], { quote: 'QA-LEGACY' })))[0];
    assert.equal(row.price_source, 'catalogue');
    assert.equal(Number(row.quantity), 1);
    assert.equal(Number(row.original_list_price), 600);
    assert.equal(row.catalog_item_number, '410040');
  });

  await test('legacy static-only stored original survives missing published price and explicit default quantity', async () => {
    assert.deepEqual(await scalar('select state_json as value from public.configurations where id=$1', [legacyDraftId]), legacyDraftState);
    await owner();
    assert.equal(await scalar("select count(*)::int as value from public.price_list_published where item_number='312010'"), 0);
    await actor();
    await change(legacyDraftId, [{ ...legacyStatic, quantity: 1 }]);
    const row = (await persisted(legacyDraftId))[0];
    assert.equal(Number(row.original_list_price), 3210);
    assert.equal(Number(row.quantity), 1);
    assert.equal(row.price_source, 'catalogue');
    assert.equal(row.item_type, 'machine');
    const fresh = await source({ itemNumber: '312010-00', catalogItemNumber: '312010', itemType: 'machine' });
    await assert.rejects(save([{ ...fresh, priceSource: 'catalogue', originalListPrice: 3210 }]), /not verified/);
    const manual = (await persisted(await save([fresh], { quote: 'QA-STATIC-MANUAL' })))[0];
    assert.equal(manual.original_list_price, null);
    assert.equal(manual.catalog_item_number, '312010');
    assert.equal(manual.price_source, 'manual');
    assert.equal(manual.item_type, 'machine');
  });

  await test('fresh source account whitelist, serial-or-Brik and nonblank instance are enforced from stored source', async () => {
    for (const accountNumber of [null, '', '1000', '1030', ' 1010']) {
      const asset = await source({ accountNumber });
      await assert.rejects(save([asset]), /not eligible/);
    }
    for (const patch of [
      { serialNumber: null, brikNumber: null, quantity: 18 },
      { serialNumber: '   ', brikNumber: null },
      { serialNumber: 'SERIAL', brikNumber: null, assetInstanceId: ' ' },
      { brikNumber: 0 }, { brikNumber: -1 }, { brikNumber: 1000000 },
    ]) {
      const asset = await source(patch);
      await assert.rejects(save([asset]), /not eligible/);
      if (patch.brikNumber === null && !patch.serialNumber) {
        await assert.rejects(save([{ ...asset, serialNumber: 'FORGED' }]), /not eligible/);
        await assert.rejects(save([{ ...asset, brikNumber: 82 }]), /not eligible/);
      }
    }
    const serial = await source({ serialNumber: 'VALID-SERIAL', brikNumber: null, accountNumber: '1020' });
    await save([serial]);
    const brik = await source({ serialNumber: null, brikNumber: 96, accountNumber: '1010' });
    await save([brik]);
  });

  await test('new source-price contract rejects direct pricing; legacy quote and ordinary quote behavior remains unchanged', async () => {
    const asset = await source();
    for (const state of [{ pricingMode: 'direct' }, { direct: true }]) await assert.rejects(save([asset], { state }), /Direct pricing is not allowed/);
    const id = await save([asset]);
    await assert.rejects(change(id, [asset], { pricingMode: 'direct' }), /Direct pricing is not allowed/);
    await change(legacyDraftId, [legacyStatic], { pricingMode: 'direct' });
    assert.equal((await scalar('select state_json as value from public.configurations where id=$1', [legacyDraftId])).pricingMode, 'direct');
    await save([], { state: { salesChannel: 'standard', pricingMode: 'direct' } });
    await assert.rejects(save([], { document: 'order', state: { salesChannel: 'standard', pricingMode: 'direct' } }), /ORDER_DIRECT_NOT_ALLOWED/);
  });

  await test('sales-stock unit positions must be finite positive unique integers and existing position/type immutable', async () => {
    const a = await source();
    for (const configuratorUnitNumber of [undefined, null, 0, -1, 1.5, 'NaN', 'Infinity', '-Infinity', 2147483648]) {
      await assert.rejects(save([{ ...a, configuratorUnitNumber }]), /unit position/);
    }
    const b = await source();
    await assert.rejects(save([a, b]), /Duplicate sales-stock unit position/);
    const id = await save([a, { ...b, configuratorUnitNumber: 2 }]);
    assert.deepEqual((await persisted(id)).map(row => row.configurator_unit_number).sort(), [1, 2]);
    await assert.rejects(change(id, [{ ...a, configuratorUnitNumber: 3 }, { ...b, configuratorUnitNumber: 2 }]), /immutable/);
    await assert.rejects(change(id, [{ ...a, itemType: 'equipment' }, { ...b, configuratorUnitNumber: 2 }]), /immutable/);
    const canonical = await known();
    await assert.rejects(save([{ ...canonical, itemType: null, pricingMethod: 'adjusted_base', adjustedBasePrice: 450, pricingReason: 'Reason' }]), /type must match/);
    await assert.rejects(save([{ ...canonical, itemType: 'equipment' }]), /type must match/);
  });

  await test('active direct Fabric loans, Planning serial loans and Planning reservations block fresh sales; released records do not', async () => {
    const direct = await source({ serialNumber: 'LOAN-DIRECT', brikNumber: null });
    await owner();
    const allocationId = (await db.query('insert into public.loan_asset_allocations(fabric_asset_id) values($1) returning id', [direct.sourceAssetId])).rows[0].id;
    await actor();
    await assert.rejects(save([{ ...direct, allocated: false }]), /already allocated to Loans or Planning/);
    await owner();
    await db.query("update public.loan_asset_allocations set allocation_status='released' where id=$1", [allocationId]);
    await actor();
    await save([direct]);

    const viaPlanning = await source({ serialNumber: 'LOAN-PLANNING-SERIAL', brikNumber: null });
    const supplyId = randomUUID();
    await owner();
    await db.query('insert into public.planning_supply_units(id,serial_number) values($1,$2)', [supplyId, ' loan-planning-serial ']);
    const plannedLoan = (await db.query('insert into public.loan_asset_allocations(supply_unit_id) values($1) returning id', [supplyId])).rows[0].id;
    await actor();
    await assert.rejects(save([viaPlanning]), /already allocated to Loans or Planning/);
    await owner();
    await db.query("update public.loan_asset_allocations set allocation_status='released' where id=$1", [plannedLoan]);
    const reservation = (await db.query("insert into public.planning_reservations(supply_unit_id,status) values($1,'active') returning id", [supplyId])).rows[0].id;
    await actor();
    await assert.rejects(save([viaPlanning]), /already allocated to Loans or Planning/);
    await owner();
    await db.query("update public.planning_reservations set status='released' where id=$1", [reservation]);
    await actor();
    await save([viaPlanning]);
  });

  await test('saved sales draft cannot submit over a later Planning reservation but can release without rewriting its price', async () => {
    const asset = await source({ serialNumber: 'PLANNING-AFTER-DRAFT', brikNumber: null });
    const id = await save([asset]);
    const supplyId = randomUUID();
    await owner();
    await db.query('insert into public.planning_supply_units(id,serial_number) values($1,$2)', [supplyId, asset.serialNumber]);
    await db.query("insert into public.planning_reservations(supply_unit_id,status) values($1,'active')", [supplyId]);
    await actor();
    await assert.rejects(db.query("update public.configurations set order_number='QA-CONFLICT',submitted_at=now() where id=$1", [id]), /already allocated to Loans or Planning/);
    assert.equal((await persisted(id))[0].reservation_status, 'ACTIVE');
    await db.query("update public.configurations set case_status='deleted' where id=$1", [id]);
    const row = (await persisted(id))[0];
    assert.equal(row.reservation_status, 'RELEASED');
    assert.equal(Number(row.adjusted_base_price), 450);
  });

  await test('quantity must be finite positive and exactly the Fabric row quantity, including fractional source values', async () => {
    const asset = await source({ quantity: 18 });
    for (const quantity of [0, -1, 'NaN', 'Infinity', '-Infinity', 1, 19, null, undefined]) {
      await assert.rejects(save([{ ...asset, quantity }]), /quantity/);
    }
    const fraction = await source({ quantity: 1.5 });
    assert.equal(Number((await persisted(await save([fraction])))[0].quantity), 1.5);
    await owner();
    await db.query("update public.fabric_loan_assets_current set inventory_qty='NaN' where asset_id=$1", [asset.sourceAssetId]);
    await actor();
    await assert.rejects(save([asset]), /quantity must match Fabric/);
  });

  await test('manual prices reject zero, negative, nonfinite, subcent zero and missing reasons', async () => {
    const asset = await source();
    for (const adjustedBasePrice of [0, -10, 'NaN', 'Infinity', '-Infinity', 0.004]) {
      await assert.rejects(save([{ ...asset, adjustedBasePrice }], { quote: 'QA-BAD' }), /price is invalid/);
    }
    await assert.rejects(save([{ ...asset, pricingReason: '   ' }]), /reason is required/);
    await assert.rejects(save([{ ...asset, priceSource: 'fabric' }]), /price source/);
    await assert.rejects(save([{ ...asset, priceSource: 'MANUAL' }]), /price source/);
    await assert.rejects(save([{ ...asset, priceSource: null }]), /price source/);
    await assert.rejects(save([{ ...asset, originalListPrice: 1000 }]), /unverified original/);
    const id = await save([{ ...asset, adjustedBasePrice: 123456 }], { quote: 'QA-NO-ORIGINAL-CAP' });
    assert.equal(Number((await persisted(id))[0].adjusted_base_price), 123456);
  });

  await test('unverified original, currency mismatch and fabricated type are rejected', async () => {
    const asset = await known();
    for (const originalListPrice of [0, 999, -1, 'NaN', 'Infinity', '-Infinity']) {
      await assert.rejects(save([{ ...asset, originalListPrice }]), /pricing method|not verified/);
    }
    await assert.rejects(save([{ ...asset, pricingCurrency: 'EUR', originalListPrice: 80 }]), /currency must match/);
    await assert.rejects(save([{ ...asset, pricingCurrency: 'USD' }]), /pricing currency/);
    const euro = await save([{ ...asset, pricingCurrency: 'EUR', originalListPrice: 80 }], { state: { currency: 'EUR' }, quote: 'QA-EUR' });
    assert.equal((await persisted(euro))[0].pricing_currency, 'EUR');
    const unknown = await source();
    for (const itemType of ['machine','equipment','made-up']) await assert.rejects(save([{ ...unknown, itemType }]), /type/);
    await assert.rejects(save([{ ...unknown, catalogItemNumber: '410040' }]), /catalogue identity/);
  });

  await test('null source type with exact released catalogue link permits a verified original and discount', async () => {
    const asset = await source({ itemNumber: 'QA-UNTYPED-00', catalogItemNumber: 'QA-UNTYPED-00', itemType: null,
      priceSource: 'catalogue', originalListPrice: 800, pricingMethod: 'sales_stock_discount', adjustedBasePrice: null,
      salesStockDiscountPct: 10, pricingReason: 'Physical condition reviewed' });
    await owner();
    // Conflicting product classifications make the actual source resolver return null, despite a released price.
    await db.exec(`insert into public.planning_machine_products values('QA-UNTYPED');
      insert into public.planning_accessory_products values('QA-UNTYPED');
      insert into public.price_list_published values('QA-UNTYPED-00',800,100,1200)`);
    assert.equal(await scalar('select public.loan_resolve_fabric_item_type($1) as value', [asset.itemNumber]), null);
    await actor();
    await assert.rejects(save([{ ...asset, originalListPrice: 850 }]), /not verified/);
    await assert.rejects(save([{ ...asset, salesStockDiscountPct: 100 }]), /discount is invalid/);
    const id = await save([asset], { quote: 'QA-UNTYPED-CATALOGUE' });
    const row = (await persisted(id))[0];
    assert.equal(row.item_type, null);
    assert.equal(row.catalog_item_number, asset.itemNumber);
    assert.equal(row.price_source, 'catalogue');
    assert.equal(Number(row.original_list_price), 800);
    assert.equal(row.pricing_method, 'sales_stock_discount');
    assert.equal(Number(row.sales_stock_discount_pct), 10);
    assert.equal(row.adjusted_base_price, null);
    await change(id, [{ ...asset, salesStockDiscountPct: 15 }]);
    assert.equal((await persisted(id))[0].item_type, null);
    assert.equal(Number((await persisted(id))[0].sales_stock_discount_pct), 15);
  });

  await test('discount requires positive verified original and cannot produce a rounded zero commercial price', async () => {
    const unknown = await source();
    await assert.rejects(save([{ ...unknown, pricingMethod: 'sales_stock_discount', adjustedBasePrice: null }]), /adjusted base/);
    const asset = await known();
    for (const salesStockDiscountPct of [-1, 100, 99.99999, 'NaN', 'Infinity', '-Infinity']) {
      await assert.rejects(save([{ ...asset, salesStockDiscountPct, pricingReason: 'Reason' }]), /discount is invalid/);
    }
    await assert.rejects(save([{ ...asset, salesStockDiscountPct: 10 }]), /reason is required/);
    await assert.rejects(save([{ ...asset, adjustedBasePrice: 400 }]), /discount is invalid/);
    const row = (await persisted(await save([{ ...asset, salesStockDiscountPct: 10, pricingReason: 'Condition' }], { quote: 'QA-DISCOUNT' })))[0];
    assert.equal(Number(row.sales_stock_discount_pct), 10);
    const tiny = await source({ itemNumber: 'TINY-00', catalogItemNumber: 'TINY', itemType: 'equipment',
      priceSource: 'catalogue', originalListPrice: 0.01, pricingMethod: 'sales_stock_discount', adjustedBasePrice: null });
    await owner();
    await db.exec("insert into public.price_list_published values('TINY',0.01,0.01,0.01)");
    await actor();
    await assert.rejects(save([{ ...tiny, salesStockDiscountPct: 99 }], { quote: 'QA-ZERO-NET' }), /discount is invalid/);
  });

  await test('catalogue original is server-verified but stored original survives later price changes/removal', async () => {
    const asset = await known();
    const id = await save([asset]);
    await owner();
    await db.exec("update public.price_list_published set price_dkk=700 where item_number='410040'");
    await actor();
    await change(id, [{ ...asset, salesStockDiscountPct: 15, pricingReason: 'Historical original retained' }]);
    assert.equal(Number((await persisted(id))[0].original_list_price), 600);
    const fresh = await known();
    await assert.rejects(save([fresh]), /not verified/);
    await owner();
    await db.exec("delete from public.price_list_published where item_number='410040'");
    await actor();
    await change(id, [asset]);
    assert.equal(Number((await persisted(id))[0].original_list_price), 600);
    await assert.rejects(save([fresh]), /not verified/);
    await owner();
    await db.exec("insert into public.price_list_published values('410040',600,80,900)");
    await actor();
  });

  await test('manual repricing is audited without modifying historical original records', async () => {
    const asset = await known();
    const id = await save([asset]);
    await change(id, [{ ...asset, priceSource: 'manual', originalListPrice: null, pricingMethod: 'adjusted_base',
      adjustedBasePrice: 850, pricingReason: 'Manual condition valuation' }]);
    const row = (await persisted(id))[0];
    assert.equal(row.original_list_price, null);
    const audit = (await db.query('select * from public.sales_stock_pricing_audit where configuration_id=$1', [id])).rows[0];
    assert.equal(Number(audit.old_original_list_price), 600);
    assert.equal(audit.new_original_list_price, null);
    assert.equal(audit.old_price_source, 'catalogue');
    assert.equal(audit.new_price_source, 'manual');
  });

  await test('fresh source snapshot cannot forge raw SKU/text/classification or physical identifiers', async () => {
    const asset = await source();
    for (const patch of [
      { itemNumber: 'UNKNOWN-RAW' }, { itemText: `${asset.itemText} ` }, { itemText: 'Catalogue replacement' },
      { assetInstanceId: 'wrong' }, { serialNumber: 'fake' }, { brikNumber: 83 }, { warehouseLocationCode: '4' },
      { accountNumber: '1020' }, { sourceOrderNumber: 'wrong' }, { classification: 'REVIEW_REQUIRED' },
    ]) await assert.rejects(save([{ ...asset, ...patch }]), /does not match Fabric/);
    await assert.rejects(save([{ ...asset, sourceAssetId: randomUUID() }]), /not eligible/);
    const id = await save([asset]);
    await assert.rejects(change(id, [{ ...asset, itemText: 'modified history' }]), /immutable/);
  });

  await test('unsafe, missing or changed fresh sources are rejected; duplicate IDs cannot make two rows', async () => {
    const asset = await source();
    await assert.rejects(save([asset, { ...asset, sourceAssetId: asset.sourceAssetId.toUpperCase(), configuratorUnitNumber: 2 }]), /Duplicate/);
    for (const [column, value] of [['source_present', false], ['review_required', true], ['identity_conflict', true], ['warehouse_location_code', '9']]) {
      await owner();
      const old = await scalar(`select ${column} as value from public.fabric_loan_assets_current where asset_id=$1`, [asset.sourceAssetId]);
      await db.query(`update public.fabric_loan_assets_current set ${column}=$2 where asset_id=$1`, [asset.sourceAssetId, value]);
      await actor();
      await assert.rejects(save([asset]), /not eligible/);
      await owner();
      await db.query(`update public.fabric_loan_assets_current set ${column}=$2 where asset_id=$1`, [asset.sourceAssetId, old]);
    }
    await actor();
  });

  await test('shared Brik prevents sale/sale and loan/sale double allocation in both directions', async () => {
    const first = await source();
    const second = await source({ itemNumber: 'OTHER-COMPONENT-00' });
    await owner();
    await db.query('update public.fabric_loan_assets_current set company=$2 where asset_id=$1', [second.sourceAssetId, `QA-${first.sourceAssetId}`]);
    await db.query('update public.loan_asset_portal_metadata set company=$2 where asset_id=$1', [second.sourceAssetId, `QA-${first.sourceAssetId}`]);
    await actor();
    const id = await save([first]);
    await assert.rejects(save([second]), /Physical asset group is already reserved/);
    await owner();
    await assert.rejects(db.query('insert into public.loan_asset_allocations(fabric_asset_id) values($1)', [second.sourceAssetId]), /group is already allocated/);
    await actor();
    await db.query("update public.configurations set case_status='deleted' where id=$1", [id]);
    assert.equal((await persisted(id))[0].reservation_status, 'RELEASED');
    await owner();
    const allocation = (await db.query('insert into public.loan_asset_allocations(fabric_asset_id) values($1) returning id', [second.sourceAssetId])).rows[0].id;
    await actor();
    await assert.rejects(save([first]), /already allocated to Loans or Planning/);
    await owner();
    await db.query("update public.loan_asset_allocations set allocation_status='released' where id=$1", [allocation]);
    await actor();
    await save([second]);
  });

  await test('shared Brik conflicting serial identities remain rejected', async () => {
    const a = await source({ serialNumber: 'QA-SERIAL-A' });
    const b = await source({ serialNumber: 'QA-SERIAL-B' });
    await owner();
    await db.query('update public.fabric_loan_assets_current set company=$2 where asset_id=$1', [b.sourceAssetId, `QA-${a.sourceAssetId}`]);
    await db.query('update public.loan_asset_portal_metadata set company=$2 where asset_id=$1', [b.sourceAssetId, `QA-${a.sourceAssetId}`]);
    await actor();
    await assert.rejects(save([a]), /conflicting serial identities/);
  });

  await test('ordinary configurations and source projections are untouched; standard transition releases only active sales', async () => {
    const asset = await source();
    await owner();
    const before = await scalar('select to_jsonb(f) as value from public.fabric_loan_assets_current f where asset_id=$1', [asset.sourceAssetId]);
    await actor();
    const id = await save([asset]);
    await change(id, [], { salesChannel: 'standard' });
    assert.equal((await persisted(id))[0].reservation_status, 'RELEASED');
    const ordinary = await save([], { state: { salesChannel: 'standard', arbitraryLegacySetting: 'preserved' } });
    assert.equal((await persisted(ordinary)).length, 0);
    assert.equal(await scalar('select sales_source_type as value from public.configurations where id=$1', [ordinary]), 'STANDARD');
    assert.equal((await scalar('select state_json as value from public.configurations where id=$1', [ordinary])).arbitraryLegacySetting, 'preserved');
    await assert.rejects(save([asset], { state: { salesChannel: 'standard' } }), /require sales-stock mode/);
    await owner();
    assert.deepEqual(await scalar('select to_jsonb(f) as value from public.fabric_loan_assets_current f where asset_id=$1', [asset.sourceAssetId]), before);
    await actor();
  });

  await test('seller uses existing ownership/assignment scope; external/service/inactive/unapproved users cannot price stock', async () => {
    const outsideAsset = await source();
    const outside = await save([outsideAsset]);
    const ownAsset = await source();
    await actor(seller);
    const own = await save([ownAsset], { creator: seller });
    await change(own, [{ ...ownAsset, adjustedBasePrice: 400 }]);
    assert.equal((await change(outside, [outsideAsset])).affectedRows, 0);
    const forbiddenInsert = await source();
    await actor(seller);
    await assert.rejects(save([forbiddenInsert], { creator: backend }), /row-level security/);
    const assignedAsset = await source();
    await actor(seller);
    await save([assignedAsset], { creator: backend, assigned: seller });
    for (const role of ['timan_dealer','timan_service','dealer_customer']) {
      const asset = await source();
      await owner();
      await db.query('update public.app_users set portal_role=$2,dealer_number=$3 where id=$1', [backend, role, '1010']);
      await actor();
      await assert.rejects(save([asset]), /access denied/);
      assert.equal(await scalar('select count(*)::int as value from public.sales_stock_configuration_assets'), 0);
      await owner();
      await db.query("update public.app_users set portal_role='timan_backend' where id=$1", [backend]);
    }
    for (const column of ['approved','is_active']) {
      const asset = await source();
      await owner();
      await db.query(`update public.app_users set ${column}=false where id=$1`, [backend]);
      await actor();
      await assert.rejects(save([asset]), /access denied|row-level security/);
      assert.equal(await scalar('select count(*)::int as value from public.sales_stock_pricing_audit'), 0);
      await owner();
      await db.query(`update public.app_users set ${column}=true where id=$1`, [backend]);
    }
    await actor();
  });

  await test('client direct writes/helper execution denied and audit remains append-only even for owner', async () => {
    await assert.rejects(db.exec('update public.sales_stock_configuration_assets set quantity=2'), /permission denied/);
    await assert.rejects(db.exec('delete from public.sales_stock_pricing_audit'), /permission denied/);
    await assert.rejects(scalar('select public.sales_stock_actor_can_manage() as value'), /permission denied/);
    await owner();
    await assert.rejects(db.exec("update public.sales_stock_pricing_audit set pricing_reason='tampered'"), /append-only/);
    await db.exec('set role anon');
    await assert.rejects(scalar('select count(*) as value from public.sales_stock_configuration_assets'), /permission denied/);
    await owner();
    await db.exec(readFileSync('supabase/tests/sales_stock_optional_catalogue_security.sql', 'utf8'));
  });

  console.log(`PASS ${passed} sales-stock optional-catalogue groups; actual SQL guards, shared-Brik triggers and scoped RLS; no remote connection`);
} finally {
  await db.close();
}
