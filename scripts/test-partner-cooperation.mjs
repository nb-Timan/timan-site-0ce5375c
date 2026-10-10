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
const customer = '33333333-3333-4333-8333-333333333333';
const dealer = '44444444-4444-4444-8444-444444444444';
const nextDealer = '55555555-5555-4555-8555-555555555555';
const dealerAuth = '66666666-6666-4666-8666-666666666666';
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('qa.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table app_users(id uuid primary key,auth_user_id uuid,email text,full_name text,portal_role text,role text,
      approved boolean,is_active boolean,dealer_number text,organization_access_role text);
    insert into app_users values('${actor}','${auth}','backend@example.invalid','Backend QA','timan_backend',null,true,true,null,null),
      ('${dealerAuth}','${dealerAuth}','dealer@example.invalid','Dealer QA','timan_dealer',null,true,true,'10295','collaboration_manager');
    create function public.is_backend() returns boolean language sql stable security definer as $$ select exists(
      select 1 from app_users where auth_user_id=auth.uid() and portal_role='timan_backend' and approved and is_active) $$;
    create function public.is_timan_backend() returns boolean language sql stable security definer as $$ select public.is_backend() $$;
    create function public.is_protected_internal_crm_account(text,text,text) returns boolean language sql immutable as $$ select false $$;
    create table dealer_accounts(id uuid primary key,account_number text,company_name text,address_line_1 text,address_line_2 text,address text,
      postal_code text,city text,country text,customer_type_label text,customer_type text,dealer_type text,
      assigned_seller_initials text,parent_account_number text,branch_name text,status text,is_active boolean,is_deleted boolean,is_blocked boolean);
    insert into dealer_accounts(id,account_number,company_name,customer_type_label,assigned_seller_initials,is_active,is_deleted,is_blocked,status)
      values('${dealer}','10295','AB Lauridsen','Forhandler','EM',true,false,false,'active'),
        ('${nextDealer}','11841','Other dealer','Forhandler','AKR',true,false,false,'active'),
        ('${customer}','12041','JE Service','Forhandlerkunde','EM',true,false,false,'active');
    create table historical_orders(id integer primary key,customer_id uuid,stored_dealer_id uuid,total numeric);
    insert into historical_orders values(1,'${customer}','${dealer}',12345);
    create function reject_history_write() returns trigger language plpgsql as $$ begin raise exception 'HISTORICAL_BUSINESS_DATA_PROTECTED'; end $$;
    create trigger protect_orders before insert or update or delete or truncate on historical_orders for each statement execute function reject_history_write();
    grant usage on schema public,auth to anon,authenticated,service_role;
    select set_config('qa.uid','${auth}',false);`);
  const file = path => readFileSync(`supabase/migrations/${path}.sql`, 'utf8');
  await db.exec(file('20260828163604_partner_account_relations'));
  await db.exec(file('20261009100017_fabric_partner_master_shadow'));
  await db.exec(file('20261010103109_fabric_partner_review_decisions'));
  await db.exec(file('20261010110700_permanent_partner_review_overrides'));
  await db.exec(file('20261010112321_partner_review_source_evidence'));
  const organization = file('20260911085610_20260911072822_organization_access_role_collaboration_manager');
  await db.exec(organization.slice(organization.indexOf('create or replace function public.resolve_collaboration_manager_accounts()'),
    organization.indexOf('create or replace function public.can_assign_organization_access_role(')));
  await db.exec(`create table customer_documents(customer_id uuid,revision integer,total numeric);
    insert into customer_documents values('${customer}',1,12345);
    alter table customer_documents enable row level security;
    grant select on customer_documents to authenticated;
    create policy document_scope on customer_documents for select to authenticated using(
      customer_id in(select id from public.resolve_collaboration_manager_accounts()));`);
  const baseline = await scalar(`select md5(jsonb_build_array((select jsonb_agg(to_jsonb(d)-'parent_account_number' order by id) from dealer_accounts d),
    (select jsonb_agg(to_jsonb(u) order by id) from app_users u),(select jsonb_agg(to_jsonb(o) order by id) from historical_orders o))::text) as value`);
  const migration = file('20261010113512_permanent_partner_cooperation_lifecycle');
  check(/(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.)?(?:app_users|crm_leads|configurations|historical_orders)\b/i.test(migration),false,'no unrelated business write path');
  await db.exec(migration);
  check(await scalar('select count(*)::int as value from partner_account_relations'),0,'migration never activates/imports a relation');
  const sourceRows = ['10295','12040','12041'].map((account,index) => ({ company:'DAT',account_number:account,account_raw:account,
    company_name:account==='12041'?'JE Service':account,address1:'Source street',address2:null,postal_code:'4683',city:'Source city',
    zipcity_raw:'4683 Source city',zipcity_validation:'PARSED_DK',country:'Danmark',iso_country:'DK',phone:null,email:null,
    c5_invoice_account_number:account==='12041'?'12040':account==='12040'?'10295':null,c5_group:null,
    c5_partner_type_code:account==='10295'?'1':'5',c5_salesrep:'EM',language:0,vat_number:null,currency:'DKK',payment:'30',
    c5_blocked:0,c5_approved:1,source_row_number:index+1,source_last_changed:'2026-10-10T10:00:00' }));
  const ingest = async rows => {
    const restoreAuthenticated = await scalar("select current_setting('role')='authenticated' as value");
    await db.exec('reset role');
    try { return await scalar('select fabric_partner_shadow_ingest($1,clock_timestamp(),$2::jsonb) as value',[randomUUID(),JSON.stringify(rows)]); }
    finally { if (restoreAuthenticated) await db.exec('set role authenticated'); }
  };
  await ingest(sourceRows);
  const context = await scalar("select fabric_partner_review_context('12041') as value");
  const fields = Object.fromEntries(['company_name','address1','address2','postal_code','city','country'].map(key=>[key,'C5']));
  const approval = await scalar('select fabric_partner_review_save($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as value',
    ['12041',0,context.source_fingerprint,context.portal_fingerprint,randomUUID(),'APPROVED','dealer_customer',dealer,'Explicit review',JSON.stringify(fields)]);
  const effective = () => scalar("select fabric_partner_review_effective('12041') as value");
  const args = (action='ACTIVATE',version=0,parent=dealer) => [customer,version,action,parent,true,'Explicit Backend approval',randomUUID(),null];
  const change = p => scalar('select partner_cooperation_change($1,$2,$3,$4,$5,$6,$7,$8) as value',p);
  const history = () => scalar('select partner_cooperation_history($1) as value',[customer]);
  const actorUid = uid => db.exec(`select set_config('qa.uid','${uid}',false)`);
  await db.exec('set role anon'); await reject(change(args()),/permission denied/); await reject(history(),/permission denied/);
  await db.exec('reset role; set role service_role'); await reject(change(args()),/permission denied/);
  await db.exec('reset role; set role authenticated'); await actorUid(dealerAuth);
  await reject(change(args()),/BACKEND_ONLY/); await reject(history(),/BACKEND_ONLY/);
  await actorUid(auth);
  await reject(scalar('select count(*) as value from partner_cooperation_events'),/permission denied/);
  await reject(db.exec(`insert into partner_account_relations(source_account_id,target_account_id,relation_type) values('${dealer}','${customer}','dealer_has_dealer_customer')`),/LIFECYCLE_REQUIRED/);
  const missingConfirm=args(); missingConfirm[4]=false; await reject(change(missingConfirm),/EXPLICIT_RELATION_APPROVAL_REQUIRED/);
  const missingReason=args(); missingReason[5]=' '; await reject(change(missingReason),/INVALID_COOPERATION_CHANGE/);
  const wrongDealer=args('ACTIVATE',0,customer); await reject(change(wrongDealer),/VALID_DEALER_REQUIRED/);
  const wrongApproval=args(); wrongApproval[7]=randomUUID(); await reject(change(wrongApproval),/CURRENT_RELATION_APPROVAL_REQUIRED/);
  const first=args(); first[7]=approval; const event=await change(first);
  check(await change(first),event,'exact retries do not duplicate activation');
  const altered=[...first]; altered[5]='Another reason'; await reject(change(altered),/REQUEST_CONFLICT/);
  check((await history()).version,1,'server version established');
  check((await history()).events[0].reviewed_by,actor,'canonical app_users actor, not auth UUID');
  check((await history()).events[0].original_invoice_account_number,'12040','invoice evidence is separate from approved dealer');
  await db.exec('reset role');
  await ingest(sourceRows.map(row=>row.account_number==='12041'?{...row,c5_invoice_account_number:'11841',company_name:'Changed C5'}:row));
  check((await effective()).parent_dealer_id,dealer,'C5 invoice changes never move active cooperation');
  check((await effective()).needs_recheck,true,'source change raises recheck rather than ending cooperation');
  check((await effective()).fields.company_name,'JE Service','approved profile value survives source refresh');
  check((await history()).version,1,'source sync appends no cooperation event');
  await db.exec('set role authenticated');
  await actorUid(dealerAuth);
  check(await scalar('select count(*)::int as value from customer_documents'),1,'actual canonical organization resolver grants active customer access');
  await actorUid(auth); await db.exec('reset role');
  const relation=await scalar("select id as value from partner_account_relations where active and target_account_id=$1",[customer]);
  await reject(db.exec(`update partner_account_relations set active=false where id='${relation}'`),/LIFECYCLE_REQUIRED/);
  await reject(db.exec(`delete from partner_account_relations where id='${relation}'`),/HISTORY_PRESERVED/);
  await reject(db.exec('truncate partner_account_relations cascade'),/HISTORY_PRESERVED/);
  await reject(db.exec(`update dealer_accounts set parent_account_number='OTHER C5' where id='${customer}'`),/LIFECYCLE_REQUIRED/);
  await reject(change(args('SWITCH',0,nextDealer)),/VERSION_CONFLICT/);
  await change(args('SWITCH',1,nextDealer));
  check(await scalar('select active as value from partner_account_relations where id=$1',[relation]),false,'previous relation remains stored inactive');
  check(await scalar('select ended_by as value from partner_account_relations where id=$1',[relation]),actor,'ending has canonical responsible actor');
  check(await scalar('select ended_at is not null and end_reason is not null as value from partner_account_relations where id=$1',[relation]),true,'ending records date and reason');
  check(await scalar('select parent_account_number as value from dealer_accounts where id=$1',[customer]),'11841','canonical legacy access pointer changes atomically');
  check((await effective()).parent_dealer_id,nextDealer,'explicit switch supersedes old review relation without deleting approval');
  await db.exec('set role authenticated'); await actorUid(dealerAuth);
  check(await scalar('select count(*)::int as value from customer_documents'),0,'previous dealer cannot read customer data after switch');
  await actorUid(auth); await db.exec('reset role');
  await change(args('END',2,null));
  check(await scalar('select parent_account_number as value from dealer_accounts where id=$1',[customer]),null,'ending clears legacy access pointer');
  check(await scalar("select count(*)::int as value from partner_account_relations where active and target_account_id=$1",[customer]),0,'ending deactivates cooperation');
  check((await effective()).parent_dealer_id,null,'explicit ending cannot revive an old approved relation');
  await ingest(sourceRows);
  check((await effective()).parent_dealer_id,null,'source refresh cannot reactivate ended cooperation');
  check((await history()).version,3,'source refresh leaves complete cooperation history unchanged');
  const reactivate=args('ACTIVATE',3,dealer); await change(reactivate);
  check(await scalar('select count(*)::int as value from partner_account_relations where target_account_id=$1',[customer]),2,'reactivation preserves previous relation identities');
  check((await history()).events.length,4,'all collaboration periods retained append-only');
  await reject(db.exec('update partner_cooperation_events set reason=reason'),/AUDIT_IMMUTABLE/);
  await reject(db.exec('delete from partner_cooperation_events'),/AUDIT_IMMUTABLE/);
  await reject(db.exec('truncate partner_cooperation_events'),/AUDIT_IMMUTABLE/);
  check(await scalar(`select md5(jsonb_build_array((select jsonb_agg(to_jsonb(d)-'parent_account_number' order by id) from dealer_accounts d),
    (select jsonb_agg(to_jsonb(u) order by id) from app_users u),(select jsonb_agg(to_jsonb(o) order by id) from historical_orders o))::text) as value`),baseline,'UUID/seller/users/historical orders preserved');
  check(await scalar("select relrowsecurity as value from pg_class where relname='partner_cooperation_events'"),true,'audit RLS enabled');
  await db.exec(file('20261010120531_je_service_controlled_import_pilot'));
  await db.exec(file('20261010140258_partner_import_materialization_evidence'));
  await db.exec(file('20261010140302_rostofte_legacy_cooperation_correction'));
  const legacyCustomer=randomUUID(), kolding=randomUUID(), vedbaek=randomUUID(), koldingAuth=randomUUID();
  await db.exec(`insert into dealer_accounts(id,account_number,company_name,customer_type_label,assigned_seller_initials,
    parent_account_number,is_active,is_deleted,is_blocked,status)
    values('${legacyCustomer}','10363','Rostofte','Forhandlerkunde','EM','10138',true,false,false,'active'),
      ('${kolding}','10138','Kolding','Servicepartner','EM',null,true,false,false,'active'),
      ('${vedbaek}','50532','Vedbaek','Forhandler','EM','10138',true,false,false,'active');
    insert into app_users(id,auth_user_id,email,full_name,portal_role,approved,is_active,dealer_number,organization_access_role)
      values('${koldingAuth}','${koldingAuth}','kolding@example.invalid','Kolding QA','timan_dealer',true,true,'10138','collaboration_manager');
    insert into customer_documents values('${legacyCustomer}',1,45678);`);
  const scopedBaseline=await scalar(`select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(d)-'parent_account_number' order by id) from dealer_accounts d),
    (select jsonb_agg(to_jsonb(u) order by id) from app_users u),
    (select jsonb_agg(to_jsonb(o) order by id) from historical_orders o),
    (select jsonb_agg(to_jsonb(d) order by customer_id) from customer_documents d))::text) as value`);
  const legacyRows=[...sourceRows,{...sourceRows[2],account_number:'10363',account_raw:'10363',
    company_name:'Rostofte',c5_invoice_account_number:'10295',source_row_number:4}];
  await ingest(legacyRows);
  const legacyPreview=()=>scalar('select partner_cooperation_rostofte_preview() as value');
  const legacyPlan=await legacyPreview();
  check(legacyPlan.customer_id,legacyCustomer,'dry-run preserves existing UUID');
  check(legacyPlan.saved_approval_exists,false,'missing saved approval is explicit, never invented');
  check(legacyPlan.planned_rows.new_dealer_accounts,0,'legacy correction creates no accounts');
  const legacyParams=[legacyPlan.source_fingerprint,legacyPlan.portal_fingerprint,
    legacyPlan.parent_portal_fingerprint,'Explicit Timan legacy correction',randomUUID(),true];
  const legacySwitch=params=>scalar('select partner_cooperation_rostofte_switch($1,$2,$3,$4,$5,$6) as value',params);
  await db.exec('set role anon');
  await reject(legacyPreview(),/permission denied/); await reject(legacySwitch(legacyParams),/permission denied/);
  await db.exec('reset role; set role service_role'); await reject(legacySwitch(legacyParams),/permission denied/);
  await db.exec('reset role; set role authenticated'); await actorUid(koldingAuth);
  await reject(legacyPreview(),/BACKEND_ONLY/); await reject(legacySwitch(legacyParams),/BACKEND_ONLY/);
  check(await scalar('select count(*)::int as value from customer_documents where customer_id=$1',[legacyCustomer]),1,'old dealer has only pre-switch legacy access');
  await actorUid(dealerAuth);
  check(await scalar('select count(*)::int as value from customer_documents where customer_id=$1',[legacyCustomer]),0,'new dealer has no premature access');
  await actorUid(auth); await db.exec('reset role');
  await reject(legacySwitch([...legacyParams.slice(0,5),false]),/EXPLICIT_RELATION_APPROVAL_REQUIRED/);
  await reject(legacySwitch(['stale',...legacyParams.slice(1)]),/SOURCE_CHANGED/);
  await db.exec(`create function fail_legacy_event() returns trigger language plpgsql as $$ begin
    if NEW.customer_id='${legacyCustomer}' then raise exception 'QA_ATOMIC_FAILURE'; end if; return NEW; end $$;
    create trigger qa_legacy_failure before insert on partner_cooperation_events for each row execute function fail_legacy_event();`);
  await reject(legacySwitch(legacyParams),/QA_ATOMIC_FAILURE/);
  check(await scalar("select count(*)::int as value from fabric_partner_review_decisions where account_number='10363'"),0,'failed switch rolls approval back');
  check(await scalar('select parent_account_number as value from dealer_accounts where id=$1',[legacyCustomer]),'10138','failed switch preserves old access pointer');
  await db.exec('drop trigger qa_legacy_failure on partner_cooperation_events');
  const legacyEvent=await legacySwitch(legacyParams);
  check(await legacySwitch(legacyParams),legacyEvent,'atomic legacy request is idempotent');
  await reject(legacySwitch([...legacyParams.slice(0,3),'Changed reason',...legacyParams.slice(4)]),/REQUEST_CONFLICT/);
  check(await scalar('select previous_relation_id as value from partner_cooperation_events where id=$1',[legacyEvent]),null,'no old relationship row/start date fabricated');
  check(await scalar('select previous_dealer_id as value from partner_cooperation_events where id=$1',[legacyEvent]),kolding,'observed old dealer retained');
  check(await scalar('select previous_relation_origin as value from partner_cooperation_events where id=$1',[legacyEvent]),'OBSERVED_LEGACY_POINTER','legacy origin explicit');
  check(await scalar('select parent_account_number as value from dealer_accounts where id=$1',[legacyCustomer]),'10295','canonical pointer switched');
  check(await scalar('select count(*)::int as value from partner_account_relations where target_account_id=$1',[legacyCustomer]),1,'one permanent relation, no duplicate/fake old relation');
  check((await scalar("select fabric_partner_review_effective('10363') as value")).needs_recheck,false,'approved switch itself does not produce false recheck');
  await db.exec('set role authenticated'); await actorUid(koldingAuth);
  check(await scalar('select count(*)::int as value from customer_documents where customer_id=$1',[legacyCustomer]),0,'old dealer loses canonical RLS access');
  check(await scalar('select count(*)::int as value from resolve_collaboration_manager_accounts() where id=$1',[vedbaek]),1,'Kolding retains other child access');
  await actorUid(dealerAuth);
  check(await scalar('select count(*)::int as value from customer_documents where customer_id=$1',[legacyCustomer]),1,'AB gains only approved customer access');
  await actorUid(auth); await db.exec('reset role');
  await ingest(legacyRows);
  check((await scalar("select fabric_partner_review_effective('10363') as value")).needs_recheck,false,'unchanged refresh preserves approved legacy decision');
  await ingest(legacyRows.map(row=>row.account_number==='10363'?{...row,c5_invoice_account_number:'10138'}:row));
  check((await scalar("select fabric_partner_review_effective('10363') as value")).needs_recheck,true,'real source conflict still requires review');
  check(await scalar('select parent_account_number as value from dealer_accounts where id=$1',[legacyCustomer]),'10295','Fabric never overrides permanent approved relation');
  await reject(db.exec(`update dealer_accounts set parent_account_number='10138' where id='${legacyCustomer}'`),/LIFECYCLE_REQUIRED/);
  check(await scalar('select parent_account_number as value from dealer_accounts where id=$1',[vedbaek]),'10138','Vedbaek pointer preserved');
  check(await scalar('select customer_type_label as value from dealer_accounts where id=$1',[kolding]),'Servicepartner','Kolding type preserved');
  check(await scalar(`select md5(jsonb_build_array(
    (select jsonb_agg(to_jsonb(d)-'parent_account_number' order by id) from dealer_accounts d),
    (select jsonb_agg(to_jsonb(u) order by id) from app_users u),
    (select jsonb_agg(to_jsonb(o) order by id) from historical_orders o),
    (select jsonb_agg(to_jsonb(d) order by customer_id) from customer_documents d))::text) as value`),scopedBaseline,'all profile/users/historical documents preserved');
  console.log(`Partner cooperation lifecycle/RLS/history: ${checks} checks PASS`);
} finally { await db.close(); }
