-- Backend-only read model for the existing submitted-order correction
-- snapshots. The correction sessions themselves remain private; this RPC
-- exposes only the history for one submitted order to the authenticated
-- Backend actor.
create or replace function public.list_submitted_configurator_order_corrections(
  p_configuration_id uuid
)
returns table (
  id uuid,
  revision_number bigint,
  reason text,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  started_at timestamptz,
  completed_at timestamptz,
  status text,
  before_snapshot jsonb,
  after_snapshot jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can read submitted-order revision history' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.configurations c
     where c.id = p_configuration_id
       and public.is_submitted_configurator_order(c)
  ) then
    raise exception 'Only submitted orders have revision history' using errcode = '22023';
  end if;

  return query
  select
    s.id,
    row_number() over (order by s.started_at)::bigint,
    s.reason,
    s.actor_user_id,
    coalesce(au.full_name, au.display_name, au.email),
    au.email,
    s.started_at,
    s.completed_at,
    s.status,
    s.before_snapshot,
    s.after_snapshot
  from public.configurator_order_correction_sessions s
  left join public.app_users au on au.id = s.actor_user_id
  where s.configuration_id = p_configuration_id
  order by s.started_at;
end;
$$;

revoke all on function public.list_submitted_configurator_order_corrections(uuid) from public, anon;
grant execute on function public.list_submitted_configurator_order_corrections(uuid) to authenticated;
