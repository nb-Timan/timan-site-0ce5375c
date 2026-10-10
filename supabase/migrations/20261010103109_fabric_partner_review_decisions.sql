-- Review decisions only: no masterdata import and no changes to existing policies.
create table public.fabric_partner_review_decisions (
  id uuid primary key default gen_random_uuid(),
  company text not null default 'DAT' check(company='DAT'),
  account_number text not null check(account_number=btrim(account_number) and length(account_number)>0),
  version integer not null check(version>0),
  status text not null check(status in ('PENDING','APPROVED','NEEDS_CLARIFICATION','IGNORED')),
  proposed_partner_type text check(proposed_partner_type in ('dealer','service_partner','importer','dealer_customer')),
  parent_dealer_id uuid references public.dealer_accounts(id),
  comment text not null check(length(comment)<=4000),
  reviewed_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  snapshot_id uuid references public.fabric_partner_shadow_runs(snapshot_id),
  source_fingerprint text,
  portal_fingerprint text not null,
  request_id uuid not null unique,
  request_fingerprint text not null,
  unique(company,account_number,version),
  check(proposed_partner_type='dealer_customer' or parent_dealer_id is null),
  check(status<>'APPROVED' or (proposed_partner_type is not null and length(btrim(comment))>0
    and source_fingerprint is not null and (proposed_partner_type<>'dealer_customer' or parent_dealer_id is not null)))
);
create index fabric_partner_review_reviewer_idx on public.fabric_partner_review_decisions(reviewed_by);
create index fabric_partner_review_parent_idx on public.fabric_partner_review_decisions(parent_dealer_id);
create index fabric_partner_review_snapshot_idx on public.fabric_partner_review_decisions(snapshot_id);
create table public.fabric_partner_review_fields (
  decision_id uuid not null references public.fabric_partner_review_decisions(id),
  field_name text not null check(field_name in ('company_name','address1','address2','postal_code','city','country')),
  value_source text not null check(value_source in ('PORTAL','C5')),
  approved_value text,
  portal_value text,
  c5_value text,
  primary key(decision_id,field_name)
);
alter table public.fabric_partner_review_decisions enable row level security;
alter table public.fabric_partner_review_fields enable row level security;
revoke all on public.fabric_partner_review_decisions,public.fabric_partner_review_fields from public,anon,authenticated,service_role;

create function public.fabric_partner_review_immutable()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'REVIEW_HISTORY_IMMUTABLE'; end $$;
revoke all on function public.fabric_partner_review_immutable() from public,anon,authenticated,service_role;
create trigger fabric_partner_review_decisions_immutable before update or delete or truncate
  on public.fabric_partner_review_decisions for each statement execute function public.fabric_partner_review_immutable();
create trigger fabric_partner_review_fields_immutable before update or delete or truncate
  on public.fabric_partner_review_fields for each statement execute function public.fabric_partner_review_immutable();

-- Exact aliases mirror partnerAccountTypes.ts, including first recognized field precedence.
create function public.fabric_partner_review_portal_type(p_label text,p_customer text,p_dealer text)
returns text language plpgsql immutable set search_path=pg_catalog,public as $$
declare v text; result text;
begin
  foreach v in array array[p_label,p_customer,p_dealer] loop
    v:=regexp_replace(replace(replace(replace(lower(btrim(v)),'ø','oe'),'æ','ae'),'å','aa'),'[^a-z0-9]','','g');
    result:=case
      when v in ('dealer','forhandler') then 'dealer'
      when v in ('servicepartner','service') then 'service_partner'
      when v in ('importer','importoer','importor') then 'importer'
      when v in ('dealercustomer','forhandlerkunde') then 'dealer_customer'
      when v in ('supplier','leverandoer','leverandoermv','leverandormv') then 'supplier'
      when v in ('spareparts','reservedele') then 'spare_parts'
      when v in ('endcustomer','slutkunde') then 'end_customer'
      when v in ('closedcustomer','lukketkunde') then 'closed_customer'
      when v in ('employeesingle','ansatpersonenkel','ansatperson') then 'employee_single'
      when v in ('misc','diverse') then 'misc'
      when v in ('demolocation','demo') then 'demo_location' end;
    if result is not null then return result; end if;
  end loop;
  return 'other_partner';
end $$;
revoke all on function public.fabric_partner_review_portal_type(text,text,text) from public,anon,authenticated,service_role;

create function public.fabric_partner_review_context(p_account text,p_parent uuid default null)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
  with recursive chain as (
    select s.account_number,s.c5_invoice_account_number,array[s.account_number] as visited,0 as depth
    from public.fabric_partner_master_shadow s where s.company='DAT' and s.source_present and s.account_number=p_account
    union all
    select s.account_number,s.c5_invoice_account_number,c.visited||s.account_number,c.depth+1
    from chain c join public.fabric_partner_master_shadow s on s.account_number=c.c5_invoice_account_number
      and s.company='DAT' and s.source_present
    where c.depth<20 and not s.account_number=any(c.visited)
  ), source as (
    select to_jsonb(s)-array['synced_at','source_present','source_last_changed'] as facts
    from public.fabric_partner_master_shadow s where s.company='DAT' and s.source_present
      and s.account_number in (select account_number from chain)
  ), portal as (
    select to_jsonb(d)-array['raw','updated_at','last_synced_at','source_modified_at','geocoded_at',
      'geocoding_address_hash','geocoding_retry_after','geocoding_error','geocoding_status'] as facts
    from public.dealer_accounts d where btrim(d.account_number)=p_account or d.id=p_parent
      or d.id in (select r.source_account_id from public.partner_account_relations r
        join public.dealer_accounts t on t.id=r.target_account_id where btrim(t.account_number)=p_account and r.active)
  )
  select jsonb_build_object('account_number',p_account,
    'source_count',(select count(*) from public.fabric_partner_master_shadow where company='DAT' and source_present and account_number=p_account),
    'portal_count',(select count(*) from public.dealer_accounts where btrim(account_number)=p_account),
    'source_fingerprint',case when exists(select 1 from source) then
      md5((select jsonb_agg(facts order by facts::text)::text from source)) end,
    'portal_fingerprint',md5(jsonb_build_object('accounts',coalesce((select jsonb_agg(facts order by facts::text) from portal),'[]'::jsonb),
      'relations',coalesce((select jsonb_agg(to_jsonb(r)-array['created_at','updated_at'] order by r.id) from public.partner_account_relations r
        where r.source_account_id in (select id from public.dealer_accounts where btrim(account_number)=p_account)
          or r.target_account_id in (select id from public.dealer_accounts where btrim(account_number)=p_account)),'[]'::jsonb))::text),
    'snapshot_id',(select snapshot_id from public.fabric_partner_shadow_runs order by completed_at desc,source_as_of desc limit 1)
  );
$$;
revoke all on function public.fabric_partner_review_context(text,uuid) from public,anon,authenticated,service_role;

create function public.fabric_partner_review_save(p_account_number text,p_expected_version integer,
  p_expected_source_fingerprint text,p_expected_portal_fingerprint text,p_request_id uuid,
  p_status text,p_proposed_partner_type text,p_parent_dealer_id uuid,p_comment text,p_fields jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  actor uuid; prior public.fabric_partner_review_decisions%rowtype; ctx jsonb; parentctx jsonb;
  source public.fabric_partner_master_shadow%rowtype; portal public.dealer_accounts%rowtype;
  previous_version integer; request_hash text; decision uuid; known_type text; field text; portalvalues jsonb;
begin
  if not public.is_backend() then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  select id into actor from public.app_users where auth.uid() is not null
    and (auth_user_id=auth.uid() or lower(email)=lower(nullif(auth.jwt()->>'email','')))
    and portal_role='timan_backend' and approved and is_active order by (auth_user_id=auth.uid()) desc nulls last,id limit 1;
  if actor is null then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  if p_request_id is null or p_account_number is null or length(p_account_number)>100 or p_account_number<>btrim(p_account_number)
    or p_account_number='' or p_expected_version is null or p_expected_version<0 then raise exception 'INVALID_REVIEW'; end if;
  if p_status is null or p_status not in ('PENDING','APPROVED','NEEDS_CLARIFICATION','IGNORED')
    or (p_proposed_partner_type is not null and p_proposed_partner_type not in ('dealer','service_partner','importer','dealer_customer'))
    or p_comment is null or length(p_comment)>4000 then raise exception 'INVALID_REVIEW'; end if;
  if p_fields is null or jsonb_typeof(p_fields)<>'object' then raise exception 'INVALID_FIELD_CHOICES'; end if;
  if (select count(*) from jsonb_object_keys(p_fields))<>6
    or not p_fields ?& array['company_name','address1','address2','postal_code','city','country']
    or exists(select 1 from jsonb_each_text(p_fields) f where f.value is null or f.value not in ('PORTAL','C5'))
    then raise exception 'INVALID_FIELD_CHOICES'; end if;
  if p_proposed_partner_type is distinct from 'dealer_customer' and p_parent_dealer_id is not null then raise exception 'INVALID_PARENT'; end if;
  request_hash:=md5(jsonb_build_array(actor,p_account_number,p_expected_version,p_expected_source_fingerprint,
    p_expected_portal_fingerprint,p_status,p_proposed_partner_type,p_parent_dealer_id,p_comment,p_fields)::text);
  -- Serialize with the existing shadow ingest lock, so source facts cannot change midway.
  if not pg_try_advisory_xact_lock(91732041) then raise exception 'SYNC_BUSY'; end if;
  select * into prior from public.fabric_partner_review_decisions where request_id=p_request_id;
  if found then
    if prior.request_fingerprint<>request_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return prior.id;
  end if;
  select coalesce(max(version),0) into previous_version from public.fabric_partner_review_decisions where company='DAT' and account_number=p_account_number;
  if previous_version<>p_expected_version then raise exception 'REVIEW_VERSION_CONFLICT'; end if;
  ctx:=public.fabric_partner_review_context(p_account_number);
  if (ctx->>'source_fingerprint') is distinct from p_expected_source_fingerprint
    or (ctx->>'portal_fingerprint') is distinct from p_expected_portal_fingerprint then raise exception 'SOURCE_CHANGED_RELOAD'; end if;
  select * into source from public.fabric_partner_master_shadow where company='DAT' and source_present and account_number=p_account_number order by source_row_number limit 1;
  select * into portal from public.dealer_accounts where btrim(account_number)=p_account_number order by id limit 1;
  known_type:=case upper(btrim(source.c5_partner_type_code)) when '1' then 'dealer' when 'A' then 'dealer'
    when '2' then 'service_partner' when 'B' then 'service_partner' when '3' then 'importer' when 'C' then 'importer'
    when '5' then 'dealer_customer' when 'E' then 'dealer_customer' end;
  if p_status='APPROVED' then
    if (ctx->>'source_count')::integer<>1 or (ctx->>'portal_count')::integer>1 or p_proposed_partner_type is null
      or btrim(p_comment)='' then raise exception 'APPROVAL_REQUIRES_VERIFIED_SOURCE_TYPE_REASON'; end if;
    if (known_type is not null and known_type<>p_proposed_partner_type)
      or (portal.id is not null and public.fabric_partner_review_portal_type(portal.customer_type_label,portal.customer_type,portal.dealer_type)<>p_proposed_partner_type)
      then raise exception 'TYPE_CONFLICT_REQUIRES_CLARIFICATION'; end if;
    if portal.id is null and exists(select 1 from jsonb_each_text(p_fields) f where f.value='PORTAL') then raise exception 'PORTAL_VALUE_UNAVAILABLE'; end if;
    if source.zipcity_validation='REVIEW_REQUIRED' and (p_fields->>'postal_code'='C5' or p_fields->>'city'='C5') then raise exception 'ADDRESS_REQUIRES_CLARIFICATION'; end if;
    if p_proposed_partner_type='dealer_customer' and (p_parent_dealer_id is null or p_parent_dealer_id=portal.id
      or not exists(select 1 from public.dealer_accounts d where d.id=p_parent_dealer_id and coalesce(d.is_active,true)
        and not coalesce(d.is_deleted,false) and not coalesce(d.is_blocked,false)
        and public.fabric_partner_review_portal_type(d.customer_type_label,d.customer_type,d.dealer_type)='dealer'))
      then raise exception 'VERIFIED_PARENT_REQUIRED'; end if;
  end if;
  parentctx:=public.fabric_partner_review_context(p_account_number,p_parent_dealer_id);
  portalvalues:=jsonb_build_object('company_name',portal.company_name,'address1',coalesce(portal.address_line_1,portal.address),
    'address2',portal.address_line_2,'postal_code',portal.postal_code,'city',portal.city,'country',portal.country);
  insert into public.fabric_partner_review_decisions(account_number,version,status,proposed_partner_type,parent_dealer_id,comment,
    reviewed_by,snapshot_id,source_fingerprint,portal_fingerprint,request_id,request_fingerprint)
    values(p_account_number,previous_version+1,p_status,p_proposed_partner_type,p_parent_dealer_id,p_comment,actor,
      (ctx->>'snapshot_id')::uuid,ctx->>'source_fingerprint',parentctx->>'portal_fingerprint',p_request_id,request_hash) returning id into decision;
  foreach field in array array['company_name','address1','address2','postal_code','city','country'] loop
    insert into public.fabric_partner_review_fields(decision_id,field_name,value_source,approved_value,portal_value,c5_value)
      values(decision,field,p_fields->>field,case p_fields->>field when 'PORTAL' then portalvalues->>field else to_jsonb(source)->>field end,
        portalvalues->>field,to_jsonb(source)->>field);
  end loop;
  return decision;
end $$;
revoke all on function public.fabric_partner_review_save(text,integer,text,text,uuid,text,text,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.fabric_partner_review_save(text,integer,text,text,uuid,text,text,uuid,text,jsonb) to authenticated;

create function public.fabric_partner_review_preview()
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
  if not public.is_backend() then raise exception 'BACKEND_ONLY' using errcode='42501'; end if;
  return jsonb_build_object(
    'contexts',coalesce((select jsonb_agg(public.fabric_partner_review_context(a.account_number) order by a.account_number) from (
      select account_number from public.fabric_partner_master_shadow where company='DAT' and source_present
      union select btrim(account_number) from public.dealer_accounts where nullif(btrim(account_number),'') is not null
      union select account_number from public.fabric_partner_review_decisions) a),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(d)-array['request_id','request_fingerprint'] || jsonb_build_object(
      'reviewer_name',u.full_name,'current_source_fingerprint',c.ctx->>'source_fingerprint',
      'current_portal_fingerprint',c.ctx->>'portal_fingerprint',
      'needs_recheck',d.source_fingerprint is distinct from (c.ctx->>'source_fingerprint')
        or d.portal_fingerprint is distinct from (c.ctx->>'portal_fingerprint') or (c.ctx->>'source_count')::integer<>1,
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
