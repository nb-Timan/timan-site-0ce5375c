-- Phase 42 — Effective-seller scoping for configuration_user_hidden.
--
-- Background:
--   Phase 28/41 stored hides as (user_id = auth.uid(), configuration_id).
--   That meant "Vis som BP" (NB/backend) hides only affected NB's own
--   view, not BP's effective Min konto. BP logged in directly would still
--   see the case.
--
-- This phase:
--   1. Adds an optional `effective_seller_email` column that records WHICH
--      seller's Min konto the hide applies to. NULL = personal/self scope.
--   2. Relaxes the SELECT policy so a user can read hide rows targeting
--      their own email (their effective Min konto), in addition to rows
--      they personally created.
--   3. Keeps INSERT/UPDATE/DELETE policies anchored to auth.uid() so only
--      the writer can mutate their own row — the effective seller cannot
--      delete a backend user's hide row, but they CAN unhide by creating
--      their own (no-op) or by the backend user unhiding via their own
--      session. Day-to-day Min konto only relies on SELECT visibility.
--   4. Primary key (user_id, configuration_id) is unchanged, so NB-as-BP
--      and BP-direct each get their own row for the same case.
--
-- Safety:
--   - Additive column with default NULL — existing rows keep behaving
--     exactly as before (only the writer sees them).
--   - Does NOT touch public.configurations or any other table.
--   - Does NOT change dealer/customer visibility.
--   - Does NOT delete any data.
--
-- Run once in the Supabase SQL editor.
-- ──────────────────────────────────────────────────────────

alter table public.configuration_user_hidden
  add column if not exists effective_seller_email text;

create index if not exists configuration_user_hidden_effective_seller_idx
  on public.configuration_user_hidden (effective_seller_email);

alter table public.configuration_user_hidden enable row level security;

-- SELECT: own row OR row that targets my email.
drop policy if exists "user can read own hidden configs"
  on public.configuration_user_hidden;
drop policy if exists "read hidden configs for self or effective seller"
  on public.configuration_user_hidden;
create policy "read hidden configs for self or effective seller"
  on public.configuration_user_hidden
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      effective_seller_email is not null
      and lower(effective_seller_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- INSERT: writer must own the row (auth.uid()).
drop policy if exists "user can insert own hidden configs"
  on public.configuration_user_hidden;
create policy "user can insert own hidden configs"
  on public.configuration_user_hidden
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- UPDATE: writer-owned, safety net for ON CONFLICT DO UPDATE.
drop policy if exists "user can update own hidden configs"
  on public.configuration_user_hidden;
create policy "user can update own hidden configs"
  on public.configuration_user_hidden
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- DELETE: writer-owned.
drop policy if exists "user can delete own hidden configs"
  on public.configuration_user_hidden;
create policy "user can delete own hidden configs"
  on public.configuration_user_hidden
  for delete
  to authenticated
  using (user_id = auth.uid());
