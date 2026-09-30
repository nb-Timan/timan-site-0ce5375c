alter table public.support_feedback
  add column if not exists reason_code text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.support_feedback
  drop constraint if exists support_feedback_reason_code_check;

alter table public.support_feedback
  add constraint support_feedback_reason_code_check
  check (reason_code is null or reason_code in (
    'INCORRECT',
    'NOT_RELEVANT',
    'MISSING_INFORMATION',
    'HARD_TO_UNDERSTAND',
    'OTHER'
  ));

alter table public.support_feedback
  drop constraint if exists support_feedback_response_user_key;

alter table public.support_feedback
  add constraint support_feedback_response_user_key
  unique (response_id, submitted_by_user_id);

drop trigger if exists support_feedback_touch_updated_at on public.support_feedback;
create trigger support_feedback_touch_updated_at
before update on public.support_feedback
for each row execute function public.support_touch_updated_at();

comment on column public.support_feedback.reason_code is
  'Optional canonical reason for negative answer feedback.';

create or replace function public.support_feedback_actor_user_id()
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

revoke all on function public.support_feedback_actor_user_id() from public, anon, authenticated, service_role;
grant execute on function public.support_feedback_actor_user_id() to authenticated;

drop policy if exists support_feedback_support_insert on public.support_feedback;
drop policy if exists support_feedback_support_update on public.support_feedback;
drop policy if exists support_feedback_support_delete on public.support_feedback;

create policy support_feedback_support_insert
on public.support_feedback for insert to authenticated
with check (
  (select public.can_access_support())
  and submitted_by_user_id = (select public.support_feedback_actor_user_id())
);

create policy support_feedback_support_update
on public.support_feedback for update to authenticated
using (
  (select public.can_access_support())
  and submitted_by_user_id = (select public.support_feedback_actor_user_id())
)
with check (
  (select public.can_access_support())
  and submitted_by_user_id = (select public.support_feedback_actor_user_id())
);

create policy support_feedback_support_delete
on public.support_feedback for delete to authenticated
using (
  (select public.can_access_support())
  and submitted_by_user_id = (select public.support_feedback_actor_user_id())
);
