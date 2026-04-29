-- Phase 5 — CRM Budget module (Phase 1 schema proposal)
-- Safe to run multiple times. Adjust as needed before applying in production.

create table if not exists public.crm_budget_years (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_budget_lines (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  product_key text not null,
  product_name text not null,
  item_number text,
  category text not null check (category in ('machine','attachment','service','other')),
  seller_id uuid references public.app_users(id) on delete set null,
  seller_name text,
  country text,
  qty_budget numeric not null default 0,
  value_budget numeric not null default 0,
  monthly_split jsonb not null default '[0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0833,0.0837]'::jsonb,
  notes text,
  locked boolean not null default false,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_crm_budget_lines_year on public.crm_budget_lines(year);
create index if not exists idx_crm_budget_lines_seller on public.crm_budget_lines(seller_id);

create table if not exists public.crm_budget_forecasts (
  id uuid primary key default gen_random_uuid(),
  budget_line_id uuid not null references public.crm_budget_lines(id) on delete cascade,
  qty_forecast numeric not null default 0,
  value_forecast numeric not null default 0,
  comments text,
  expected_timing text, -- YYYY-MM
  risk_level text check (risk_level in ('low','medium','high')),
  probability int check (probability between 0 and 100),
  updated_at timestamptz not null default now(),
  unique(budget_line_id)
);

create table if not exists public.crm_budget_sales_actuals (
  id uuid primary key default gen_random_uuid(),
  budget_line_id uuid not null references public.crm_budget_lines(id) on delete cascade,
  qty_sold numeric not null default 0,
  value_sold numeric not null default 0,
  source text default 'manual',
  updated_at timestamptz not null default now(),
  unique(budget_line_id)
);

-- RLS: enable; concrete policies should reference the existing portal_role logic.
alter table public.crm_budget_lines      enable row level security;
alter table public.crm_budget_forecasts  enable row level security;
alter table public.crm_budget_sales_actuals enable row level security;

-- Example policies (adjust to your has_role()/portal_role helper):
-- create policy "backend can do everything on budget lines" on public.crm_budget_lines
--   for all using (public.has_portal_role(auth.uid(), 'timan_backend'));
-- create policy "seller can read own budget lines" on public.crm_budget_lines
--   for select using (seller_id = (select id from public.app_users where auth_user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- Phase 5b — Per-seller / per-year budget lock (extension)
-- Mirrors the localStorage fallback used by src/lib/crmBudgetService.ts
-- (getSellerYearLock / setSellerYearLock). Each seller has their own
-- lock state for a given year so backend can unlock EM 2026 without
-- affecting AKR 2026.
-- Run this in your Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.crm_budget_seller_locks (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  seller_email text not null,
  locked boolean not null default true,
  locked_by text,
  locked_at timestamptz,
  unlocked_by text,
  unlocked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (year, seller_email)
);

alter table public.crm_budget_seller_locks enable row level security;

-- Example policies (adjust to your has_portal_role helper):
-- create policy "backend manages seller-year locks"
--   on public.crm_budget_seller_locks
--   for all using (public.has_portal_role(auth.uid(), 'timan_backend'));
-- create policy "sellers can read their own lock"
--   on public.crm_budget_seller_locks
--   for select using (
--     seller_email = (select lower(email) from public.app_users where auth_user_id = auth.uid())
--   );
