-- Foundation for module-level usage analytics.
--
-- This is intentionally separate from:
-- - audit_log: who changed what
-- - guest_sessions: broad session/visit tracking
-- - portal_activity_log: page/module page views
--
-- The frontend writes through record_portal_module_usage(), which resolves the
-- authenticated app user from the JWT. Client input cannot choose another user.

create table if not exists public.portal_module_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  auth_user_id uuid,
  email text not null,
  portal_role text,
  dealer_number text,
  session_id uuid not null,
  module_key text not null,
  first_seen_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  visit_count integer not null default 1 check (visit_count >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portal_module_usage_session_module_key unique (session_id, module_key)
);

create index if not exists portal_module_usage_user_idx
  on public.portal_module_usage(user_id, last_active_at desc);

create index if not exists portal_module_usage_email_idx
  on public.portal_module_usage(lower(email), last_active_at desc);

create index if not exists portal_module_usage_module_idx
  on public.portal_module_usage(module_key, last_active_at desc);

create index if not exists portal_module_usage_session_idx
  on public.portal_module_usage(session_id);

alter table public.portal_module_usage enable row level security;

revoke all on public.portal_module_usage from anon, public;
grant select, insert, update on public.portal_module_usage to authenticated;
grant all on public.portal_module_usage to service_role;

drop policy if exists portal_module_usage_select_self on public.portal_module_usage;
drop policy if exists portal_module_usage_select_backend on public.portal_module_usage;
drop policy if exists portal_module_usage_select_access on public.portal_module_usage;
create policy portal_module_usage_select_access
  on public.portal_module_usage
  for select
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    or lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
    or exists (
      select 1
        from public.app_users au
       where (
          au.auth_user_id = (select auth.uid())
          or lower(au.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
       )
         and au.portal_role::text = 'timan_backend'
         and coalesce(au.approved, false) = true
         and coalesce(au.is_active, false) = true
    )
  );

drop policy if exists portal_module_usage_insert_self on public.portal_module_usage;
create policy portal_module_usage_insert_self
  on public.portal_module_usage
  for insert
  to authenticated
  with check (
    auth_user_id = (select auth.uid())
    and lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  );

drop policy if exists portal_module_usage_update_self on public.portal_module_usage;
create policy portal_module_usage_update_self
  on public.portal_module_usage
  for update
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    and lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  )
  with check (
    auth_user_id = (select auth.uid())
    and lower(email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
  );

create or replace function public.record_portal_module_usage(
  p_session_id uuid,
  p_module_key text,
  p_active_seconds integer default 0,
  p_visit_increment integer default 0
)
returns public.portal_module_usage
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user public.app_users%rowtype;
  v_active_seconds integer;
  v_visit_increment integer;
  v_row public.portal_module_usage%rowtype;
begin
  if auth.uid() is null then
    raise exception 'record_portal_module_usage requires an authenticated user'
      using errcode = '42501';
  end if;

  if p_session_id is null then
    raise exception 'session_id is required'
      using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_module_key, '')), '') is null then
    raise exception 'module_key is required'
      using errcode = '22023';
  end if;

  select *
    into v_user
    from public.app_users au
   where au.auth_user_id = auth.uid()
      or lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   order by case when au.auth_user_id = auth.uid() then 0 else 1 end
   limit 1;

  if not found then
    raise exception 'No app user found for current session'
      using errcode = '42501';
  end if;

  v_active_seconds := least(greatest(coalesce(p_active_seconds, 0), 0), 90);
  v_visit_increment := least(greatest(coalesce(p_visit_increment, 0), 0), 1);

  insert into public.portal_module_usage (
    user_id,
    auth_user_id,
    email,
    portal_role,
    dealer_number,
    session_id,
    module_key,
    first_seen_at,
    last_active_at,
    active_seconds,
    visit_count,
    created_at,
    updated_at
  )
  values (
    v_user.id,
    auth.uid(),
    lower(v_user.email),
    coalesce(v_user.portal_role::text, v_user.role),
    v_user.dealer_number,
    p_session_id,
    lower(trim(p_module_key)),
    now(),
    now(),
    v_active_seconds,
    greatest(v_visit_increment, 1),
    now(),
    now()
  )
  on conflict (session_id, module_key)
  do update set
    user_id = excluded.user_id,
    auth_user_id = excluded.auth_user_id,
    email = excluded.email,
    portal_role = excluded.portal_role,
    dealer_number = excluded.dealer_number,
    last_active_at = now(),
    active_seconds = public.portal_module_usage.active_seconds + v_active_seconds,
    visit_count = public.portal_module_usage.visit_count + v_visit_increment,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.record_portal_module_usage(uuid, text, integer, integer) from public, anon;
grant execute on function public.record_portal_module_usage(uuid, text, integer, integer) to authenticated, service_role;

create or replace function public.get_portal_module_usage_summary(
  p_from timestamptz default (now() - interval '30 days'),
  p_to timestamptz default now()
)
returns table (
  user_id uuid,
  email text,
  portal_role text,
  dealer_number text,
  module_key text,
  visit_count bigint,
  active_seconds bigint,
  last_active_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    pmu.user_id,
    pmu.email,
    pmu.portal_role,
    pmu.dealer_number,
    pmu.module_key,
    sum(pmu.visit_count)::bigint as visit_count,
    sum(pmu.active_seconds)::bigint as active_seconds,
    max(pmu.last_active_at) as last_active_at
  from public.portal_module_usage pmu
  where pmu.last_active_at >= p_from
    and pmu.last_active_at <= p_to
  group by pmu.user_id, pmu.email, pmu.portal_role, pmu.dealer_number, pmu.module_key
  order by max(pmu.last_active_at) desc;
$$;

revoke all on function public.get_portal_module_usage_summary(timestamptz, timestamptz) from public, anon;
grant execute on function public.get_portal_module_usage_summary(timestamptz, timestamptz) to authenticated, service_role;
