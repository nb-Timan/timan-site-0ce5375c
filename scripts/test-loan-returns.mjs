// Uses the existing local PGlite test runtime; never connects to production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve('node_modules/.cache/loans-sql/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const foundation = readFileSync('supabase/migrations/20261006130704_loans_phase1_foundation.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20261009055619_operational_loan_returns.sql', 'utf8');
const actor = '11111111-1111-4111-8111-111111111111';
const other = '11111111-1111-4111-8111-111111111112';
const caseId = '22222222-2222-4222-8222-222222222222';
const partner = '33333333-3333-4333-8333-333333333333';
const contact = '33333333-3333-4333-8333-333333333334';
const ids = [1,2,3,4].map((n) => `44444444-4444-4444-8444-44444444444${n}`);
const key = (n) => `55555555-5555-4555-8555-5555555555${String(n).padStart(2,'0')}`;
const scalar = async (sql, params=[]) => (await db.query(sql,params)).rows[0]?.value;
const receive = (items, request=key(1)) => scalar('select public.loan_receive_assets($1,$2,$3::jsonb,null) as value',[caseId,request,JSON.stringify(items)]);
const entry = (n, patch={}) => ({ case_item_id:ids[n-1],serial_confirmed:true,brik_number:String(n===1?194:96),return_reading:n===1?'27':null,requires_review:false,...patch });
const role = async (portalRole, owned=true) => {
  await db.exec('reset role');
  await db.query('update public.app_users set portal_role=$1 where id=$2',[portalRole,actor]);
  await db.query('update public.loan_cases set responsible_user_id=$1,created_by=$1 where id=$2',[owned?actor:other,caseId]);
  await db.exec('set role authenticated');
};
const photo = async (n, suffix='meter') => {
  const path=`${caseId}/${ids[n-1]}/return-${suffix}-${key(n)}.png`;
  await db.query("insert into storage.objects(bucket_id,name) values('loan-case-media',$1)",[path]);
  return scalar("select public.loan_register_return_photo($1,$2,$3,'return_meter','meter.png','image/png') as value",[caseId,ids[n-1],path]);
};
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select '${actor}'::uuid $$;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    grant select,insert,delete on storage.objects to authenticated;
    create table public.app_users(id uuid primary key,auth_user_id uuid,portal_role text,approved boolean,is_active boolean,
      allowed_areas text[],dealer_number text,display_name text,full_name text,email text);
    insert into public.app_users values('${actor}','${actor}','timan_backend',true,true,array['loans'],'1010','QA receiver',null,'qa@invalid.test'),
      ('${other}','${other}','timan_seller',true,true,array['loans'],null,'Other',null,'other@invalid.test');
    create table public.dealer_accounts(id uuid primary key,account_number text,dealer_number text);
    insert into public.dealer_accounts values('${partner}','1010','1010');
    create table public.dealer_contacts(id uuid primary key);
    insert into public.dealer_contacts values('${contact}');
    create table public.planning_supply_units(id uuid primary key);
    create table public.fabric_loan_assets_current(asset_id uuid primary key,company text);
  `);
  await db.exec(foundation.slice(0,foundation.indexOf('create or replace function public.loan_actor_id')));
  for (const name of ['loan_actor_id','can_access_loans','can_administer_loans','loan_can_view_case','loan_can_manage_case']) {
    const start=foundation.indexOf(`create or replace function public.${name}(`);
    const end=foundation.indexOf('create or replace function public.',start+1);
    await db.exec(foundation.slice(start,end));
  }
  await db.exec(foundation.slice(foundation.indexOf('do $$ declare t text; begin')));
  await db.exec(`
    alter table public.loan_case_items add column brik_number_snapshot integer,add column fabric_asset_id uuid;
    create sequence public.loan_test_number_seq start 6601;
    alter table public.loan_cases add column loan_number text unique default ('U-'||nextval('public.loan_test_number_seq'));
    insert into public.loan_cases(id,case_number,responsible_user_id,dealer_account_id,dealer_contact_id,created_by,status)
      values('${caseId}','QA-RETURN','${actor}','${partner}','${contact}','${actor}','ON_LOAN');
  `);
  for (let n=1;n<=4;n++) {
    const id=ids[n-1];
    await db.query("insert into public.planning_supply_units(id) values($1)",[id]);
    await db.query("insert into public.fabric_loan_assets_current values($1,'DAT')",[id]);
    await db.query(`insert into public.loan_case_items(id,case_id,item_type,product_sku,planning_supply_unit_id,
      serial_snapshot,product_name_snapshot,brik_number_snapshot,usage_reading_value,usage_reading_unit,created_by,fabric_asset_id)
      values($1,$2,$3,$4,$1,$5,$6,$7,$8,$9,$10,$1)`,
    [id,caseId,n===1?'machine':'equipment',`QA-${n}`,n===1?'QA-SERIAL':null,`QA asset ${n}`,n===1?194:n===4?97:96,n===1?12:null,n===1?'hours':null,actor]);
    await db.query('insert into public.loan_asset_allocations(case_item_id,supply_unit_id,allocated_by) values($1,$1,$2)',[id,actor]);
  }
  await db.exec(migration);
  await db.exec(readFileSync('supabase/migrations/20261009083118_loan_case_lifecycle.sql','utf8'));
  await role('timan_dealer');
  assert.equal(await scalar('select count(*)::int as value from public.loan_list_return_summary($1)',[caseId]),4,'scoped partner summary is read-only');
  await assert.rejects(receive([entry(1)]),/denied/);
  await role('timan_seller',false);
  assert.equal(await scalar('select count(*)::int as value from public.loan_list_return_summary($1)',[caseId]),0,'unassigned seller cannot read');
  await assert.rejects(receive([entry(1)]),/denied/);
  await role('timan_service');
  assert.equal(await scalar('select can_receive as value from public.loan_list_case_return_states()'),true);
  await role('timan_backend');
  await assert.rejects(db.exec('delete from public.loan_return_inspections'),/permission denied/);
  await assert.rejects(db.exec("update public.loan_case_events set event_type='FORGED'"),/permission denied/);
  await assert.rejects(receive(null),/Select at least/);
  await assert.rejects(receive([entry(1),entry(1)]),/once per request/);
  await assert.rejects(receive([entry(1,{serial_confirmed:false})]),/Serial confirmation/);
  await assert.rejects(receive([entry(1,{brik_number:null})]),/Observed Brik/);
  await assert.rejects(receive([entry(1,{brik_number:'195'})]),/does not match/);
  await assert.rejects(receive([entry(1,{return_reading:'NaN'})]),/finite/);
  await assert.rejects(receive([entry(1,{return_reading:'Infinity'})]),/finite/);
  await assert.rejects(receive([entry(1)]),/meter photo/);
  await assert.rejects(scalar("select public.loan_register_return_photo($1,$2,$3,'return_meter','fake.png','image/png') as value",[caseId,ids[0],`${caseId}/${ids[0]}/return-fake.png`]),/upload not found/);
  const meterPhoto=await photo(1);
  await assert.rejects(receive([entry(1,{return_reading:'10'})]),/lower than checkout/);
  await assert.rejects(receive([entry(2)]),/shared Brik group/);
  const receipt=await receive([entry(1)]);
  assert.equal(await receive([entry(1)]),receipt,'retry is idempotent even after status change');
  await assert.rejects(receive([entry(1,{return_reading:'28'})]),/different input/);
  assert.equal(await scalar("select allocation_status as value from public.loan_asset_allocations where case_item_id=$1",[ids[0]]),'released');
  assert.equal(await scalar("select presentation_state as value from public.loan_list_case_return_states()"),'PARTIALLY_RETURNED');
  assert.equal(await scalar('select calculated_usage as value from public.loan_list_return_summary($1) where case_item_id=$2',[caseId,ids[0]]),'15');
  await assert.rejects(scalar('select public.loan_remove_return_photo($1,$2) as value',[caseId,meterPhoto]),/cannot be removed/);
  assert.equal((await db.query("delete from storage.objects where name like '%return-meter-%' returning id")).rows.length,0,'sealed Storage object cannot be deleted');
  await db.exec('reset role');
  await assert.rejects(db.exec("delete from public.loan_case_events"),/append-only/);
  await assert.rejects(db.query('update public.loan_return_item_inspections set notes=$1',['FORGED']),/append-only/);
  await assert.rejects(db.exec("update public.loan_return_inspections set notes='FORGED'"),/append-only/);
  await db.exec('set role authenticated');
  await receive([entry(2,{requires_review:true,discrepancy_note:'Wrong physical tag',brik_number:'95'}),entry(3,{requires_review:true,discrepancy_note:'Wrong physical tag',brik_number:'95'})],key(2));
  assert.equal(await scalar("select presentation_state as value from public.loan_list_case_return_states()"),'REVIEW_REQUIRED');
  assert.equal(await scalar("select count(*)::int as value from public.loan_asset_allocations where allocation_status='active'"),3,'discrepancy keeps reservations');
  await receive([entry(2),entry(3)],key(3));
  assert.equal(await scalar("select count(*)::int as value from public.loan_deviations where resolution_state='OPEN'"),0);
  await receive([entry(4,{brik_number:'97'})],key(4));
  assert.equal(await scalar('select status as value from public.loan_cases'),'CLOSED_WITH_DEVIATION');
  assert.equal(await scalar("select count(*)::int as value from public.loan_asset_allocations where allocation_status='active'"),0);
  assert.equal(await scalar('select received_asset_count::int as value from public.loan_list_case_return_states()'),4);
  await assert.rejects(photo(1,'after-close'),/row-level security/);

  await db.exec('reset role');
  const kmCase='66666666-6666-4666-8666-666666666666';
  const kmItem='77777777-7777-4777-8777-777777777777';
  await db.query("insert into public.loan_cases(id,case_number,responsible_user_id,dealer_account_id,dealer_contact_id,created_by,status) values($1,'QA-KM',$2,$3,$4,$2,'ACCEPTED')",[kmCase,actor,partner,contact]);
  await db.query('insert into public.planning_supply_units(id) values($1)',[kmItem]);
  await db.query("insert into public.loan_case_items(id,case_id,item_type,product_sku,planning_supply_unit_id,serial_snapshot,usage_reading_value,usage_reading_unit,created_by) values($1,$2,'machine','QA-KM',$1,'QA-KM-SERIAL',120,'km',$3)",[kmItem,kmCase,actor]);
  await db.query('insert into public.loan_asset_allocations(case_item_id,supply_unit_id,allocated_by) values($1,$1,$2)',[kmItem,actor]);
  await db.exec('set role authenticated');
  const kmPath=`${kmCase}/${kmItem}/return-meter-km.png`;
  await db.query("insert into storage.objects(bucket_id,name) values('loan-case-media',$1)",[kmPath]);
  await scalar("select public.loan_register_return_photo($1,$2,$3,'return_meter','km.png','image/png') as value",[kmCase,kmItem,kmPath]);
  await scalar('select public.loan_receive_assets($1,$2,$3::jsonb,null) as value',[kmCase,key(8),JSON.stringify([{case_item_id:kmItem,serial_confirmed:true,return_reading:'100',lower_reading_explanation:'Meter replaced'}])]);
  assert.equal(await scalar('select status as value from public.loan_cases where id=$1',[kmCase]),'CLOSED_OK');
  assert.equal(await scalar('select calculated_usage as value from public.loan_list_return_summary($1)',[kmCase]),'-20');
  assert.equal(await scalar('select lower_reading_explanation as value from public.loan_list_return_summary($1)',[kmCase]),'Meter replaced');
  await db.exec('reset role');
  for (const statement of [
    'delete from public.loan_cases where id=$1',
    "update public.loan_cases set notes='FORGED' where id=$1",
    'delete from public.loan_case_items where case_id=$1',
    "update public.loan_case_items set product_name_snapshot='FORGED' where case_id=$1",
  ]) await assert.rejects(db.query(statement,[caseId]),/history/);
  assert.equal(await scalar('select count(*)::int as value from public.loan_case_items where case_id=$1',[caseId]),4);
  const draft='88888888-8888-4888-8888-888888888888';
  const draftItem='99999999-9999-4999-8999-999999999999';
  await db.query("insert into public.loan_cases(id,case_number,responsible_user_id,dealer_account_id,dealer_contact_id,created_by) values($1,'QA-CANCEL',$2,$3,$4,$2)",[draft,actor,partner,contact]);
  // Reuse a returned physical asset without deleting its original case/item link.
  await db.query("insert into public.loan_case_items(id,case_id,item_type,product_sku,planning_supply_unit_id,created_by) values($1,$2,'machine','QA-1',$3,$4)",[draftItem,draft,ids[0],actor]);
  await db.query('insert into public.loan_asset_allocations(case_item_id,supply_unit_id,allocated_by) values($1,$2,$3)',[draftItem,ids[0],actor]);
  assert.equal(await scalar('select count(*)::int as value from public.loan_case_items where planning_supply_unit_id=$1',[ids[0]]),2);
  const updated=await scalar('select updated_at::text as value from public.loan_cases where id=$1',[draft]);
  const originalNumber=await scalar('select loan_number as value from public.loan_cases where id=$1',[draft]);
  const cancel=(reason='Wrong QA draft',timestamp=updated,request=key(20))=>scalar('select public.loan_cancel_unissued_case($1,$2,$3,$4) as value',[draft,timestamp,reason,request]);
  for (const portalRole of ['timan_seller','timan_service','timan_dealer']) {
    await db.query('update public.app_users set portal_role=$1 where id=$2',[portalRole,actor]);
    await db.exec('set role authenticated');
    await assert.rejects(cancel(),/Backend loan administration required/);
    await db.exec('reset role');
  }
  await db.query("update public.app_users set portal_role='timan_backend' where id=$1",[actor]);
  await db.exec('set role authenticated');
  await assert.rejects(cancel(''),/reason/);
  await assert.rejects(cancel('QA','2000-01-01T00:00:00Z'),/changed/);
  assert.equal(await scalar('select can_cancel_draft as value from public.loan_list_case_lifecycle_states() where case_id=$1',[draft]),true);
  await cancel();
  await cancel();
  await assert.rejects(cancel('Changed reason'),/different input/);
  assert.equal(await scalar('select status as value from public.loan_cases where id=$1',[draft]),'CANCELLED');
  assert.equal(await scalar("select count(*)::int as value from public.loan_asset_allocations where case_item_id=$1 and allocation_status='active'",[draftItem]),0);
  assert.equal(await scalar("select count(*)::int as value from public.loan_case_events where case_id=$1 and event_type='CASE_CANCELLED'",[draft]),1);
  assert.equal(await scalar("select metadata->>'loan_number' as value from public.loan_case_events where case_id=$1 and event_type='CASE_CANCELLED'",[draft]),originalNumber);
  assert.ok(await scalar('select last_received_at as value from public.loan_list_case_lifecycle_states() where case_id=$1',[caseId]));
  assert.equal(await scalar('select can_cancel_draft as value from public.loan_list_case_lifecycle_states() where case_id=$1',[caseId]),false);
  await db.exec('reset role');
  await assert.rejects(db.query('delete from public.loan_case_items where case_id=$1',[draft]),/history/);
  await assert.rejects(db.query("insert into public.loan_case_items(case_id,item_type,product_sku,created_by) values($1,'equipment','FORGED',$2)",[draft,actor]),/history/);
  const reopened='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await db.query("insert into public.loan_cases(id,case_number,responsible_user_id,dealer_account_id,dealer_contact_id,created_by) values($1,'QA-REOPENED',$2,$3,$4,$2)",[reopened,actor,partner,contact]);
  await db.query("insert into public.loan_case_events(case_id,event_type,actor_user_id,from_status,to_status) values($1,'REOPENED_FOR_EDIT',$2,'ACCEPTED','DRAFT')",[reopened,actor]);
  const nextNumber=await scalar('select loan_number as value from public.loan_cases where id=$1',[reopened]);
  assert.notEqual(nextNumber,originalNumber,'cancelled U-number remains allocated');
  await db.exec('set role authenticated');
  assert.equal(await scalar('select can_cancel_draft as value from public.loan_list_case_lifecycle_states() where case_id=$1',[reopened]),false,'reopened accepted history cannot be cancelled');
  await assert.rejects(scalar('select public.loan_cancel_unissued_case($1,(select updated_at from public.loan_cases where id=$1),$2,$3) as value',[reopened,'QA',key(21)]),/never-issued/);
  const cancelledMedia=`${draft}/${draftItem}/checkout.png`;
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('loan-case-media',$1)",[cancelledMedia]),/row-level security/);
  await db.exec('reset role; set role anon');
  await assert.rejects(receive([entry(1)]),/permission denied/);
  await assert.rejects(db.exec('select * from public.loan_case_item_photos'),/permission denied/);
  await db.exec('reset role');
  assert.equal(await scalar("select public as value from storage.buckets where id='loan-case-media'"),false);
  console.log('PASS: actual return/lifecycle migrations, canonical RLS, partial/full receipt, shared Brik, private media, Backend-only version-checked idempotent cancellation, audit, immutable completed/cancelled history, reservation release and asset reuse, U-number retention, accepted/reopened protection. Isolated PostgreSQL only.');
} finally { await db.close(); }
