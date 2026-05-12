-- Phase 35 — CRM Budget dealer-level lines (additive, idempotent).
--
-- Purpose:
--   Stores per-(seller, year, month, dealer, product) budget quantities so
--   the CRM Budget Dashboard can show Budget by dealer. The existing
--   public.crm_budget_lines table remains the canonical product-level
--   aggregate and is NOT modified by this migration.
--
-- Safety:
--   * No DROP TABLE, no DELETE, no TRUNCATE, no destructive change.
--   * `create table if not exists` + `add column if not exists`.
--   * Safe to re-run.
--   * Run manually in the Supabase SQL editor.
--
-- Linkage:
--   Logical link to public.crm_budget_lines via the tuple
--     (lower(seller_email), year, product_key)
--   No FK is enforced because manual budget edits and dealer-level imports
--   may exist independently.

create table if not exists public.crm_budget_dealer_lines (
  id uuid primary key default gen_random_uuid(),

  -- Time scope
  year      integer not null,
  month_idx integer not null check (month_idx between 0 and 11),

  -- Seller scope
  seller_id        uuid,
  seller_name      text,
  seller_email     text not null,
  seller_initials  text,

  -- Dealer scope (id-first, name fallback)
  dealer_account_id     uuid,
  dealer_account_number text,
  dealer_name           text,
  dealer_name_norm      text,

  -- Product scope (mirrors crm_budget_lines.product_key)
  product_key  text not null,
  product_name text,
  item_number  text,

  -- Quantity
  qty                 integer not null default 0,
  -- When true, this row is recorded but MUST NOT be summed into totals
  -- (e.g. demos / lost cases imported with qty 0 for traceability).
  excluded_from_total boolean not null default false,

  -- Import metadata
  import_source   text,
  import_batch_id text,
  imported_at     timestamptz default now(),
  imported_by     text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Defensive: re-add columns if an older partial version of the table exists.
alter table public.crm_budget_dealer_lines
  add column if not exists seller_id uuid,
  add column if not exists seller_name text,
  add column if not exists seller_initials text,
  add column if not exists dealer_account_id uuid,
  add column if not exists dealer_account_number text,
  add column if not exists dealer_name text,
  add column if not exists dealer_name_norm text,
  add column if not exists product_name text,
  add column if not exists item_number text,
  add column if not exists excluded_from_total boolean not null default false,
  add column if not exists import_source text,
  add column if not exists import_batch_id text,
  add column if not exists imported_at timestamptz default now(),
  add column if not exists imported_by text,
  add column if not exists updated_at timestamptz not null default now();

-- ── Indexes ─────────────────────────────────────────────────────────────
create index if not exists idx_cbdl_year_seller
  on public.crm_budget_dealer_lines (year, lower(seller_email));

create index if not exists idx_cbdl_year_seller_product
  on public.crm_budget_dealer_lines (year, lower(seller_email), product_key);

create index if not exists idx_cbdl_dealer_account
  on public.crm_budget_dealer_lines (dealer_account_id)
  where dealer_account_id is not null;

create index if not exists idx_cbdl_import_batch
  on public.crm_budget_dealer_lines (import_batch_id)
  where import_batch_id is not null;

-- ── Unique identity (prevents duplicate import rows) ───────────────────
-- Primary identity: when dealer_account_id is known.
create unique index if not exists ux_cbdl_identity_with_account
  on public.crm_budget_dealer_lines
     (year, month_idx, lower(seller_email), dealer_account_id, product_key)
  where dealer_account_id is not null;

-- Fallback identity: when only a normalized dealer name is available.
create unique index if not exists ux_cbdl_identity_name_only
  on public.crm_budget_dealer_lines
     (year, month_idx, lower(seller_email), dealer_name_norm, product_key)
  where dealer_account_id is null and dealer_name_norm is not null;

-- ── updated_at trigger (idempotent) ────────────────────────────────────
create or replace function public.set_updated_at_crm_budget_dealer_lines()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cbdl_set_updated_at on public.crm_budget_dealer_lines;
create trigger trg_cbdl_set_updated_at
  before update on public.crm_budget_dealer_lines
  for each row execute function public.set_updated_at_crm_budget_dealer_lines();

-- ── Row-Level Security ─────────────────────────────────────────────────
-- Mirrors public.crm_budget_lines / public.crm_budget_forecasts (Phase 34):
-- permissive for authenticated. A stricter per-seller policy can be layered
-- on later (e.g. require app_users.email = seller_email for seller writes).
alter table public.crm_budget_dealer_lines enable row level security;

drop policy if exists "crm_budget_dealer_lines auth read"  on public.crm_budget_dealer_lines;
drop policy if exists "crm_budget_dealer_lines auth write" on public.crm_budget_dealer_lines;

create policy "crm_budget_dealer_lines auth read"
  on public.crm_budget_dealer_lines
  for select
  to authenticated
  using (true);

create policy "crm_budget_dealer_lines auth write"
  on public.crm_budget_dealer_lines
  for all
  to authenticated
  using (true)
  with check (true);

-- ── Optional tightening (commented; review before enabling) ────────────
-- To restrict sellers to only their own rows while leaving backend
-- unrestricted, replace the "auth write" policy with the pair below and
-- ensure public.app_users.email is populated for every seller.
--
-- create policy "crm_budget_dealer_lines backend all"
--   on public.crm_budget_dealer_lines
--   for all
--   to authenticated
--   using (
--     exists (select 1 from public.app_users au
--             where au.user_id = auth.uid() and au.role = 'timan_backend')
--   )
--   with check (
--     exists (select 1 from public.app_users au
--             where au.user_id = auth.uid() and au.role = 'timan_backend')
--   );
--
-- create policy "crm_budget_dealer_lines seller own"
--   on public.crm_budget_dealer_lines
--   for all
--   to authenticated
--   using (
--     exists (select 1 from public.app_users au
--             where au.user_id = auth.uid()
--               and lower(au.email) = lower(crm_budget_dealer_lines.seller_email))
--   )
--   with check (
--     exists (select 1 from public.app_users au
--             where au.user_id = auth.uid()
--               and lower(au.email) = lower(crm_budget_dealer_lines.seller_email))
--   );
