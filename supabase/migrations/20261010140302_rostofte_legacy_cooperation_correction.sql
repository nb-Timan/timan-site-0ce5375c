-- No existing rows/access change. Only an explicitly approved Backend call can switch the observed legacy pointer.
alter table public.partner_cooperation_events add column previous_relation_origin text
  check(previous_relation_origin in ('OBSERVED_LEGACY_POINTER','CANONICAL_LIFECYCLE'));
create or replace function public.partner_cooperation_change(p_customer_id uuid,p_expected_version integer,p_action text,
  p_new_dealer_id uuid,p_confirm_new_relation boolean,p_reason text,p_request_id uuid,p_review_decision_id uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; prior public.partner_cooperation_events%rowtype; child public.dealer_accounts%rowtype;
  old_relation public.partner_account_relations%rowtype; new_relation public.partner_account_relations%rowtype;
  parent public.dealer_accounts%rowtype; old_parent text; new_parent text; version_now integer; event_id uuid; request_hash text;
  approval public.fabric_partner_review_decisions%rowtype; ctx jsonb; legacy boolean:=false; legacy_dealer uuid;
begin
  if not public.is_backend() then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  select id into actor from public.app_users where auth.uid() is not null
    and (auth_user_id=auth.uid() or lower(email)=lower(nullif(auth.jwt()->>'email','')))
    and portal_role='timan_backend' and approved and is_active order by (auth_user_id=auth.uid()) desc nulls last,id limit 1;
  if actor is null then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  if p_customer_id is null or p_request_id is null or p_expected_version is null or p_expected_version<0
    or p_action is null or p_action not in ('ACTIVATE','END','SWITCH') or p_reason is null
    or length(btrim(p_reason))=0 or length(p_reason)>4000 then raise exception 'INVALID_COOPERATION_CHANGE'; end if;
  if not pg_try_advisory_xact_lock(91732041) then raise exception 'SYNC_BUSY'; end if;
  request_hash:=md5(jsonb_build_array(actor,p_customer_id,p_expected_version,p_action,p_new_dealer_id,p_confirm_new_relation,p_reason,p_review_decision_id)::text);
  perform pg_advisory_xact_lock(hashtextextended('partner-cooperation:'||p_customer_id::text,0));
  select * into prior from public.partner_cooperation_events where request_id=p_request_id;
  if found then
    if prior.request_fingerprint<>request_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return prior.id;
  end if;
  select coalesce(max(version),0) into version_now from public.partner_cooperation_events where customer_id=p_customer_id;
  if version_now<>p_expected_version then raise exception 'COOPERATION_VERSION_CONFLICT'; end if;
  select * into child from public.dealer_accounts where id=p_customer_id for update;
  if not found or public.fabric_partner_review_portal_type(child.customer_type_label,child.customer_type,child.dealer_type)<>'dealer_customer'
    then raise exception 'DEALER_CUSTOMER_REQUIRED'; end if;
  ctx:=public.fabric_partner_review_context(child.account_number);
  if p_action<>'END' and (not coalesce(child.is_active,true) or coalesce(child.is_deleted,false) or coalesce(child.is_blocked,false))
    then raise exception 'ACTIVE_CUSTOMER_REQUIRED'; end if;
  if (select count(*) from public.partner_account_relations where target_account_id=child.id and relation_type='dealer_has_dealer_customer' and active)>1
    then raise exception 'COOPERATION_REVIEW_REQUIRED'; end if;
  select * into old_relation from public.partner_account_relations where target_account_id=child.id
    and relation_type='dealer_has_dealer_customer' and active for update;
  legacy:=p_action='SWITCH' and old_relation.id is null and version_now=0
    and child.account_number='10363' and child.parent_account_number='10138'
    and p_review_decision_id is not null
    and not exists(select 1 from public.partner_account_relations where target_account_id=child.id and relation_type='dealer_has_dealer_customer');
  if legacy then
    select id into legacy_dealer from public.dealer_accounts where account_number='10138';
    if legacy_dealer is null or (select count(*) from public.dealer_accounts where account_number='10138')<>1
      or (select account_number from public.dealer_accounts where id=p_new_dealer_id) is distinct from '10295'
      then raise exception 'LEGACY_PARENT_CONFLICT'; end if;
  end if;
  if (p_action='ACTIVATE' and old_relation.id is not null) or (p_action in ('END','SWITCH') and old_relation.id is null and not legacy)
    then raise exception 'COOPERATION_STATE_CONFLICT'; end if;
  if old_relation.id is not null then
    select account_number into old_parent from public.dealer_accounts where id=old_relation.source_account_id;
    if child.parent_account_number is not null and child.parent_account_number<>old_parent then raise exception 'LEGACY_PARENT_CONFLICT'; end if;
  end if;
  if p_action='END' then
    if p_new_dealer_id is not null or p_review_decision_id is not null then raise exception 'INVALID_COOPERATION_CHANGE'; end if;
    new_parent:=null;
  else
    if p_confirm_new_relation is distinct from true then raise exception 'EXPLICIT_RELATION_APPROVAL_REQUIRED'; end if;
    select * into parent from public.dealer_accounts where id=p_new_dealer_id for share;
    if not found or parent.id=child.id or public.fabric_partner_review_portal_type(parent.customer_type_label,parent.customer_type,parent.dealer_type)<>'dealer'
      or not coalesce(parent.is_active,true) or coalesce(parent.is_deleted,false) or coalesce(parent.is_blocked,false)
      then raise exception 'VALID_DEALER_REQUIRED'; end if;
    if old_relation.source_account_id=parent.id then raise exception 'COOPERATION_SAME_DEALER'; end if;
    if p_action='ACTIVATE' and child.parent_account_number is not null and child.parent_account_number<>parent.account_number
      then raise exception 'LEGACY_PARENT_CONFLICT'; end if;
    if p_review_decision_id is not null then
      if not pg_try_advisory_xact_lock(91732041) then raise exception 'SYNC_BUSY'; end if;
      select * into approval from public.fabric_partner_review_decisions where id=p_review_decision_id;
      ctx:=public.fabric_partner_review_context(child.account_number,parent.id);
      if approval.id is null or public.fabric_partner_review_active(child.account_number) is distinct from approval.id
        or approval.account_number<>child.account_number or approval.proposed_partner_type<>'dealer_customer' or approval.parent_dealer_id<>parent.id
        or approval.source_fingerprint is distinct from (ctx->>'source_fingerprint')
        or approval.portal_fingerprint is distinct from (ctx->>'portal_fingerprint') then raise exception 'CURRENT_RELATION_APPROVAL_REQUIRED'; end if;
    end if;
    new_parent:=parent.account_number;
    select * into new_relation from public.partner_account_relations where source_account_id=parent.id and target_account_id=child.id
      and relation_type='dealer_has_dealer_customer' for update;
    if new_relation.id is null then new_relation.id:=gen_random_uuid(); end if;
  end if;
  insert into public.partner_cooperation_events(customer_id,version,action,previous_relation_id,new_relation_id,
    previous_dealer_id,new_dealer_id,previous_parent_account_number,new_parent_account_number,reviewed_by,reason,
    review_decision_id,source_snapshot_id,source_fingerprint,original_invoice_account_number,request_id,request_fingerprint,previous_relation_origin)
    values(child.id,version_now+1,p_action,old_relation.id,new_relation.id,coalesce(old_relation.source_account_id,legacy_dealer),parent.id,
      child.parent_account_number,new_parent,actor,p_reason,p_review_decision_id,(ctx->>'snapshot_id')::uuid,ctx->>'source_fingerprint',
      (select c5_invoice_account_number from public.fabric_partner_master_shadow where company='DAT' and source_present
        and account_number=child.account_number order by source_row_number limit 1),p_request_id,request_hash,case when legacy then 'OBSERVED_LEGACY_POINTER' else 'CANONICAL_LIFECYCLE' end) returning id into event_id;
  perform set_config('timan.cooperation_request',p_request_id::text,true);
  if old_relation.id is not null then
    update public.partner_account_relations set active=false,ended_at=now(),ended_by=actor,end_reason=p_reason where id=old_relation.id;
  end if;
  if p_action<>'END' then
    insert into public.partner_account_relations(id,source_account_id,target_account_id,relation_type,active)
      values(new_relation.id,parent.id,child.id,'dealer_has_dealer_customer',true)
      on conflict(source_account_id,target_account_id,relation_type) do update set active=true,ended_at=null,ended_by=null,end_reason=null;
  end if;
  -- Existing RLS/scope consumers use this pointer. Historical CRM/order rows are never changed.
  update public.dealer_accounts set parent_account_number=new_parent where id=child.id;
  perform set_config('timan.cooperation_request','',true);
  return event_id;
end $$;
revoke all on function public.partner_cooperation_change(uuid,integer,text,uuid,boolean,text,uuid,uuid) from public,anon,service_role;
grant execute on function public.partner_cooperation_change(uuid,integer,text,uuid,boolean,text,uuid,uuid) to authenticated;


create function public.partner_cooperation_rostofte_preview()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare child public.dealer_accounts%rowtype; parent public.dealer_accounts%rowtype;
  previous public.dealer_accounts%rowtype; ctx jsonb; parent_ctx jsonb;
begin
  if public.is_backend() is not true then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  select * into child from public.dealer_accounts where account_number='10363';
  select * into parent from public.dealer_accounts where account_number='10295';
  select * into previous from public.dealer_accounts where account_number='10138';
  ctx:=public.fabric_partner_review_context('10363');
  parent_ctx:=public.fabric_partner_review_context('10363',parent.id);
  if (ctx->>'portal_count')::integer<>1 or (ctx->>'source_count')::integer<>1
    or (select count(*) from public.dealer_accounts where account_number='10295')<>1
    or (select count(*) from public.dealer_accounts where account_number='10138')<>1
    or child.parent_account_number is distinct from '10138'
    or public.fabric_partner_review_portal_type(child.customer_type_label,child.customer_type,child.dealer_type) is distinct from 'dealer_customer'
    or public.fabric_partner_review_portal_type(parent.customer_type_label,parent.customer_type,parent.dealer_type) is distinct from 'dealer'
    or not coalesce(child.is_active,true) or coalesce(child.is_deleted,false) or coalesce(child.is_blocked,false)
    or not coalesce(parent.is_active,true) or coalesce(parent.is_deleted,false) or coalesce(parent.is_blocked,false)
    or exists(select 1 from public.fabric_partner_review_decisions where account_number='10363')
    or exists(select 1 from public.partner_cooperation_events where customer_id=child.id)
    or exists(select 1 from public.partner_account_relations where target_account_id=child.id and relation_type='dealer_has_dealer_customer')
    or not exists(select 1 from public.fabric_partner_master_shadow where company='DAT' and account_number='10363'
      and source_present and c5_partner_type_code in ('5','E') and c5_invoice_account_number='10295')
    then raise exception 'LEGACY_CORRECTION_REVIEW_REQUIRED'; end if;
  return jsonb_build_object('customer_id',child.id,'account_number','10363','previous_dealer_id',previous.id,
    'previous_parent_account_number','10138','new_dealer_id',parent.id,'new_parent_account_number','10295',
    'previous_relation_origin','OBSERVED_LEGACY_POINTER','source_fingerprint',ctx->>'source_fingerprint',
    'portal_fingerprint',ctx->>'portal_fingerprint','parent_portal_fingerprint',parent_ctx->>'portal_fingerprint',
    'saved_approval_exists',false,'explicit_production_approval_required',true,
    'planned_rows',jsonb_build_object('new_dealer_accounts',0,'updated_parent_pointer',1,'new_relations',1,
      'cooperation_events',1,'review_decisions',1,'review_fields',6,
      'review_invoice_chain',(select count(*) from public.fabric_partner_master_shadow where company='DAT' and source_present and account_number in ('10363','10295'))),
    'preserved_seller',child.assigned_seller_initials);
end $$;
revoke all on function public.partner_cooperation_rostofte_preview() from public,anon,service_role;
grant execute on function public.partner_cooperation_rostofte_preview() to authenticated;

create function public.partner_cooperation_rostofte_switch(p_expected_source text,p_expected_portal text,
  p_expected_parent_portal text,p_reason text,p_request_id uuid,p_confirm boolean)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare plan jsonb; approval_id uuid; parent_id uuid; customer_id uuid; event_id uuid;
begin
  if public.is_backend() is not true then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  if p_confirm is distinct from true then raise exception 'EXPLICIT_RELATION_APPROVAL_REQUIRED'; end if;
  if p_reason is null or length(btrim(p_reason))=0 or length(p_reason)>4000 or p_request_id is null
    then raise exception 'INVALID_COOPERATION_CHANGE'; end if;
  if not pg_try_advisory_xact_lock(91732041) then raise exception 'SYNC_BUSY'; end if;
  if not exists(select 1 from public.partner_cooperation_events where request_id=p_request_id) then
    plan:=public.partner_cooperation_rostofte_preview();
    if plan->>'source_fingerprint' is distinct from p_expected_source
      or plan->>'portal_fingerprint' is distinct from p_expected_portal
      or plan->>'parent_portal_fingerprint' is distinct from p_expected_parent_portal
      then raise exception 'SOURCE_CHANGED_RELOAD'; end if;
  end if;
  select id into parent_id from public.dealer_accounts where account_number='10295';
  select id into customer_id from public.dealer_accounts where account_number='10363';
  -- Save approval and canonical SWITCH in one transaction; any failure rolls both back.
  approval_id:=public.fabric_partner_review_save('10363',0,p_expected_source,p_expected_portal,p_request_id,
    'APPROVED','dealer_customer',parent_id,p_reason,
    '{"company_name":"PORTAL","address1":"PORTAL","address2":"PORTAL","postal_code":"PORTAL","city":"PORTAL","country":"PORTAL"}'::jsonb);
  if (select portal_fingerprint from public.fabric_partner_review_decisions where id=approval_id)
    is distinct from p_expected_parent_portal then raise exception 'SOURCE_CHANGED_RELOAD'; end if;
  event_id:=public.partner_cooperation_change(customer_id,0,'SWITCH',parent_id,true,p_reason,p_request_id,approval_id);
  if not exists(select 1 from public.fabric_partner_review_materializations where decision_id=approval_id) then
    insert into public.fabric_partner_review_materializations(decision_id,cooperation_event_id,source_fingerprint,
      portal_fingerprint_after,reason) values(approval_id,event_id,p_expected_source,
      public.fabric_partner_review_context('10363',parent_id)->>'portal_fingerprint',
      'Explicit Backend approval materialized by atomic legacy cooperation switch.');
  end if;
  return event_id;
end $$;
revoke all on function public.partner_cooperation_rostofte_switch(text,text,text,text,uuid,boolean) from public,anon,service_role;
grant execute on function public.partner_cooperation_rostofte_switch(text,text,text,text,uuid,boolean) to authenticated;
