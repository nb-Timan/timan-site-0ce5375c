-- Economic relationships must not enter the legacy commercial access graph.
-- No account import, role change, parent/billing pointer update or case activation.
create table public.partner_billing_relations (
  id uuid primary key default gen_random_uuid(),
  main_partner_id uuid not null references public.dealer_accounts(id) on delete restrict,
  billing_company text not null default 'DAT' check (billing_company='DAT'),
  billing_account_number text not null check (billing_account_number=btrim(billing_account_number) and length(billing_account_number)>0),
  billing_account_id uuid references public.dealer_accounts(id) on delete restrict,
  relation_type text not null default 'billing_branch' check (relation_type='billing_branch'),
  active boolean not null default false,
  approved_by uuid references public.app_users(id) on delete restrict,
  approved_at timestamptz,
  approval_source text,
  approval_reason text,
  billing_company_name_at_approval text,
  ended_at timestamptz,
  ended_by uuid references public.app_users(id) on delete restrict,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(main_partner_id,billing_company,billing_account_number),
  check (billing_account_id is distinct from main_partner_id),
  check (not active or (approved_by is not null and approved_at is not null and approval_source is not null and approval_reason is not null
    and length(btrim(approval_source))>0 and length(btrim(approval_reason))>0))
);
create unique index partner_billing_one_active_per_main on public.partner_billing_relations(main_partner_id) where active;
alter table public.partner_billing_relations enable row level security;
revoke all on public.partner_billing_relations from public,anon,authenticated,service_role;

-- Reuse the existing canonical relation audit; old service-partner rows stay intact.
alter table public.partner_account_relation_history
  add column billing_relation_id uuid references public.partner_billing_relations(id) on delete restrict,
  add column previous_billing_relation_id uuid references public.partner_billing_relations(id) on delete restrict,
  add column relation_type text,
  add column action text,
  add column version integer,
  add column approval_source text,
  add column reason text,
  add column billing_company_name text,
  add column source_invoice_account_number text,
  add column source_customer_type_code text,
  add column request_id uuid,
  add column request_fingerprint text;
create unique index partner_billing_audit_request on public.partner_account_relation_history(request_id) where relation_type='billing_branch';
create unique index partner_billing_audit_version on public.partner_account_relation_history(new_parent_account_id,version) where relation_type='billing_branch';
alter table public.partner_account_relation_history add constraint partner_billing_audit_required check (
  relation_type is distinct from 'billing_branch' or (action is not null and action in ('PROPOSE','ACTIVATE','END','SWITCH')
    and version is not null and version>0 and billing_relation_id is not null and changed_by is not null and new_parent_account_id is not null
    and request_id is not null and request_fingerprint is not null and approval_source is not null and reason is not null
    and length(btrim(approval_source))>0 and length(btrim(reason))>0));
create policy partner_billing_history_scope on public.partner_account_relation_history as restrictive for select to authenticated using (
  relation_type is distinct from 'billing_branch' or public.is_backend() or exists(select 1 from public.dealer_accounts d
    where d.id=new_parent_account_id and public.can_manage_partner_admin_fields(d.assigned_seller_id,d.assigned_seller_email,d.assigned_seller_initials)));

create function public.partner_billing_guard()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if TG_OP='TRUNCATE' then raise exception 'BILLING_HISTORY_PRESERVED'; end if;
  if TG_TABLE_NAME='partner_account_relation_history' then
    if TG_OP='INSERT' and NEW.relation_type is distinct from 'billing_branch' then return NEW; end if;
    if TG_OP='DELETE' and OLD.relation_type is distinct from 'billing_branch' then return OLD; end if;
    if TG_OP='UPDATE' and OLD.relation_type is distinct from 'billing_branch' and NEW.relation_type is distinct from 'billing_branch' then return NEW; end if;
    if TG_OP<>'INSERT' then raise exception 'BILLING_HISTORY_PRESERVED'; end if;
  else
    if TG_OP='DELETE' then raise exception 'BILLING_HISTORY_PRESERVED'; end if;
    if TG_OP='UPDATE' and (NEW.main_partner_id<>OLD.main_partner_id or NEW.billing_company<>OLD.billing_company
      or NEW.billing_account_number<>OLD.billing_account_number or NEW.billing_account_id is distinct from OLD.billing_account_id) then
      raise exception 'BILLING_IDENTITY_PRESERVED'; end if;
  end if;
  if nullif(current_setting('timan.billing_request',true),'') is null then raise exception 'BILLING_RPC_REQUIRED'; end if;
  return NEW;
end $$;
revoke all on function public.partner_billing_guard() from public,anon,authenticated,service_role;
create trigger partner_billing_only_rpc before insert or update or delete on public.partner_billing_relations for each row execute function public.partner_billing_guard();
create trigger partner_billing_audit_only_rpc before insert or update or delete on public.partner_account_relation_history for each row execute function public.partner_billing_guard();
create trigger partner_billing_no_truncate before truncate on public.partner_billing_relations for each statement execute function public.partner_billing_guard();
create trigger partner_billing_audit_no_truncate before truncate on public.partner_account_relation_history for each statement execute function public.partner_billing_guard();

create function public.partner_billing_preview(p_main_partner_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare is_admin boolean:=public.is_backend(); main public.dealer_accounts%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if p_main_partner_id is null and not is_admin then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  if p_main_partner_id is not null then
    select * into main from public.dealer_accounts where id=p_main_partner_id;
    if main.id is null or not public.can_manage_partner_admin_fields(main.assigned_seller_id,main.assigned_seller_email,main.assigned_seller_initials)
      then raise exception 'PARTNER_SCOPE_REQUIRED' using errcode='42501'; end if;
  end if;
  return jsonb_build_object('enabled',true,
    'relations',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('main_account_number',d.account_number,'main_company_name',d.company_name,
      'billing_name',coalesce(b.company_name,s.company_name,r.billing_company_name_at_approval,r.billing_account_number),
      'address',coalesce(b.address_line_1,s.address1),'postal_code',coalesce(b.postal_code,s.postal_code),'city',coalesce(b.city,s.city),
      'country',coalesce(b.country,s.country),'invoice_email',b.invoice_email,'currency',coalesce(b.currency_code,s.currency),
      'payment',coalesce(b.payment_terms,s.payment),'c5_invoice_account',s.c5_invoice_account_number,
      'version',coalesce((select max(h.version) from public.partner_account_relation_history h where h.relation_type='billing_branch' and h.new_parent_account_id=r.main_partner_id),0)) order by d.account_number,r.created_at)
      from public.partner_billing_relations r join public.dealer_accounts d on d.id=r.main_partner_id
      left join public.dealer_accounts b on b.id=r.billing_account_id
      left join public.fabric_partner_master_shadow s on s.company=r.billing_company and s.account_number=r.billing_account_number
      where p_main_partner_id is null or r.main_partner_id=p_main_partner_id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(h)-array['request_id','request_fingerprint','changed_by_email'] order by h.changed_at desc)
      from public.partner_account_relation_history h where h.relation_type='billing_branch'
      and (p_main_partner_id is null or h.new_parent_account_id=p_main_partner_id)),'[]'::jsonb),
    'candidates',case when is_admin then coalesce((select jsonb_agg(jsonb_build_object('account_number',s.account_number,'company_name',s.company_name,
      'c5_type',s.c5_partner_type_code,'invoice_account',s.c5_invoice_account_number) order by s.company_name,s.account_number)
      from public.fabric_partner_master_shadow s where s.company='DAT' and s.source_present),'[]'::jsonb) else '[]'::jsonb end);
end $$;
revoke all on function public.partner_billing_preview(uuid) from public,anon,service_role;
grant execute on function public.partner_billing_preview(uuid) to authenticated;

create function public.partner_billing_change(p_main_partner_id uuid,p_account_number text,p_action text,p_expected_version integer,
  p_reason text,p_source text,p_confirmed boolean,p_request_id uuid)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor public.app_users%rowtype; main public.dealer_accounts%rowtype; bill public.dealer_accounts%rowtype;
  source_row public.fabric_partner_master_shadow%rowtype; old_relation public.partner_billing_relations%rowtype;
  new_relation public.partner_billing_relations%rowtype; prior public.partner_account_relation_history%rowtype;
  version_now integer; request_hash text; event_id uuid; account_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select * into actor from public.app_users where auth_user_id=auth.uid() and portal_role='timan_backend' and approved and is_active order by id limit 1;
  if actor.id is null then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  if p_action is null or p_action not in ('PROPOSE','ACTIVATE','END','SWITCH') or p_expected_version is null or p_expected_version<0
    or p_request_id is null or p_reason is null or length(btrim(p_reason))=0 or length(p_reason)>4000
    or p_source is null or length(btrim(p_source))=0 or length(p_source)>1000 then raise exception 'INVALID_BILLING_DECISION'; end if;
  -- Serializes sync and all economic decisions, including cycle checks across mains.
  if not pg_try_advisory_xact_lock(91732041) then raise exception 'SYNC_BUSY'; end if;
  perform pg_advisory_xact_lock(91732042);
  request_hash:=md5(jsonb_build_array(actor.id,p_main_partner_id,p_account_number,p_action,p_expected_version,p_reason,p_source,p_confirmed)::text);
  select * into prior from public.partner_account_relation_history where request_id=p_request_id and relation_type='billing_branch';
  if prior.id is not null then
    if prior.request_fingerprint<>request_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return prior.id;
  end if;
  select * into main from public.dealer_accounts where id=p_main_partner_id for share;
  if main.id is null then raise exception 'MAIN_PARTNER_REQUIRED'; end if;
  select coalesce(max(version),0) into version_now from public.partner_account_relation_history where relation_type='billing_branch' and new_parent_account_id=main.id;
  if version_now<>p_expected_version then raise exception 'BILLING_VERSION_CONFLICT'; end if;
  select * into old_relation from public.partner_billing_relations where main_partner_id=main.id and active for update;
  if p_action in ('PROPOSE','ACTIVATE') and old_relation.id is not null or p_action in ('END','SWITCH') and old_relation.id is null then raise exception 'BILLING_STATE_CONFLICT'; end if;
  if p_confirmed is distinct from true and p_action<>'PROPOSE' then raise exception 'EXPLICIT_BILLING_APPROVAL_REQUIRED'; end if;
  if p_action='END' then
    if p_account_number is not null then raise exception 'INVALID_BILLING_DECISION'; end if;
    new_relation:=old_relation;
  else
    if not coalesce(main.is_active,true) or coalesce(main.is_deleted,false) or coalesce(main.is_blocked,false)
      or public.partner_account_kind(main.id) not in ('dealer','importer','service_partner') then raise exception 'ACTIVE_MAIN_PARTNER_REQUIRED'; end if;
    if p_account_number is null or p_account_number<>btrim(p_account_number) or p_account_number=main.account_number then raise exception 'INVALID_BILLING_ACCOUNT'; end if;
    select * into source_row from public.fabric_partner_master_shadow where company='DAT' and account_number=p_account_number and source_present;
    if source_row.account_number is null then raise exception 'CURRENT_C5_ACCOUNT_REQUIRED'; end if;
    select count(*) into account_count from public.dealer_accounts where account_number=p_account_number;
    if account_count>1 then raise exception 'BILLING_ACCOUNT_CONFLICT'; end if;
    select * into bill from public.dealer_accounts where account_number=p_account_number;
    if bill.id is not null and (not coalesce(bill.is_active,true) or coalesce(bill.is_deleted,false) or coalesce(bill.is_blocked,false)) then raise exception 'BILLING_ACCOUNT_INACTIVE'; end if;
    if old_relation.billing_account_number=p_account_number then raise exception 'BILLING_SAME_ACCOUNT'; end if;
    if exists(with recursive path(account_number) as (
      select p_account_number union select r.billing_account_number from public.partner_billing_relations r
      join public.dealer_accounts d on d.id=r.main_partner_id join path on d.account_number=path.account_number where r.active
    ) select 1 from path where account_number=main.account_number) then raise exception 'BILLING_CYCLE'; end if;
    select * into new_relation from public.partner_billing_relations where main_partner_id=main.id and billing_company='DAT' and billing_account_number=p_account_number for update;
    if new_relation.id is not null and new_relation.billing_account_id is distinct from bill.id then raise exception 'BILLING_IDENTITY_REVIEW_REQUIRED'; end if;
    if new_relation.id is null then new_relation.id:=gen_random_uuid(); end if;
  end if;
  perform set_config('timan.billing_request',p_request_id::text,true);
  if old_relation.id is not null then update public.partner_billing_relations set active=false,ended_at=now(),ended_by=actor.id,end_reason=p_reason,updated_at=now() where id=old_relation.id; end if;
  if p_action<>'END' then
    insert into public.partner_billing_relations(id,main_partner_id,billing_account_number,billing_account_id,active,approved_by,approved_at,approval_source,approval_reason,billing_company_name_at_approval)
      values(new_relation.id,main.id,p_account_number,bill.id,p_action<>'PROPOSE',case when p_action<>'PROPOSE' then actor.id end,
        case when p_action<>'PROPOSE' then now() end,p_source,p_reason,source_row.company_name)
    on conflict(main_partner_id,billing_company,billing_account_number) do update set active=excluded.active,approved_by=excluded.approved_by,
      approved_at=excluded.approved_at,approval_source=excluded.approval_source,approval_reason=excluded.approval_reason,
      billing_company_name_at_approval=excluded.billing_company_name_at_approval,ended_at=null,ended_by=null,end_reason=null,updated_at=now();
  end if;
  insert into public.partner_account_relation_history(child_account_id,child_account_number,new_parent_account_id,new_parent_account_number,
    previous_billing_account_id,previous_billing_account_number,new_billing_account_id,new_billing_account_number,changed_by,changed_by_email,
    billing_relation_id,previous_billing_relation_id,relation_type,action,version,approval_source,reason,billing_company_name,
    source_invoice_account_number,source_customer_type_code,request_id,request_fingerprint)
    values(coalesce(bill.id,old_relation.billing_account_id),coalesce(p_account_number,old_relation.billing_account_number),main.id,main.account_number,
      old_relation.billing_account_id,old_relation.billing_account_number,case when p_action<>'END' then bill.id end,
      case when p_action<>'END' then p_account_number end,actor.id,actor.email,new_relation.id,old_relation.id,'billing_branch',p_action,
      version_now+1,p_source,p_reason,coalesce(source_row.company_name,old_relation.billing_company_name_at_approval),
      (select c5_invoice_account_number from public.fabric_partner_master_shadow where company='DAT' and account_number=main.account_number),
      source_row.c5_partner_type_code,p_request_id,request_hash) returning id into event_id;
  perform set_config('timan.billing_request','',true);
  return event_id;
end $$;
revoke all on function public.partner_billing_change(uuid,text,text,integer,text,text,boolean,uuid) from public,anon,service_role;
grant execute on function public.partner_billing_change(uuid,text,text,integer,text,text,boolean,uuid) to authenticated;
