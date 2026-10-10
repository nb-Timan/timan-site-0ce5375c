import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(pathToFileURL(resolve('node_modules/.cache/loans-sql/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
let checks = 0;
const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0]?.value;
const reject = async (promise, pattern) => { await assert.rejects(promise, pattern); checks++; };
const uid = '50877e58-054d-4fc9-ad02-6ca0a6037d12';
const authuid = '2f52b0e6-3050-4df0-9d58-73402ecc6426';
const parent = 'bc6ae72c-b653-4995-a446-dfdd540b01d1';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('qa.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table app_users(id uuid primary key,auth_user_id uuid,email text,full_name text,portal_role text,approved boolean,is_active boolean);
    insert into app_users values('${uid}','${authuid}','internal@example.invalid','Backend QA','timan_backend',true,true);
    create function public.is_backend() returns boolean language sql stable security definer as $$ select exists(
      select 1 from app_users where auth_user_id=auth.uid() and portal_role='timan_backend' and approved and is_active) $$;
    create table dealer_accounts(id uuid primary key,account_number text,company_name text,address_line_1 text,address_line_2 text,address text,
      postal_code text,city text,country text,phone text,email text,billing_account_id uuid,customer_type_label text,customer_type text,dealer_type text,
      assigned_seller_initials text,is_active boolean,is_deleted boolean,is_blocked boolean);
    insert into dealer_accounts(id,account_number,company_name,customer_type_label,assigned_seller_initials,is_active,city)
      values('${parent}','10295','AB Lauridsen','Forhandler','EM',true,'Portal city');
    create table partner_account_relations(id uuid primary key default gen_random_uuid(),source_account_id uuid,target_account_id uuid,
      relation_type text,active boolean,created_at timestamptz,updated_at timestamptz);
    create function reject_business_write() returns trigger language plpgsql as $$ begin raise exception 'NO_BUSINESS_WRITES'; end $$;
    create trigger no_users before insert or update or delete or truncate on app_users for each statement execute function reject_business_write();
    create trigger no_dealers before insert or update or delete or truncate on dealer_accounts for each statement execute function reject_business_write();
    create trigger no_relations before insert or update or delete or truncate on partner_account_relations for each statement execute function reject_business_write();
    grant usage on schema public,auth to anon,authenticated,service_role;
    select set_config('qa.uid','${authuid}',false);`);
  const baseline = await scalar(`select md5(jsonb_build_array((select jsonb_agg(to_jsonb(d)) from dealer_accounts d),
    (select jsonb_agg(to_jsonb(u)) from app_users u),(select jsonb_agg(to_jsonb(r)) from partner_account_relations r))::text) as value`);
  await db.exec(readFileSync('supabase/migrations/20261009100017_fabric_partner_master_shadow.sql','utf8'));
  const migration = readFileSync('supabase/migrations/20261010103109_fabric_partner_review_decisions.sql','utf8');
  check(/(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.)?(?:app_users|dealer_accounts|partner_account_relations)\b/i.test(migration),false,'no protected write path');
  await db.exec(migration);
  const row = (account, number, type='5', invoice=null) => ({ company:'DAT',account_number:account,account_raw:account,
    company_name: account==='10295' ? 'AB C5' : 'JE Service',address1:'Testvej 1',address2:null,postal_code:'4683',city:'C5 city',
    zipcity_raw:'4683 C5 city',zipcity_validation:'PARSED_DK',country:'Danmark',iso_country:'DK',phone:null,email:null,
    c5_invoice_account_number:invoice,c5_group:null,c5_partner_type_code:type,c5_salesrep:'EM',language:0,vat_number:null,
    currency:'DKK',payment:'30',c5_blocked:0,c5_approved:1,source_row_number:number,source_last_changed:'2026-10-09T10:00:00' });
  const rows=[row('10295',1,'1'),row('12040',2,'5','10295'),row('12041',3,'5','12040'),row('99999',4,'0')];
  const ingest = async (data) => scalar('select fabric_partner_shadow_ingest($1,clock_timestamp(),$2::jsonb) as value',[randomUUID(),JSON.stringify(data)]);
  await ingest(rows);
  const context = async account => scalar('select fabric_partner_review_context($1) as value',[account]);
  const fields = Object.fromEntries(['company_name','address1','address2','postal_code','city','country'].map(key=>[key,'C5']));
  const payload = async (account='12041',status='APPROVED',version=0) => {
    const c = await context(account);
    return [account,version,c.source_fingerprint,c.portal_fingerprint,randomUUID(),status,
      account==='10295' ? 'dealer' : 'dealer_customer',account==='10295' ? null : parent,'Documented QA review',JSON.stringify(fields)];
  };
  const save = p => scalar('select fabric_partner_review_save($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as value',p);
  const preview = () => scalar('select fabric_partner_review_preview() as value');
  const first = await payload();
  await db.exec('set role anon');
  await reject(preview(),/permission denied/); await reject(save(first),/permission denied/);
  await db.exec('reset role; set role service_role');
  await reject(preview(),/permission denied/); await reject(save(first),/permission denied/);
  await db.exec("reset role; set role authenticated; select set_config('qa.uid','11111111-1111-4111-8111-111111111111',false)");
  await reject(preview(),/BACKEND_ONLY/); await reject(save(first),/BACKEND_ONLY/);
  await db.exec(`select set_config('qa.uid','${authuid}',false)`);
  await reject(scalar('select count(*) as value from fabric_partner_review_decisions'),/permission denied/);
  await reject(scalar("select fabric_partner_review_context('12041') as value"),/permission denied/);
  const decision = await save(first);
  check(await save(first),decision,'idempotent replay returns same immutable decision');
  await reject(save([...first.slice(0,9),JSON.stringify({...fields,phone:'C5'})]),/INVALID_FIELD_CHOICES/);
  const altered=[...first]; altered[8]='Different reason'; await reject(save(altered),/REQUEST_CONFLICT/);
  const state = await preview(); const saved = state.reviews[0];
  check(saved.reviewed_by,uid,'canonical app_users ID, not auth user ID');
  check(saved.fields.length,6,'six relational field decisions');
  check(saved.needs_recheck,false,'fresh decision eligible');
  check(saved.parent_dealer_id,parent,'explicit future parent only');
  check(state.parents.length,1,'only canonical eligible parent');
  await db.exec('reset role');
  await reject(save(await payload()),/REVIEW_VERSION_CONFLICT/);
  const noParent=await payload('12040'); noParent[7]=null; await reject(save(noParent),/VERIFIED_PARENT_REQUIRED/);
  const wrongType=await payload('12040'); wrongType[6]='importer'; wrongType[7]=null; await reject(save(wrongType),/TYPE_CONFLICT/);
  const unknown=await payload('99999'); unknown[6]=null; unknown[7]=null; await reject(save(unknown),/APPROVAL_REQUIRES/);
  unknown[6]='dealer'; unknown[8]='Documented manual type choice'; check(typeof await save(unknown),'string','unknown code requires explicit type and reason');
  const ignored=await payload('12040','IGNORED'); check(typeof await save(ignored),'string','ignore persists');
  const clarify=await payload('12040','NEEDS_CLARIFICATION',1); check(typeof await save(clarify),'string','clarification appends next version');
  const pending=await payload('12040','PENDING',2); check(typeof await save(pending),'string','pending appends next version');
  const existing=await payload('10295'); existing[9]=JSON.stringify({...fields,company_name:'PORTAL',city:'PORTAL'});
  const existingId=await save(existing);
  check(await scalar("select approved_value as value from fabric_partner_review_fields where decision_id=$1 and field_name='city'",[existingId]),'Portal city','mixed choices derive trusted current values');
  check(await scalar('select count(*)::int as value from fabric_partner_review_decisions'),6,'all decision versions retained');
  await reject(db.exec('update fabric_partner_review_decisions set comment=comment'),/IMMUTABLE/);
  await reject(db.exec('delete from fabric_partner_review_fields'),/IMMUTABLE/);
  await reject(db.exec('truncate fabric_partner_review_decisions cascade'),/IMMUTABLE/);
  await ingest(rows);
  check((await preview()).reviews.find(r=>r.id===decision).needs_recheck,false,'unchanged live-shaped refresh preserves approval');
  const stale=await payload('12041','APPROVED',1);
  await ingest(rows.map(r=>r.account_number==='12040'? {...r,c5_invoice_account_number:null}:r));
  check((await preview()).reviews.find(r=>r.id===decision).needs_recheck,true,'invoice-chain source change invalidates approval');
  await reject(save(stale),/SOURCE_CHANGED_RELOAD/);
  await ingest(rows.map(r=>r.account_number==='12041'? {...r,company_name:'Changed C5 name'}:r));
  check((await preview()).reviews.find(r=>r.id===decision).needs_recheck,true,'own source change requires recheck');
  const invalidAddress=await payload('12040','APPROVED',3);
  await db.exec("update fabric_partner_master_shadow set zipcity_validation='REVIEW_REQUIRED' where account_number='12040'");
  const newctx=await context('12040'); invalidAddress[2]=newctx.source_fingerprint;
  await reject(save(invalidAddress),/ADDRESS_REQUIRES/);
  check(await scalar(`select md5(jsonb_build_array((select jsonb_agg(to_jsonb(d)) from dealer_accounts d),
    (select jsonb_agg(to_jsonb(u)) from app_users u),(select jsonb_agg(to_jsonb(r)) from partner_account_relations r))::text) as value`),baseline,'zero protected writes throughout migration/review/refresh');
  check(await scalar("select count(*)::int as value from pg_class where relname in ('fabric_partner_review_decisions','fabric_partner_review_fields') and relrowsecurity"),2,'both tables RLS enabled');
  check(await scalar("select fabric_partner_review_portal_type('Importør','dealer',null) as value"),'importer','canonical localized exact type precedence');
  check(await scalar("select fabric_partner_review_portal_type('Forhandlerkunde','dealer',null) as value"),'dealer_customer','dealer-customer not fuzzy dealer');
  console.log(`Partner review SQL/RLS/persistence: ${checks} checks PASS`);
} finally { await db.close(); }
