-- =====================================================================
-- 2026-06-08 — Portal change log (Phase 3).
--
-- Backs the "Hvad er nyt?" / "Seneste ændringer" feature with a Supabase
-- table. The frontend keeps the Phase 1/2 hardcoded demo entries as a
-- safety net and falls back to them when this table is empty / unreachable.
--
-- Additive only. Safe to run multiple times. Never drops anything.
-- =====================================================================

create table if not exists public.portal_change_log (
  id               uuid primary key default gen_random_uuid(),
  module_key       text        not null,
  module_name      text        not null,
  changed_at       timestamptz not null default now(),
  title            text        not null,
  description      text,
  role_visibility  text[]      not null default array['all']::text[],
  language         text        not null default 'da',
  is_major         boolean     not null default false,
  is_new_until     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid
);

create index if not exists portal_change_log_changed_at_desc_idx
  on public.portal_change_log (changed_at desc);
create index if not exists portal_change_log_module_key_idx
  on public.portal_change_log (module_key);
create index if not exists portal_change_log_language_idx
  on public.portal_change_log (language);
create index if not exists portal_change_log_is_major_idx
  on public.portal_change_log (is_major);
create index if not exists portal_change_log_role_visibility_gin
  on public.portal_change_log using gin (role_visibility);

-- updated_at trigger
create or replace function public.portal_change_log_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists portal_change_log_touch on public.portal_change_log;
create trigger portal_change_log_touch
  before update on public.portal_change_log
  for each row execute function public.portal_change_log_touch_updated_at();

-- Grants — Data API
grant select on public.portal_change_log to anon;
grant select, insert, update, delete on public.portal_change_log to authenticated;
grant all on public.portal_change_log to service_role;

-- RLS
alter table public.portal_change_log enable row level security;

-- Anyone (incl. anon) can read the changelog.
drop policy if exists portal_change_log_select_all on public.portal_change_log;
create policy portal_change_log_select_all
  on public.portal_change_log
  for select
  using (true);

-- Any authenticated user can write — admin UI is gated client-side via the
-- Backend permission check. Tighten later when a server-side role check exists.
drop policy if exists portal_change_log_insert_auth on public.portal_change_log;
create policy portal_change_log_insert_auth
  on public.portal_change_log
  for insert to authenticated
  with check (true);

drop policy if exists portal_change_log_update_auth on public.portal_change_log;
create policy portal_change_log_update_auth
  on public.portal_change_log
  for update to authenticated
  using (true) with check (true);

drop policy if exists portal_change_log_delete_auth on public.portal_change_log;
create policy portal_change_log_delete_auth
  on public.portal_change_log
  for delete to authenticated
  using (true);

-- =====================================================================
-- Verify:
--   select count(*) from public.portal_change_log;
-- =====================================================================
