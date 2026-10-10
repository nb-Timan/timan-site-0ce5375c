-- Portal-owned immutable approvals remain active across source changes.
-- Only an explicit Backend PENDING/IGNORED event revokes an approval.
alter table public.fabric_partner_review_fields drop constraint fabric_partner_review_fields_value_source_check;
alter table public.fabric_partner_review_fields add constraint fabric_partner_review_fields_value_source_check
  check(value_source in ('PORTAL','C5','APPROVED','OVERRIDE'));

create function public.fabric_partner_review_active(p_account text)
returns uuid language sql stable security definer set search_path=pg_catalog,public as $$
  select d.id from public.fabric_partner_review_decisions d
  where d.company='DAT' and d.account_number=p_account and d.status='APPROVED'
    and not exists(select 1 from public.fabric_partner_review_decisions r
      where r.company=d.company and r.account_number=d.account_number and r.version>d.version
        and r.status in ('PENDING','IGNORED'))
  order by d.version desc limit 1;
$$;
revoke all on function public.fabric_partner_review_active(text) from public,anon,authenticated,service_role;

-- Read-only projection for review/import preparation, not an operational cutover.
create function public.fabric_partner_review_effective(p_account text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare approval public.fabric_partner_review_decisions%rowtype; portal public.dealer_accounts%rowtype;
  source public.fabric_partner_master_shadow%rowtype; values_portal jsonb; ctx jsonb;
begin
  select * into approval from public.fabric_partner_review_decisions where id=public.fabric_partner_review_active(p_account);
  select * into portal from public.dealer_accounts where btrim(account_number)=p_account order by id limit 1;
  select * into source from public.fabric_partner_master_shadow where company='DAT' and source_present
    and account_number=p_account order by source_row_number limit 1;
  ctx:=public.fabric_partner_review_context(p_account,approval.parent_dealer_id);
  values_portal:=jsonb_build_object('company_name',portal.company_name,'address1',coalesce(portal.address_line_1,portal.address),
    'address2',portal.address_line_2,'postal_code',portal.postal_code,'city',portal.city,'country',portal.country);
  return jsonb_build_object('approval_id',approval.id,'approval_active',approval.id is not null,
    'partner_type',case when approval.id is not null then approval.proposed_partner_type when portal.id is not null
      then public.fabric_partner_review_portal_type(portal.customer_type_label,portal.customer_type,portal.dealer_type)
      else case upper(btrim(source.c5_partner_type_code)) when '1' then 'dealer' when 'A' then 'dealer'
        when '2' then 'service_partner' when 'B' then 'service_partner' when '3' then 'importer' when 'C' then 'importer'
        when '5' then 'dealer_customer' when 'E' then 'dealer_customer' end end,
    'parent_dealer_id',case when approval.id is not null then approval.parent_dealer_id else (
      select (array_agg(r.source_account_id))[1] from public.partner_account_relations r where r.target_account_id=portal.id and r.active
        and r.relation_type='dealer_has_dealer_customer' having count(*)=1) end,
    'needs_recheck',approval.id is not null and (approval.source_fingerprint is distinct from (ctx->>'source_fingerprint')
      or approval.portal_fingerprint is distinct from (ctx->>'portal_fingerprint') or (ctx->>'source_count')::integer<>1),
    'fields',(select jsonb_object_agg(field,case when f.decision_id is not null then to_jsonb(f.approved_value)
      when portal.id is not null then values_portal->field else to_jsonb(source)->field end)
      from unnest(array['company_name','address1','address2','postal_code','city','country']) field
      left join public.fabric_partner_review_fields f on f.decision_id=approval.id and f.field_name=field));
end $$;
revoke all on function public.fabric_partner_review_effective(text) from public,anon,authenticated,service_role;

create or replace function public.fabric_partner_review_save(p_account_number text,p_expected_version integer,
  p_expected_source_fingerprint text,p_expected_portal_fingerprint text,p_request_id uuid,
  p_status text,p_proposed_partner_type text,p_parent_dealer_id uuid,p_comment text,p_fields jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  actor uuid; prior public.fabric_partner_review_decisions%rowtype; ctx jsonb; parentctx jsonb;
  source public.fabric_partner_master_shadow%rowtype; portal public.dealer_accounts%rowtype;
  previous_version integer; request_hash text; decision uuid; field text; portalvalues jsonb;
  active_id uuid; choice jsonb; selected_source text; selected_value text;
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
    or not p_fields ?& array['company_name','address1','address2','postal_code','city','country'] then raise exception 'INVALID_FIELD_CHOICES'; end if;
  foreach field in array array['company_name','address1','address2','postal_code','city','country'] loop
    choice:=p_fields->field;
    if jsonb_typeof(choice)='string' then
      if choice#>>'{}' not in ('PORTAL','C5','APPROVED') then raise exception 'INVALID_FIELD_CHOICES'; end if;
    elsif jsonb_typeof(choice)='object' then
      if not choice ?& array['source','value'] or (select count(*) from jsonb_object_keys(choice))<>2
        or choice->>'source' is distinct from 'OVERRIDE' or jsonb_typeof(choice->'value') not in ('string','null')
        or length(choice->>'value')>1000 then raise exception 'INVALID_FIELD_CHOICES'; end if;
    else raise exception 'INVALID_FIELD_CHOICES'; end if;
  end loop;
  if p_proposed_partner_type is distinct from 'dealer_customer' and p_parent_dealer_id is not null then raise exception 'INVALID_PARENT'; end if;
  request_hash:=md5(jsonb_build_array(actor,p_account_number,p_expected_version,p_expected_source_fingerprint,
    p_expected_portal_fingerprint,p_status,p_proposed_partner_type,p_parent_dealer_id,p_comment,p_fields)::text);
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
  active_id:=public.fabric_partner_review_active(p_account_number);
  select * into source from public.fabric_partner_master_shadow where company='DAT' and source_present and account_number=p_account_number order by source_row_number limit 1;
  select * into portal from public.dealer_accounts where btrim(account_number)=p_account_number order by id limit 1;
  if p_status='APPROVED' then
    if (ctx->>'source_count')::integer<>1 or (ctx->>'portal_count')::integer>1 or p_proposed_partner_type is null
      or btrim(p_comment)='' then raise exception 'APPROVAL_REQUIRES_VERIFIED_SOURCE_TYPE_REASON'; end if;
    -- Backend may document a type exception; this never changes existing masterdata.
    if portal.id is null and exists(select 1 from jsonb_each(p_fields) f where f.value='"PORTAL"'::jsonb) then raise exception 'PORTAL_VALUE_UNAVAILABLE'; end if;
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
    choice:=p_fields->field;
    selected_source:=case when jsonb_typeof(choice)='object' then 'OVERRIDE' else choice#>>'{}' end;
    if selected_source='APPROVED' then
      select approved_value into selected_value from public.fabric_partner_review_fields where decision_id=active_id and field_name=field;
      if not found then raise exception 'ACTIVE_APPROVAL_REQUIRED'; end if;
    elsif selected_source='OVERRIDE' then selected_value:=choice->>'value';
    elsif selected_source='PORTAL' then selected_value:=portalvalues->>field;
    else selected_value:=to_jsonb(source)->>field; end if;
    insert into public.fabric_partner_review_fields(decision_id,field_name,value_source,approved_value,portal_value,c5_value)
      values(decision,field,selected_source,selected_value,portalvalues->>field,to_jsonb(source)->>field);
  end loop;
  return decision;
end $$;
revoke all on function public.fabric_partner_review_save(text,integer,text,text,uuid,text,text,uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.fabric_partner_review_save(text,integer,text,text,uuid,text,text,uuid,text,jsonb) to authenticated;

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
