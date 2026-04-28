-- Phase 2 — Timan Backend > Brugere (Users administration).
--
-- HOW TO RUN
-- 1. Open your Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent). Existing rows, ids, and emails are preserved.
--
-- This extends public.app_users with the columns the Timan Backend Users
-- page needs (initials, company, country, language, dealer_number, portal
-- role, allowed_areas, allowed_modules, permissions, preferences, login
-- stats). It does NOT delete or overwrite any existing data.
--
-- It also enables RLS in a permissive way for the publishable/anon key the
-- portal currently uses (so reads/updates from the SPA continue to work).
-- Tighten these policies later when proper auth.uid() based gating is added.

-- 1) Portal role enum (safe re-create) ----------------------------------------
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

-- 2) Add columns ---------------------------------------------------------------
alter table public.app_users
  add column if not exists initials             text,
  add column if not exists company              text,
  add column if not exists country              text,
  add column if not exists preferred_language   text   not null default 'da',
  add column if not exists preferred_currency   text   not null default 'DKK',
  add column if not exists dealer_number        text,
  add column if not exists portal_role          public.portal_role,
  add column if not exists company_dealer       text,
  add column if not exists status               text   not null default 'active',
  add column if not exists allowed_areas        text[] not null default '{}',
  add column if not exists allowed_modules      text[] not null default '{}',
  add column if not exists backend_modules      text[] not null default '{}',
  add column if not exists permissions          jsonb  not null default '{}'::jsonb,
  add column if not exists last_login           timestamptz,
  add column if not exists login_count          integer not null default 0,
  add column if not exists module_access        text[] not null default '{}';

-- 3) Sanity constraints --------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_status_check') then
    alter table public.app_users
      add constraint app_users_status_check
      check (status in ('active', 'inactive', 'pending', 'suspended', 'blocked'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'app_users_pref_lang_check') then
    alter table public.app_users
      add constraint app_users_pref_lang_check
      check (preferred_language in ('da','en','de','it','hu'));
  end if;
end$$;

-- 4) Indexes -------------------------------------------------------------------
create index if not exists app_users_portal_role_idx on public.app_users (portal_role);
create index if not exists app_users_status_idx      on public.app_users (status);
create index if not exists app_users_email_idx       on public.app_users (lower(email));

-- 5) Backfill initials / company / country / portal_role safely ---------------
update public.app_users
set initials = coalesce(initials, upper(left(coalesce(full_name, split_part(email, '@', 1)), 3)))
where initials is null;

update public.app_users
set company = coalesce(company, 'Timan')
where company is null
  and email ilike '%@timan.dk';

update public.app_users
set country = coalesce(country, 'DK')
where country is null;

update public.app_users
set portal_role = case
  when role = 'timan_saelger'                                then 'timan_seller'
  when role = 'partner' and partner_type = 'forhandler'      then 'timan_dealer'
  when role = 'partner' and partner_type = 'service_partner' then 'timan_service'
  when role = 'partner' and partner_type = 'importoer'       then 'timan_importer'
  else null
end::public.portal_role
where portal_role is null;

-- Mark known internal backend users (Nicolai, Janni, Birger) as timan_backend.
update public.app_users
set portal_role = 'timan_backend'::public.portal_role
where portal_role = 'timan_seller'::public.portal_role
  and lower(email) in ('nb@timan.dk', 'janni@timan.dk', 'jn@timan.dk', 'birger@timan.dk', 'bp@timan.dk');

-- 6) RLS — keep permissive for the publishable key the SPA currently uses ----
-- (App-level role gating is enforced in the React app via AppUserContext +
-- /portal/backend/users access check. Tighten later with auth.uid() once
-- proper Supabase Auth roles are wired into the backend admin flow.)
alter table public.app_users enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_users' and policyname='app_users_anon_select') then
    create policy "app_users_anon_select" on public.app_users for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='app_users' and policyname='app_users_anon_update') then
    create policy "app_users_anon_update" on public.app_users for update using (true) with check (true);
  end if;
end$$;
