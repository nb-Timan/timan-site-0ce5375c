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
const actor = '11111111-1111-4111-8111-111111111111';
const auth = '22222222-2222-4222-8222-222222222222';
const parent = '33333333-3333-4333-8333-333333333333';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('qa.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table app_users(id uuid primary key,auth_user_id uuid,email text,full_name text,portal_role text,approved boolean,is_active boolean);
    insert into app_users values('${actor}','${auth}','qa@example.invalid','Backend QA','timan_backend',true,true);
    create function public.is_backend() returns boolean language sql stable security definer as $$ select exists(
      select 1 from app_users where auth_user_id=auth.uid() and portal_role='timan_backend' and approved and is_active) $$;
    create function public.is_timan_backend() returns boolean language sql stable security definer as $$ select public.is_backend() $$;
    create function public.is_protected_internal_crm_account(text,text,text) returns boolean language sql immutable as $$ select false $$;
    create table dealer_accounts(id uuid primary key default gen_random_uuid(),account_number text unique,dealer_number text,company_name text,
      address_line_1 text,address_line_2 text,address text,postal_code text,city text,country text,customer_type_label text,customer_type text,
      dealer_type text,assigned_seller_initials text,parent_account_number text,branch_name text,status text,is_active boolean,is_deleted boolean,
      is_blocked boolean,source text,is_main_account boolean,billing_account_id uuid,phone text,email text);
    insert into dealer_accounts(id,account_number,company_name,customer_type_label,assigned_seller_initials,is_active,is_deleted,is_blocked,status)
      values('${parent}','10295','AB Lauridsen','Forhandler','EM',true,false,false,'active');
    grant usage on schema public,auth to anon,authenticated,service_role;
    select set_config('qa.uid','${auth}',false);`);
  const file = path => readFileSync(`supabase/migrations/${path}.sql`, 'utf8');
  for (const migration of ['20260828163604_partner_account_relations','20261009100017_fabric_partner_master_shadow',
    '20261010103109_fabric_partner_review_decisions','20261010110700_permanent_partner_review_overrides',
    '20261010112321_partner_review_source_evidence','20261010113512_permanent_partner_cooperation_lifecycle',
    '20261010120531_je_service_controlled_import_pilot','20261010125045_partner_management_readiness_preview']) await db.exec(file(migration));
  const rows = ['10295','12040','12041'].map((account,index) => ({ company:'DAT',account_number:account,account_raw:account,
    company_name:account==='12041'?'JE Service':account,address1:'Symbiosen 7',address2:null,postal_code:'4683',city:'Ronnede',
    zipcity_raw:'4683 Ronnede',zipcity_validation:'PARSED_DK',country:'Danmark',iso_country:'DK',phone:null,email:null,
    c5_invoice_account_number:account==='12041'?'12040':account==='12040'?'10295':null,c5_group:null,
    c5_partner_type_code:account==='10295'?'1':'5',c5_salesrep:'EM',language:0,vat_number:null,currency:'DKK',payment:'30',
    c5_blocked:0,c5_approved:1,source_row_number:index+1,source_last_changed:'2026-10-10T10:00:00' }));
  const ingest = data => scalar('select fabric_partner_shadow_ingest($1,clock_timestamp(),$2::jsonb) as value',[randomUUID(),JSON.stringify(data)]);
  await ingest(rows);
  await reject(scalar('select fabric_partner_je_pilot_preview() as value'),/CURRENT_JE_APPROVAL_REQUIRED/);
  const context = await scalar("select fabric_partner_review_context('12041') as value");
  const fields = Object.fromEntries(['company_name','address1','address2','postal_code','city','country'].map(key=>[key,'C5']));
  const approval = await scalar('select fabric_partner_review_save($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as value',
    ['12041',0,context.source_fingerprint,context.portal_fingerprint,randomUUID(),'APPROVED','dealer_customer',parent,'Business-approved fixture',JSON.stringify(fields)]);
  const baseline = await scalar(`select md5(jsonb_build_array((select jsonb_agg(to_jsonb(d)) from dealer_accounts d),
    (select jsonb_agg(to_jsonb(u)) from app_users u))::text) as value`);
  const preview = () => scalar('select fabric_partner_je_pilot_preview() as value');
  const plan = await preview();
  for (const scenario of ['OVERRIDE','NEEDS_CLARIFICATION']) {
    await db.exec('begin');
    const choices = scenario==='OVERRIDE' ? {...fields,company_name:{source:'OVERRIDE',value:'JE Service'}} : fields;
    await scalar('select fabric_partner_review_save($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as value',
      ['12041',1,context.source_fingerprint,context.portal_fingerprint,randomUUID(),scenario==='OVERRIDE'?'APPROVED':scenario,
        'dealer_customer',parent,'Isolated review scenario',JSON.stringify(choices)]);
    await reject(preview(),scenario==='OVERRIDE'?/APPROVED_C5_FIELDS_REQUIRED/:/CURRENT_JE_APPROVAL_REQUIRED/);
    await db.exec('rollback');
  }
  const params = [approval,plan.source_fingerprint,plan.portal_fingerprint,randomUUID(),true,'Explicit one-account approval'];
  const run = input => scalar('select fabric_partner_je_pilot_import($1,$2,$3,$4,$5,$6) as value',input);
  check(plan.planned_rows,{dealer_accounts:1,partner_account_relations:1,partner_cooperation_events:1,fabric_partner_import_pilots:1},'exact one-account plan');
  check(plan.dealer_account.parent_account_number,'10295','approved operational parent, not invoice account');
  check(plan.dealer_account.billing_account_id,null,'no invented billing UUID');
  check(await scalar('select count(*)::int as value from dealer_accounts'),1,'dry-run creates nothing');
  check((await scalar('select fabric_partner_shadow_preview() as value')).imports,[],'approval is not an executed import');
  await db.exec('set role anon'); await reject(preview(),/permission denied/); await reject(run(params),/permission denied/);
  await db.exec('reset role; set role service_role'); await reject(run(params),/permission denied/);
  await db.exec("reset role; set role authenticated; select set_config('qa.uid','44444444-4444-4444-8444-444444444444',false)");
  await reject(preview(),/BACKEND_ONLY/); await reject(run(params),/BACKEND_ONLY/);
  await db.exec(`select set_config('qa.uid','${auth}',false)`);
  await reject(scalar('select count(*) as value from fabric_partner_import_pilots'),/permission denied/);
  const notConfirmed=[...params]; notConfirmed[4]=false; await reject(run(notConfirmed),/EXPLICIT_PILOT_APPROVAL_REQUIRED/);
  const wrongApproval=[...params]; wrongApproval[0]=randomUUID(); await reject(run(wrongApproval),/SOURCE_CHANGED/);
  const stale=[...params]; stale[1]='old'; await reject(run(stale),/SOURCE_CHANGED/);
  await db.exec('reset role');
  await ingest(rows.map(row=>row.account_number==='12041'?{...row,city:'Changed source'}:row));
  await reject(run(params),/SOURCE_CHANGED/);
  await ingest(rows);
  await db.exec(`update dealer_accounts set is_blocked=true where id='${parent}'`);
  await reject(run(params),/ACTIVE_AB_LAURIDSEN_REQUIRED/);
  await db.exec(`update dealer_accounts set is_blocked=false where id='${parent}'`);
  // A cooperation request conflict must roll back the new account as well.
  await db.exec(`create function reject_cooperation() returns trigger language plpgsql as $$ begin raise exception 'SIMULATED_RELATION_FAILURE'; end $$;
    create trigger qa_failure before insert on partner_cooperation_events for each statement execute function reject_cooperation();`);
  await reject(run(params),/SIMULATED_RELATION_FAILURE/);
  check(await scalar("select count(*)::int as value from dealer_accounts where account_number='12041'"),0,'atomic failure leaves no partial account');
  check(await scalar('select count(*)::int as value from fabric_partner_import_pilots'),0,'atomic failure leaves no import receipt');
  await db.exec('drop trigger qa_failure on partner_cooperation_events');
  await db.exec('set role authenticated');
  const result = await run(params);
  check(result.replayed,false,'first run creates one canonical account');
  check(result.account_id===parent,false,'new account never reuses parent UUID');
  check((await run(params)).account_id,result.account_id,'retry returns the same UUID');
  check((await run([...params.slice(0,3),randomUUID(),...params.slice(4)])).account_id,result.account_id,'rerun with a new request also creates no duplicate');
  const changed=[...params]; changed[5]='different'; await reject(run(changed),/REQUEST_CONFLICT/);
  await db.exec('reset role');
  check(await scalar('select count(*)::int as value from fabric_partner_import_pilots'),1,'single immutable receipt');
  check(await scalar('select approval_id as value from fabric_partner_import_pilots'),approval,'receipt retains exact original approval');
  check(await scalar('select original_invoice_account_number as value from fabric_partner_import_pilots'),'12040','invoice preserved separately, not imported as parent');
  check(await scalar('select count(*)::int as value from partner_cooperation_events'),1,'single canonical cooperation event');
  check(await scalar("select count(*)::int as value from dealer_accounts where account_number='12040'"),0,'no invoice-account import');
  check(await scalar("select parent_account_number as value from dealer_accounts where account_number='12041'"),'10295','permanent canonical relation');
  check(await scalar("select customer_type_label as value from dealer_accounts where account_number='12041'"),'Forhandlerkunde','canonical Portal classification');
  const status = await scalar('select fabric_partner_shadow_preview() as value');
  check(status.imports.length,1,'Backend status exposes one actual receipt');
  check(status.imports[0].account_id,result.account_id,'receipt uses the canonical UUID');
  check(Object.keys(status.imports[0]).sort(),['account_id','account_number','approval_id','id','imported_at'],'status exposes no private request/actor/secret fields');
  check(status.portal.find(account=>account.account_number==='12041').parent_account_number,'10295','comparison uses actual permanent Portal relation');
  await db.exec(file('20261010140258_partner_import_materialization_evidence'));
  const postContext = await scalar("select fabric_partner_review_context('12041',$1) as value",[parent]);
  const receiptId = await scalar('select id as value from fabric_partner_import_pilots');
  check((await scalar("select fabric_partner_review_effective('12041') as value")).needs_recheck,true,'original pre-import comparison reproduces false recheck');
  await reject(scalar('select fabric_partner_import_materialize($1,$2) as value',[receiptId,'stale']),/REVIEW_REQUIRED/);
  await scalar('select fabric_partner_import_materialize($1,$2) as value',[receiptId,postContext.portal_fingerprint]);
  await scalar('select fabric_partner_import_materialize($1,$2) as value',[receiptId,postContext.portal_fingerprint]);
  check(await scalar('select count(*)::int as value from fabric_partner_review_materializations'),1,'reconciliation is idempotent');
  check((await scalar("select fabric_partner_review_effective('12041') as value")).needs_recheck,false,'verified import no longer causes false recheck');
  const reviewPreview = await scalar('select fabric_partner_review_preview() as value');
  check(reviewPreview.reviews[0].portal_fingerprint,plan.portal_fingerprint,'original approval evidence is unchanged');
  check(reviewPreview.reviews[0].materialized_portal_fingerprint,postContext.portal_fingerprint,'client receives separately verified post-import baseline');
  await ingest(rows);
  check((await scalar("select fabric_partner_review_effective('12041') as value")).needs_recheck,false,'unchanged Fabric refresh preserves reconciled approval');
  await db.exec('begin');
  await scalar('select partner_cooperation_change($1,1,$2,null,true,$3,$4,null) as value',[result.account_id,'END','Isolated ending',randomUUID()]);
  check((await scalar("select fabric_partner_review_effective('12041') as value")).needs_recheck,true,'later cooperation change still requires review');
  await db.exec('rollback');
  await db.exec('begin');
  await db.exec("update dealer_accounts set phone='later change' where account_number='12041'");
  check((await scalar("select fabric_partner_review_effective('12041') as value")).needs_recheck,true,'later Portal profile change is detected');
  await db.exec('rollback');
  await reject(db.exec('update fabric_partner_review_materializations set reason=reason'),/HISTORY_IMMUTABLE/);
  await reject(db.exec('delete from fabric_partner_review_materializations'),/HISTORY_IMMUTABLE/);
  await reject(db.exec('truncate fabric_partner_review_materializations'),/HISTORY_IMMUTABLE/);
  await db.exec('set role authenticated');
  await reject(scalar('select fabric_partner_import_materialize($1,$2) as value',[receiptId,postContext.portal_fingerprint]),/permission denied/);
  await reject(scalar('select count(*) as value from fabric_partner_review_materializations'),/permission denied/);
  await db.exec('reset role; set role service_role');
  await reject(scalar('select fabric_partner_import_materialize($1,$2) as value',[receiptId,postContext.portal_fingerprint]),/permission denied/);
  await db.exec('reset role');
  await db.exec('set role authenticated');
  await scalar("select set_config('qa.uid','44444444-4444-4444-8444-444444444444',false) as value");
  await reject(scalar('select fabric_partner_shadow_preview() as value'),/BACKEND_ONLY/);
  await db.exec('reset role');
  await scalar("select set_config('qa.uid',$1,false) as value",[auth]);
  await ingest(rows.map(row=>row.account_number==='12041'?{...row,c5_invoice_account_number:null}:row));
  check((await scalar("select fabric_partner_review_effective('12041') as value")).needs_recheck,true,'real C5 change still requires review after reconciliation');
  check(await scalar("select parent_account_number as value from dealer_accounts where account_number='12041'"),'10295','refresh cannot remove cooperation');
  check(await scalar("select count(*)::int as value from partner_account_relations where active and source_account_id=$1",[parent]),1,'refresh keeps the exact relation active');
  await reject(db.exec('delete from fabric_partner_import_pilots'),/AUDIT_IMMUTABLE/);
  await reject(db.exec('update fabric_partner_import_pilots set reason=reason'),/AUDIT_IMMUTABLE/);
  await reject(db.exec('truncate fabric_partner_import_pilots cascade'),/IMMUTABLE/);
  check(await scalar(`select md5(jsonb_build_array((select jsonb_agg(to_jsonb(d)) from dealer_accounts d where id='${parent}'),
    (select jsonb_agg(to_jsonb(u)) from app_users u))::text) as value`),baseline,'existing parent UUID/seller and all users unchanged');
  check(await scalar("select relrowsecurity as value from pg_class where relname='fabric_partner_import_pilots'"),true,'RLS enabled');
  console.log(`JE Service controlled pilot: ${checks} checks PASS`);
} finally { await db.close(); }
