-- Phase 41 — Harden RLS on configuration_user_hidden.
--
-- Background:
--   Phase 28 created configuration_user_hidden with SELECT/INSERT/DELETE
--   policies scoped to auth.uid(). The SPA initially called
--   supabase.from(...).upsert(...) which, on conflict, takes the UPDATE
--   path. With no UPDATE policy present Postgres rejects the write with:
--     "new row violates row-level security policy
--      USING expression for table configuration_user_hidden"
--
-- This phase:
--   1. Re-asserts the per-user SELECT / INSERT / DELETE policies
--      (idempotent — safe to re-run).
--   2. Adds an UPDATE policy WITH CHECK so any future ON CONFLICT
--      DO UPDATE remains valid for the owning user only.
--   3. Leaves the table append-only in practice — the SPA now inserts
--      with ignoreDuplicates=true, but the UPDATE policy is a safety net.
--
-- Safety:
--   - No destructive changes.
--   - Does NOT touch public.configurations or any other table.
--   - Does NOT change visibility for dealers/customers.
--
-- Run once in the Supabase SQL editor.
-- ──────────────────────────────────────────────────────────

alter table public.configuration_user_hidden enable row level security;

drop policy if exists "user can read own hidden configs"
  on public.configuration_user_hidden;
create policy "user can read own hidden configs"
  on public.configuration_user_hidden
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "user can insert own hidden configs"
  on public.configuration_user_hidden;
create policy "user can insert own hidden configs"
  on public.configuration_user_hidden
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "user can update own hidden configs"
  on public.configuration_user_hidden;
create policy "user can update own hidden configs"
  on public.configuration_user_hidden
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user can delete own hidden configs"
  on public.configuration_user_hidden;
create policy "user can delete own hidden configs"
  on public.configuration_user_hidden
  for delete
  to authenticated
  using (user_id = auth.uid());
