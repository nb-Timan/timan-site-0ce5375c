-- “Demo afholdt?” is an existing lead field. Record its state change as a
-- canonical history event and complete the one calendar event for the demo.
create or replace function public.append_crm_demo_held_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.app_users%rowtype;
begin
  if new.demo_has_run is not distinct from 'yes'
     or old.demo_has_run is not distinct from 'yes' then
    return new;
  end if;

  select * into v_actor
  from public.app_users
  where auth_user_id = auth.uid()
     or lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  limit 1;

  update public.crm_calendar_activities
     set status = 'completed', updated_at = now()
   where demo_lead_id = new.converted_demo_lead_id
     and status <> 'completed';

  insert into public.crm_activities (
    activity_type, lead_id, account_id, created_by_user_id, created_by_name,
    assigned_owner_user_id, assigned_owner_name, title, description, status, meta
  ) values (
    'demo_held', new.id, new.linked_dealer_id, v_actor.id,
    coalesce(v_actor.display_name, v_actor.full_name, v_actor.email),
    new.owner_user_id, new.owner_name, 'Demo afholdt',
    'Demo er markeret som afholdt', 'completed',
    jsonb_build_object('demo_id', new.converted_demo_lead_id)
  );
  return new;
end;
$$;

drop trigger if exists append_crm_demo_held_history on public.crm_leads;
create trigger append_crm_demo_held_history
after update of demo_has_run on public.crm_leads
for each row execute function public.append_crm_demo_held_history();

revoke all on function public.append_crm_demo_held_history() from public, anon, authenticated;

-- Submitted quotes/orders retain priority over the demo-held presentation.
do $migration$
declare
  v_page text;
  v_dashboard text;
  v_page_signature constant text := 'public.crm_leads_page_query(boolean, uuid, text, uuid[], uuid[], text[], text, text, text, text, text, text, text, text, integer, integer, timestamptz, text, uuid[])';
  v_dashboard_signature constant text := 'public.crm_dashboard_lead_kpis(uuid, text, timestamptz)';
begin
  select pg_get_functiondef(v_page_signature::regprocedure) into v_page;
  if position('''Demo afholdt''' in v_page) = 0 then
    v_page := replace(v_page,
      'when coalesce(lse.has_sent_quote, false) then ''Tilbud sendt'' else case',
      'when coalesce(lse.has_sent_quote, false) then ''Tilbud sendt'' when l.demo_has_run = ''yes'' then ''Demo afholdt'' else case');
    v_page := replace(v_page,
      'when coalesce(lse.has_sent_quote, false) then 70 else case',
      'when coalesce(lse.has_sent_quote, false) then 70 when l.demo_has_run = ''yes'' then coalesce(l.probability, 50) else case');
    execute v_page;
  end if;

  select pg_get_functiondef(v_dashboard_signature::regprocedure) into v_dashboard;
  if position('''Demo afholdt''' in v_dashboard) = 0 then
    v_dashboard := replace(v_dashboard,
      'when coalesce(lse.has_sent_quote, false) then ''Tilbud sendt'' else case',
      'when coalesce(lse.has_sent_quote, false) then ''Tilbud sendt'' when l.demo_has_run = ''yes'' then ''Demo afholdt'' else case');
    v_dashboard := replace(v_dashboard,
      'when display_status = ''Demo planlagt'' then ''demo''',
      'when display_status in (''Demo planlagt'', ''Demo afholdt'') then ''demo''');
    execute v_dashboard;
  end if;
end;
$migration$;
