-- One registration under the existing CRM lead. Completion is explicit, never inferred from a date.
alter table public.crm_demo_leads
  add column completed_at timestamptz,
  add column completed_by uuid references public.app_users(id) on delete set null;

create or replace function public.crm_demo_effective_actor(p_effective_user_id uuid default null)
returns public.app_users language plpgsql security invoker set search_path = public as $$
declare actor public.app_users%rowtype; effective public.app_users%rowtype;
begin
  select * into actor from app_users where approved and is_active
    and (auth_user_id=auth.uid() or lower(email)=lower(auth.jwt()->>'email')) limit 1;
  if actor.id is null then raise exception using errcode='42501', message='DEMO_ACCESS_DENIED'; end if;
  effective := actor;
  if p_effective_user_id is not null and p_effective_user_id<>actor.id then
    if coalesce(actor.portal_role::text,actor.role)<>'timan_backend' then
      raise exception using errcode='42501', message='DEMO_VIEW_AS_DENIED';
    end if;
    select * into effective from app_users where id=p_effective_user_id and approved and is_active;
  end if;
  if effective.id is null or coalesce(effective.portal_role::text,effective.role) not in ('timan_backend','timan_service','timan_seller') then
    raise exception using errcode='42501', message='DEMO_ACCESS_DENIED';
  end if;
  return effective;
end;
$$;
revoke all on function public.crm_demo_effective_actor(uuid) from public, anon;
grant execute on function public.crm_demo_effective_actor(uuid) to authenticated;

create or replace function public.save_crm_demo_registration(
  p_demo_id uuid, p_source_lead_id uuid, p_demo jsonb, p_effective_user_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  actor public.app_users%rowtype := public.crm_demo_effective_actor(p_effective_user_id);
  owner_row public.app_users%rowtype;
  lead_row public.crm_leads%rowtype;
  demo public.crm_demo_leads%rowtype;
  dealer public.dealer_accounts%rowtype;
  owner_id uuid := nullif(p_demo->>'owner_user_id','')::uuid;
  dealer_id uuid := nullif(p_demo->>'dealer_account_id','')::uuid;
  contact_id uuid := nullif(p_demo->>'dealer_rep_contact_id','')::uuid;
  person_id uuid := nullif(p_demo->>'dealer_rep_user_id','')::uuid;
  representative text := nullif(p_demo->>'dealer_rep','');
  payload jsonb; result jsonb;
begin
  if nullif(btrim(p_demo->>'title'),'') is null or nullif(p_demo->>'demo_date','') is null then
    raise exception using errcode='23514', message='DEMO_DATE_AND_TITLE_REQUIRED';
  end if;
  if p_demo_id is not null then
    select * into demo from crm_demo_leads where id=p_demo_id for update;
    if not found or demo.source_lead_id is distinct from p_source_lead_id then
      raise exception using errcode='42501', message='DEMO_OUTSIDE_SCOPE';
    end if;
    if demo.completed_at is not null then raise exception using errcode='23514', message='DEMO_ALREADY_COMPLETED'; end if;
  end if;
  if p_source_lead_id is not null then
    select * into lead_row from crm_leads where id=p_source_lead_id for update;
    if not found or (coalesce(actor.portal_role::text,actor.role)='timan_seller' and lead_row.owner_user_id is distinct from actor.id) then
      raise exception using errcode='42501', message='DEMO_LEAD_OUTSIDE_SCOPE';
    end if;
  end if;
  if coalesce(actor.portal_role::text,actor.role)='timan_seller' and owner_id is distinct from actor.id then
    raise exception using errcode='42501', message='DEMO_OWNER_OUTSIDE_SCOPE';
  end if;
  select * into owner_row from app_users where id=owner_id and approved and is_active
    and coalesce(portal_role::text,role) in ('timan_seller','timan_backend','timan_service');
  if not found then raise exception using errcode='42501', message='DEMO_OWNER_OUTSIDE_SCOPE'; end if;
  select * into dealer from dealer_accounts where id=dealer_id and deleted_at is null;
  if not found then raise exception using errcode='42501', message='DEMO_DEALER_OUTSIDE_SCOPE'; end if;
  -- Match the canonical seller assignment, including inherited branch assignment.
  if coalesce(actor.portal_role::text,actor.role)='timan_seller' and not exists (
    select 1 from dealer_accounts scoped
    where (scoped.id=dealer.id or scoped.account_number=dealer.parent_account_number)
      and (scoped.assigned_seller_id=actor.id or lower(scoped.assigned_seller_email)=lower(actor.email)
        or upper(actor.initials)=any(regexp_split_to_array(upper(coalesce(scoped.assigned_seller_initials,'')), '[^A-Z0-9]+')))
  ) then raise exception using errcode='42501', message='DEMO_DEALER_OUTSIDE_SCOPE'; end if;
  if num_nonnulls(contact_id,person_id)>1 then raise exception using errcode='22023', message='DEALER_REP_REFERENCE_CONFLICT'; end if;
  if contact_id is not null then
    select coalesce(nullif(name,''),email) into representative from dealer_contacts where id=contact_id and dealer_account_id=dealer_id;
    if not found then raise exception using errcode='42501', message='DEALER_REP_OUTSIDE_DEALER'; end if;
  elsif person_id is not null then
    select coalesce(nullif(display_name,''),full_name,email) into representative from app_users
      where id=person_id and dealer_number=dealer.account_number and approved and is_active;
    if not found then raise exception using errcode='42501', message='DEALER_REP_OUTSIDE_DEALER'; end if;
  end if;
  -- Assignment is shared with the opportunity and commits together with the demo.
  if lead_row.id is not null then
    update crm_leads set owner_user_id=owner_row.id, owner_name=coalesce(owner_row.display_name,owner_row.full_name,owner_row.email),
      owner_email=owner_row.email, linked_dealer_id=dealer.id where id=lead_row.id;
  end if;
  payload := p_demo || jsonb_build_object('owner_user_id',owner_row.id,
    'dealer_company',dealer.company_name, 'dealer_country',dealer.country,
    'interest_level',null, 'wants_offer',null, 'competitors_present',null,
    'competitor_name',null, 'estimated_value',null, 'probability',null,
    'result_status',null, 'notes_after_demo',null, 'update_followup',false, 'followup_date',null);
  if p_demo_id is null then
    result := public.create_crm_demo_lifecycle_with_representative(p_source_lead_id,payload);
    update crm_demo_leads set probability=null where id=(result->>'demo_id')::uuid;
    return result;
  end if;
  update crm_demo_leads set title=btrim(payload->>'title'), demo_date=(payload->>'demo_date')::date,
    owner_user_id=owner_row.id, owner_name=coalesce(owner_row.display_name,owner_row.full_name,owner_row.email), owner_email=owner_row.email,
    dealer_account_id=dealer.id, dealer_company=dealer.company_name, dealer_country=dealer.country,
    dealer_rep=representative, dealer_rep_contact_id=contact_id, dealer_rep_user_id=person_id,
    customer_name=nullif(payload->>'customer_name',''), customer_address=nullif(payload->>'customer_address',''),
    notes=nullif(payload->>'notes',''), machine_category=array(select jsonb_array_elements_text(payload->'machine_category')),
    demo_machine=nullif(payload->>'demo_machine',''), demo_equipment=array(select jsonb_array_elements_text(payload->'demo_equipment')),
    attachments=coalesce(payload->'attachments','[]'::jsonb)
  where id=p_demo_id returning * into demo;
  return jsonb_build_object('lead_id',lead_row.id,'lead_no',lead_row.lead_no,'demo_id',demo.id,'demo_no',demo.demo_no,'demo_date',demo.demo_date);
end;
$$;
revoke all on function public.save_crm_demo_registration(uuid,uuid,jsonb,uuid) from public, anon;
grant execute on function public.save_crm_demo_registration(uuid,uuid,jsonb,uuid) to authenticated;

create or replace function public.save_crm_demo_result(p_demo_id uuid, p_result jsonb, p_effective_user_id uuid default null)
returns public.crm_demo_leads language plpgsql security invoker set search_path=public as $$
declare
  actor public.app_users%rowtype := public.crm_demo_effective_actor(p_effective_user_id);
  demo public.crm_demo_leads%rowtype; lead_row public.crm_leads%rowtype;
  interest integer := nullif(p_result->>'interest_level','')::integer;
  v_probability integer := nullif(p_result->>'probability','')::integer;
  v_result_status text := nullif(p_result->>'result_status','');
begin
  select * into demo from crm_demo_leads where id=p_demo_id for update;
  if not found then raise exception using errcode='42501', message='DEMO_OUTSIDE_SCOPE'; end if;
  select * into lead_row from crm_leads where id=demo.source_lead_id for update;
  if not found or (coalesce(actor.portal_role::text,actor.role)='timan_seller' and lead_row.owner_user_id is distinct from actor.id) then
    raise exception using errcode='42501', message='DEMO_LEAD_OUTSIDE_SCOPE';
  end if;
  if demo.demo_date is null or demo.demo_date>(now() at time zone 'Europe/Copenhagen')::date then
    raise exception using errcode='23514', message='DEMO_NOT_YET_HELD';
  end if;
  if interest is null or interest not between 1 and 5 or (p_result->>'wants_offer') is null
    or (p_result->>'wants_offer') not in ('yes','no') or v_result_status is null
    or v_result_status not in ('Hot lead','Warm lead','Cold lead','Offer requested','Won','Lost','No fit')
    or (v_probability is not null and v_probability not between 0 and 100)
    or (nullif(p_result->>'competitors_present','') is not null and p_result->>'competitors_present' not in ('yes','no'))
    or nullif(p_result->>'estimated_value','')::numeric<0 then
    raise exception using errcode='23514', message='DEMO_RESULT_REQUIRED';
  end if;
  update crm_demo_leads set interest_level=interest, wants_offer=p_result->>'wants_offer',
    result_status=v_result_status, probability=v_probability,
    estimated_value=nullif(p_result->>'estimated_value','')::numeric,
    competitors_present=nullif(p_result->>'competitors_present',''), competitor_name=nullif(p_result->>'competitor_name',''),
    notes_after_demo=nullif(p_result->>'notes_after_demo',''),
    followup_date=case when coalesce((p_result->>'update_followup')::boolean,false) then nullif(p_result->>'followup_date','')::date else followup_date end,
    completed_at=coalesce(completed_at,now()), completed_by=coalesce(completed_by,actor.id)
  where id=p_demo_id returning * into demo;
  update crm_leads set demo_has_run='yes', demo_registration_pending=false,
    next_activity=case when next_activity in ('Customer requests a demonstration','Demonstration scheduled','Demo agreed') then 'Follow-up on leads' else next_activity end,
    probability=case when next_activity in ('Customer requests a demonstration','Demonstration scheduled','Demo agreed','Follow-up on leads') then coalesce(demo.probability,crm_leads.probability) else crm_leads.probability end,
    estimated_value=coalesce(demo.estimated_value,crm_leads.estimated_value),
    next_followup_date=case when coalesce((p_result->>'update_followup')::boolean,false) then demo.followup_date else next_followup_date end
  where id=lead_row.id;
  -- The existing non-yes -> yes trigger records completion exactly once and completes the calendar event.
  return demo;
end;
$$;
revoke all on function public.save_crm_demo_result(uuid,jsonb,uuid) from public, anon;
grant execute on function public.save_crm_demo_result(uuid,jsonb,uuid) to authenticated;

-- Preserve calendar id on reschedule, including edits after a recorded result.
-- Expose scheduling evidence beside (not instead of) the list's completeness flag.
do $migration$
declare definition text; signature text;
begin
  select pg_get_functiondef('public.sync_crm_demo_calendar()'::regprocedure) into definition;
  definition := replace(definition,'if not found or v_lead.demo_has_run = ''yes'' then','if not found then');
  definition := replace(definition,'status = ''planned'',','status = excluded.status,');
  definition := replace(definition,'''planned'',','case when new.completed_at is not null then ''completed'' else ''planned'' end,');
  execute definition;
  signature := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  select pg_get_functiondef(signature::regprocedure) into definition;
  if position('''demo_registration_pending'', demo_registration_pending,' in definition)=0 then raise exception 'Unexpected lead list projection'; end if;
  definition := replace(definition,'''demo_registration_pending'', demo_registration_pending,',
    '''demo_registration_pending'', demo_registration_pending,
     ''demo_registration'', (select jsonb_build_object(''id'', demo.id, ''demo_date'', demo.demo_date,
       ''completed_at'', demo.completed_at, ''result_status'', demo.result_status)
       from public.crm_demo_leads demo where demo.source_lead_id = page_rows.id limit 1),');
  execute definition;
end;
$migration$;
