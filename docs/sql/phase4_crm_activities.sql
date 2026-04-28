-- Phase 4 — CRM activities + logins.
--
-- HOW TO RUN
--   Open Supabase → SQL Editor → paste this entire file → Run.
--   Safe to re-run (idempotent). No existing data is dropped.
--
-- WHAT THIS DOES
-- - Adds public.crm_activities to capture sales activity (quote created,
--   quote sent, order created, order sent, comment, login, lead etc).
-- - Adds public.crm_logins to capture per-account login events.
-- - Both tables have permissive policies for now to match the rest of the
--   project (the SPA filters by seller in JS via crmScope.ts). Tighten
--   later when Supabase Auth is wired through everywhere.
--
-- WHAT THIS DOES NOT DO
-- - Does not change pricing, configurator, PDF, n8n, claims, TSB, warranty
--   or any existing table's columns.
-- - Does not create quotes/orders tables — public.configurations is
--   already used for offers and orders (quote_sent_at / order_sent_at /
--   assigned_seller_id columns exist from phase 3).

-- ---------------------------------------------------------------- ACTIVITIES
create table if not exists public.crm_activities (
  id                       uuid primary key default gen_random_uuid(),
  activity_type            text not null,                 -- quote_created | quote_sent | order_created | order_sent | discount_changed | delivery_changed | comment | login | lead_created | lead_viewed | lead_accepted | lead_rejected
  activity_date            timestamptz not null default now(),
  account_id               uuid references public.app_users(id) on delete set null,
  account_name             text,
  created_by_user_id       uuid references public.app_users(id) on delete set null,
  created_by_name          text,
  assigned_owner_user_id   uuid references public.app_users(id) on delete set null,
  assigned_owner_name      text,
  title                    text,
  description              text,
  status                   text,
  quote_id                 uuid,
  order_id                 uuid,
  configuration_id         uuid references public.configurations(id) on delete set null,
  value                    numeric(14,2),
  currency                 text,
  meta                     jsonb,
  created_at               timestamptz not null default now()
);

create index if not exists crm_activities_account_idx        on public.crm_activities (account_id, activity_date desc);
create index if not exists crm_activities_owner_idx          on public.crm_activities (assigned_owner_user_id, activity_date desc);
create index if not exists crm_activities_creator_idx        on public.crm_activities (created_by_user_id, activity_date desc);
create index if not exists crm_activities_type_idx           on public.crm_activities (activity_type, activity_date desc);
create index if not exists crm_activities_configuration_idx  on public.crm_activities (configuration_id);

alter table public.crm_activities enable row level security;

drop policy if exists crm_activities_select on public.crm_activities;
create policy crm_activities_select on public.crm_activities
  for select using (true);

drop policy if exists crm_activities_insert on public.crm_activities;
create policy crm_activities_insert on public.crm_activities
  for insert with check (true);

-- No update / delete policy → activities are append-only by default.

-- ---------------------------------------------------------------- LOGINS
create table if not exists public.crm_logins (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references public.app_users(id) on delete set null,
  user_name           text,
  user_email          text,
  account_id          uuid references public.app_users(id) on delete set null,
  account_name        text,
  login_date          timestamptz not null default now(),
  ip_placeholder      text,
  device_placeholder  text,
  meta                jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists crm_logins_user_idx     on public.crm_logins (user_id, login_date desc);
create index if not exists crm_logins_account_idx  on public.crm_logins (account_id, login_date desc);
create index if not exists crm_logins_date_idx     on public.crm_logins (login_date desc);

alter table public.crm_logins enable row level security;

drop policy if exists crm_logins_select on public.crm_logins;
create policy crm_logins_select on public.crm_logins for select using (true);

drop policy if exists crm_logins_insert on public.crm_logins;
create policy crm_logins_insert on public.crm_logins for insert with check (true);

-- ---------------------------------------------------------------- SEED 3 ACCOUNTS
-- Upsert the three external accounts requested for CRM bootstrap.
-- Owners: assign EM (esben@timan.dk) if that user exists; otherwise leave null and
-- let the trigger sync owner fields once an EM row is added later.
do $$
declare
  em_id   uuid;
  em_name text;
  em_init text;
  em_mail text;
begin
  select id, full_name, initials, email
    into em_id, em_name, em_init, em_mail
    from public.app_users
   where lower(email) = 'esben@timan.dk'
   limit 1;

  -- 1) Claus Kjær Jørgensen
  insert into public.app_users (
    email, full_name, role, partner_type, portal_role,
    company, country, preferred_language, status, approved, is_active,
    account_owner_user_id, account_owner_name, account_owner_initials, account_owner_email
  ) values (
    'claus@wjmaskinservice.dk', 'Claus Kjær Jørgensen', 'partner', 'forhandler', 'timan_dealer',
    'WJ Maskinservice', 'DK', 'da', 'active', true, true,
    em_id, em_name, coalesce(em_init,'EM'), em_mail
  )
  on conflict (email) do update set
    full_name              = coalesce(excluded.full_name, public.app_users.full_name),
    company                = coalesce(excluded.company, public.app_users.company),
    country                = coalesce(excluded.country, public.app_users.country),
    portal_role            = coalesce(public.app_users.portal_role, excluded.portal_role),
    account_owner_user_id  = coalesce(public.app_users.account_owner_user_id, excluded.account_owner_user_id),
    account_owner_name     = coalesce(public.app_users.account_owner_name, excluded.account_owner_name),
    account_owner_initials = coalesce(public.app_users.account_owner_initials, excluded.account_owner_initials),
    account_owner_email    = coalesce(public.app_users.account_owner_email, excluded.account_owner_email);

  -- 2) Steen Jakobsen
  insert into public.app_users (
    email, full_name, role, partner_type, portal_role,
    company, country, preferred_language, status, approved, is_active,
    account_owner_user_id, account_owner_name, account_owner_initials, account_owner_email
  ) values (
    'sj@lyngfeldt.dk', 'Steen Jakobsen', 'partner', 'forhandler', 'timan_dealer',
    'Lyngfeldt', 'DK', 'da', 'active', true, true,
    em_id, em_name, coalesce(em_init,'EM'), em_mail
  )
  on conflict (email) do update set
    full_name              = coalesce(excluded.full_name, public.app_users.full_name),
    company                = coalesce(excluded.company, public.app_users.company),
    country                = coalesce(excluded.country, public.app_users.country),
    portal_role            = coalesce(public.app_users.portal_role, excluded.portal_role),
    account_owner_user_id  = coalesce(public.app_users.account_owner_user_id, excluded.account_owner_user_id),
    account_owner_name     = coalesce(public.app_users.account_owner_name, excluded.account_owner_name),
    account_owner_initials = coalesce(public.app_users.account_owner_initials, excluded.account_owner_initials),
    account_owner_email    = coalesce(public.app_users.account_owner_email, excluded.account_owner_email);

  -- 3) Have og Park Center Svendborg (service partner). No personal email
  -- in the brief — synthesise a stable contact email so the unique key works.
  insert into public.app_users (
    email, full_name, role, partner_type, portal_role,
    company, country, preferred_language, status, approved, is_active,
    dealer_number, notes,
    account_owner_user_id, account_owner_name, account_owner_initials, account_owner_email
  ) values (
    'kontakt@hpc-svendborg.dk', 'Jimmi (HPC Svendborg)', 'partner', 'service_partner', 'timan_service_partner',
    'Have og Park Center Svendborg', 'DK', 'da', 'active', true, true,
    '10082',
    'Tvedvej 170, 5700 Svendborg, Danmark | Tlf +45 62 24 15 36 | http://www.hpc-svendborg.dk/',
    em_id, em_name, coalesce(em_init,'EM'), em_mail
  )
  on conflict (email) do update set
    company                = coalesce(public.app_users.company, excluded.company),
    dealer_number          = coalesce(public.app_users.dealer_number, excluded.dealer_number),
    notes                  = coalesce(public.app_users.notes, excluded.notes),
    portal_role            = coalesce(public.app_users.portal_role, excluded.portal_role),
    account_owner_user_id  = coalesce(public.app_users.account_owner_user_id, excluded.account_owner_user_id),
    account_owner_name     = coalesce(public.app_users.account_owner_name, excluded.account_owner_name),
    account_owner_initials = coalesce(public.app_users.account_owner_initials, excluded.account_owner_initials),
    account_owner_email    = coalesce(public.app_users.account_owner_email, excluded.account_owner_email);
end $$;
