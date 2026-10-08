// Isolated PostgreSQL test: npm install --prefix node_modules/.cache/loans-sql --no-package-lock --ignore-scripts @electric-sql/pglite@0.5.8
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(resolve('node_modules/.cache/loans-sql/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
const actor = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema vault; create schema cron; create schema net;
    create function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;
    create table public.app_users(id uuid primary key, auth_user_id uuid, portal_role text);
    insert into public.app_users values('${actor}','${actor}','timan_backend');
    create function public.can_access_loans() returns boolean language sql stable as $$ select current_setting('qa.allowed',true)='true' $$;
    create function public.can_administer_loans() returns boolean language sql stable security definer as $$ select public.can_access_loans() and exists(select 1 from public.app_users where portal_role='timan_backend') $$;
    create function public.loan_actor_id() returns uuid language sql stable as $$ select auth.uid() $$;
    create function public.loan_can_manage_case(uuid) returns boolean language sql stable security definer as $$ select public.can_access_loans() and exists(select 1 from public.app_users where portal_role in ('timan_backend','timan_seller','timan_service')) $$;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    create table cron.jobs(name text, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language plpgsql as $$ begin insert into cron.jobs values($1,$2,$3); return 1; end $$;
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$ select 1::bigint $$;
    create table public.planning_supply_units(id uuid primary key, serial_number text);
    create table public.planning_machine_products(item_number text);
    create table public.planning_accessory_products(item_number text);
    create table public.price_list_published(item_number text);
    create table public.planning_reservations(supply_unit_id uuid, status text);
    create table public.loan_cases(id uuid primary key, status text, expected_return_date date, serial_numbers_confirmed_by uuid,serial_numbers_confirmed_at timestamptz,updated_at timestamptz);
    create table public.loan_case_version_items(
      id uuid primary key default gen_random_uuid(),
      fabric_asset_id uuid
    );
    create table public.loan_case_items(id uuid primary key default gen_random_uuid(),case_id uuid references public.loan_cases(id),item_type text,product_sku text,
      planning_supply_unit_id uuid,serial_snapshot text,product_name_snapshot text,warehouse_snapshot text,
      warehouse_location_code_snapshot text,fabric_account_number_snapshot text,fabric_order_number_snapshot text,
      expected_return_date date,created_by uuid,
      constraint loan_case_items_check check (item_type='equipment' or planning_supply_unit_id is not null));
    create table public.loan_asset_allocations(id uuid primary key default gen_random_uuid(),case_item_id uuid references public.loan_case_items(id) on delete cascade,
      supply_unit_id uuid not null,allocation_status text not null default 'active',allocated_by uuid,released_by uuid,released_at timestamptz,release_reason text);
    create table public.loan_case_events(case_id uuid,event_type text,actor_user_id uuid,metadata jsonb);
    grant usage on schema public,auth to authenticated,anon,service_role;
    select set_config('qa.allowed','true',false);
    insert into public.loan_cases(id,status) values('${caseId}','DRAFT');
    insert into public.planning_machine_products values('QA-ITEM'),('410040');
    insert into public.price_list_published values('725142'),('730601'),('730600');
  `);
  await db.exec(readFileSync('supabase/migrations/20261007160113_fabric_loan_stock_projection.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261008070522_resolve_fabric_loan_item_type.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261008075941_fabric_loan_line_text_and_brik_metadata.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261008094909_support_nonserialized_fabric_loan_assets.sql', 'utf8'));
  assert.equal(await scalar("select public.loan_resolve_fabric_item_type('410040-01') as value"),'machine');
  assert.equal(await scalar("select public.loan_resolve_fabric_item_type('725142-00') as value"),'equipment');
  assert.equal(await scalar("select public.loan_resolve_fabric_item_type('UNKNOWN-00') as value"),null);
  assert.equal(await scalar("select count(*)::int as value from cron.jobs"), 0, 'Fabric schedules pushes; no Edge source polling');
  assert.equal(await scalar('select enabled as value from public.fabric_loan_sync_state'), false);
  await db.exec('update public.fabric_loan_sync_state set enabled=true');
  const row = (serial, patch = {}) => ({ asset_instance_id: serial
      ? `SERIAL|${patch.company ?? 'QA'}|${serial.trim().toUpperCase()}`
      : `LINE|${patch.company ?? 'QA'}|${patch.source_row_number ?? 1}|${patch.instance_ordinal ?? 1}`,
    instance_ordinal: 1, company: 'QA', account_number: '1010', order_number: null, line_number: null,
    item_number: 'QA-ITEM', item_name: 'QA machine', line_text: 'Nr.82 QA fejekost', serial_number: serial, warehouse_location_code: '2', warehouse_location_name: 'Lager 2',
    inventory_qty: '1', reserved_qty: '0', stock_last_changed: '2026-10-07T10:00:00', source_row_number: 1,
    classification: 'LOAN_CANDIDATE', review_required: false, review_reason: null, identity_conflict: false, ...patch });
  const begin = () => scalar("select public.fabric_loan_sync_begin('MANUAL') as value");
  const publish = (run, rows) => scalar('select public.fabric_loan_sync_publish($1,now(),$2::jsonb) as value', [run, JSON.stringify(rows)]);
  const first = await begin();
  await assert.rejects(publish(null,[]),/STALE_SYNC_LEASE/);
  assert.equal(await begin(), null, 'duplicate worker refused');
  assert.equal(await publish(first, [row('QA-1'),row('QA-2',{account_number:'1020',warehouse_location_code:'4'}),row('QA-REVIEW',{classification:'REVIEW_REQUIRED',review_required:true})]), 3);
  const id = await scalar("select asset_id as value from public.fabric_loan_assets_current where serial_number='QA-1'");
  await db.exec('set role authenticated');
  assert.equal((await scalar('select public.loan_set_asset_brik_number($1,82) as value',[id])).brik_number,82);
  await assert.rejects(scalar('select count(*)::int as value from public.loan_asset_portal_metadata'),/permission denied/);
  await db.exec('reset role');
  await publish(await begin(), [row('qa-1'),row('QA-2',{account_number:'1020',warehouse_location_code:'4'}),row('QA-REVIEW',{classification:'REVIEW_REQUIRED',review_required:true})]);
  assert.equal(await scalar("select asset_id as value from public.fabric_loan_assets_current where serial_number_normalized='QA-1'"), id, 'idempotent normalized identity');
  assert.equal(await scalar('select count(*)::int as value from public.fabric_loan_assets_current'),3);
  const failed = await begin();
  await assert.rejects(publish(failed,[row('DUP'),row(' dup ',{asset_instance_id:'SERIAL|QA|OTHER'})]), /INVALID_SNAPSHOT/);
  await db.query("select public.fabric_loan_sync_fail($1,'INVALID_SNAPSHOT')",[failed]);
  assert.equal(await scalar('select count(*)::int as value from public.fabric_loan_assets_current where source_present'),3,'failed publication preserves snapshot');
  await publish(await begin(), [row('QA-1'),row('QA-REVIEW',{classification:'REVIEW_REQUIRED',review_required:true})]);
  assert.equal(await scalar("select source_present as value from public.fabric_loan_assets_current where serial_number='QA-2'"),false);
  const expired = await begin();
  await db.exec("update public.fabric_loan_sync_state set lease_until=now()-interval '1 second'");
  const replacement = await begin();
  await assert.rejects(publish(expired,[]),/STALE_SYNC_LEASE/);
  await publish(replacement,[row('QA-1'),row('QA-REVIEW',{classification:'REVIEW_REQUIRED',review_required:true})]);

  const snapshotId = '33333333-3333-4333-8333-333333333333';
  await db.exec("update public.fabric_loan_sync_state set source_as_of=now()-interval '1 minute'");
  const sourceTime = new Date().toISOString();
  const orderSerial = row('730600-00-2044',{company:'DAT',account_number:'1020',order_number:'138063',line_number:2,
    item_number:'730600-00',item_name:'Ukrudtsbørste WB-170 (3330) for T2',line_text:'Nr.194 Ukrudtsbørste med mulighed for opsamling',
    warehouse_location_code:'4',source_row_number:445129382});
  const orderNonSerial = row(null,{asset_instance_id:'LINE|DAT|445129381|730601-00|4|138063|1|1',company:'DAT',
    account_number:'1020',order_number:'138063',line_number:1,item_number:'730601-00',item_name:'Sug for ukrudtsbørste',
    line_text:'Nr.131 Sug for ukrudtsbørste',serial_number:null,warehouse_location_code:'4',source_row_number:445129381});
  const pushRows = [row('QA-1'),row('QA-REVIEW',{classification:'REVIEW_REQUIRED',review_required:true}),orderSerial,orderNonSerial];
  const ingest = (id, rows = pushRows, time = sourceTime) => scalar(
    'select public.fabric_loan_ingest_snapshot($1,$2,$3::jsonb) as value', [id,time,JSON.stringify(rows)]);
  await db.exec('set role authenticated');
  assert.equal((await scalar('select public.loan_request_fabric_refresh() as value')).status,'QUEUED');
  await db.exec('reset role');
  const requestAt = await scalar('select refresh_requested_at as value from public.fabric_loan_sync_state');
  await db.exec('set role authenticated');
  await scalar('select public.loan_request_fabric_refresh() as value');
  await assert.rejects(ingest(snapshotId), /permission denied/);
  await db.exec('reset role');
  assert.equal(String(await scalar('select refresh_requested_at as value from public.fabric_loan_sync_state')), String(requestAt), 'duplicate refresh is coalesced');
  const laterTime = new Date(Date.now()+1000).toISOString();
  assert.equal((await ingest(snapshotId,pushRows,laterTime)).duplicate,false);
  assert.equal(await scalar('select refresh_requested_at as value from public.fabric_loan_sync_state'),null);
  assert.equal((await ingest(snapshotId,pushRows,laterTime)).duplicate,true,'same snapshot retry is idempotent');
  await assert.rejects(ingest(snapshotId,[row('MUTATED')],laterTime), /SNAPSHOT_ID_REUSED/);
  await assert.rejects(ingest('44444444-4444-4444-8444-444444444444',pushRows,sourceTime), /STALE_SNAPSHOT/);
  const successAt = await scalar('select last_success_at as value from public.fabric_loan_sync_state');
  await assert.rejects(ingest('55555555-5555-4555-8555-555555555555',[row('VALID'),row('BAD',{classification:'UNKNOWN'})],new Date(Date.now()+2000).toISOString()), /check constraint/);
  assert.equal(String(await scalar('select last_success_at as value from public.fabric_loan_sync_state')),String(successAt),'invalid full push rolls back publication');
  assert.equal(await scalar('select running_run_id as value from public.fabric_loan_sync_state'),null,'failed transaction leaves no stranded lease');
  assert.equal(await scalar("select count(*)::int as value from public.fabric_loan_assets_current where serial_number='VALID'"),0,'no partial rows published');

  await db.exec('set role authenticated');
  assert.equal(await scalar('select count(*)::int as value from public.fabric_loan_assets_current where source_present'),4);
  await assert.rejects(db.exec("update public.fabric_loan_assets_current set item_name='forged'"),/permission denied/);
  await assert.rejects(begin(),/permission denied/);
  await assert.rejects(publish(replacement,[]),/permission denied/);
  assert.equal((await scalar('select public.loan_stock_snapshot() as value')).assets.length,4);
  const qaAsset = (await scalar('select public.loan_stock_snapshot() as value')).assets.find((a)=>a.asset_id===id);
  assert.equal(qaAsset.line_text,'Nr.82 QA fejekost');
  assert.equal(qaAsset.brik_number,82,'Portal-owned brik metadata survives Fabric snapshot replacement');
  const nonSerialId = await scalar("select asset_id as value from public.fabric_loan_assets_current where asset_instance_id='LINE|DAT|445129381|730601-00|4|138063|1|1'");
  await assert.rejects(scalar('select public.loan_add_fabric_asset_item($1,$2) as value',[caseId,nonSerialId]),/requires a Brik number/);
  await assert.rejects(scalar('select public.loan_set_asset_brik_number($1,82) as value',[nonSerialId]),/already assigned/);
  assert.equal((await scalar('select public.loan_set_asset_brik_number($1,131) as value',[nonSerialId])).brik_number,131);
  await db.exec('reset role');
  await publish(await begin(),pushRows);
  await db.exec('set role authenticated');
  assert.equal((await scalar('select public.loan_stock_snapshot() as value')).assets.find((a)=>a.asset_id===nonSerialId).brik_number,131,
    'Portal-owned Brik survives a Fabric refresh');
  const item = await scalar('select public.loan_add_fabric_asset_item($1,$2) as value',[caseId,id]);
  const nonSerialItem = await scalar('select public.loan_add_fabric_asset_item($1,$2) as value',[caseId,nonSerialId]);
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::int as value from public.loan_case_items where case_id=$1',[caseId]),2,
    'serialized and non-serialized assets share one U-number');
  await db.exec('set role authenticated');
  await assert.rejects(scalar('select public.loan_add_fabric_asset_item($1,$2) as value',[caseId,nonSerialId]),/already allocated/);
  await assert.rejects(scalar('select public.loan_add_fabric_asset_item($1,$2) as value',[caseId,id]),/already allocated/);
  assert.equal((await scalar('select public.loan_stock_snapshot() as value')).assets.find((a)=>a.asset_id===id).allocated,true);
  const reviewId = (await scalar('select public.loan_stock_snapshot() as value')).assets.find((a)=>a.classification==='REVIEW_REQUIRED').asset_id;
  await assert.rejects(scalar('select public.loan_add_fabric_asset_item($1,$2) as value',[caseId,reviewId]),/not loan eligible/);
  await db.query('select public.loan_remove_draft_item($1,$2)',[caseId,item]);
  await db.query('select public.loan_remove_draft_item($1,$2)',[caseId,nonSerialItem]);
  await db.exec("reset role; update public.fabric_loan_sync_state set source_as_of=now()-interval '1 hour'; set role authenticated");
  await assert.rejects(scalar('select public.loan_add_fabric_asset_item($1,$2) as value',[caseId,id]),/FABRIC_STALE/);
  await db.exec("reset role; update public.app_users set portal_role='timan_seller'; set role authenticated");
  await assert.rejects(scalar('select public.loan_request_fabric_refresh() as value'),/access denied/);
  await assert.rejects(scalar('select public.loan_set_asset_brik_number($1,83) as value',[id]),/access denied/);
  assert.equal((await scalar('select public.loan_stock_snapshot() as value')).assets.length,3,'seller sees candidates with canonical physical identity, but no review assets');
  await db.exec("reset role; update public.app_users set portal_role='timan_dealer'; set role authenticated");
  assert.equal(await scalar('select count(*)::int as value from public.fabric_loan_assets_current'),0,'partner cannot browse stock');
  await assert.rejects(scalar('select public.loan_stock_snapshot() as value'),/access denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(scalar('select public.loan_stock_snapshot() as value'),/permission denied/);
  await assert.rejects(scalar('select count(*) as value from public.fabric_loan_assets_current'),/permission denied/);
  console.log('PASS: migration, serialized and non-serialized identities, unique persistent Brik metadata, same-case multi-asset allocation, blank-serial collision protection, push/refresh queue, lease fencing, failure retention, stale block, Backend/Seller/Partner/anonymous RLS, read-only grants. Local in-memory PostgreSQL only.');
} catch (error) { console.error(error.message); process.exitCode=1; }
finally { await db.close(); }
