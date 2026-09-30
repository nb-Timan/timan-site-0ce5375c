create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.support_feedback_actor_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.app_users u
  where u.approved is true
    and u.is_active is true
    and (
      u.auth_user_id = (select auth.uid())
      or lower(u.email) = lower(nullif((select auth.jwt() ->> 'email'), ''))
    )
  order by (u.auth_user_id = (select auth.uid())) desc
  limit 1
$$;

revoke all on function private.support_feedback_actor_user_id() from public, anon, authenticated, service_role;
grant execute on function private.support_feedback_actor_user_id() to authenticated;

drop policy if exists support_feedback_support_insert on public.support_feedback;
drop policy if exists support_feedback_support_update on public.support_feedback;
drop policy if exists support_feedback_support_delete on public.support_feedback;

create policy support_feedback_support_insert
on public.support_feedback for insert to authenticated
with check (
  (select public.can_access_support())
  and submitted_by_user_id = (select private.support_feedback_actor_user_id())
);

create policy support_feedback_support_update
on public.support_feedback for update to authenticated
using (
  (select public.can_access_support())
  and submitted_by_user_id = (select private.support_feedback_actor_user_id())
)
with check (
  (select public.can_access_support())
  and submitted_by_user_id = (select private.support_feedback_actor_user_id())
);

create policy support_feedback_support_delete
on public.support_feedback for delete to authenticated
using (
  (select public.can_access_support())
  and submitted_by_user_id = (select private.support_feedback_actor_user_id())
);

drop function if exists public.support_feedback_actor_user_id();

comment on function private.support_feedback_actor_user_id() is
  'Resolves the active application user for owner-scoped Support answer feedback.';
