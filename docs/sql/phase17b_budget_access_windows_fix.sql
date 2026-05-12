-- =====================================================================
-- Phase 17b — Fix close/extend sync for budget_access_windows
--
-- Problem:
--   Closing or extending a budget access window from the CRM showed
--   "Gemt lokalt – ikke synkroniseret til serveren" because the direct
--   UPDATE to public.budget_access_windows was rejected (or matched 0
--   rows under RLS) and the client fell back to localStorage.
--
-- Fix:
--   1. Re-assert RLS policies for SELECT/INSERT/UPDATE on the table
--      (idempotent — drops the old ones and recreates them so any drift
--      from a partial Phase 17 deployment is corrected).
--   2. Add a DELETE policy for backend users (was missing).
--   3. Provide SECURITY DEFINER RPCs close_budget_access_window() and
--      extend_budget_access_window() so the frontend can update windows
--      reliably even if direct-row RLS edge-cases bite.
--
-- Safe to run multiple times. Does not touch configurator pricing,
-- products, leads/quotes/orders, n8n webhooks, or existing budget rows.
-- Existing window rows are untouched.
-- =====================================================================

-- ---------- 1) Ensure table exists (no-op if Phase 17 ran) -----------
create table if not exists public.budget_access_windows (
  id uuid primary key default gen_random_uuid(),
  budget_year integer not null,
  scope text not null check (scope in ('all', 'seller')),
  seller_initials text,
  seller_email text,
  open_from timestamptz not null default now(),
  open_until timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.budget_access_windows enable row level security;

-- ---------- 2) Re-assert RLS policies --------------------------------
do $$
begin
  -- Drop any prior policies so we can recreate cleanly.
  if exists (select 1 from pg_policies where tablename='budget_access_windows' and policyname='budget_access_windows_select_authed') then
    drop policy budget_access_windows_select_authed on public.budget_access_windows;
  end if;
  if exists (select 1 from pg_policies where tablename='budget_access_windows' and policyname='budget_access_windows_insert_backend') then
    drop policy budget_access_windows_insert_backend on public.budget_access_windows;
  end if;
  if exists (select 1 from pg_policies where tablename='budget_access_windows' and policyname='budget_access_windows_update_backend') then
    drop policy budget_access_windows_update_backend on public.budget_access_windows;
  end if;
  if exists (select 1 from pg_policies where tablename='budget_access_windows' and policyname='budget_access_windows_delete_backend') then
    drop policy budget_access_windows_delete_backend on public.budget_access_windows;
  end if;
end $$;

create policy budget_access_windows_select_authed
  on public.budget_access_windows
  for select
  to authenticated
  using (true);

create policy budget_access_windows_insert_backend
  on public.budget_access_windows
  for insert
  to authenticated
  with check (public.is_timan_backend());

create policy budget_access_windows_update_backend
  on public.budget_access_windows
  for update
  to authenticated
  using (public.is_timan_backend())
  with check (public.is_timan_backend());

create policy budget_access_windows_delete_backend
  on public.budget_access_windows
  for delete
  to authenticated
  using (public.is_timan_backend());

grant select, insert, update, delete on public.budget_access_windows to authenticated;

-- ---------- 3) SECURITY DEFINER RPCs ---------------------------------
-- These let the frontend close/extend a window reliably. Authorization
-- is enforced INSIDE the function — non-backend callers get 42501.

create or replace function public.close_budget_access_window(
  _id uuid,
  _closed_by text default null
)
returns public.budget_access_windows
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.budget_access_windows;
begin
  if not public.is_timan_backend() then
    raise exception 'forbidden: not a Timan Backend user'
      using errcode = '42501';
  end if;

  update public.budget_access_windows
     set status    = 'closed',
         closed_at = now(),
         closed_by = coalesce(_closed_by, closed_by)
   where id = _id
   returning * into row;

  if row.id is null then
    raise exception 'budget_access_window % not found', _id
      using errcode = 'P0002';
  end if;

  return row;
end;
$$;

revoke all on function public.close_budget_access_window(uuid, text) from public;
grant execute on function public.close_budget_access_window(uuid, text) to authenticated;

create or replace function public.extend_budget_access_window(
  _id uuid,
  _new_open_until timestamptz
)
returns public.budget_access_windows
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.budget_access_windows;
begin
  if not public.is_timan_backend() then
    raise exception 'forbidden: not a Timan Backend user'
      using errcode = '42501';
  end if;

  update public.budget_access_windows
     set open_until = _new_open_until
   where id = _id
   returning * into row;

  if row.id is null then
    raise exception 'budget_access_window % not found', _id
      using errcode = 'P0002';
  end if;

  return row;
end;
$$;

revoke all on function public.extend_budget_access_window(uuid, timestamptz) from public;
grant execute on function public.extend_budget_access_window(uuid, timestamptz) to authenticated;
