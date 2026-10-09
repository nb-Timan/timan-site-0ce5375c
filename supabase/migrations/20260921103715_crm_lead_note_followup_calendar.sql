-- Quick Notes keep using crm_activities. These two relations make an optional
-- calendar entry traceable to exactly one lead note without a parallel model.
alter table public.crm_calendar_activities
  add column if not exists lead_id uuid references public.crm_leads(id) on delete cascade,
  add column if not exists lead_activity_id uuid references public.crm_activities(id) on delete cascade;

create index if not exists crm_calendar_activities_lead_start_idx
  on public.crm_calendar_activities (lead_id, start_datetime);

create unique index if not exists crm_calendar_activities_lead_activity_unique
  on public.crm_calendar_activities (lead_activity_id)
  where lead_activity_id is not null;

create or replace function public.save_crm_lead_note_followup(
  p_note_id uuid,
  p_lead_id uuid,
  p_note text,
  p_next_followup_date date default null,
  p_next_activity text default null,
  p_add_to_calendar boolean default false,
  p_lead_title text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor public.app_users%rowtype;
  v_owner public.app_users%rowtype;
  v_lead public.crm_leads%rowtype;
  v_note public.crm_activities%rowtype;
  v_calendar_id uuid;
  v_note_text text := nullif(btrim(coalesce(p_note, '')), '');
  v_next_activity text := nullif(btrim(coalesce(p_next_activity, '')), '');
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_note_id is null or p_lead_id is null then
    raise exception 'Note id and lead id are required' using errcode = '22023';
  end if;
  if v_note_text is null then
    raise exception 'Note must not be empty' using errcode = '22023';
  end if;
  if p_add_to_calendar and p_next_followup_date is null then
    raise exception 'A follow-up date is required for a calendar activity' using errcode = '22023';
  end if;
  if v_next_activity is not null and not (v_next_activity = any (array[
    'Follow-up on leads',
    'Sales material sent to the customer',
    'Offer sent to the customer',
    'Customer wants a demonstration',
    'Customer requests a demonstration',
    'Lead sent to the dealer',
    'Closed without order',
    'Closed with order',
    'Not relevant',
    'New lead',
    'Wants to be contacted',
    'Timan'
  ]::text[])) then
    raise exception 'Unsupported next activity' using errcode = '22023';
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

  -- RLS on crm_leads is authoritative for real users and View-as scope.
  select lead.* into v_lead
  from public.crm_leads lead
  where lead.id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found or not permitted' using errcode = 'P0002';
  end if;

  select owner.* into v_owner
  from public.app_users owner
  where owner.id = v_lead.owner_user_id
  limit 1;

  insert into public.crm_activities (
    id,
    activity_type,
    lead_id,
    title,
    description,
    activity_date,
    account_id,
    account_name,
    created_by_user_id,
    created_by_name,
    assigned_owner_user_id,
    assigned_owner_name,
    status,
    meta,
    created_at
  ) values (
    p_note_id,
    'comment',
    v_lead.id,
    coalesce(nullif(btrim(p_lead_title), ''), v_lead.title, 'Lead-note'),
    v_note_text,
    now(),
    v_lead.linked_dealer_id,
    null,
    v_actor.id,
    coalesce(nullif(v_actor.display_name, ''), v_actor.initials, v_actor.email),
    v_lead.owner_user_id,
    v_lead.owner_name,
    'completed',
    jsonb_build_object(
      'lead_id', v_lead.id,
      'source', 'crm_lead_quick_note',
      'next_followup_date', p_next_followup_date,
      'next_activity', v_next_activity,
      'calendar_requested', coalesce(p_add_to_calendar, false)
    ),
    now()
  )
  on conflict (id) do nothing
  returning * into v_note;

  if not found then
    select activity.* into v_note
    from public.crm_activities activity
    where activity.id = p_note_id
      and activity.activity_type = 'comment'
      and activity.lead_id = v_lead.id;
    if not found then
      raise exception 'Note id is already used outside this lead' using errcode = '23505';
    end if;
  end if;

  if v_lead.next_followup_date is distinct from p_next_followup_date
     or v_lead.next_activity is distinct from v_next_activity then
    update public.crm_leads lead
    set next_followup_date = p_next_followup_date,
        next_activity = v_next_activity,
        probability = case
          when lead.next_activity is not distinct from v_next_activity then lead.probability
          when v_next_activity is null then lead.probability
          when v_next_activity = 'Wants to be contacted' then 15
          when v_next_activity = 'Sales material sent to the customer' then 30
          when v_next_activity = 'Customer wants a demonstration' then 40
          when v_next_activity = 'Customer requests a demonstration' then 50
          when v_next_activity = 'Follow-up on leads' then 25
          when v_next_activity = 'Offer sent to the customer' then 70
          when v_next_activity = 'Closed with order' then 100
          when v_next_activity in ('Closed without order', 'Not relevant') then 0
          else 10
        end,
        pipeline_stage = case
          when lead.next_activity is not distinct from v_next_activity then lead.pipeline_stage
          when v_next_activity is null then lead.pipeline_stage
          when v_next_activity = 'Offer sent to the customer' then 'Offer sent'
          when v_next_activity = 'Closed with order' then 'Won'
          when v_next_activity in ('Closed without order', 'Not relevant') then 'Lost'
          when v_next_activity in ('Customer wants a demonstration', 'Customer requests a demonstration', 'Follow-up on leads') then 'Qualified'
          else 'Lead'
        end,
        updated_at = now()
    where lead.id = v_lead.id
    returning * into v_lead;
  end if;

  if p_add_to_calendar then
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
      lead_activity_id
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
      v_note_text,
      'planned',
      v_actor.id,
      v_actor.email,
      v_actor.id,
      v_lead.id,
      v_note.id
    )
    on conflict (lead_activity_id) where lead_activity_id is not null
    do update set
      title = excluded.title,
      start_datetime = excluded.start_datetime,
      end_datetime = excluded.end_datetime,
      account_id = excluded.account_id,
      seller_user_id = excluded.seller_user_id,
      seller_initials = excluded.seller_initials,
      seller_name = excluded.seller_name,
      participant_seller_initials = excluded.participant_seller_initials,
      activity_type = excluded.activity_type,
      note = excluded.note,
      status = 'planned',
      updated_by_user_id = v_actor.id,
      updated_at = now()
    returning id into v_calendar_id;
  else
    delete from public.crm_calendar_activities calendar
    where calendar.lead_activity_id = v_note.id;
    v_calendar_id := null;
  end if;

  return jsonb_build_object(
    'note', to_jsonb(v_note),
    'calendar_activity_id', v_calendar_id,
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'next_followup_date', v_lead.next_followup_date,
      'next_activity', v_lead.next_activity,
      'probability', v_lead.probability,
      'pipeline_stage', v_lead.pipeline_stage
    )
  );
end;
$$;

revoke all on function public.save_crm_lead_note_followup(uuid, uuid, text, date, text, boolean, text) from public, anon;
grant execute on function public.save_crm_lead_note_followup(uuid, uuid, text, date, text, boolean, text) to authenticated;
