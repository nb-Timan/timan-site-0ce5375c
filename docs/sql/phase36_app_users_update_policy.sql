-- ⚠️ SUPERSEDED AND INSECURE — DO NOT RUN.
-- Phase 36 restored fully permissive policies on public.app_users
-- (select/update using (true) with check (true)). Combined with the public
-- publishable key this allowed any anonymous visitor to enumerate all users
-- and grant themselves timan_backend. It is replaced by
-- docs/sql/phase63_app_users_rls_hardening.sql. Kept only for history.

-- Phase 36 — Restore permissive UPDATE policy on public.app_users.
--
-- HOW TO RUN
-- 1. Open your Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent).
--
-- ROOT CAUSE
-- The Backend → Brugere editor saves changes via PostgREST PATCH
-- /rest/v1/app_users?id=eq.<id> using the publishable (anon) key. In the
-- live database this PATCH currently returns HTTP 200 with an empty body
-- (`[]`, content-range `*/*`) — i.e. **0 rows updated** — even though the
-- row clearly exists. supabase-js treats 0-row updates as success (no
-- error, data = null), so the UI showed "Saved" while nothing changed.
--
-- Reason: the permissive UPDATE policy from `phase2_backend_users.sql`
-- (`app_users_anon_update USING (true) WITH CHECK (true)`) is missing or
-- has been replaced by a stricter policy that no longer matches anon
-- requests, so the row falls outside the policy's USING clause and the
-- update silently affects 0 rows.
--
-- App-level role gating still happens in React (AppUserContext +
-- /portal/backend/users access check). Tighten this to auth.uid()
-- when proper Supabase Auth roles are wired into the backend admin flow.

alter table public.app_users enable row level security;

-- Drop any older variants so this script is the single source of truth.
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='app_users' and policyname='app_users_anon_select') then
    drop policy "app_users_anon_select" on public.app_users;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='app_users' and policyname='app_users_anon_update') then
    drop policy "app_users_anon_update" on public.app_users;
  end if;
end$$;

create policy "app_users_anon_select"
  on public.app_users
  for select
  using (true);

create policy "app_users_anon_update"
  on public.app_users
  for update
  using (true)
  with check (true);
