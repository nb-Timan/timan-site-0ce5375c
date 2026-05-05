-- Phase 28 — Per-user "hide from Min konto" for configurations.
--
-- Purpose:
--   Users can remove a saved case from their own "Min konto → Gemte sager"
--   list WITHOUT soft-deleting the underlying configurations row.
--   Backend CRM still uses the existing case_status='deleted' soft delete.
--
-- Safety:
--   - Does NOT touch public.configurations.
--   - Does NOT change any existing RLS policies on configurations.
--   - Pure additive: new table + RLS + index.
--
-- Run this once in Supabase SQL editor.
-- ──────────────────────────────────────────────────────────

create table if not exists public.configuration_user_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  configuration_id uuid not null references public.configurations(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, configuration_id)
);

create index if not exists configuration_user_hidden_user_idx
  on public.configuration_user_hidden (user_id);

alter table public.configuration_user_hidden enable row level security;

-- Each user manages only their own hide rows.
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

drop policy if exists "user can delete own hidden configs"
  on public.configuration_user_hidden;
create policy "user can delete own hidden configs"
  on public.configuration_user_hidden
  for delete
  to authenticated
  using (user_id = auth.uid());
