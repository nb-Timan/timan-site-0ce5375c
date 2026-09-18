-- Lead comments remain canonical crm_activities. Priority only controls their
-- per-lead display order and never changes note text, author, or timestamps.
alter table public.crm_activities
  add column if not exists priority_position smallint;

alter table public.crm_activities
  drop constraint if exists crm_activities_comment_priority_position_check;

alter table public.crm_activities
  add constraint crm_activities_comment_priority_position_check
  check (priority_position is null or priority_position in (1, 2, 3));

create unique index if not exists crm_activities_lead_comment_priority_unique
  on public.crm_activities (lead_id, priority_position)
  where activity_type = 'comment' and lead_id is not null and priority_position is not null;

create or replace function public.set_crm_lead_note_priority(
  p_note_id uuid,
  p_priority smallint default null
)
returns table (id uuid, priority_position smallint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lead_id uuid;
begin
  if p_priority is not null and p_priority not in (1, 2, 3) then
    raise exception 'Priority must be 1, 2, 3, or null' using errcode = '22023';
  end if;

  -- RLS applies because this is SECURITY INVOKER. The row lock also serializes
  -- simultaneous moves for the same lead before an occupied slot is released.
  select activity.lead_id
    into v_lead_id
  from public.crm_activities activity
  where activity.id = p_note_id
    and activity.activity_type = 'comment'
    and activity.lead_id is not null
  for update;

  if not found then
    raise exception 'Lead note not found or not permitted' using errcode = 'P0002';
  end if;

  perform 1
  from public.crm_activities activity
  where activity.lead_id = v_lead_id
    and activity.activity_type = 'comment'
  for update;

  if p_priority is not null then
    update public.crm_activities
    set priority_position = null
    where lead_id = v_lead_id
      and activity_type = 'comment'
      and priority_position = p_priority
      and id <> p_note_id;
  end if;

  return query
  update public.crm_activities activity
  set priority_position = p_priority
  where activity.id = p_note_id
  returning activity.id, activity.priority_position;
end;
$$;

revoke all on function public.set_crm_lead_note_priority(uuid, smallint) from public;
grant execute on function public.set_crm_lead_note_priority(uuid, smallint) to authenticated;
