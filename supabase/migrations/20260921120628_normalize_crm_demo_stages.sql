-- A requested demo and an agreed, dated demo are separate CRM stages.
-- The linked demo record remains the canonical evidence for the agreed stage.
create or replace function public.sync_crm_demo_calendar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_start timestamptz;
  v_previous_demo_date date;
begin
  if new.source_lead_id is null then
    return new;
  end if;

  select * into v_lead
  from public.crm_leads
  where id = new.source_lead_id;

  if not found or v_lead.demo_has_run = 'yes' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_previous_demo_date := old.demo_date;
  end if;

  if new.demo_date is null then
    update public.crm_leads lead
       set next_activity = 'Customer requests a demonstration',
           probability = 40,
           pipeline_stage = 'Qualified',
           next_followup_date = case
             when v_previous_demo_date is not null
              and lead.next_followup_date = v_previous_demo_date then null
             else lead.next_followup_date
           end,
           updated_at = now()
     where lead.id = new.source_lead_id
       and lead.demo_has_run is distinct from 'yes';

    update public.crm_calendar_activities
       set status = 'canceled', updated_at = now()
     where demo_lead_id = new.id
       and status <> 'canceled';
    return new;
  end if;

  update public.crm_leads lead
     set next_activity = 'Demo agreed',
         probability = 50,
         pipeline_stage = 'Qualified',
         next_followup_date = new.demo_date,
         updated_at = now()
   where lead.id = new.source_lead_id
     and lead.demo_has_run is distinct from 'yes';

  v_start := (new.demo_date::timestamp at time zone 'Europe/Copenhagen');

  insert into public.crm_calendar_activities (
    demo_lead_id, title, start_datetime, account_id, dealer_name,
    seller_user_id, seller_name, activity_type, note, status,
    created_by_user_id, updated_by_user_id
  ) values (
    new.id,
    'Demo: ' || new.title,
    v_start,
    v_lead.linked_dealer_id,
    new.dealer_company,
    new.owner_user_id,
    new.owner_name,
    'demo',
    coalesce(new.notes, ''),
    'planned',
    coalesce(v_lead.created_by_user_id, new.owner_user_id),
    coalesce(v_lead.created_by_user_id, new.owner_user_id)
  )
  on conflict (demo_lead_id) where demo_lead_id is not null do update
    set title = excluded.title,
        start_datetime = excluded.start_datetime,
        account_id = excluded.account_id,
        dealer_name = excluded.dealer_name,
        seller_user_id = excluded.seller_user_id,
        seller_name = excluded.seller_name,
        note = excluded.note,
        status = 'planned',
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_crm_demo_calendar() from public, anon, authenticated;

create or replace function public.create_crm_demo_lifecycle(
  p_source_lead_id uuid,
  p_demo jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor public.app_users%rowtype;
  v_lead public.crm_leads%rowtype;
  v_demo public.crm_demo_leads%rowtype;
  v_role text;
  v_owner_id uuid;
  v_owner_name text;
  v_owner_email text;
  v_dealer_id uuid;
  v_next_activity text;
  v_probability integer;
  v_demo_date date;
  v_machine_types text[];
begin
  select * into v_actor
  from public.app_users
  where approved is true
    and is_active is true
    and (
      auth_user_id = auth.uid()
      or lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  limit 1;

  if not found then
    raise exception 'CRM demo lifecycle requires an approved authenticated user';
  end if;

  v_role := coalesce(v_actor.portal_role::text, v_actor.role);
  if v_role not in ('timan_backend', 'timan_service', 'timan_seller') then
    raise exception 'CRM demo lifecycle is not available for this portal role';
  end if;

  v_demo_date := nullif(p_demo ->> 'demo_date', '')::date;
  v_next_activity := case when v_demo_date is null then 'Customer requests a demonstration' else 'Demo agreed' end;
  v_probability := case when v_demo_date is null then 40 else 50 end;

  if p_source_lead_id is not null then
    select * into v_lead from public.crm_leads where id = p_source_lead_id for update;
    if not found then
      raise exception 'Lead not found or not available in the current scope';
    end if;
    if v_role = 'timan_seller' and v_lead.owner_user_id is distinct from v_actor.id then
      raise exception 'Lead is outside the current seller scope';
    end if;
  else
    v_owner_id := nullif(p_demo ->> 'owner_user_id', '')::uuid;
    if v_role = 'timan_seller' and v_owner_id is distinct from v_actor.id then
      raise exception 'Seller may only create a demo for their own lead';
    end if;
    if v_owner_id is null then
      v_owner_id := v_actor.id;
    end if;
    select coalesce(display_name, full_name, email), email
      into v_owner_name, v_owner_email
      from public.app_users
     where id = v_owner_id;
    if v_owner_name is null then
      raise exception 'Responsible seller was not found';
    end if;
    v_dealer_id := nullif(p_demo ->> 'dealer_account_id', '')::uuid;
    v_machine_types := coalesce(array(select jsonb_array_elements_text(coalesce(p_demo -> 'machine_interest', '[]'::jsonb))), '{}'::text[]);

    insert into public.crm_leads (
      title, owner_user_id, owner_name, owner_email, linked_dealer_id,
      first_contact_date, next_followup_date, machine_types, next_activity,
      demo_has_run, contact_type, customer_type, contact_information, notes,
      estimated_value, probability, pipeline_stage, status, created_by_user_id
    ) values (
      nullif(trim(p_demo ->> 'title'), ''), v_owner_id, v_owner_name, v_owner_email, v_dealer_id,
      current_date, coalesce(v_demo_date, nullif(p_demo ->> 'followup_date', '')::date), v_machine_types, v_next_activity,
      'no', 'Customer', 'Customer', nullif(p_demo ->> 'customer_name', ''), nullif(p_demo ->> 'notes', ''),
      nullif(p_demo ->> 'estimated_value', '')::numeric, v_probability, 'Qualified', 'open', v_actor.id
    ) returning * into v_lead;
  end if;

  insert into public.crm_demo_leads (
    title, owner_user_id, owner_name, owner_email, dealer_company, dealer_country,
    dealer_rep, customer_name, customer_address, notes, machine_category,
    demo_machine, demo_equipment, demo_date, interest_level, wants_offer,
    followup_date, estimated_value, probability, competitors_present,
    competitor_name, notes_after_demo, result_status, attachments, source_lead_id
  ) values (
    nullif(trim(p_demo ->> 'title'), ''), v_lead.owner_user_id, v_lead.owner_name, v_lead.owner_email,
    nullif(p_demo ->> 'dealer_company', ''), nullif(p_demo ->> 'dealer_country', ''),
    nullif(p_demo ->> 'dealer_rep', ''), nullif(p_demo ->> 'customer_name', ''),
    nullif(p_demo ->> 'customer_address', ''), nullif(p_demo ->> 'notes', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_demo -> 'machine_category', '[]'::jsonb))), '{}'::text[]),
    nullif(p_demo ->> 'demo_machine', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_demo -> 'demo_equipment', '[]'::jsonb))), '{}'::text[]),
    v_demo_date, nullif(p_demo ->> 'interest_level', '')::integer,
    nullif(p_demo ->> 'wants_offer', ''), nullif(p_demo ->> 'followup_date', '')::date,
    nullif(p_demo ->> 'estimated_value', '')::numeric, v_probability,
    nullif(p_demo ->> 'competitors_present', ''), nullif(p_demo ->> 'competitor_name', ''),
    nullif(p_demo ->> 'notes_after_demo', ''), nullif(p_demo ->> 'result_status', ''),
    coalesce(p_demo -> 'attachments', '[]'::jsonb), v_lead.id
  ) returning * into v_demo;

  update public.crm_leads
     set converted_demo_lead_id = v_demo.id,
         next_activity = v_next_activity,
         probability = v_probability,
         pipeline_stage = 'Qualified',
         next_followup_date = case when v_demo_date is not null then v_demo_date else next_followup_date end,
         demo_has_run = 'no',
         updated_at = now()
   where id = v_lead.id;

  insert into public.crm_activities (
    activity_type, lead_id, account_id, account_name, created_by_user_id,
    created_by_name, assigned_owner_user_id, assigned_owner_name, title,
    description, status, meta
  ) values (
    case when v_demo_date is null then 'demo_requested' else 'demo_scheduled' end,
    v_lead.id, v_lead.linked_dealer_id, nullif(p_demo ->> 'dealer_company', ''), v_actor.id,
    coalesce(v_actor.display_name, v_actor.full_name, v_actor.email), v_lead.owner_user_id, v_lead.owner_name,
    case when v_demo_date is null then 'Demo ønsket' else 'Demo aftalt' end,
    concat_ws(' · ', nullif(p_demo ->> 'demo_machine', ''), v_demo_date::text),
    case when v_demo_date is null then 'requested' else 'planned' end,
    jsonb_build_object('demo_id', v_demo.id, 'demo_no', v_demo.demo_no, 'demo_date', v_demo.demo_date)
  );

  return jsonb_build_object(
    'lead_id', v_lead.id, 'lead_no', v_lead.lead_no,
    'demo_id', v_demo.id, 'demo_no', v_demo.demo_no,
    'demo_date', v_demo.demo_date
  );
end;
$$;

revoke all on function public.create_crm_demo_lifecycle(uuid, jsonb) from public, anon;
grant execute on function public.create_crm_demo_lifecycle(uuid, jsonb) to authenticated;

-- Patch the canonical list/dashboard RPCs in place so later scope/security
-- reconciliation remains intact.
do $migration$
declare
  v_page text;
  v_dashboard text;
  v_page_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  v_dashboard_signature constant text := 'public.crm_dashboard_lead_kpis(uuid, text, timestamptz)';
begin
  select pg_get_functiondef(v_page_signature::regprocedure) into v_page;
  v_page := replace(v_page,
    'when ''Customer wants a demonstration'' then ''Ønsker demo'' when ''Customer requests a demonstration'' then ''Demo planlagt''',
    'when ''Customer wants a demonstration'' then ''Ønsker demo'' when ''Customer requests a demonstration'' then ''Ønsker demo'' when ''Demo agreed'' then ''Demo aftalt''');
  v_page := replace(v_page,
    'when ''Customer wants a demonstration'' then coalesce(l.probability, 40) when ''Customer requests a demonstration'' then coalesce(l.probability, 50)',
    'when ''Customer wants a demonstration'' then coalesce(l.probability, 40) when ''Customer requests a demonstration'' then coalesce(l.probability, 40) when ''Demo agreed'' then coalesce(l.probability, 50)');
  if position('when ''Demo agreed'' then ''Demo aftalt''' in v_page) = 0 then
    raise exception 'crm_leads_page_query did not contain the expected demo-stage mapping';
  end if;
  execute v_page;

  select pg_get_functiondef(v_dashboard_signature::regprocedure) into v_dashboard;
  v_dashboard := replace(v_dashboard,
    'when ''Customer wants a demonstration'' then ''Ønsker demo'' when ''Customer requests a demonstration'' then ''Demo planlagt''',
    'when ''Customer wants a demonstration'' then ''Ønsker demo'' when ''Customer requests a demonstration'' then ''Ønsker demo'' when ''Demo agreed'' then ''Demo aftalt''');
  v_dashboard := replace(v_dashboard, '''Demo planlagt''', '''Demo aftalt''');
  if position('when ''Demo agreed'' then ''Demo aftalt''' in v_dashboard) = 0 then
    raise exception 'crm_dashboard_lead_kpis did not contain the expected demo-stage mapping';
  end if;
  execute v_dashboard;
end;
$migration$;

-- Keep Quick Note's canonical next-activity write path aligned without
-- changing its RLS, calendar or history behavior.
do $migration$
declare
  v_note text;
  v_signature constant text := 'public.save_crm_lead_note_followup(uuid, uuid, text, date, text, boolean, text)';
begin
  select pg_get_functiondef(v_signature::regprocedure) into v_note;
  v_note := replace(v_note,
    '''Customer requests a demonstration''::text, ''Lead sent to the dealer''::text',
    '''Customer requests a demonstration''::text, ''Demo agreed''::text, ''Lead sent to the dealer''::text');
  v_note := replace(v_note,
    '''Customer requests a demonstration'', ''Lead sent to the dealer''',
    '''Customer requests a demonstration'', ''Demo agreed'', ''Lead sent to the dealer''');
  v_note := replace(v_note,
    'when v_next_activity = ''Customer requests a demonstration'' then 50',
    'when v_next_activity = ''Customer requests a demonstration'' then 40 when v_next_activity = ''Demo agreed'' then 50');
  v_note := replace(v_note,
    'when v_next_activity in (''Customer wants a demonstration'', ''Customer requests a demonstration'', ''Follow-up on leads'') then ''Qualified''',
    'when v_next_activity in (''Customer wants a demonstration'', ''Customer requests a demonstration'', ''Demo agreed'', ''Follow-up on leads'') then ''Qualified''');
  if position('when v_next_activity = ''Demo agreed'' then 50' in v_note) = 0 then
    raise exception 'save_crm_lead_note_followup did not contain the expected demo-stage mapping';
  end if;
  execute v_note;
end;
$migration$;

-- Deterministic live backfill. Completed demos are explicitly excluded and
-- expected_close_date is never written.
update public.crm_leads lead
set next_activity = 'Customer requests a demonstration',
    probability = 40,
    pipeline_stage = 'Qualified',
    updated_at = now()
where lead.next_activity in ('Customer wants a demonstration', 'Customer requests a demonstration')
  and lead.demo_has_run is distinct from 'yes'
  and not exists (
    select 1
    from public.crm_demo_leads demo
    where demo.source_lead_id = lead.id
      and demo.demo_date is not null
  )
  and (
    lead.next_activity is distinct from 'Customer requests a demonstration'
    or lead.probability is distinct from 40
    or lead.pipeline_stage is distinct from 'Qualified'
  );

update public.crm_leads lead
set next_activity = 'Demo agreed',
    probability = 50,
    pipeline_stage = 'Qualified',
    next_followup_date = scheduled.demo_date,
    updated_at = now()
from (
  select demo.source_lead_id, max(demo.demo_date) as demo_date
  from public.crm_demo_leads demo
  where demo.source_lead_id is not null
    and demo.demo_date is not null
  group by demo.source_lead_id
) scheduled
where lead.id = scheduled.source_lead_id
  and lead.demo_has_run is distinct from 'yes'
  and (
    lead.next_activity is distinct from 'Demo agreed'
    or lead.probability is distinct from 50
    or lead.pipeline_stage is distinct from 'Qualified'
    or lead.next_followup_date is distinct from scheduled.demo_date
  );
