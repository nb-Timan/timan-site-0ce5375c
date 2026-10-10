import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const {PGlite}=await import(pathToFileURL(resolve('node_modules/.cache/loans-sql/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db=new PGlite();let checks=0;
const check=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const reject=async(p,pattern)=>{await assert.rejects(p,pattern);checks++;};
const scalar=async(sql)=>(await db.query(sql)).rows[0]?.value;
const main='4272d57f-283f-4d27-bc2b-9c70ead7c077',service='e82b8f96-cd7f-4dc5-a839-b7be28c04692',other='ffe39a95-858d-4c9f-834a-298b4ee66ccc';
const backend='11111111-1111-4111-8111-111111111111',seller='22222222-2222-4222-8222-222222222222',external='33333333-3333-4333-8333-333333333333';
const file=name=>readFileSync(`supabase/migrations/${name}.sql`,'utf8');
const change=(action,version,account='10476',confirmed=true,id=randomUUID(),mainId=main)=>db.query(
  'select public.partner_billing_change($1,$2,$3,$4,$5,$6,$7,$8) as value',[mainId,account,action,version,'Explicit synthetic QA decision','Timan QA',confirmed,id]);
try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('qa.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    create table app_users(id uuid primary key,auth_user_id uuid,email text,full_name text,portal_role text,role text,approved boolean,is_active boolean,dealer_number text,organization_access_role text);
    insert into app_users values('${backend}','${backend}','backend@example.invalid','Backend QA','timan_backend',null,true,true,null,null),
      ('${seller}','${seller}','seller@example.invalid','Seller QA','timan_seller',null,true,true,null,null),
      ('${external}','${external}','external@example.invalid','External QA','timan_importer',null,true,true,'10451','collaboration_manager');
    create function is_backend() returns boolean language sql stable security definer as $$ select exists(select 1 from app_users where auth_user_id=auth.uid() and portal_role='timan_backend' and approved and is_active) $$;
    create function is_timan_backend() returns boolean language sql stable security definer as $$ select is_backend() $$;
    create function can_manage_partner_admin_fields(uuid,text,text) returns boolean language sql stable security definer as $$ select is_backend() or auth.uid()='${seller}'::uuid and $3='BP' $$;
    create function is_protected_internal_crm_account(text,text,text) returns boolean language sql immutable as $$ select false $$;
    create table dealer_accounts(id uuid primary key,account_number text,company_name text,parent_account_number text,customer_type text,customer_type_label text,dealer_type text,
      assigned_seller_id uuid,assigned_seller_email text,assigned_seller_initials text,branch_name text,status text,is_active boolean,is_blocked boolean,is_deleted boolean,
      address_line_1 text,postal_code text,city text,country text,invoice_email text,currency_code text,payment_terms text);
    insert into dealer_accounts(id,account_number,company_name,parent_account_number,customer_type_label,dealer_type,assigned_seller_initials,is_active,is_blocked,is_deleted,status)
    values('${main}','10451','Integra Group','10476','Importør','importer','BP',true,false,false,'active'),
      ('${service}','10953','Integra Service',null,'Servicepartner','service_partner','BP',true,false,false,'active'),
      ('${other}','10267','Holmsland',null,'Forhandler','dealer','EM',true,false,false,'active');
    create table fabric_partner_master_shadow(company text,account_number text,company_name text,c5_invoice_account_number text,c5_partner_type_code text,
      source_present boolean,address1 text,postal_code text,city text,country text,currency text,payment text,primary key(company,account_number));
    insert into fabric_partner_master_shadow(company,account_number,company_name,c5_invoice_account_number,c5_partner_type_code,source_present)
    values('DAT','10451','Integra Group','10476','1',true),('DAT','10476','NORD AUTOSERVICE',null,'0',true),
      ('DAT','10953','Integra Service',null,'1',true),('DAT','10267','Holmsland','10374','1',true),('DAT','10374','TBS Maskinpower',null,'1',true);
    grant usage on schema public,auth to anon,authenticated,service_role;select set_config('qa.uid','${backend}',false);`);
  await db.exec(file('20260828163604_partner_account_relations'));
  const legacy=file('20260922104421_service_partner_main_billing_relation');
  await db.exec(legacy.slice(0,legacy.indexOf('-- Assigned Timan sellers')));
  await db.exec(`insert into partner_account_relations(source_account_id,target_account_id,relation_type) values('${main}','${service}','importer_has_service_partner');`);
  const organization=file('20260911085610_20260911072822_organization_access_role_collaboration_manager');
  await db.exec(organization.slice(organization.indexOf('create or replace function public.resolve_collaboration_manager_accounts()'),organization.indexOf('create or replace function public.can_assign_organization_access_role(')));
  const baseline=await scalar(`select md5(jsonb_build_array((select jsonb_agg(to_jsonb(d) order by id) from dealer_accounts d),(select jsonb_agg(to_jsonb(u) order by id) from app_users u),(select jsonb_agg(to_jsonb(r) order by id) from partner_account_relations r))::text) as value`);
  await db.exec(file('20261010180202_billing_branch_relations'));
  check(await scalar('select count(*)::int as value from partner_billing_relations'),0,'no automatic production proposals');
  check(await scalar('select count(*)::int as value from dealer_accounts'),3,'no C5 account import');
  await db.exec('set role authenticated');
  await reject(db.query('select * from partner_billing_relations'),/permission denied/);
  await change('PROPOSE',0,'10476',false);
  check(await scalar(`select (partner_billing_preview('${main}')->'relations'->0->>'active')::boolean as value`),false,'proposal not active');
  check(await scalar(`select (partner_billing_preview('${main}')->'relations'->0->>'version')::integer as value`),1,'proposal is versioned');
  await reject(change('ACTIVATE',1,'10476',false),/EXPLICIT_BILLING_APPROVAL_REQUIRED/);
  await reject(change('ACTIVATE',0),/BILLING_VERSION_CONFLICT/);
  const request=randomUUID(),first=await change('ACTIVATE',1,'10476',true,request);
  check((await change('ACTIVATE',1,'10476',true,request)).rows[0].value,first.rows[0].value,'unchanged retry is idempotent');
  await reject(change('ACTIVATE',1,'10374',true,request),/REQUEST_CONFLICT/);
  check(await scalar(`select (partner_billing_preview('${main}')->'relations'->0->>'billing_account_id') is null as value`),true,'C5-only financial identity gets no Portal UUID/login');
  check(await scalar(`select partner_billing_preview('${main}')->'relations'->0->>'billing_account_number' as value`),'10476','exact account identity');
  await change('ACTIVATE',0,'10476',true,randomUUID(),other);
  await db.exec(`reset role;select set_config('qa.uid','${external}',false);set role authenticated;`);
  await reject(change('END',2,null),/BACKEND_ONLY/);
  await reject(db.query(`select partner_billing_preview('${main}')`),/PARTNER_SCOPE_REQUIRED/);
  await reject(db.query('select * from partner_billing_relations'),/permission denied/);
  check(await scalar(`select count(*)::int as value from resolve_collaboration_manager_accounts()`),2,'commercial scope remains main + existing service partner only');
  await db.exec(`reset role;select set_config('qa.uid','${seller}',false);set role authenticated;`);
  check(await scalar(`select jsonb_array_length(partner_billing_preview('${main}')->'relations') as value`),1,'existing scoped seller can read economics');
  await reject(db.query(`select partner_billing_preview('${other}')`),/PARTNER_SCOPE_REQUIRED/);
  await reject(change('END',2,null),/BACKEND_ONLY/);
  await db.exec(`reset role;select set_config('qa.uid','${backend}',false);set role authenticated;`);
  await reject(change('END',2,null,false),/EXPLICIT_BILLING_APPROVAL_REQUIRED/);
  await change('SWITCH',2,'10374');
  check(await scalar(`select jsonb_array_length(partner_billing_preview('${main}')->'history') as value`),3,'switch appends audit');
  await change('END',3,null);
  await db.exec('reset role');
  check(await scalar(`select count(*)::int as value from partner_billing_relations where main_partner_id='${main}' and active`),0,'ended relation inactive');
  await reject(db.exec('delete from partner_billing_relations'),/BILLING_HISTORY_PRESERVED/);
  await reject(db.exec('truncate partner_billing_relations cascade'),/BILLING_HISTORY_PRESERVED/);
  await reject(db.exec("update partner_account_relation_history set reason='rewrite' where relation_type='billing_branch'"),/BILLING_HISTORY_PRESERVED/);
  await reject(db.exec(`update partner_billing_relations set active=true where main_partner_id='${main}'`),/BILLING_RPC_REQUIRED/);
  await db.exec("update fabric_partner_master_shadow set c5_invoice_account_number='10374',source_present=false where account_number='10476'");
  check(await scalar(`select count(*)::int as value from partner_billing_relations where main_partner_id='${other}' and active`),1,'Fabric source changes do not deactivate or move approval');
  check(await scalar(`select count(*)::int as value from partner_billing_relations where main_partner_id='${main}' and active`),0,'source refresh never reactivates ended approval');
  await db.exec("update fabric_partner_master_shadow set source_present=true where account_number='10476'");
  await db.exec('set role authenticated');
  await reject(change('ACTIVATE',4,'10451'),/INVALID_BILLING_ACCOUNT/);
  await change('ACTIVATE',4,'10267');
  await reject(change('SWITCH',1,'10451',true,randomUUID(),other),/BILLING_CYCLE/);
  await db.exec('reset role');
  await db.exec(`create function qa_reject_billing_event() returns trigger language plpgsql as $$ begin raise exception 'QA_ATOMIC_FAILURE';end $$;
    create trigger qa_fail_audit before insert on partner_account_relation_history for each row execute function qa_reject_billing_event();set role authenticated;`);
  await reject(change('SWITCH',5,'10374'),/QA_ATOMIC_FAILURE/);
  await db.exec('reset role;drop trigger qa_fail_audit on partner_account_relation_history');
  check(await scalar(`select billing_account_number as value from partner_billing_relations where main_partner_id='${main}' and active`),'10267','audit failure rolls back relation switch atomically');
  check(await scalar(`select max(version)::integer as value from partner_account_relation_history where new_parent_account_id='${main}'`),5,'failed switch never advances version');
  check(await scalar(`select md5(jsonb_build_array((select jsonb_agg(to_jsonb(d) order by id) from dealer_accounts d),(select jsonb_agg(to_jsonb(u) order by id) from app_users u),(select jsonb_agg(to_jsonb(r) order by id) from partner_account_relations r))::text) as value`),baseline,'accounts, roles, commercial relations and pointers unchanged');
  check(await scalar(`select count(*)::int as value from partner_billing_relations where main_partner_id='${other}' and billing_account_number='10476'`),1,'no duplicate economic relation');
  await db.exec(`select set_config('qa.uid','',false);set role anon;`);
  await reject(db.query(`select partner_billing_preview('${main}')`),/permission denied/);
  await reject(change('ACTIVATE',0),/permission denied/);
  console.log(`Billing branch SQL/lifecycle/RLS: ${checks} checks PASS`);
}finally{await db.close();}
