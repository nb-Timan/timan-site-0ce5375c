-- Completion metadata only. crm_demo_leads remains the scheduling source of truth.
alter table public.crm_leads add column if not exists demo_registration_pending boolean not null default false;

create or replace function public.crm_lead_has_scheduled_demo(p_lead_id uuid)
returns boolean language sql stable security invoker set search_path = public as $$
  select exists (
    select 1 from public.crm_demo_leads
    where source_lead_id = p_lead_id and demo_date is not null
      and lower(coalesce(result_status, '')) not in ('canceled', 'cancelled')
  );
$$;
revoke all on function public.crm_lead_has_scheduled_demo(uuid) from public, anon;
grant execute on function public.crm_lead_has_scheduled_demo(uuid) to authenticated;

create or replace function public.enforce_crm_demo_stage()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.next_activity = 'Customer wants a demonstration' then
    new.next_activity := 'Customer requests a demonstration';
  end if;
  if new.next_activity in ('Demo agreed', 'Demonstration scheduled') then
    if not public.crm_lead_has_scheduled_demo(new.id) then
      raise exception using errcode = '23514', message = 'DEMO_REGISTRATION_REQUIRED';
    end if;
    new.next_activity := 'Demonstration scheduled';
    new.probability := 50;
    new.demo_registration_pending := false;
  elsif new.next_activity = 'Customer requests a demonstration' and new.demo_has_run is distinct from 'yes' then
    if public.crm_lead_has_scheduled_demo(new.id) then
      new.next_activity := 'Demonstration scheduled';
      new.probability := 50;
      new.demo_registration_pending := false;
    else
      new.probability := 40;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_crm_demo_stage() from public, anon, authenticated;
create trigger enforce_crm_demo_stage before insert or update of next_activity, probability
on public.crm_leads for each row execute function public.enforce_crm_demo_stage();

-- Invoker + the same actor/owner checks as create_crm_demo_lifecycle. No wider read scope.
create or replace function public.start_crm_demo_registration(p_lead_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_actor public.app_users%rowtype;
  v_lead public.crm_leads%rowtype;
  v_demo_id uuid;
begin
  select * into v_actor from public.app_users where approved is true and is_active is true
    and (auth_user_id = auth.uid() or lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))) limit 1;
  if not found or coalesce(v_actor.portal_role::text, v_actor.role) not in ('timan_backend', 'timan_service', 'timan_seller') then
    raise exception using errcode = '42501', message = 'Demo registration not allowed';
  end if;
  select * into v_lead from public.crm_leads where id = p_lead_id for update;
  if not found or (coalesce(v_actor.portal_role::text, v_actor.role) = 'timan_seller' and v_lead.owner_user_id is distinct from v_actor.id) then
    raise exception using errcode = '42501', message = 'Lead outside current scope';
  end if;
  select id into v_demo_id from public.crm_demo_leads where source_lead_id = p_lead_id;
  if v_demo_id is not null then return v_demo_id; end if;
  if not v_lead.demo_registration_pending then
    update public.crm_leads set demo_registration_pending = true where id = p_lead_id;
    insert into public.crm_activities(activity_type, lead_id, title, created_by_user_id, created_by_name,
      assigned_owner_user_id, assigned_owner_name, meta)
    values ('demo_registration_started', p_lead_id, 'Demo registration started', v_actor.id,
      coalesce(v_actor.display_name, v_actor.full_name, v_actor.email), v_lead.owner_user_id, v_lead.owner_name,
      jsonb_build_object('source', 'crm_demo_registration'));
  end if;
  return null;
end;
$$;
revoke all on function public.start_crm_demo_registration(uuid) from public, anon;
grant execute on function public.start_crm_demo_registration(uuid) to authenticated;

create or replace function public.enforce_crm_demo_source_scope()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_lead public.crm_leads%rowtype; v_actor public.app_users%rowtype;
begin
  if tg_op = 'UPDATE' and new.source_lead_id is distinct from old.source_lead_id then
    raise exception using errcode = '23514', message = 'Demo source lead cannot be reassigned';
  end if;
  if new.source_lead_id is null then return new; end if;
  select * into v_lead from public.crm_leads where id = new.source_lead_id for update;
  if not found then raise exception using errcode = '42501', message = 'Lead outside current scope'; end if;
  if new.owner_user_id is distinct from v_lead.owner_user_id then
    raise exception using errcode = '42501', message = 'Demo owner must match the source lead';
  end if;
  select * into v_actor from public.app_users where approved and is_active
    and (auth_user_id = auth.uid() or lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', '')))) limit 1;
  if coalesce(v_actor.portal_role::text, v_actor.role) = 'timan_seller' and v_actor.id is distinct from v_lead.owner_user_id then
    raise exception using errcode = '42501', message = 'Lead outside current seller scope';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_crm_demo_source_scope() from public, anon, authenticated;
create trigger enforce_crm_demo_source_scope before insert or update on public.crm_demo_leads
for each row execute function public.enforce_crm_demo_source_scope();

-- Patch the current functions, retaining the previously released scope/audit/owner fixes.
do $migration$
declare v text; original text; signature text;
begin
  select pg_get_functiondef('public.create_crm_demo_lifecycle(uuid,jsonb)'::regprocedure) into original;
  v := replace(original, '''Demo agreed''', '''Demonstration scheduled''');
  v := replace(v, 'v_demo_date := nullif(p_demo ->> ''demo_date'', '''')::date;',
    'v_demo_date := nullif(p_demo ->> ''demo_date'', '''')::date;
  if v_demo_date is null then raise exception using errcode = ''23514'', message = ''DEMO_DATE_REQUIRED''; end if;');
  -- Create the lead as requested first; the subsequent demo insert establishes scheduled evidence.
  v := replace(v, 'current_date, coalesce(v_demo_date, nullif(p_demo ->> ''followup_date'', '''')::date), v_machine_types, v_next_activity,',
    'current_date, nullif(p_demo ->> ''followup_date'', '''')::date, v_machine_types, ''Customer requests a demonstration'',');
  v := replace(v, '         next_followup_date = case when v_demo_date is not null then v_demo_date else next_followup_date end,',
    '         next_followup_date = case when coalesce((p_demo ->> ''update_followup'')::boolean, false)
           then nullif(p_demo ->> ''followup_date'', '''')::date else next_followup_date end,');
  v := replace(v, '         demo_has_run = ''no'',', '         demo_registration_pending = false,');
  v := replace(v, '  insert into public.crm_demo_leads (',
    '  if exists (select 1 from public.crm_demo_leads where source_lead_id = v_lead.id) then
    raise exception using errcode = ''23505'', message = ''DEMO_ALREADY_LINKED'';
  end if;
  insert into public.crm_demo_leads (');
  if v = original or position('DEMO_DATE_REQUIRED' in v) = 0 or position('then v_demo_date else next_followup_date' in v) > 0
    or position('coalesce(v_demo_date,' in v) > 0 then raise exception 'Unexpected demo create definition'; end if;
  execute v;

  select pg_get_functiondef('public.sync_crm_demo_calendar()'::regprocedure) into original;
  v := replace(original, '''Demo agreed''', '''Demonstration scheduled''');
  v := replace(v, 'if new.demo_date is null then', 'if new.demo_date is null or lower(coalesce(new.result_status, '''')) in (''canceled'', ''cancelled'') then');
  v := regexp_replace(v, 'next_followup_date = case\s+when v_previous_demo_date is not null\s+and lead.next_followup_date = v_previous_demo_date then null\s+else lead.next_followup_date\s+end,', 'demo_registration_pending = true,');
  v := replace(v, 'next_followup_date = new.demo_date,', 'demo_registration_pending = false,');
  -- A later commercial stage is not rolled back by calendar maintenance.
  v := replace(v, 'and lead.demo_has_run is distinct from ''yes'';',
    'and lead.demo_has_run is distinct from ''yes''
       and coalesce(lead.next_activity, '''') not in (''Offer sent to the customer'', ''Closed with order'', ''Closed without order'', ''Not relevant'');');
  if v = original or position('next_followup_date =' in v) > 0 or position('seller_initials' in v) = 0 then
    raise exception 'Unexpected calendar definition or missing owner fix';
  end if;
  execute v;

  foreach signature in array array[
    'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])',
    'public.crm_dashboard_lead_kpis(uuid, text, timestamptz)',
    'public.save_crm_lead_note_followup(uuid, uuid, text, date, text, boolean, text)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into original;
    v := replace(original, '''Demo agreed''', '''Demonstration scheduled''');
    if signature like 'public.crm_leads_page_query%' then
      v := replace(v, 'as incomplete, l.created_at', 'as incomplete, l.demo_registration_pending, l.created_at');
      v := replace(v, 'false as incomplete, d.created_at', 'false as incomplete, false as demo_registration_pending, d.created_at');
      v := replace(v, '''incomplete'', incomplete,', '''incomplete'', incomplete, ''demo_registration_pending'', demo_registration_pending,');
      if position('''demo_registration_pending'', demo_registration_pending' in v) = 0 then raise exception 'Missing list warning projection'; end if;
    end if;
    execute v;
  end loop;
end;
$migration$;

drop trigger sync_crm_demo_calendar on public.crm_demo_leads;
create trigger sync_crm_demo_calendar after insert or update of demo_date, result_status, title, notes,
  owner_user_id, owner_name, dealer_company, source_lead_id on public.crm_demo_leads
  for each row execute function public.sync_crm_demo_calendar();

create or replace function public.append_crm_demo_lifecycle_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead public.crm_leads%rowtype; v_actor public.app_users%rowtype; v_type text;
begin
  if tg_table_name = 'crm_leads' then
    if new.next_activity is distinct from 'Customer requests a demonstration' then return new; end if;
    if tg_op = 'UPDATE' and old.next_activity in ('Customer requests a demonstration', 'Customer wants a demonstration') then return new; end if;
    v_lead := new;
    v_type := 'demo_requested';
  else
    if new.demo_date is not distinct from old.demo_date then return new; end if;
    select * into v_lead from public.crm_leads where id = new.source_lead_id;
    if not found then return new; end if;
    v_type := case when old.demo_date is null and new.demo_date is not null then 'demo_scheduled' else 'demo_date_changed' end;
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid()
    or lower(trim(email)) = lower(trim(coalesce(auth.jwt()->>'email', ''))) limit 1;
  insert into public.crm_activities(activity_type, lead_id, title, created_by_user_id, created_by_name,
    assigned_owner_user_id, assigned_owner_name, description, meta)
  values (v_type, v_lead.id, v_type, v_actor.id, coalesce(v_actor.display_name, v_actor.full_name),
    v_lead.owner_user_id, v_lead.owner_name,
    case when tg_table_name = 'crm_demo_leads' then concat_ws(' → ', to_jsonb(old)->>'demo_date', to_jsonb(new)->>'demo_date') else null end,
    jsonb_build_object('source', 'crm_demo_registration'));
  return new;
end;
$$;
revoke all on function public.append_crm_demo_lifecycle_history() from public, anon, authenticated;
create trigger append_crm_demo_requested_history after insert or update of next_activity on public.crm_leads
for each row execute function public.append_crm_demo_lifecycle_history();
create trigger append_crm_demo_date_history after update of demo_date on public.crm_demo_leads
for each row execute function public.append_crm_demo_lifecycle_history();

create or replace function public.unlink_deleted_crm_demo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.crm_calendar_activities set status = 'canceled', updated_at = now() where demo_lead_id = old.id;
  update public.crm_leads set next_activity = 'Customer requests a demonstration', probability = 40,
    demo_registration_pending = true, converted_demo_lead_id = null
  where id = old.source_lead_id and next_activity in ('Demo agreed', 'Demonstration scheduled')
    and demo_has_run is distinct from 'yes' and not public.crm_lead_has_scheduled_demo(id);
  return old;
end;
$$;
revoke all on function public.unlink_deleted_crm_demo() from public, anon, authenticated;
create trigger unlink_deleted_crm_demo after delete on public.crm_demo_leads
for each row execute function public.unlink_deleted_crm_demo();

-- No timeline rewriting, date inference, or historical follow-up restoration.
-- Legacy status='Demo planlagt' is ambiguous and deliberately left unchanged.
update public.crm_leads set next_activity = 'Customer requests a demonstration'
where next_activity = 'Customer wants a demonstration' and demo_has_run is distinct from 'yes';
update public.crm_leads set next_activity = 'Demonstration scheduled'
where next_activity = 'Demo agreed' and public.crm_lead_has_scheduled_demo(id);
update public.crm_leads set demo_registration_pending = true,
  next_activity = 'Customer requests a demonstration', probability = 40
where next_activity in ('Demo agreed', 'Demonstration scheduled') and not public.crm_lead_has_scheduled_demo(id)
  and demo_has_run is distinct from 'yes';
