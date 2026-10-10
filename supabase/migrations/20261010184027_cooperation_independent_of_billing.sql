-- No account/relation is activated by this migration. Extend the existing audit,
-- not the C5/billing model. Existing customer-only RPCs remain compatible.
alter table public.partner_cooperation_events add column relation_type text not null default 'dealer_has_dealer_customer'
  check(relation_type in ('importer_has_dealer','importer_has_service_partner','importer_has_dealer_customer',
    'dealer_has_service_partner','dealer_has_dealer_customer','service_partner_has_dealer_customer','service_partner_has_dealer'));
alter table public.partner_cooperation_events add column previous_relation_type text
  check(previous_relation_type in ('importer_has_dealer','importer_has_service_partner','importer_has_dealer_customer',
    'dealer_has_service_partner','dealer_has_dealer_customer','service_partner_has_dealer_customer','service_partner_has_dealer'));

-- Approved edges are owned by the lifecycle even after END. Legacy, unaudited
-- non-customer edges retain their existing compatibility path and RLS.
create or replace function public.partner_cooperation_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare event public.partner_cooperation_events%rowtype; request text; protected boolean;
begin
  if TG_OP='TRUNCATE' then
    if exists(select 1 from public.partner_account_relations where relation_type='dealer_has_dealer_customer')
      or exists(select 1 from public.partner_cooperation_events) then raise exception 'COOPERATION_HISTORY_PRESERVED'; end if;
    return null;
  end if;
  if TG_TABLE_NAME='dealer_accounts' then
    if NEW.parent_account_number is not distinct from OLD.parent_account_number then return NEW; end if;
    if not exists(select 1 from public.partner_cooperation_events where customer_id=OLD.id)
      and not exists(select 1 from public.partner_account_relations where target_account_id=OLD.id and relation_type='dealer_has_dealer_customer')
      then return NEW; end if;
  else
    protected := case when TG_OP='INSERT' then NEW.relation_type='dealer_has_dealer_customer'
      or (NEW.relation_type<>'service_partner_has_dealer' and exists(select 1 from public.partner_cooperation_events
        where customer_id=NEW.target_account_id and relation_type<>'service_partner_has_dealer'))
      else OLD.relation_type='dealer_has_dealer_customer' or exists(select 1 from public.partner_cooperation_events
        where previous_relation_id=OLD.id or new_relation_id=OLD.id) end;
    if TG_OP='UPDATE' then protected:=protected or NEW.relation_type='dealer_has_dealer_customer'; end if;
    request:=current_setting('timan.cooperation_request',true);
    if not protected and coalesce(request,'')='' then
      if TG_OP='DELETE' then return OLD; else return NEW; end if;
    end if;
    if TG_OP='DELETE' then raise exception 'COOPERATION_HISTORY_PRESERVED'; end if;
  end if;
  request:=current_setting('timan.cooperation_request',true);
  if coalesce(request,'')='' or public.is_backend() is not true then raise exception 'COOPERATION_LIFECYCLE_REQUIRED'; end if;
  select * into event from public.partner_cooperation_events where request_id::text=request and transaction_id=pg_current_xact_id();
  if not found then raise exception 'COOPERATION_LIFECYCLE_REQUIRED'; end if;
  if TG_TABLE_NAME='dealer_accounts' then
    if event.customer_id<>OLD.id or event.previous_parent_account_number is distinct from OLD.parent_account_number
      or event.new_parent_account_number is distinct from NEW.parent_account_number then raise exception 'COOPERATION_SCOPE_MISMATCH'; end if;
  else
    if TG_OP='UPDATE' and (NEW.source_account_id<>OLD.source_account_id or NEW.target_account_id<>OLD.target_account_id
      or NEW.relation_type<>OLD.relation_type) then raise exception 'COOPERATION_HISTORY_PRESERVED'; end if;
    if NEW.target_account_id<>event.customer_id or (
      (event.previous_relation_id=NEW.id and not NEW.active and NEW.source_account_id=event.previous_dealer_id
        and NEW.relation_type=coalesce(event.previous_relation_type,event.relation_type))
      or (event.new_relation_id=NEW.id and NEW.active and NEW.source_account_id=event.new_dealer_id
        and NEW.relation_type=event.relation_type)) is not true then raise exception 'COOPERATION_SCOPE_MISMATCH'; end if;
    -- Only hierarchy edges participate in ancestor checks. The canonical
    -- service_partner_has_dealer is a separate many-to-many service access edge.
    if NEW.active and NEW.relation_type<>'service_partner_has_dealer' and exists(
      with recursive edges as (
        select source_account_id s,target_account_id t from public.partner_account_relations
          where active and relation_type<>'service_partner_has_dealer' and id<>NEW.id
            and id is distinct from event.previous_relation_id
        union select p.id,c.id from public.dealer_accounts c join public.dealer_accounts p
          on p.account_number=c.parent_account_number where c.id<>event.customer_id
      ), descendants(id) as (
        select NEW.target_account_id union select e.t from edges e join descendants d on e.s=d.id
      ) select 1 from descendants where id=NEW.source_account_id
    ) then raise exception 'COOPERATION_CYCLE'; end if;
  end if;
  return NEW;
end $$;
revoke all on function public.partner_cooperation_guard() from public,anon,authenticated,service_role;

create function public.partner_cooperation_change_typed(p_customer_id uuid,p_expected_version integer,p_action text,
  p_new_dealer_id uuid,p_confirm_new_relation boolean,p_reason text,p_request_id uuid,p_relation_type text,
  p_previous_relation_id uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; prior public.partner_cooperation_events%rowtype; child public.dealer_accounts%rowtype;
  parent public.dealer_accounts%rowtype; old_relation public.partner_account_relations%rowtype;
  new_relation public.partner_account_relations%rowtype; version_now integer; event_id uuid; request_hash text;
  new_parent text; ctx jsonb; source_kind text; target_kind text; existing_count integer;
begin
  if public.is_backend() is not true then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  select id into actor from public.app_users where auth.uid() is not null
    and (auth_user_id=auth.uid() or lower(email)=lower(nullif(auth.jwt()->>'email','')))
    and portal_role='timan_backend' and approved and is_active order by (auth_user_id=auth.uid()) desc nulls last,id limit 1;
  if actor is null then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  if p_customer_id is null or p_request_id is null or p_expected_version is null or p_expected_version<0
    or p_action is null or p_action not in ('ACTIVATE','END','SWITCH') or p_reason is null
    or length(btrim(p_reason))=0 or length(p_reason)>4000 then raise exception 'INVALID_COOPERATION_CHANGE'; end if;
  if p_relation_type is null or p_relation_type not in ('importer_has_dealer','importer_has_service_partner',
    'importer_has_dealer_customer','dealer_has_service_partner','dealer_has_dealer_customer',
    'service_partner_has_dealer_customer','service_partner_has_dealer') then raise exception 'INVALID_RELATION_TYPE'; end if;
  if not pg_try_advisory_xact_lock(91732041) then raise exception 'SYNC_BUSY'; end if;
  perform pg_advisory_xact_lock(hashtextextended('partner-cooperation:'||p_customer_id::text,0));
  request_hash:=md5(jsonb_build_array(actor,p_customer_id,p_expected_version,p_action,p_new_dealer_id,
    p_confirm_new_relation,p_reason,p_relation_type,p_previous_relation_id)::text);
  select * into prior from public.partner_cooperation_events where request_id=p_request_id;
  if found then
    if prior.request_fingerprint<>request_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return prior.id;
  end if;
  select coalesce(max(version),0) into version_now from public.partner_cooperation_events where customer_id=p_customer_id;
  if version_now<>p_expected_version then raise exception 'COOPERATION_VERSION_CONFLICT'; end if;
  select * into child from public.dealer_accounts where id=p_customer_id for update;
  if not found then raise exception 'VALID_PARTNERS_REQUIRED'; end if;
  -- Main-parent edges share one set; the separate service-network edge is many-to-many.
  if p_relation_type='service_partner_has_dealer' then
    if p_previous_relation_id is not null then
      select * into old_relation from public.partner_account_relations where id=p_previous_relation_id and active
        and target_account_id=child.id and relation_type='service_partner_has_dealer' for update;
    else
      select * into old_relation from public.partner_account_relations where active and target_account_id=child.id
        and source_account_id=p_new_dealer_id and relation_type=p_relation_type for update;
    end if;
  else
    select count(*) into existing_count from public.partner_account_relations where active
      and target_account_id=child.id and relation_type<>'service_partner_has_dealer';
    if existing_count>1 then raise exception 'COOPERATION_REVIEW_REQUIRED'; end if;
    select * into old_relation from public.partner_account_relations where active
      and target_account_id=child.id and relation_type<>'service_partner_has_dealer' for update;
  end if;
  if (p_action='ACTIVATE' and (old_relation.id is not null or p_previous_relation_id is not null))
    or (p_action in ('END','SWITCH') and (old_relation.id is null or p_previous_relation_id is distinct from old_relation.id))
    then raise exception 'COOPERATION_STATE_CONFLICT'; end if;
  if p_action='END' then
    if p_new_dealer_id is not null or p_relation_type is distinct from old_relation.relation_type then raise exception 'INVALID_COOPERATION_CHANGE'; end if;
  else
    if p_confirm_new_relation is distinct from true then raise exception 'EXPLICIT_RELATION_APPROVAL_REQUIRED'; end if;
    select * into parent from public.dealer_accounts where id=p_new_dealer_id for share;
    if not found or parent.id=child.id or not coalesce(parent.is_active,true) or coalesce(parent.is_deleted,false) or coalesce(parent.is_blocked,false)
      or not coalesce(child.is_active,true) or coalesce(child.is_deleted,false) or coalesce(child.is_blocked,false)
      then raise exception 'VALID_PARTNERS_REQUIRED'; end if;
    source_kind:=public.partner_account_kind(parent.id); target_kind:=public.partner_account_kind(child.id);
    if p_relation_type is distinct from source_kind||'_has_'||target_kind then raise exception 'INVALID_RELATION_TYPE'; end if;
    if old_relation.source_account_id=parent.id and old_relation.relation_type=p_relation_type then raise exception 'COOPERATION_SAME_PARTNER'; end if;
    select * into new_relation from public.partner_account_relations where source_account_id=parent.id
      and target_account_id=child.id and relation_type=p_relation_type for update;
    if new_relation.id is null then new_relation.id:=gen_random_uuid(); end if;
  end if;
  -- Retain the established customer-only access pointer. This is never a billing
  -- pointer. Servicepartner/importer/dealer cooperation never changes account rows.
  new_parent:=child.parent_account_number;
  if public.partner_account_kind(child.id)='dealer_customer' then
    if old_relation.id is not null and child.parent_account_number is not null
      and child.parent_account_number is distinct from (select account_number from public.dealer_accounts where id=old_relation.source_account_id)
      then raise exception 'LEGACY_PARENT_CONFLICT'; end if;
    if p_action='ACTIVATE' and child.parent_account_number is not null and child.parent_account_number is distinct from parent.account_number
      then raise exception 'LEGACY_PARENT_CONFLICT'; end if;
    new_parent:=case when p_action='END' then null else parent.account_number end;
  end if;
  ctx:=public.fabric_partner_review_context(child.account_number);
  insert into public.partner_cooperation_events(customer_id,version,action,previous_relation_id,new_relation_id,
    previous_dealer_id,new_dealer_id,previous_parent_account_number,new_parent_account_number,reviewed_by,reason,
    source_snapshot_id,source_fingerprint,original_invoice_account_number,request_id,request_fingerprint,
    relation_type,previous_relation_type,previous_relation_origin)
    values(child.id,version_now+1,p_action,old_relation.id,new_relation.id,old_relation.source_account_id,parent.id,
      child.parent_account_number,new_parent,actor,p_reason,(ctx->>'snapshot_id')::uuid,ctx->>'source_fingerprint',
      (select c5_invoice_account_number from public.fabric_partner_master_shadow where company='DAT' and source_present
        and account_number=child.account_number order by source_row_number limit 1),p_request_id,request_hash,
      p_relation_type,old_relation.relation_type,'CANONICAL_LIFECYCLE') returning id into event_id;
  perform set_config('timan.cooperation_request',p_request_id::text,true);
  if old_relation.id is not null then
    update public.partner_account_relations set active=false,ended_at=now(),ended_by=actor,end_reason=p_reason where id=old_relation.id;
  end if;
  if p_action<>'END' then
    insert into public.partner_account_relations(id,source_account_id,target_account_id,relation_type,active)
      values(new_relation.id,parent.id,child.id,p_relation_type,true)
      on conflict(source_account_id,target_account_id,relation_type) do update set active=true,ended_at=null,ended_by=null,end_reason=null;
  end if;
  if new_parent is distinct from child.parent_account_number then
    update public.dealer_accounts set parent_account_number=new_parent where id=child.id;
  end if;
  perform set_config('timan.cooperation_request','',true);
  return event_id;
end $$;
revoke all on function public.partner_cooperation_change_typed(uuid,integer,text,uuid,boolean,text,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.partner_cooperation_change_typed(uuid,integer,text,uuid,boolean,text,uuid,text,uuid) to authenticated;

create or replace function public.partner_cooperation_history(p_customer_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare account text; source_count integer; invoice text;
begin
  if public.is_backend() is not true then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  select account_number into account from public.dealer_accounts where id=p_customer_id;
  select count(*),min(c5_invoice_account_number) into source_count,invoice from public.fabric_partner_master_shadow
    where company='DAT' and source_present and account_number=account;
  return jsonb_build_object('version',(select coalesce(max(version),0) from public.partner_cooperation_events where customer_id=p_customer_id),
    'billing',jsonb_build_object('source_count',source_count,'invoice_account',invoice),
    'events',coalesce((select jsonb_agg(to_jsonb(e)-array['request_id','request_fingerprint','transaction_id']
      || jsonb_build_object('reviewer_name',u.full_name) order by e.version desc)
      from public.partner_cooperation_events e join public.app_users u on u.id=e.reviewed_by where customer_id=p_customer_id),'[]'::jsonb));
end $$;
revoke all on function public.partner_cooperation_history(uuid) from public,anon,service_role;
grant execute on function public.partner_cooperation_history(uuid) to authenticated;
create or replace function public.fabric_partner_review_effective(p_account text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare approval public.fabric_partner_review_decisions%rowtype; portal public.dealer_accounts%rowtype;
  source public.fabric_partner_master_shadow%rowtype; cooperation public.partner_cooperation_events%rowtype;
  values_portal jsonb; ctx jsonb;
begin
  select * into approval from public.fabric_partner_review_decisions where id=public.fabric_partner_review_active(p_account);
  select * into portal from public.dealer_accounts where btrim(account_number)=p_account order by id limit 1;
  select * into source from public.fabric_partner_master_shadow where company='DAT' and source_present
    and account_number=p_account order by source_row_number limit 1;
  select * into cooperation from public.partner_cooperation_events where customer_id=portal.id and relation_type<>'service_partner_has_dealer' order by version desc limit 1;
  ctx:=public.fabric_partner_review_context(p_account,approval.parent_dealer_id);
  values_portal:=jsonb_build_object('company_name',portal.company_name,'address1',coalesce(portal.address_line_1,portal.address),
    'address2',portal.address_line_2,'postal_code',portal.postal_code,'city',portal.city,'country',portal.country);
  return jsonb_build_object('approval_id',approval.id,'approval_active',approval.id is not null,
    'partner_type',case when approval.id is not null then approval.proposed_partner_type when portal.id is not null
      then public.fabric_partner_review_portal_type(portal.customer_type_label,portal.customer_type,portal.dealer_type)
      else case upper(btrim(source.c5_partner_type_code)) when '1' then 'dealer' when 'A' then 'dealer'
        when '2' then 'service_partner' when 'B' then 'service_partner' when '3' then 'importer' when 'C' then 'importer'
        when '5' then 'dealer_customer' when 'E' then 'dealer_customer' end end,
    'parent_dealer_id',case when cooperation.id is not null then cooperation.new_dealer_id
      when approval.id is not null then approval.parent_dealer_id else (
      select (array_agg(r.source_account_id))[1] from public.partner_account_relations r where r.target_account_id=portal.id and r.active
        and r.relation_type<>'service_partner_has_dealer' having count(*)=1) end,
    'cooperation_event_id',cooperation.id,
    'needs_recheck',(approval.id is not null and (approval.source_fingerprint is distinct from (ctx->>'source_fingerprint')
      or public.fabric_partner_review_portal_baseline(approval.id) is distinct from (ctx->>'portal_fingerprint') or (ctx->>'source_count')::integer<>1))
      or (cooperation.id is not null and cooperation.source_fingerprint is distinct from (ctx->>'source_fingerprint')),
    'fields',(select jsonb_object_agg(field,case when f.decision_id is not null then to_jsonb(f.approved_value)
      when portal.id is not null then values_portal->field else to_jsonb(source)->field end)
      from unnest(array['company_name','address1','address2','postal_code','city','country']) field
      left join public.fabric_partner_review_fields f on f.decision_id=approval.id and f.field_name=field));
end $$;
