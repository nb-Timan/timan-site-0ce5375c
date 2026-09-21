-- A demo is an activity on a canonical CRM lead, not a second opportunity.
alter table public.crm_calendar_activities
  add column if not exists demo_lead_id uuid references public.crm_demo_leads(id) on delete set null;

create unique index if not exists crm_demo_leads_one_source_lead
  on public.crm_demo_leads(source_lead_id)
  where source_lead_id is not null;

create unique index if not exists crm_calendar_activities_one_demo
  on public.crm_calendar_activities(demo_lead_id)
  where demo_lead_id is not null;

create or replace function public.sync_crm_demo_calendar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.crm_leads%rowtype;
  v_start timestamptz;
begin
  if new.source_lead_id is null then
    return new;
  end if;

  select * into v_lead
  from public.crm_leads
  where id = new.source_lead_id;

  if new.demo_date is null then
    update public.crm_calendar_activities
       set status = 'canceled', updated_at = now()
     where demo_lead_id = new.id
       and status <> 'canceled';
    return new;
  end if;

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

drop trigger if exists sync_crm_demo_calendar on public.crm_demo_leads;
create trigger sync_crm_demo_calendar
after insert or update of demo_date, title, notes, owner_user_id, owner_name, dealer_company, source_lead_id
on public.crm_demo_leads
for each row execute function public.sync_crm_demo_calendar();

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
    v_next_activity := case when nullif(p_demo ->> 'demo_date', '') is null then 'Customer wants a demonstration' else 'Customer requests a demonstration' end;
    v_probability := case when nullif(p_demo ->> 'demo_date', '') is null then 40 else 50 end;

    insert into public.crm_leads (
      title, owner_user_id, owner_name, owner_email, linked_dealer_id,
      first_contact_date, next_followup_date, machine_types, next_activity,
      demo_has_run, contact_type, customer_type, contact_information, notes,
      estimated_value, probability, pipeline_stage, status, created_by_user_id
    ) values (
      nullif(trim(p_demo ->> 'title'), ''), v_owner_id, v_owner_name, v_owner_email, v_dealer_id,
      current_date, nullif(p_demo ->> 'followup_date', '')::date, v_machine_types, v_next_activity,
      'no', 'Customer', 'Customer', nullif(p_demo ->> 'customer_name', ''), nullif(p_demo ->> 'notes', ''),
      nullif(p_demo ->> 'estimated_value', '')::numeric, v_probability, 'Qualified', 'open', v_actor.id
    ) returning * into v_lead;
  end if;

  v_next_activity := case when nullif(p_demo ->> 'demo_date', '') is null then 'Customer wants a demonstration' else 'Customer requests a demonstration' end;
  v_probability := case when nullif(p_demo ->> 'demo_date', '') is null then 40 else 50 end;

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
    nullif(p_demo ->> 'demo_date', '')::date, nullif(p_demo ->> 'interest_level', '')::integer,
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
         demo_has_run = 'no',
         updated_at = now()
   where id = v_lead.id;

  insert into public.crm_activities (
    activity_type, lead_id, account_id, account_name, created_by_user_id,
    created_by_name, assigned_owner_user_id, assigned_owner_name, title,
    description, status, meta
  ) values (
    case when nullif(p_demo ->> 'demo_date', '') is null then 'demo_requested' else 'demo_scheduled' end,
    v_lead.id, v_lead.linked_dealer_id, nullif(p_demo ->> 'dealer_company', ''), v_actor.id,
    coalesce(v_actor.display_name, v_actor.full_name, v_actor.email), v_lead.owner_user_id, v_lead.owner_name,
    case when nullif(p_demo ->> 'demo_date', '') is null then 'Demo ønsket' else 'Demo planlagt' end,
    concat_ws(' · ', nullif(p_demo ->> 'demo_machine', ''), nullif(p_demo ->> 'demo_date', '')),
    case when nullif(p_demo ->> 'demo_date', '') is null then 'requested' else 'planned' end,
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
revoke all on function public.sync_crm_demo_calendar() from public, anon;

-- Keep CRM list and dashboard status labels aligned with the new pre-date state
-- without replacing their current, later reconciliation changes.
do $migration$
declare
  v_page text;
  v_dashboard text;
  v_page_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  v_dashboard_signature constant text := 'public.crm_dashboard_lead_kpis(uuid, text, timestamptz)';
begin
  select pg_get_functiondef(v_page_signature::regprocedure) into v_page;
  if position('when ''Customer wants a demonstration''' in v_page) = 0 then
    v_page := replace(v_page,
      'when ''Customer requests a demonstration'' then ''Demo planlagt''',
      'when ''Customer wants a demonstration'' then ''Ønsker demo'' when ''Customer requests a demonstration'' then ''Demo planlagt''');
    v_page := replace(v_page,
      'when ''Customer requests a demonstration'' then coalesce(l.probability, 50)',
      'when ''Customer wants a demonstration'' then coalesce(l.probability, 40) when ''Customer requests a demonstration'' then coalesce(l.probability, 50)');
  end if;
  v_page := replace(v_page, 'from public.crm_demo_leads d )', 'from public.crm_demo_leads d where d.source_lead_id is null )');
  execute v_page;

  select pg_get_functiondef(v_dashboard_signature::regprocedure) into v_dashboard;
  if position('when ''Customer wants a demonstration''' in v_dashboard) = 0 then
    v_dashboard := replace(v_dashboard,
      'when ''Customer requests a demonstration'' then ''Demo planlagt''',
      'when ''Customer wants a demonstration'' then ''Ønsker demo'' when ''Customer requests a demonstration'' then ''Demo planlagt''');
  end if;
  execute v_dashboard;
end;
$migration$;
