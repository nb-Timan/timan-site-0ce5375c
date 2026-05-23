-- =====================================================================
-- Phase 43 — Service registration and maintenance
--
-- Adds three tables for the new "Service registrering og vedligehold" module
-- under Portal → Teknik & Service.
--
-- Safe / additive only:
--   - Does NOT touch configurations, configuration_items, app_users,
--     dealer_accounts, claims, warranty, tsb_cases, pricing or auth.
--   - Reuses the existing public.is_timan_backend() helper for RLS.
--   - All policies are scoped to authenticated users.
--
-- Idempotent: safe to run multiple times.
-- =====================================================================

-- 1) service_machines -------------------------------------------------
create table if not exists public.service_machines (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null,
  machine_type text not null,
  dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  dealer_number text,
  dealer_name text,
  customer_name text,
  customer_email text,
  customer_phone text,
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists service_machines_serial_uidx
  on public.service_machines (lower(serial_number));

create index if not exists service_machines_dealer_number_idx
  on public.service_machines (dealer_number);

-- 2) service_registrations -------------------------------------------
create table if not exists public.service_registrations (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid references public.service_machines(id) on delete set null,
  serial_number text not null,
  dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  dealer_number text,
  dealer_name text,
  machine_type text not null,
  customer_name text,
  service_date date not null,
  operating_hours integer,
  service_interval_hours integer not null,
  technician_name text,
  service_plan_completed boolean not null default true,
  notes text,
  faults_found text,
  spare_parts_used text,
  attachment_urls jsonb not null default '[]'::jsonb,
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_registrations_serial_idx
  on public.service_registrations (lower(serial_number));
create index if not exists service_registrations_dealer_number_idx
  on public.service_registrations (dealer_number);
create index if not exists service_registrations_machine_idx
  on public.service_registrations (machine_id);

-- 3) service_intervals -----------------------------------------------
create table if not exists public.service_intervals (
  id uuid primary key default gen_random_uuid(),
  machine_type text not null,
  interval_hours integer not null,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists service_intervals_type_hours_uidx
  on public.service_intervals (lower(machine_type), interval_hours);

-- Seed RC-1000 intervals (idempotent)
insert into public.service_intervals (machine_type, interval_hours, label)
values
  ('RC-1000', 10,   '10 timer'),
  ('RC-1000', 100,  '100 timer'),
  ('RC-1000', 200,  '200 timer'),
  ('RC-1000', 300,  '300 timer'),
  ('RC-1000', 400,  '400 timer'),
  ('RC-1000', 500,  '500 timer'),
  ('RC-1000', 600,  '600 timer'),
  ('RC-1000', 700,  '700 timer'),
  ('RC-1000', 800,  '800 timer'),
  ('RC-1000', 900,  '900 timer'),
  ('RC-1000', 1000, '1000 timer')
on conflict (lower(machine_type), interval_hours) do nothing;

-- =====================================================================
-- Helper: dealer_number(s) for the currently signed-in app_user
-- =====================================================================
create or replace function public.current_user_dealer_number()
returns text language sql stable security definer
set search_path = public as $$
  select dealer_number from public.app_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.service_machines       enable row level security;
alter table public.service_registrations  enable row level security;
alter table public.service_intervals      enable row level security;

-- ---------- service_intervals: everyone authenticated can read ------
drop policy if exists service_intervals_select_auth on public.service_intervals;
create policy service_intervals_select_auth
  on public.service_intervals for select
  to authenticated
  using (true);

drop policy if exists service_intervals_write_backend on public.service_intervals;
create policy service_intervals_write_backend
  on public.service_intervals for all
  to authenticated
  using (public.is_timan_backend())
  with check (public.is_timan_backend());

-- ---------- service_machines ---------------------------------------
drop policy if exists service_machines_select on public.service_machines;
create policy service_machines_select
  on public.service_machines for select
  to authenticated
  using (
    public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists service_machines_insert on public.service_machines;
create policy service_machines_insert
  on public.service_machines for insert
  to authenticated
  with check (
    public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists service_machines_update on public.service_machines;
create policy service_machines_update
  on public.service_machines for update
  to authenticated
  using (
    public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  )
  with check (
    public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

-- ---------- service_registrations ----------------------------------
drop policy if exists service_registrations_select on public.service_registrations;
create policy service_registrations_select
  on public.service_registrations for select
  to authenticated
  using (
    public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists service_registrations_insert on public.service_registrations;
create policy service_registrations_insert
  on public.service_registrations for insert
  to authenticated
  with check (
    public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );

drop policy if exists service_registrations_update on public.service_registrations;
create policy service_registrations_update
  on public.service_registrations for update
  to authenticated
  using (
    public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  )
  with check (
    public.is_timan_backend()
    or (dealer_number is not null and dealer_number = public.current_user_dealer_number())
  );
