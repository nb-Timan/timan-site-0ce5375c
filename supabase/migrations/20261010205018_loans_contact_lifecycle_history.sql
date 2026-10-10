-- Narrow lifecycle/UI support. No loan, user, contact or partner is changed here.
alter table public.dealer_contacts
  add column removed_at timestamptz,
  add column removed_by uuid references public.app_users(id);
create index dealer_contacts_removed_partner_idx on public.dealer_contacts(dealer_account_id,removed_at)
  where removed_at is not null;
alter table public.audit_log add column recorded_by_server boolean not null default false;
-- TRUNCATE bypasses row triggers/RLS. Browser roles must not erase retained history.
revoke truncate on public.dealer_contacts, public.audit_log from anon,authenticated;

-- Provenance is stamped by the database, never accepted from browser input.
create function public.people_audit_provenance() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='INSERT' then
    NEW.recorded_by_server:=current_user not in ('anon','authenticated');
    return NEW;
  end if;
  if OLD.recorded_by_server then raise exception 'Server audit history is append-only'; end if;
  if TG_OP='UPDATE' then NEW.recorded_by_server:=false; return NEW; end if;
  return OLD;
end $$;
revoke all on function public.people_audit_provenance() from public,anon,authenticated;
create trigger people_audit_provenance before insert or update or delete on public.audit_log
  for each row execute function public.people_audit_provenance();

create function public.partnerdata_contact_history_guard() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='DELETE' then raise exception 'Archive partner contacts; historical references must be retained'; end if;
  if TG_OP='UPDATE' and OLD.removed_at is not null then raise exception 'Removed contact history is read-only'; end if;
  if (TG_OP='INSERT' and NEW.removed_at is not null) or
    (TG_OP='UPDATE' and (NEW.removed_at is distinct from OLD.removed_at or NEW.removed_by is distinct from OLD.removed_by)) then
    if current_user in ('anon','authenticated') then raise exception 'Use the scoped contact archive operation' using errcode='42501'; end if;
  end if;
  return NEW;
end $$;
revoke all on function public.partnerdata_contact_history_guard() from public,anon,authenticated;
create trigger partnerdata_contact_history_guard before insert or update or delete on public.dealer_contacts
  for each row execute function public.partnerdata_contact_history_guard();
-- Keep every existing scope policy; these restrictions only hide removed contacts.
create policy dealer_contacts_active_select on public.dealer_contacts as restrictive for select to authenticated using(removed_at is null);
create policy dealer_contacts_active_update on public.dealer_contacts as restrictive for update to authenticated
  using(removed_at is null) with check(removed_at is null);

create or replace function public.delete_partnerdata_contact(p_contact_id uuid,p_effective_user_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare c public.dealer_contacts%rowtype; effective uuid; actor uuid;
begin
  effective:=public.partnerdata_effective_actor_id(p_effective_user_id);
  select id into actor from public.current_timan_app_user();
  select * into c from public.dealer_contacts where id=p_contact_id for update;
  if not found then return false; end if;
  if public.can_edit_partnerdata_account_as(c.dealer_account_id,effective) is not true then
    raise exception 'Partner contact is outside the effective user scope' using errcode='42501';
  end if;
  if c.removed_at is not null then return true; end if;
  update public.dealer_contacts set removed_at=now(),removed_by=actor,is_primary=false where id=c.id;
  insert into public.audit_log(actor_user_id,action,module,record_type,record_id,record_label,old_value,new_value,changed_fields,status)
  values(actor,'update','partnerdata','dealer_contact',c.id::text,c.name,
    jsonb_build_object('name',c.name,'dealer_account_id',c.dealer_account_id,'contact_area',c.contact_area),
    jsonb_build_object('removed_at',now(),'removed_by',actor),array['removed_at','removed_by'],'success');
  return true;
end $$;
revoke all on function public.delete_partnerdata_contact(uuid,uuid) from public,anon;
grant execute on function public.delete_partnerdata_contact(uuid,uuid) to authenticated,service_role;

-- A legacy field remains intact. An archived canonical row suppresses its active fallback.
create function public.archive_partnerdata_legacy_contact(p_dealer_account_id uuid,p_contact_area text,p_effective_user_id uuid default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare d public.dealer_accounts%rowtype; effective uuid; actor uuid; contact_id uuid; nm text; em text; ph text;
begin
  effective:=public.partnerdata_effective_actor_id(p_effective_user_id);
  select id into actor from public.current_timan_app_user();
  if public.can_edit_partnerdata_account_as(p_dealer_account_id,effective) is not true then
    raise exception 'Partner contact is outside the effective user scope' using errcode='42501'; end if;
  select * into d from public.dealer_accounts where id=p_dealer_account_id for update;
  if not found then return false; end if;
  if p_contact_area not in ('director','finance','sales','workshop','marketing') or p_contact_area is null then raise exception 'Invalid legacy contact area'; end if;
  if exists(select 1 from public.dealer_contacts where dealer_account_id=d.id and contact_area=p_contact_area and removed_at is not null) then return true; end if;
  if exists(select 1 from public.dealer_contacts where dealer_account_id=d.id and contact_area=p_contact_area and removed_at is null) then raise exception 'Reload the canonical contact before removal'; end if;
  nm:=case p_contact_area when 'director' then d.director_name when 'finance' then d.finance_contact_name when 'sales' then d.sales_contact_name when 'workshop' then d.workshop_contact_name when 'marketing' then d.marketing_contact_name end;
  em:=case p_contact_area when 'finance' then d.finance_contact_email when 'sales' then d.sales_contact_email when 'workshop' then d.workshop_contact_email when 'marketing' then d.marketing_contact_email end;
  ph:=case p_contact_area when 'finance' then d.finance_contact_phone when 'sales' then d.sales_contact_phone when 'workshop' then d.workshop_contact_phone when 'marketing' then d.marketing_contact_phone end;
  if coalesce(nullif(btrim(nm),''),nullif(btrim(em),''),nullif(btrim(ph),'')) is null then return false; end if;
  insert into public.dealer_contacts(dealer_account_id,contact_area,name,email,phone,removed_at,removed_by,is_primary)
    values(d.id,p_contact_area,nm,em,ph,now(),actor,false) returning id into contact_id;
  insert into public.audit_log(actor_user_id,action,module,record_type,record_id,record_label,old_value,new_value,changed_fields,status)
    values(actor,'update','partnerdata','dealer_contact',contact_id::text,nm,
      jsonb_build_object('name',nm,'dealer_account_id',d.id,'contact_area',p_contact_area),
      jsonb_build_object('removed_at',now(),'removed_by',actor),array['removed_at','removed_by'],'success');
  return true;
end $$;
revoke all on function public.archive_partnerdata_legacy_contact(uuid,text,uuid) from public,anon,service_role;
grant execute on function public.archive_partnerdata_legacy_contact(uuid,text,uuid) to authenticated;

create function public.partnerdata_removed_contact_areas(p_dealer_account_id uuid)
returns setof text language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.can_access_partnerdata_account(p_dealer_account_id) is not true then
    raise exception 'Partner scope required' using errcode='42501'; end if;
  return query select distinct c.contact_area from public.dealer_contacts c where c.dealer_account_id=p_dealer_account_id and c.removed_at is not null;
end $$;
revoke all on function public.partnerdata_removed_contact_areas(uuid) from public,anon,service_role;
grant execute on function public.partnerdata_removed_contact_areas(uuid) to authenticated;

-- Loans' SECURITY DEFINER contact picker must obey the same active-contact rule.
create or replace function public.loan_list_partner_contacts(p_dealer_account_id uuid)
returns table(id uuid,name text,role_title text,email text,phone text)
language sql stable security definer set search_path='' as $$
  select c.id,c.name,c.role_title,c.email,c.phone from public.dealer_contacts c
  where c.removed_at is null and public.can_access_loans() and c.dealer_account_id=p_dealer_account_id and nullif(btrim(c.name),'') is not null
    and (exists(select 1 from public.app_users a where a.auth_user_id=auth.uid() and a.portal_role::text in ('timan_backend','timan_seller','timan_service'))
      or exists(select 1 from public.app_users a join public.dealer_accounts d on d.id=c.dealer_account_id where a.auth_user_id=auth.uid()
        and a.portal_role::text in ('timan_dealer','timan_service_partner') and nullif(btrim(a.dealer_number),'') in (nullif(btrim(d.account_number),''),nullif(btrim(d.dealer_number),''))))
$$;

create function public.loan_list_case_action_states()
returns table(case_id uuid,can_review boolean,can_accept boolean,terms_ready boolean,active_reservation_count bigint)
language sql stable security definer set search_path='' as $$
  select c.id,public.loan_can_manage_case(c.id) and c.status='READY_FOR_REVIEW',
    public.loan_can_accept_case(c.id) and c.status='AWAITING_ACCEPTANCE',
    exists(select 1 from public.loan_term_versions t join public.loan_term_translations x on x.term_version_id=t.id
      where t.status='APPROVED' and x.language_code=c.language_code),
    (select count(*) from public.loan_asset_allocations a join public.loan_case_items i on i.id=a.case_item_id where i.case_id=c.id and a.allocation_status='active')
  from public.loan_cases c where public.loan_can_view_case(c.id)
$$;
revoke all on function public.loan_list_case_action_states() from public,anon,service_role;
grant execute on function public.loan_list_case_action_states() to authenticated;

create function public.loan_case_historical_contact(p_case_id uuid)
returns table(id uuid,name text) language sql stable security definer set search_path='' as $$
  select contact.id,contact.name from public.loan_cases c join public.dealer_contacts contact on contact.id=c.dealer_contact_id
  where c.id=p_case_id and public.loan_can_view_case(c.id)
$$;
revoke all on function public.loan_case_historical_contact(uuid) from public,anon,service_role;
grant execute on function public.loan_case_historical_contact(uuid) to authenticated;

-- Backend-only projection. No credentials, IP addresses, emails or access tokens.
create function public.backend_personnel_history()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or public.is_backend() is not true then raise exception 'Backend history access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'users',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.display_name,''),u.full_name),
      'company',coalesce(d.company_name,u.company),'role',u.portal_role,'is_active',u.is_active,'approved',u.approved,'status',u.status,
      'created_at',u.created_at,'last_login_at',u.last_login) order by u.full_name) from public.app_users u left join public.dealer_accounts d on d.account_number=u.dealer_number),'[]'::jsonb),
    'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'company',d.company_name,'account',d.account_number,
      'area',c.contact_area,'removed_at',c.removed_at,'removed_by',actor.full_name) order by c.removed_at desc)
      from public.dealer_contacts c join public.dealer_accounts d on d.id=c.dealer_account_id left join public.app_users actor on actor.id=c.removed_by
      where c.removed_at is not null),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(e order by e->>'at' desc) from (
      select jsonb_build_object('id',a.id,'at',a.created_at,'actor',coalesce(nullif(actor.display_name,''),actor.full_name,a.actor_name),
        'record_id',a.record_id,'record_type',a.record_type,
        'label',coalesce(a.old_value->>'full_name',a.new_value->>'full_name',a.old_value->>'name',a.new_value->>'name'),
        'action',a.action,'server_recorded',a.recorded_by_server,
        'old',coalesce((select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(a.old_value)='object' then a.old_value else '{}'::jsonb end)
          where key in ('full_name','company','portal_role','role','status','approved','is_active','archived_at','name','contact_area','dealer_account_id','removed_at')),'{}'::jsonb),
        'new',coalesce((select jsonb_object_agg(key,value) from jsonb_each(case when jsonb_typeof(a.new_value)='object' then a.new_value else '{}'::jsonb end)
          where key in ('full_name','company','portal_role','role','status','approved','is_active','archived_at','removed_at')),'{}'::jsonb)) e
      from public.audit_log a left join public.app_users actor on actor.id=a.actor_user_id
      where a.status='success' and a.record_type in ('app_users','dealer_contact') order by a.created_at desc limit 500
    ) events),'[]'::jsonb));
end $$;
revoke all on function public.backend_personnel_history() from public,anon,service_role;
grant execute on function public.backend_personnel_history() to authenticated;
