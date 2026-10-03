-- Demo results own only demonstration-specific facts. Historical commercial
-- columns remain intact for old records and reporting compatibility.
create or replace function public.save_crm_demo_result(
  p_demo_id uuid,
  p_result jsonb,
  p_effective_user_id uuid default null
)
returns public.crm_demo_leads
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor public.app_users%rowtype := public.crm_demo_effective_actor(p_effective_user_id);
  demo public.crm_demo_leads%rowtype;
  lead_row public.crm_leads%rowtype;
  interest integer := nullif(p_result->>'interest_level', '')::integer;
  competitors text := nullif(p_result->>'competitors_present', '');
begin
  select * into demo
  from public.crm_demo_leads
  where id = p_demo_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'DEMO_OUTSIDE_SCOPE';
  end if;

  select * into lead_row
  from public.crm_leads
  where id = demo.source_lead_id
  for update;

  if not found
     or (coalesce(actor.portal_role::text, actor.role) = 'timan_seller'
         and lead_row.owner_user_id is distinct from actor.id) then
    raise exception using errcode = '42501', message = 'DEMO_LEAD_OUTSIDE_SCOPE';
  end if;

  if demo.demo_date is null
     or demo.demo_date > (now() at time zone 'Europe/Copenhagen')::date then
    raise exception using errcode = '23514', message = 'DEMO_NOT_YET_HELD';
  end if;

  if interest is null
     or interest not between 1 and 5
     or (competitors is not null and competitors not in ('yes', 'no')) then
    raise exception using errcode = '23514', message = 'DEMO_RESULT_REQUIRED';
  end if;

  update public.crm_demo_leads
  set interest_level = interest,
      competitors_present = competitors,
      completed_at = coalesce(completed_at, now()),
      completed_by = coalesce(completed_by, actor.id)
  where id = p_demo_id
  returning * into demo;

  -- These are relationship/completion flags only. Commercial lead fields such
  -- as status, probability, value, follow-up and notes remain untouched.
  update public.crm_leads
  set demo_has_run = 'yes',
      demo_registration_pending = false
  where id = lead_row.id;

  return demo;
end;
$$;

revoke all on function public.save_crm_demo_result(uuid, jsonb, uuid) from public, anon;
grant execute on function public.save_crm_demo_result(uuid, jsonb, uuid) to authenticated;

-- Keep one canonical completion event. The existing transition guard prevents
-- duplicate events when an already completed result is edited.
create or replace function public.append_crm_demo_held_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.app_users%rowtype;
  v_demo public.crm_demo_leads%rowtype;
begin
  if new.demo_has_run is distinct from 'yes'
     or old.demo_has_run is not distinct from 'yes' then
    return new;
  end if;

  select * into v_actor
  from public.app_users
  where auth_user_id = auth.uid()
     or lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  limit 1;

  select * into v_demo
  from public.crm_demo_leads
  where id = new.converted_demo_lead_id;

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
    concat_ws(' · ',
      case when v_demo.demo_date is not null then
        'Demo kørt ' || to_char(v_demo.demo_date, 'DD-MM-YYYY')
      else 'Demo kørt' end,
      nullif(v_demo.dealer_company, '')
    ),
    'completed',
    jsonb_strip_nulls(jsonb_build_object(
      'demo_id', new.converted_demo_lead_id,
      'demo_date', v_demo.demo_date,
      'dealer_company', nullif(v_demo.dealer_company, '')
    ))
  );

  return new;
end;
$$;

revoke all on function public.append_crm_demo_held_history() from public, anon, authenticated;
