-- =====================================================================
-- Phase 9 — Dealer accounts (forhandlere) for Timan Backend
--
-- Source of truth for dealer/account master data, used by:
--   • Timan Backend → Forhandlere (admin page)
--   • Timan Backend → Brugere (dealer picker when approving new users)
--
-- Safe to run multiple times.
-- =====================================================================

-- ---------- 1) dealer_accounts table ---------------------------------

create table if not exists public.dealer_accounts (
  id                       uuid primary key default gen_random_uuid(),
  account_number           text unique not null,
  company_name             text not null,
  customer_type            text,         -- e.g. 'Forhandler', 'Service partner', 'Importør', 'Slutkunde'
  country                  text,         -- ISO-2 (DK, GB, DE, ...)
  postal_code              text,
  city                     text,
  address                  text,
  email                    text,
  phone                    text,

  assigned_seller_initials text,
  assigned_seller_name     text,
  assigned_seller_email    text,

  source_created_at        timestamptz,  -- from upstream/ERP
  source_changed_at        timestamptz,  -- from upstream/ERP

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists dealer_accounts_country_idx        on public.dealer_accounts (country);
create index if not exists dealer_accounts_customer_type_idx  on public.dealer_accounts (customer_type);
create index if not exists dealer_accounts_seller_idx         on public.dealer_accounts (assigned_seller_initials);
create index if not exists dealer_accounts_company_idx        on public.dealer_accounts (company_name);

-- ---------- 2) updated_at trigger ------------------------------------

create or replace function public.dealer_accounts_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_dealer_accounts_touch on public.dealer_accounts;
create trigger trg_dealer_accounts_touch
  before update on public.dealer_accounts
  for each row execute function public.dealer_accounts_touch_updated_at();

-- ---------- 3) RLS — only timan_backend can read/write ----------------

alter table public.dealer_accounts enable row level security;

-- Helper: is_timan_backend() exists from phase 7. Recreate idempotently
-- in case it hasn't been applied yet.
create or replace function public.is_timan_backend()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.app_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and portal_role = 'timan_backend'
      and is_active = true
  );
$$;

drop policy if exists dealer_accounts_select_backend on public.dealer_accounts;
drop policy if exists dealer_accounts_insert_backend on public.dealer_accounts;
drop policy if exists dealer_accounts_update_backend on public.dealer_accounts;
drop policy if exists dealer_accounts_delete_backend on public.dealer_accounts;
drop policy if exists dealer_accounts_select_authenticated on public.dealer_accounts;

-- Authenticated users can READ dealer accounts (needed for the dealer picker
-- when approving users). Write access is restricted to Timan Backend.
create policy dealer_accounts_select_authenticated
  on public.dealer_accounts for select
  to authenticated
  using (true);

create policy dealer_accounts_insert_backend
  on public.dealer_accounts for insert
  to authenticated
  with check (public.is_timan_backend());

create policy dealer_accounts_update_backend
  on public.dealer_accounts for update
  to authenticated
  using (public.is_timan_backend())
  with check (public.is_timan_backend());

create policy dealer_accounts_delete_backend
  on public.dealer_accounts for delete
  to authenticated
  using (public.is_timan_backend());

-- ---------- 4) app_users — link columns to a dealer account -----------
-- Multiple users may belong to the same dealer (no UNIQUE on dealer_number).

alter table public.app_users
  add column if not exists dealer_number   text,
  add column if not exists company_dealer  text,
  add column if not exists seller_initials text,
  add column if not exists seller_email    text;

create index if not exists app_users_dealer_number_idx on public.app_users (dealer_number);

-- =====================================================================
-- Done. Verify in Supabase:
--   select * from public.dealer_accounts limit 5;
--   select dealer_number, company_dealer, seller_initials, seller_email
--   from public.app_users limit 5;
-- =====================================================================
