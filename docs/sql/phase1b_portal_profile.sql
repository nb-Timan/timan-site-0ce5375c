-- Phase 1B — Unified Timan Portal profile fields.
--
-- HOW TO RUN
-- 1. Open your Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent).
--
-- This extends the existing public.app_users table with the columns
-- needed for the portal role / module-access / preferences model.
-- Existing rows and the existing login flow continue to work unchanged.

-- 1) Portal role enum (internal English keys; UI shows Danish labels) ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'portal_role') then
    create type public.portal_role as enum (
      'timan_backend',
      'timan_seller',
      'timan_service',
      'timan_importer',
      'timan_dealer',
      'timan_service_partner',
      'dealer_user'
    );
  end if;
end$$;

-- 2) New profile columns on app_users ------------------------------------------
alter table public.app_users
  add column if not exists portal_role         public.portal_role,
  add column if not exists company_dealer      text,
  add column if not exists module_access       text[] not null default '{}',
  add column if not exists preferred_language  text   not null default 'da',
  add column if not exists preferred_currency  text   not null default 'DKK',
  add column if not exists status              text   not null default 'active',
  add column if not exists last_login          timestamptz,
  add column if not exists login_count         integer not null default 0,
  add column if not exists created_at          timestamptz not null default now();

-- 3) Sanity constraints --------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_status_check') then
    alter table public.app_users
      add constraint app_users_status_check
      check (status in ('active', 'inactive', 'pending', 'suspended'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'app_users_preferred_language_check') then
    alter table public.app_users
      add constraint app_users_preferred_language_check
      check (preferred_language in ('da','en','de','it','hu'));
  end if;
end$$;

-- 4) Helpful indexes -----------------------------------------------------------
create index if not exists app_users_portal_role_idx     on public.app_users (portal_role);
create index if not exists app_users_company_dealer_idx  on public.app_users (company_dealer);
create index if not exists app_users_status_idx          on public.app_users (status);

-- 5) Backfill portal_role from existing role/partner_type ----------------------
update public.app_users
set portal_role = case
  when role = 'timan_saelger'                                  then 'timan_seller'
  when role = 'partner' and partner_type = 'forhandler'        then 'timan_dealer'
  when role = 'partner' and partner_type = 'service_partner'   then 'timan_service_partner'
  when role = 'partner' and partner_type = 'importoer'         then 'timan_importer'
  else null
end::public.portal_role
where portal_role is null;

-- NOTE:
-- A future migration will introduce a dedicated `login_events` table to
-- drive last_login / login_count automatically. For Phase 1B these columns
-- are application-managed.
