import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';

const evidence = JSON.parse(readFileSync(new URL('./fixtures/service-partner-access-audit-20261010.json', import.meta.url), 'utf8'));

/**
 * Negative acceptance audit, not a successful access-model release.
 * Reuses the existing isolated lifecycle database. No network, credentials,
 * production data or production mutation. DDL/rows are rolled back afterwards.
 */
export async function auditServicePartnerAccess({ db, backendAuth, reesinkAuth, serviceAuth, reesink, service }) {
  let checks = 0;
  const check = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const as = async uid => db.query("select set_config('qa.uid',$1,false)", [uid]);
  const blocked = [];
  await db.exec('reset role; begin');
  try {
    await db.exec(`create domain public.portal_role as text;
      alter table app_users add column display_name text, add column initials text,
        add column allowed_areas text[], add column allowed_modules text[], add column module_access text[];
      alter table dealer_accounts add column assigned_seller_id uuid,add column assigned_seller_email text,
        add column successor_dealer_id uuid,add column successor_dealer_account_number text;
      create table configurations(id uuid primary key,dealer_account_id uuid,dealer_number text,
        created_by_user_id uuid,created_by_email text,assigned_seller_id uuid,seller_email text,
        quote_number text,order_number text,internal_note text,state_json jsonb,total_price numeric);
      create table warranty_registrations(id uuid primary key,dealer_account_id uuid,
        dealer_account_number text,dealer_match_status text,legacy_cost_amount numeric);
      create table service_registrations(id uuid primary key,dealer_account_id uuid,service_date date);
      create function public.partnerdata_seller_account_scope(uuid) returns table(dealer_account_id uuid)
        language sql stable security definer set search_path='' as
        $$ select id from public.dealer_accounts where assigned_seller_id=$1 $$;`);
    // Exact deployed SQL definitions; the seller-only helper above is outside
    // this external-user audit. Never pretend this replaces a complete RLS suite.
    for (const name of ['is_timan_staff','app_user_owns_row','current_timan_app_user','current_user_dealer_number','can_maintain_partnerdata_as',
      'can_edit_partnerdata_account_as','can_access_partnerdata_account','partnerdata_effective_actor_id',
      'list_partnerdata_accounts','resolve_collaboration_manager_accounts','warranty_visible_dealer_ids',
      'is_timan_global_warranty','service_is_global_actor','service_visible_dealer_ids']) {
      const fn=evidence.functions.find(f=>f.name===name);
      assert.ok(fn,'missing audited function '+name);
      await db.exec(fn.definition);
    }
    for (const table of ['app_users','dealer_accounts','configurations','warranty_registrations','service_registrations']) {
      await db.exec('alter table public.'+table+' enable row level security; grant select,update,delete on public.'+table+' to authenticated');
      const old = await db.query("select policyname from pg_policies where schemaname='public' and tablename=$1",[table]);
      for (const row of old.rows) await db.exec('drop policy "'+row.policyname.replaceAll('"','""')+'" on public.'+table);
      for (const policy of evidence.policies.filter(p=>p.tablename===table)) {
        await db.exec('create policy "'+policy.policyname+'" on public.'+table+' for '+policy.cmd+' to authenticated'+
          (policy.qual?' using ('+policy.qual+')':'')+(policy.with_check?' with check ('+policy.with_check+')':''));
      }
    }
    const unrelated=randomUUID(), unrelatedAuth=randomUUID(), quote=randomUUID(), order=randomUUID(), draft=randomUUID();
    const allowedRoleUsers=[];
    for (const role of ['timan_dealer','dealer_user','dealer_customer','timan_importer','timan_service_partner','exhibition_user']) {
      const id=randomUUID(); allowedRoleUsers.push({role,id});
      await db.query(`insert into app_users(id,auth_user_id,email,portal_role,approved,is_active,dealer_number,organization_access_role)
        values($1,$1,$2,$3,true,true,'10151','collaboration_manager')`,[id,role+'@example.invalid',role]);
    }
    const ownOnly=randomUUID(), inactive=randomUUID(), unapproved=randomUUID();
    for (const [id,active,approved] of [[ownOnly,true,true],[inactive,false,true],[unapproved,true,false]]) {
      await db.query(`insert into app_users(id,auth_user_id,email,portal_role,approved,is_active,dealer_number,organization_access_role)
        values($1,$1,$2,'timan_dealer',$3,$4,'10151',$5)`,[id,id+'@example.invalid',approved,active,id===ownOnly?'own_company':'collaboration_manager']);
    }
    await db.query(`insert into dealer_accounts(id,account_number,company_name,dealer_type,is_active,is_deleted,is_blocked,status)
      values($1,'UNRELATED','Unrelated QA dealer','dealer',true,false,false,'active')`,[unrelated]);
    await db.query(`insert into app_users(id,auth_user_id,email,portal_role,approved,is_active,dealer_number,organization_access_role)
      values($1,$1,'unrelated@example.invalid','timan_dealer',true,true,'UNRELATED','collaboration_manager')`,[unrelatedAuth]);
    for (const [id,quoteNo,orderNo] of [[quote,'T-QA',null],[order,'T-QA-2','O-QA'],[draft,null,null]]) {
      await db.query(`insert into configurations values($1,$2,'10082',$3,'backend@example.invalid',$3,'backend@example.invalid',
        $4,$5,'PRIVATE QA SENTINEL','{"internalNote":"PRIVATE QA SENTINEL","pricingSnapshot":{"prices":{"712000":777}}}',777)`,
        [id,service,backendAuth,quoteNo,orderNo]);
    }
    await db.query(`insert into configurations values($1,$2,'UNRELATED',$3,'backend@example.invalid',$3,null,'T-OTHER',null,null,'{}',99)`,
      [randomUUID(),unrelated,backendAuth]);
    await db.query("insert into warranty_registrations values($1,$2,'10082','matched',999)",[randomUUID(),service]);
    await db.query("insert into service_registrations values($1,$2,'2026-10-10')",[randomUUID(),service]);
    await db.query("insert into service_registrations values($1,$2,'2026-10-10')",[randomUUID(),unrelated]);
    const integritySql = `select md5(jsonb_build_array(
      (select jsonb_agg(to_jsonb(d) order by id) from dealer_accounts d),
      (select jsonb_agg(to_jsonb(u) order by id) from app_users u),
      (select jsonb_agg(to_jsonb(c) order by id) from configurations c),
      (select jsonb_agg(to_jsonb(w) order by id) from warranty_registrations w),
      (select jsonb_agg(to_jsonb(s) order by source_row_number) from fabric_partner_master_shadow s),
      (select jsonb_agg(to_jsonb(o) order by id) from historical_orders o))::text) value`;
    const integrityBefore=await scalar(integritySql);
    await db.exec('set role authenticated');
    const scoped = async () => scalar('select count(*)::int value from resolve_collaboration_manager_accounts() where id=$1',[service]);
    await as(reesinkAuth);
    check(await scoped(),1,'approved manager gets canonical target scope');
    check(await scalar('select count(*)::int value from configurations where id=$1',[quote]),1,'target quote visible');
    check(await scalar('select count(*)::int value from configurations where id=$1',[order]),1,'target order visible');
    check(await scalar("select count(*)::int value from configurations where dealer_number='UNRELATED'"),0,'unrelated quotes denied');
    check(await scalar('select count(*)::int value from service_registrations where dealer_account_id=$1',[service]),1,'target service registrations visible');
    check(await scalar('select count(*)::int value from service_registrations where dealer_account_id=$1',[unrelated]),0,'unrelated service data denied');
    check(await scalar('select count(*)::int value from list_partnerdata_accounts() where id=$1',[service]),0,'confirmed canonical Partnerdata scope gap');
    blocked.push('Canonical Partnerdata RPC excludes the related servicepartner');
    check(await scalar('select count(*)::int value from warranty_registrations where dealer_account_id=$1',[service]),0,'confirmed machine/warranty scope gap');
    blocked.push('Warranty/machine RLS excludes the related servicepartner');
    check(await scalar('select internal_note value from configurations where id=$1',[quote]),'PRIVATE QA SENTINEL','confirmed private note exposure');
    check(await scalar('select state_json->>\'internalNote\' value from configurations where id=$1',[quote]),'PRIVATE QA SENTINEL','confirmed private snapshot note exposure');
    check(await scalar('select count(*)::int value from configurations where id=$1',[draft]),1,'confirmed unpublished-draft exposure');
    blocked.push('Related configurations expose private notes and unsubmitted drafts');
    check(await scalar('select count(*)::int value from app_users where id=$1',[serviceAuth]),1,'confirmed broader organization user read scope');
    check((await db.query('update app_users set full_name=\'Not allowed\' where id=$1 returning id',[serviceAuth])).rows.length,0,'related user administration update denied');
    // Avoid persisting even synthetic destructive changes in the audit.
    await db.exec('savepoint deletion_probe');
    check((await db.query('delete from configurations where id=$1 returning id',[quote])).rows.length,1,'confirmed ALL-policy derived DELETE exposure');
    await db.exec('rollback to savepoint deletion_probe');
    blocked.push('Configuration ALL policy permits deleting related quotes/orders');
    const roleMatrix=[];
    for (const {role,id} of allowedRoleUsers) {
      await as(id);
      const hasScope=await scoped();
      check(hasScope,role==='exhibition_user'?0:1,'current role scope '+role);
      roleMatrix.push({role,organizationAccessRole:'collaboration_manager',relatedScope:hasScope===1});
    }
    for (const id of [ownOnly,inactive,unapproved,unrelatedAuth,serviceAuth]) {
      await as(id);check(await scoped(),0,'own-only/inactive/unapproved/unrelated/reverse scope denied');
    }
    await as(backendAuth);
    const relation=(await db.query('select id from partner_account_relations where source_account_id=$1 and target_account_id=$2 and active',[reesink,service])).rows[0].id;
    const version=await scalar('select (partner_cooperation_history($1)->>\'version\')::integer value',[service]);
    await db.query('select partner_cooperation_change_typed($1,$2,\'END\',null,true,$3,$4,\'dealer_has_service_partner\',$5)',
      [service,version,'Isolated access revocation QA only',randomUUID(),relation]);
    await as(reesinkAuth);
    check(await scoped(),0,'END revokes canonical derived target scope');
    check(await scalar("select count(*)::int value from configurations where dealer_number='10082'"),0,'END revokes related quotes/order reads');
    check(await scalar('select count(*)::int value from service_registrations where dealer_account_id=$1',[service]),0,'END revokes service history reads');
    check(await scalar('select count(*)::int value from app_users where id=$1',[serviceAuth]),0,'END revokes organization user reads');
    await db.exec('reset role');
    check(await scalar(integritySql),integrityBefore,'accounts/UUID/EM/billing/C5/users/frozen business snapshots unchanged');
    check(await scalar('select count(*)::int value from partner_cooperation_events where customer_id=$1 and action=\'END\'',[service]),2,'previous and audit END history retained');
    const absent=evidence.availability.filter(row=>!row.present).map(row=>row.name);
    check(absent.includes('service_tickets'),true,'deployed service-ticket schema absent');
    check(absent.includes('service_claims'),true,'deployed service-claim schema absent');
    blocked.push('Production service-case tables absent: '+absent.join(', '));
    return {status:'BLOCKED',accessModelAcceptance:'FAIL',auditChecksPassed:checks,roleMatrix,blockers:blocked,
      productionWrites:0,productionRelationActivated:false};
  } finally {
    await db.exec('rollback');
    await db.exec('reset role');
    await as(backendAuth);
  }
}
