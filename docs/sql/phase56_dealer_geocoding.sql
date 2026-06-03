-- =====================================================================
-- Phase 56 — Geocoding columns on dealer_accounts.
--
-- Adds latitude/longitude + status fields so dealer addresses synchronised
-- from SharePoint can be turned into map coordinates by a manual, server-
-- side backend job. NO automatic geocoding on page load, no client calls.
--
-- Additive only. Safe to run multiple times. Does NOT touch CRM,
-- users, quotes, orders, activities, budgets, or SharePoint sync logic.
-- =====================================================================

alter table public.dealer_accounts
  add column if not exists latitude         numeric,
  add column if not exists longitude        numeric,
  add column if not exists geocoded_at      timestamptz,
  add column if not exists geocoding_status text,
  add column if not exists geocoding_error  text;

create index if not exists dealer_accounts_geocoded_idx
  on public.dealer_accounts (latitude, longitude)
  where latitude is not null and longitude is not null;

-- =====================================================================
-- Verify:
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='dealer_accounts'
--      and column_name in ('latitude','longitude','geocoded_at','geocoding_status','geocoding_error');
-- =====================================================================
