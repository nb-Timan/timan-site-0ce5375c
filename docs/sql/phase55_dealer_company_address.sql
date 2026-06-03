-- =====================================================================
-- Phase 55 — Extend dealer_accounts with structured company address
--             (master data from SharePoint DebitorFiltered).
--
-- Additive only. Safe to run multiple times. Does NOT drop or rename any
-- existing column. Existing `address`, `postal_code`, `city`, `country`
-- columns are preserved untouched.
--
-- Mapping (SharePoint → dealer_accounts):
--   ADDRESS1 → address_line_1
--   ADDRESS2 → address_line_2
--   ZIPCITY  → zip_city_raw  (then split into postal_code + city)
--   COUNTRY  → country (unchanged from phase 9)
-- =====================================================================

alter table public.dealer_accounts
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists zip_city_raw   text;

-- postal_code + city already exist (phase 9), but ensure for safety.
alter table public.dealer_accounts
  add column if not exists postal_code text,
  add column if not exists city        text;

-- =====================================================================
-- Verify:
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='dealer_accounts'
--      and column_name in ('address_line_1','address_line_2','zip_city_raw','postal_code','city','country')
--    order by ordinal_position;
-- =====================================================================
