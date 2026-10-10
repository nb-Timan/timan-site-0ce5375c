-- Explicit one-account pilot only. Installing this migration imports nothing.
create table public.fabric_partner_import_pilots (
  id uuid primary key default gen_random_uuid(),
  company text not null check(company='DAT'),
  account_number text not null check(account_number='12041'),
  account_id uuid not null unique references public.dealer_accounts(id),
  approval_id uuid not null references public.fabric_partner_review_decisions(id),
  cooperation_event_id uuid not null references public.partner_cooperation_events(id),
  snapshot_id uuid not null references public.fabric_partner_shadow_runs(snapshot_id),
  source_fingerprint text not null,
  portal_fingerprint_before text not null,
  original_invoice_account_number text not null check(original_invoice_account_number='12040'),
  imported_by uuid not null references public.app_users(id),
  imported_at timestamptz not null default now(),
  reason text not null check(length(btrim(reason))>0 and length(reason)<=4000),
  request_id uuid not null unique,
  request_fingerprint text not null,
  unique(company,account_number)
);
create index fabric_partner_import_approval_idx on public.fabric_partner_import_pilots(approval_id);
create index fabric_partner_import_cooperation_idx on public.fabric_partner_import_pilots(cooperation_event_id);
create index fabric_partner_import_snapshot_idx on public.fabric_partner_import_pilots(snapshot_id);
create index fabric_partner_import_actor_idx on public.fabric_partner_import_pilots(imported_by);
alter table public.fabric_partner_import_pilots enable row level security;
revoke all on public.fabric_partner_import_pilots from public,anon,authenticated,service_role;
create trigger fabric_partner_import_pilots_immutable before update or delete or truncate
  on public.fabric_partner_import_pilots for each statement execute function public.partner_cooperation_immutable();

create function public.fabric_partner_je_pilot_preview()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare approval public.fabric_partner_review_decisions%rowtype; parent public.dealer_accounts%rowtype;
  source public.fabric_partner_master_shadow%rowtype; ctx jsonb; values_approved jsonb;
begin
  if public.is_backend() is not true then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  select * into approval from public.fabric_partner_review_decisions where id=public.fabric_partner_review_active('12041');
  if approval.id is null or approval.status<>'APPROVED' or approval.proposed_partner_type<>'dealer_customer'
    or approval.company<>'DAT' or approval.account_number<>'12041'
    or exists(select 1 from public.fabric_partner_review_decisions where company='DAT' and account_number='12041' and version>approval.version)
    then raise exception 'CURRENT_JE_APPROVAL_REQUIRED'; end if;
  select * into parent from public.dealer_accounts where id=approval.parent_dealer_id;
  if not found or parent.account_number<>'10295' or not coalesce(parent.is_active,true)
    or coalesce(parent.is_deleted,false) or coalesce(parent.is_blocked,false)
    or public.fabric_partner_review_portal_type(parent.customer_type_label,parent.customer_type,parent.dealer_type)<>'dealer'
    then raise exception 'ACTIVE_AB_LAURIDSEN_REQUIRED'; end if;
  ctx:=public.fabric_partner_review_context('12041',parent.id);
  if (ctx->>'source_count')::integer<>1 or (ctx->>'portal_count')::integer<>0
    or approval.source_fingerprint is distinct from (ctx->>'source_fingerprint')
    or approval.portal_fingerprint is distinct from (ctx->>'portal_fingerprint') then raise exception 'PILOT_SOURCE_CHANGED_RELOAD'; end if;
  if exists(select 1 from public.dealer_accounts where btrim(account_number)='12041' or btrim(dealer_number)='12041'
    or lower(btrim(company_name))='je service') then raise exception 'PILOT_EXISTING_IDENTITY_REVIEW'; end if;
  select * into source from public.fabric_partner_master_shadow where company='DAT' and source_present and account_number='12041';
  if source.c5_blocked is distinct from 0 or source.c5_approved is distinct from 1
    or source.zipcity_validation='REVIEW_REQUIRED' or source.c5_invoice_account_number is distinct from '12040'
    or not exists(select 1 from public.fabric_partner_master_shadow where company='DAT' and source_present
      and account_number='12040' and c5_invoice_account_number='10295')
    or not exists(select 1 from public.fabric_partner_master_shadow where company='DAT' and source_present
      and account_number='10295' and c5_invoice_account_number is null)
    or (select count(*) from public.fabric_partner_review_invoice_chain where decision_id=approval.id)<>3
    or not exists(select 1 from public.fabric_partner_review_invoice_chain where decision_id=approval.id
      and ordinal=0 and account_number='12041' and invoice_account_number='12040')
    or not exists(select 1 from public.fabric_partner_review_invoice_chain where decision_id=approval.id
      and ordinal=1 and account_number='12040' and invoice_account_number='10295')
    or not exists(select 1 from public.fabric_partner_review_invoice_chain where decision_id=approval.id
      and ordinal=2 and account_number='10295' and invoice_account_number is null) then raise exception 'PILOT_C5_EVIDENCE_REQUIRED'; end if;
  if (select count(*) from public.fabric_partner_review_fields where decision_id=approval.id)<>6
    or exists(select 1 from public.fabric_partner_review_fields where decision_id=approval.id
      and (value_source<>'C5' or approved_value is distinct from (to_jsonb(source)->>field_name)))
    then raise exception 'PILOT_APPROVED_C5_FIELDS_REQUIRED'; end if;
  select jsonb_object_agg(field_name,approved_value) into values_approved from public.fabric_partner_review_fields where decision_id=approval.id;
  return jsonb_build_object('account_number','12041','approval_id',approval.id,'approval_version',approval.version,
    'source_fingerprint',ctx->>'source_fingerprint','portal_fingerprint',ctx->>'portal_fingerprint','snapshot_id',ctx->>'snapshot_id',
    'parent_dealer_id',parent.id,'parent_account_number',parent.account_number,'invoice_account_number','12040',
    'dealer_account',jsonb_build_object('account_number','12041','company_name',values_approved->'company_name',
      'address_line_1',values_approved->'address1','address_line_2',values_approved->'address2',
      'address',values_approved->'address1','postal_code',values_approved->'postal_code','city',values_approved->'city',
      'country',values_approved->'country','customer_type','Forhandlerkunde','customer_type_label','Forhandlerkunde',
      'dealer_type','dealer','source','fabric_c5_pilot','status','active','is_active',true,
      'is_main_account',false,'is_blocked',false,'is_deleted',false,'parent_account_number','10295',
      'billing_account_id',null,'assigned_seller_id',null,'assigned_seller_initials',null),
    'planned_rows',jsonb_build_object('dealer_accounts',1,'partner_account_relations',1,'partner_cooperation_events',1,'fabric_partner_import_pilots',1),
    'existing_rows_updated',0,'app_users_created',0,'invoice_accounts_created',0);
end $$;
revoke all on function public.fabric_partner_je_pilot_preview() from public,anon,service_role;
grant execute on function public.fabric_partner_je_pilot_preview() to authenticated;

create function public.fabric_partner_je_pilot_import(p_approval_id uuid,p_expected_source_fingerprint text,
  p_expected_portal_fingerprint text,p_request_id uuid,p_confirm boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; plan jsonb; prior public.fabric_partner_import_pilots%rowtype;
  account_id uuid; cooperation_id uuid; import_id uuid; request_hash text; fields jsonb;
begin
  if public.is_backend() is not true then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  select id into actor from public.app_users where auth.uid() is not null
    and (auth_user_id=auth.uid() or lower(email)=lower(nullif(auth.jwt()->>'email','')))
    and portal_role='timan_backend' and approved and is_active order by (auth_user_id=auth.uid()) desc nulls last,id limit 1;
  if actor is null then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  if p_confirm is distinct from true or p_request_id is null or p_approval_id is null or p_reason is null
    or length(btrim(p_reason))=0 or length(p_reason)>4000 then raise exception 'EXPLICIT_PILOT_APPROVAL_REQUIRED'; end if;
  if not pg_try_advisory_xact_lock(91732041) then raise exception 'SYNC_BUSY'; end if;
  request_hash:=md5(jsonb_build_array(actor,p_approval_id,p_expected_source_fingerprint,p_expected_portal_fingerprint,p_reason)::text);
  select * into prior from public.fabric_partner_import_pilots where request_id=p_request_id or (company='DAT' and account_number='12041');
  if found then
    if prior.request_fingerprint<>request_hash then raise exception 'PILOT_ALREADY_IMPORTED_OR_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('import_id',prior.id,'account_id',prior.account_id,'cooperation_event_id',prior.cooperation_event_id,'replayed',true);
  end if;
  plan:=public.fabric_partner_je_pilot_preview();
  if p_approval_id is distinct from (plan->>'approval_id')::uuid
    or p_expected_source_fingerprint is distinct from (plan->>'source_fingerprint')
    or p_expected_portal_fingerprint is distinct from (plan->>'portal_fingerprint') then raise exception 'PILOT_SOURCE_CHANGED_RELOAD'; end if;
  perform 1 from public.dealer_accounts where id=(plan->>'parent_dealer_id')::uuid for share;
  -- Revalidate after acquiring the parent lock; no caller-supplied profile values.
  if plan is distinct from public.fabric_partner_je_pilot_preview() then raise exception 'PILOT_SOURCE_CHANGED_RELOAD'; end if;
  fields:=plan->'dealer_account';
  insert into public.dealer_accounts(account_number,company_name,address_line_1,address_line_2,address,postal_code,city,country,
    customer_type,customer_type_label,dealer_type,source,status,is_active,is_main_account,is_blocked,is_deleted)
    values('12041',fields->>'company_name',fields->>'address_line_1',fields->>'address_line_2',fields->>'address',fields->>'postal_code',
      fields->>'city',fields->>'country','Forhandlerkunde','Forhandlerkunde','dealer','fabric_c5_pilot','active',true,false,false,false)
    returning id into account_id;
  -- Approval fingerprints were validated before creating the new account.
  -- The import audit links that frozen approval to the canonical cooperation event.
  cooperation_id:=public.partner_cooperation_change(account_id,0,'ACTIVATE',(plan->>'parent_dealer_id')::uuid,
    true,p_reason,p_request_id,null);
  insert into public.fabric_partner_import_pilots(company,account_number,account_id,approval_id,cooperation_event_id,
    snapshot_id,source_fingerprint,portal_fingerprint_before,original_invoice_account_number,imported_by,reason,request_id,request_fingerprint)
    values('DAT','12041',account_id,p_approval_id,cooperation_id,(plan->>'snapshot_id')::uuid,
      p_expected_source_fingerprint,p_expected_portal_fingerprint,'12040',actor,p_reason,p_request_id,request_hash) returning id into import_id;
  return jsonb_build_object('import_id',import_id,'account_id',account_id,'cooperation_event_id',cooperation_id,'replayed',false);
end $$;
revoke all on function public.fabric_partner_je_pilot_import(uuid,text,text,uuid,boolean,text) from public,anon,service_role;
grant execute on function public.fabric_partner_je_pilot_import(uuid,text,text,uuid,boolean,text) to authenticated;
