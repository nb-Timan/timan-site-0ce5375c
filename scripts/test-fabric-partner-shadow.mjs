import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(resolve('node_modules/.cache/loans-sql/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
const reject = async (promise, pattern) => { await assert.rejects(promise, pattern); checks++; };
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create function public.is_backend() returns boolean language sql stable as $$ select current_setting('qa.backend',true)='true' $$;
    create table public.dealer_accounts(id uuid primary key,account_number text,company_name text,address_line_1 text,address_line_2 text,address text,
      postal_code text,city text,country text,phone text,email text,billing_account_id uuid,customer_type_label text,customer_type text,dealer_type text,assigned_seller_initials text);
    create table public.partner_account_relations(id uuid primary key default gen_random_uuid(),source_account_id uuid,target_account_id uuid,relation_type text);
    create table public.app_users(id uuid primary key,full_name text,auth_user_id uuid,permissions jsonb,updated_at timestamptz);
    insert into public.app_users values('50877e58-054d-4fc9-ad02-6ca0a6037d12','Nicolai Moesgaard','2f52b0e6-3050-4df0-9d58-73402ecc6426','{"support":false}','2026-10-09T13:00:00Z');
    create function public.reject_shadow_user_write() returns trigger language plpgsql as $$
      begin raise exception 'SHADOW_MUST_NOT_WRITE_APP_USERS'; end $$;
    create trigger reject_shadow_user_write before insert or update or delete or truncate on public.app_users
      for each statement execute function public.reject_shadow_user_write();
    insert into public.dealer_accounts(id,account_number,company_name,assigned_seller_initials) values('bc6ae72c-b653-4995-a446-dfdd540b01d1','10295','AB Lauridsen','EM');
    insert into public.partner_account_relations(source_account_id,target_account_id,relation_type) values('bc6ae72c-b653-4995-a446-dfdd540b01d1','bf9e9d75-4af3-45d3-8de7-61bb91d95541','dealer_has_service_partner');
    create trigger reject_shadow_dealer_write before insert or update or delete or truncate on public.dealer_accounts
      for each statement execute function public.reject_shadow_user_write();
    create trigger reject_shadow_relation_write before insert or update or delete or truncate on public.partner_account_relations
      for each statement execute function public.reject_shadow_user_write();
    grant usage on schema public to anon,authenticated,service_role;
    select set_config('qa.backend','false',false);
  `);
  const dealerHash = await scalar('select md5(jsonb_agg(to_jsonb(d))::text) as value from dealer_accounts d');
  const relationHash = await scalar('select md5(jsonb_agg(to_jsonb(d))::text) as value from partner_account_relations d');
  const userHash = await scalar('select md5(jsonb_agg(to_jsonb(d) order by id)::text) as value from app_users d');
  await db.exec(readFileSync('supabase/migrations/20261009100017_fabric_partner_master_shadow.sql', 'utf8'));
  const isolation = await db.exec(readFileSync('scripts/verify-fabric-partner-shadow-isolation.sql', 'utf8'));
  const controlled = isolation.at(-1).rows[0].controlled_result;
  check(controlled.shadow_rows_written,1,'controlled test actually writes a shadow row');
  check(controlled.app_users_unchanged,true,'controlled ingest leaves row-level users unchanged');
  check(controlled.dealer_accounts_unchanged,true,'controlled ingest leaves dealers unchanged');
  check(controlled.relations_unchanged,true,'controlled ingest leaves relations unchanged');
  check(controlled.shadow_test_rolled_back,true,'controlled test leaves no shadow artifacts');
  check(controlled.changed_user_rows,[],'controlled test has no changed user columns');
  check(await scalar('select md5(jsonb_agg(to_jsonb(d) order by id)::text) as value from app_users d'),userHash,'migration leaves all user fields unchanged');
  await reject(db.exec('update public.app_users set updated_at=updated_at'),/SHADOW_MUST_NOT_WRITE_APP_USERS/);
  const now = new Date(), next = new Date(now.getTime() + 1000), later = new Date(now.getTime() + 2000);
  const row = (account, sourceRow, invoice = null) => ({
    company: 'DAT', account_number: account, account_raw: ` ${account} `, company_name: account === '10295' ? 'AB Lauridsen' : 'JE Service',
    address1: 'Testvej 1', address2: null, postal_code: '4683', city: 'Rønnede', zipcity_raw: '4683 Rønnede', zipcity_validation: 'PARSED_DK',
    country: 'Danmark', iso_country: 'DK', phone: null, email: null, c5_invoice_account_number: invoice,
    c5_group: null,c5_partner_type_code: account === '10295' ? '1' : '5', c5_salesrep: 'EM', language: 0, vat_number: null,
    currency: 'DKK', payment: '30', c5_blocked: 0, c5_approved: 1, source_row_number: sourceRow, source_last_changed: '2026-10-09T10:00:00',
  });
  const rows = [row('10295',1),row('12040',2,'10295'),row('12041',3,'12040')];
  const id = '11111111-1111-4111-8111-111111111111';
  const ingest = (snapshot, asof, values) => scalar('select public.fabric_partner_shadow_ingest($1,$2,$3::jsonb) as value',[snapshot,asof,JSON.stringify(values)]);
  await db.exec('set role service_role');
  check(await ingest(id,now,rows),3,'complete shadow published');
  check(await ingest(id,now,rows),3,'same snapshot idempotent');
  await reject(ingest(id,now,[rows[0]]),/SNAPSHOT_CONFLICT/);
  await reject(scalar('select count(*) as value from public.fabric_partner_master_shadow'),/permission denied/);
  await db.exec('reset role');
  check(await scalar("select c5_invoice_account_number as value from fabric_partner_master_shadow where account_number='12041'"),'12040','JE chain retained only in shadow');
  check(await scalar('select count(*)::int as value from fabric_partner_shadow_runs'),1,'immutable accepted snapshot audit');
  await reject(ingest('22222222-2222-4222-8222-222222222222',now,rows),/STALE_SNAPSHOT/);
  await reject(ingest('22222222-2222-4222-8222-222222222222',next,[]),/INVALID_SNAPSHOT/);
  await reject(ingest('22222222-2222-4222-8222-222222222222',next,[rows[0]]),/SHRINK_REVIEW/);
  await reject(ingest('22222222-2222-4222-8222-222222222222',next,[rows[0],rows[0],rows[2]]),/DUPLICATE_SOURCE_ROW/);
  await reject(ingest('22222222-2222-4222-8222-222222222222',next,[rows[0],{...rows[1],PASSWORD:'not-real'},rows[2]]),/INVALID_SOURCE_ROW/);
  await reject(ingest('22222222-2222-4222-8222-222222222222',next,[rows[0],{...rows[1],company:'OTHER'},rows[2]]),/INVALID_SOURCE_ROW/);
  check(await scalar('select count(*)::int as value from fabric_partner_master_shadow where source_present'),3,'failed refresh never empties snapshot');
  await scalar('select public.fabric_partner_shadow_record_failure() as value');
  check(await scalar('select row_count as value from fabric_partner_shadow_state'),3,'failure preserves success freshness/count');
  check(await ingest('33333333-3333-4333-8333-333333333333',later,[...rows,row('0012041',4)]),4,'leading zeros remain distinct');
  check(await scalar("select count(*)::int as value from fabric_partner_master_shadow where account_number in ('12041','0012041')"),2,'no numeric account coercion');
  await db.exec('set role anon');
  await reject(scalar('select public.fabric_partner_shadow_preview() as value'),/permission denied/);
  await db.exec('reset role; set role authenticated');
  await reject(scalar('select public.fabric_partner_shadow_preview() as value'),/BACKEND_ONLY/);
  await reject(ingest('44444444-4444-4444-8444-444444444444',later,rows),/permission denied/);
  await reject(scalar('select count(*) as value from public.fabric_partner_master_shadow'),/permission denied/);
  await db.exec("select set_config('qa.backend','true',false)");
  check((await scalar('select public.fabric_partner_shadow_preview() as value')).shadow.length,4,'only Backend read RPC authorized');
  await reject(db.exec("update public.fabric_partner_master_shadow set company_name='tampered'"),/permission denied/);
  await reject(db.exec('truncate public.fabric_partner_master_shadow'),/permission denied/);
  await db.exec('reset role');
  check(await scalar('select md5(jsonb_agg(to_jsonb(d))::text) as value from dealer_accounts d'),dealerHash,'Portal UUID/seller/masterdata untouched');
  check(await scalar('select md5(jsonb_agg(to_jsonb(d))::text) as value from partner_account_relations d'),relationHash,'service partner relation untouched');
  check(await scalar('select md5(jsonb_agg(to_jsonb(d) order by id)::text) as value from app_users d'),userHash,'ingest/replay/failure/preview cause zero user writes, including no-op writes');
  check(await scalar("select count(*)::int as value from pg_class where relname like 'fabric_partner_%' and relkind='r' and relrowsecurity"),3,'RLS enabled on all shadow tables');
  console.log(`Partner shadow SQL/RLS: ${checks} checks PASS`);
} finally { await db.close(); }
