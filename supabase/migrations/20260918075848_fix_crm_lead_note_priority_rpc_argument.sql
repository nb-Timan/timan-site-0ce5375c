-- PostgREST resolves JSON numeric RPC arguments as integer, not smallint.
-- Keep the stored priority smallint while exposing an unambiguous RPC signature.
drop function if exists public.set_crm_lead_note_priority(uuid, smallint);

create function public.set_crm_lead_note_priority(
  p_note_id uuid,
  p_priority integer default null
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
      and priority_position = p_priority::smallint
      and id <> p_note_id;
  end if;

  return query
  update public.crm_activities activity
  set priority_position = p_priority::smallint
  where activity.id = p_note_id
  returning activity.id, activity.priority_position;
end;
$$;

revoke all on function public.set_crm_lead_note_priority(uuid, integer) from public;
grant execute on function public.set_crm_lead_note_priority(uuid, integer) to authenticated;
