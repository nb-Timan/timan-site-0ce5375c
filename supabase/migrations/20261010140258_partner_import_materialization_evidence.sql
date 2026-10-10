-- Preserve immutable approval/import evidence; record the verified import result separately.
create table public.fabric_partner_review_materializations (
  import_id uuid unique references public.fabric_partner_import_pilots(id),
  cooperation_event_id uuid unique references public.partner_cooperation_events(id),
  decision_id uuid primary key references public.fabric_partner_review_decisions(id),
  source_fingerprint text not null,
  portal_fingerprint_after text not null,
  recorded_at timestamptz not null default now(),
  recorded_by text not null default current_user,
  reason text not null,
  check(num_nonnulls(import_id,cooperation_event_id)=1)
);
alter table public.fabric_partner_review_materializations enable row level security;
revoke all on public.fabric_partner_review_materializations from public,anon,authenticated,service_role;
create trigger fabric_partner_review_materializations_immutable before update or delete or truncate
  on public.fabric_partner_review_materializations for each statement execute function public.fabric_partner_review_immutable();

create function public.fabric_partner_import_materialize(p_import_id uuid,p_expected_portal_fingerprint text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare receipt public.fabric_partner_import_pilots%rowtype; approval public.fabric_partner_review_decisions%rowtype;
  child public.dealer_accounts%rowtype; event public.partner_cooperation_events%rowtype; ctx jsonb; before_ctx jsonb;
begin
  if not pg_try_advisory_xact_lock(91732041) then raise exception 'SYNC_BUSY'; end if;
  select * into receipt from public.fabric_partner_import_pilots where id=p_import_id;
  select * into approval from public.fabric_partner_review_decisions where id=receipt.approval_id;
  select * into child from public.dealer_accounts where id=receipt.account_id for share;
  select * into event from public.partner_cooperation_events where customer_id=child.id order by version desc limit 1;
  ctx:=public.fabric_partner_review_context('12041',approval.parent_dealer_id);
  -- Reuse canonical hashing for the pre-import parent-only state (no account/relations).
  if exists(select 1 from public.dealer_accounts where account_number='__pre_import_absent__') then raise exception 'IMPORT_BASELINE_CONFLICT'; end if;
  before_ctx:=public.fabric_partner_review_context('__pre_import_absent__',approval.parent_dealer_id);
  if receipt.id is null or approval.id is null or child.id is null or event.id is null
    or receipt.account_number<>'12041' or child.account_number<>'12041'
    or public.fabric_partner_review_active('12041') is distinct from approval.id
    or approval.status<>'APPROVED' or approval.proposed_partner_type<>'dealer_customer'
    or event.id<>receipt.cooperation_event_id or event.action<>'ACTIVATE' or event.version<>1
    or event.new_dealer_id is distinct from approval.parent_dealer_id
    or child.parent_account_number<>'10295' or child.source<>'fabric_c5_pilot'
    or public.fabric_partner_review_portal_type(child.customer_type_label,child.customer_type,child.dealer_type)<>'dealer_customer'
    or not coalesce(child.is_active,false) or coalesce(child.is_deleted,true) or coalesce(child.is_blocked,true)
    or child.assigned_seller_initials is not null or child.billing_account_id is not null
    or (ctx->>'source_count')::integer<>1 or (ctx->>'portal_count')::integer<>1
    or approval.source_fingerprint is distinct from (ctx->>'source_fingerprint')
    or receipt.source_fingerprint is distinct from approval.source_fingerprint
    or receipt.portal_fingerprint_before is distinct from approval.portal_fingerprint
    or approval.portal_fingerprint is distinct from (before_ctx->>'portal_fingerprint')
    or p_expected_portal_fingerprint is null or p_expected_portal_fingerprint is distinct from (ctx->>'portal_fingerprint')
    or (select count(*) from public.partner_account_relations where target_account_id=child.id)<>1
    or not exists(select 1 from public.partner_account_relations where id=event.new_relation_id
      and active and target_account_id=child.id and source_account_id=approval.parent_dealer_id)
    or (select count(*) from public.fabric_partner_review_fields where decision_id=approval.id)<>6
    or exists(select 1 from public.fabric_partner_review_fields f where f.decision_id=approval.id and (
      f.value_source<>'C5' or f.approved_value is distinct from
      (jsonb_build_object('company_name',child.company_name,'address1',child.address_line_1,
        'address2',child.address_line_2,'postal_code',child.postal_code,'city',child.city,'country',child.country)->>f.field_name)))
    then raise exception 'IMPORT_MATERIALIZATION_REVIEW_REQUIRED'; end if;
  if exists(select 1 from public.fabric_partner_review_materializations where import_id=receipt.id) then
    if not exists(select 1 from public.fabric_partner_review_materializations where import_id=receipt.id
      and decision_id=approval.id and portal_fingerprint_after=p_expected_portal_fingerprint) then
      raise exception 'IMPORT_MATERIALIZATION_CONFLICT'; end if;
    return;
  end if;
  insert into public.fabric_partner_review_materializations(import_id,decision_id,source_fingerprint,portal_fingerprint_after,reason)
    values(receipt.id,approval.id,approval.source_fingerprint,p_expected_portal_fingerprint,
      'Verified authorized JE Service import result; original approval and import receipt retained.');
end $$;
create or replace function public.fabric_partner_review_preview()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_backend() then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  return jsonb_build_object(
    'contexts',coalesce((select jsonb_agg(public.fabric_partner_review_context(a.account_number)
      || jsonb_build_object('effective_values',public.fabric_partner_review_effective(a.account_number)) order by a.account_number) from (
      select account_number from public.fabric_partner_master_shadow where company='DAT' and source_present
      union select btrim(account_number) from public.dealer_accounts where nullif(btrim(account_number),'') is not null
      union select account_number from public.fabric_partner_review_decisions) a),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(d)-array['request_id','request_fingerprint'] || jsonb_build_object(
      'reviewer_name',u.full_name,'current_source_fingerprint',c.ctx->>'source_fingerprint',
      'current_portal_fingerprint',c.ctx->>'portal_fingerprint',
      'materialized_portal_fingerprint',(select portal_fingerprint_after from public.fabric_partner_review_materializations where decision_id=d.id),
      'needs_recheck',d.source_fingerprint is distinct from (c.ctx->>'source_fingerprint')
        or public.fabric_partner_review_portal_baseline(d.id) is distinct from (c.ctx->>'portal_fingerprint') or (c.ctx->>'source_count')::integer<>1,
      'source_invoice_chain',coalesce((select jsonb_agg(jsonb_build_object('account_number',i.account_number,
        'invoice_account_number',i.invoice_account_number) order by i.ordinal)
        from public.fabric_partner_review_invoice_chain i where i.decision_id=d.id),'[]'::jsonb),
      'fields',coalesce((select jsonb_agg(to_jsonb(f)-'decision_id' order by field_name) from public.fabric_partner_review_fields f where f.decision_id=d.id),'[]'::jsonb))
      order by d.account_number,d.version desc)
      from public.fabric_partner_review_decisions d join public.app_users u on u.id=d.reviewed_by
      cross join lateral (select public.fabric_partner_review_context(d.account_number,d.parent_dealer_id) as ctx) c),'[]'::jsonb),
    'parents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'account_number',d.account_number,'company_name',d.company_name) order by d.company_name,d.account_number)
      from public.dealer_accounts d where coalesce(d.is_active,true) and not coalesce(d.is_deleted,false) and not coalesce(d.is_blocked,false)
        and public.fabric_partner_review_portal_type(d.customer_type_label,d.customer_type,d.dealer_type)='dealer'),'[]'::jsonb)
  );
end $$;
revoke all on function public.fabric_partner_review_preview() from public,anon,service_role;
grant execute on function public.fabric_partner_review_preview() to authenticated;
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
      or public.fabric_partner_review_portal_baseline(approval.id) is distinct from (ctx->>'portal_fingerprint') or (ctx->>'source_count')::integer<>1))
      or (cooperation.id is not null and cooperation.source_fingerprint is distinct from (ctx->>'source_fingerprint')),
    'fields',(select jsonb_object_agg(field,case when f.decision_id is not null then to_jsonb(f.approved_value)
      when portal.id is not null then values_portal->field else to_jsonb(source)->field end)
      from unnest(array['company_name','address1','address2','postal_code','city','country']) field
      left join public.fabric_partner_review_fields f on f.decision_id=approval.id and f.field_name=field));
end $$;
revoke all on function public.fabric_partner_import_materialize(uuid,text) from public,anon,authenticated,service_role;

create function public.fabric_partner_review_portal_baseline(p_decision_id uuid)
returns text language sql stable security definer set search_path=pg_catalog,public as $$
  select coalesce(m.portal_fingerprint_after,d.portal_fingerprint) from public.fabric_partner_review_decisions d
    left join public.fabric_partner_review_materializations m on m.decision_id=d.id where d.id=p_decision_id
$$;
revoke all on function public.fabric_partner_review_portal_baseline(uuid) from public,anon,authenticated,service_role;

-- Only the already-authorized, independently verified receipt may be reconciled in production.
do $$
begin
  if exists(select 1 from public.fabric_partner_import_pilots where id='6dbd5603-86a8-4e0f-97fa-ff9cb3369b55') then
    perform public.fabric_partner_import_materialize('6dbd5603-86a8-4e0f-97fa-ff9cb3369b55','23c966c131da883edc3b4b8463f744b9');
  end if;
end $$;
