-- No import/backfill/cutover. Existing relations are unchanged.
alter table public.partner_account_relations add column ended_at timestamptz;
alter table public.partner_account_relations add column ended_by uuid references public.app_users(id);
alter table public.partner_account_relations add column end_reason text;

create table public.partner_cooperation_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.dealer_accounts(id),
  version integer not null check(version>0),
  action text not null check(action in ('ACTIVATE','END','SWITCH')),
  previous_relation_id uuid references public.partner_account_relations(id),
  new_relation_id uuid references public.partner_account_relations(id) deferrable initially deferred,
  previous_dealer_id uuid references public.dealer_accounts(id),
  new_dealer_id uuid references public.dealer_accounts(id),
  previous_parent_account_number text,
  new_parent_account_number text,
  reviewed_by uuid not null references public.app_users(id),
  reason text not null check(length(btrim(reason))>0 and length(reason)<=4000),
  review_decision_id uuid references public.fabric_partner_review_decisions(id),
  source_snapshot_id uuid references public.fabric_partner_shadow_runs(snapshot_id),
  source_fingerprint text,
  original_invoice_account_number text,
  created_at timestamptz not null default now(),
  transaction_id xid8 not null default pg_current_xact_id(),
  request_id uuid not null unique,
  request_fingerprint text not null,
  unique(customer_id,version)
);
create index partner_cooperation_previous_relation_idx on public.partner_cooperation_events(previous_relation_id);
create index partner_cooperation_new_relation_idx on public.partner_cooperation_events(new_relation_id);
create index partner_cooperation_previous_dealer_idx on public.partner_cooperation_events(previous_dealer_id);
create index partner_cooperation_new_dealer_idx on public.partner_cooperation_events(new_dealer_id);
create index partner_cooperation_actor_idx on public.partner_cooperation_events(reviewed_by);
create index partner_cooperation_review_idx on public.partner_cooperation_events(review_decision_id);
create index partner_cooperation_snapshot_idx on public.partner_cooperation_events(source_snapshot_id);
create index partner_relation_ended_by_idx on public.partner_account_relations(ended_by);
alter table public.partner_cooperation_events enable row level security;
revoke all on public.partner_cooperation_events from public,anon,authenticated,service_role;

create function public.partner_cooperation_immutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'COOPERATION_AUDIT_IMMUTABLE'; end $$;
revoke all on function public.partner_cooperation_immutable() from public,anon,authenticated,service_role;
create trigger partner_cooperation_events_immutable before update or delete or truncate
  on public.partner_cooperation_events for each statement execute function public.partner_cooperation_immutable();

-- A same-transaction audit event is the capability issued by the gated RPC.
-- A client cannot manufacture it, and replaying a previous event cannot mutate data.
create function public.partner_cooperation_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare event public.partner_cooperation_events%rowtype; request text;
begin
  if TG_OP='TRUNCATE' then
    if exists(select 1 from public.partner_account_relations where relation_type='dealer_has_dealer_customer') then
      raise exception 'COOPERATION_HISTORY_PRESERVED';
    end if;
    return null;
  end if;
  if TG_TABLE_NAME='dealer_accounts' then
    if NEW.parent_account_number is not distinct from OLD.parent_account_number then return NEW; end if;
    if not exists(select 1 from public.partner_cooperation_events where customer_id=OLD.id)
      and not exists(select 1 from public.partner_account_relations where target_account_id=OLD.id and relation_type='dealer_has_dealer_customer')
      then return NEW; end if;
  else
    if TG_OP='INSERT' and NEW.relation_type<>'dealer_has_dealer_customer' then return NEW; end if;
    if TG_OP='DELETE' then
      if OLD.relation_type='dealer_has_dealer_customer' then raise exception 'COOPERATION_HISTORY_PRESERVED'; end if;
      return OLD;
    end if;
    if TG_OP='UPDATE' and OLD.relation_type<>'dealer_has_dealer_customer' and NEW.relation_type<>'dealer_has_dealer_customer' then return NEW; end if;
  end if;
  request:=current_setting('timan.cooperation_request',true);
  if request is null or request='' or public.is_backend() is not true then raise exception 'COOPERATION_LIFECYCLE_REQUIRED'; end if;
  select * into event from public.partner_cooperation_events where request_id::text=request and transaction_id=pg_current_xact_id();
  if not found then raise exception 'COOPERATION_LIFECYCLE_REQUIRED'; end if;
  if TG_TABLE_NAME='dealer_accounts' then
    if event.customer_id<>OLD.id or event.previous_parent_account_number is distinct from OLD.parent_account_number
      or event.new_parent_account_number is distinct from NEW.parent_account_number then raise exception 'COOPERATION_SCOPE_MISMATCH'; end if;
  else
    if TG_OP='UPDATE' and (NEW.source_account_id<>OLD.source_account_id or NEW.target_account_id<>OLD.target_account_id
      or NEW.relation_type<>OLD.relation_type) then raise exception 'COOPERATION_HISTORY_PRESERVED'; end if;
    if NEW.relation_type<>'dealer_has_dealer_customer' or NEW.target_account_id<>event.customer_id
      or ((event.previous_relation_id=NEW.id and not NEW.active and NEW.source_account_id=event.previous_dealer_id)
        or (event.new_relation_id=NEW.id and NEW.active and NEW.source_account_id=event.new_dealer_id)) is not true then
      raise exception 'COOPERATION_SCOPE_MISMATCH';
    end if;
  end if;
  return NEW;
end $$;
revoke all on function public.partner_cooperation_guard() from public,anon,authenticated,service_role;
create trigger partner_cooperation_guard before insert or update or delete on public.partner_account_relations
  for each row execute function public.partner_cooperation_guard();
create trigger partner_cooperation_guard_truncate before truncate on public.partner_account_relations
  for each statement execute function public.partner_cooperation_guard();
create trigger partner_cooperation_guard_parent before update of parent_account_number on public.dealer_accounts
  for each row execute function public.partner_cooperation_guard();

create function public.partner_cooperation_change(p_customer_id uuid,p_expected_version integer,p_action text,
  p_new_dealer_id uuid,p_confirm_new_relation boolean,p_reason text,p_request_id uuid,p_review_decision_id uuid default null)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; prior public.partner_cooperation_events%rowtype; child public.dealer_accounts%rowtype;
  old_relation public.partner_account_relations%rowtype; new_relation public.partner_account_relations%rowtype;
  parent public.dealer_accounts%rowtype; old_parent text; new_parent text; version_now integer; event_id uuid; request_hash text;
  approval public.fabric_partner_review_decisions%rowtype; ctx jsonb;
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
  if (p_action='ACTIVATE' and old_relation.id is not null) or (p_action in ('END','SWITCH') and old_relation.id is null)
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
    review_decision_id,source_snapshot_id,source_fingerprint,original_invoice_account_number,request_id,request_fingerprint)
    values(child.id,version_now+1,p_action,old_relation.id,new_relation.id,old_relation.source_account_id,parent.id,
      child.parent_account_number,new_parent,actor,p_reason,p_review_decision_id,(ctx->>'snapshot_id')::uuid,ctx->>'source_fingerprint',
      (select c5_invoice_account_number from public.fabric_partner_master_shadow where company='DAT' and source_present
        and account_number=child.account_number order by source_row_number limit 1),p_request_id,request_hash) returning id into event_id;
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

create function public.partner_cooperation_history(p_customer_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_backend() then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  return jsonb_build_object('version',(select coalesce(max(version),0) from public.partner_cooperation_events where customer_id=p_customer_id),
    'events',coalesce((select jsonb_agg(to_jsonb(e)-array['request_id','request_fingerprint','transaction_id']
      || jsonb_build_object('reviewer_name',u.full_name) order by e.version desc)
      from public.partner_cooperation_events e join public.app_users u on u.id=e.reviewed_by where customer_id=p_customer_id),'[]'::jsonb));
end $$;
revoke all on function public.partner_cooperation_history(uuid) from public,anon,service_role;
grant execute on function public.partner_cooperation_history(uuid) to authenticated;

-- Operational cooperation decisions supersede earlier proposed relations only;
-- approved profile fields and their original C5 evidence remain untouched.
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
  select * into cooperation from public.partner_cooperation_events where customer_id=portal.id order by version desc limit 1;
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
        and r.relation_type='dealer_has_dealer_customer' having count(*)=1) end,
    'cooperation_event_id',cooperation.id,
    'needs_recheck',(approval.id is not null and (approval.source_fingerprint is distinct from (ctx->>'source_fingerprint')
      or approval.portal_fingerprint is distinct from (ctx->>'portal_fingerprint') or (ctx->>'source_count')::integer<>1))
      or (cooperation.id is not null and cooperation.source_fingerprint is distinct from (ctx->>'source_fingerprint')),
    'fields',(select jsonb_object_agg(field,case when f.decision_id is not null then to_jsonb(f.approved_value)
      when portal.id is not null then values_portal->field else to_jsonb(source)->field end)
      from unnest(array['company_name','address1','address2','postal_code','city','country']) field
      left join public.fabric_partner_review_fields f on f.decision_id=approval.id and f.field_name=field));
end $$;
