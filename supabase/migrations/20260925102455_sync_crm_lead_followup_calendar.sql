create unique index if not exists crm_calendar_activities_lead_followup_unique
  on public.crm_calendar_activities (lead_id)
  where lead_id is not null
    and lead_activity_id is null
    and demo_lead_id is null
    and activity_type = 'andet';

create or replace function public.sync_crm_lead_followup_calendar(
  p_lead_id uuid,
  p_enabled boolean,
  p_next_followup_date date default null,
  p_next_activity text default null,
  p_lead_title text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor public.app_users%rowtype;
  v_owner public.app_users%rowtype;
  v_lead public.crm_leads%rowtype;
  v_calendar_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_lead_id is null then
    raise exception 'Lead id is required' using errcode = '22023';
  end if;
  if coalesce(p_enabled, false) and p_next_followup_date is null then
    raise exception 'A follow-up date is required for a calendar activity' using errcode = '22023';
  end if;

  select actor.* into v_actor
  from public.app_users actor
  where actor.auth_user_id = (select auth.uid())
     or lower(actor.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  order by case when actor.auth_user_id = (select auth.uid()) then 0 else 1 end
  limit 1;

  if not found or not coalesce(v_actor.approved, false) or not coalesce(v_actor.is_active, false) then
    raise exception 'Active portal user not found' using errcode = '42501';
  end if;

  -- The existing crm_leads and calendar RLS policies remain authoritative.
  select lead.* into v_lead
  from public.crm_leads lead
  where lead.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found or not permitted' using errcode = 'P0002';
  end if;

  if not coalesce(p_enabled, false) then
    delete from public.crm_calendar_activities calendar
    where calendar.lead_id = v_lead.id
      and calendar.lead_activity_id is null
      and calendar.demo_lead_id is null
      and calendar.activity_type = 'andet';
    return null;
  end if;

  select owner.* into v_owner
  from public.app_users owner
  where owner.id = v_lead.owner_user_id
  limit 1;

  v_start := (p_next_followup_date + time '09:00') at time zone 'Europe/Copenhagen';
  v_end := v_start + interval '30 minutes';

  insert into public.crm_calendar_activities (
    title,
    start_datetime,
    end_datetime,
    account_id,
    seller_user_id,
    seller_initials,
    seller_name,
    participant_seller_initials,
    activity_type,
    note,
    status,
    created_by_user_id,
    created_by_email,
    updated_by_user_id,
    lead_id,
    lead_activity_id,
    demo_lead_id
  ) values (
    'Opfølgning: ' || coalesce(nullif(btrim(p_lead_title), ''), v_lead.title, 'Lead'),
    v_start,
    v_end,
    v_lead.linked_dealer_id,
    v_lead.owner_user_id,
    v_owner.initials,
    coalesce(v_lead.owner_name, v_owner.display_name),
    case when nullif(btrim(coalesce(v_owner.initials, '')), '') is null then '{}'::text[] else array[upper(v_owner.initials)] end,
    'andet',
    nullif(btrim(coalesce(p_next_activity, '')), ''),
    'planned',
    v_actor.id,
    v_actor.email,
    v_actor.id,
    v_lead.id,
    null,
    null
  )
  on conflict (lead_id) where lead_id is not null
    and lead_activity_id is null
    and demo_lead_id is null
    and activity_type = 'andet'
  do update set
    title = excluded.title,
    start_datetime = excluded.start_datetime,
    end_datetime = excluded.end_datetime,
    account_id = excluded.account_id,
    seller_user_id = excluded.seller_user_id,
    seller_initials = excluded.seller_initials,
    seller_name = excluded.seller_name,
    participant_seller_initials = excluded.participant_seller_initials,
    note = excluded.note,
    status = 'planned',
    updated_by_user_id = v_actor.id,
    updated_at = now()
  returning id into v_calendar_id;

  return v_calendar_id;
end;
$$;

revoke all on function public.sync_crm_lead_followup_calendar(uuid, boolean, date, text, text) from public, anon;
grant execute on function public.sync_crm_lead_followup_calendar(uuid, boolean, date, text, text) to authenticated;
