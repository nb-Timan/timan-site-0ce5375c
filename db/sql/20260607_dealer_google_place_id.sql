-- =====================================================================
-- 2026-06-07 — Add google_place_id to dealer_accounts.
--
-- Stores the stable Google Places place_id captured when the address is
-- selected via GoogleAddressAutocomplete. Coordinates already exist
-- (phase 56: latitude, longitude, geocoded_at, geocoding_status).
--
-- Additive only. Safe to run multiple times. No data is modified.
-- =====================================================================

alter table public.dealer_accounts
  add column if not exists google_place_id text;

create index if not exists dealer_accounts_google_place_id_idx
  on public.dealer_accounts (google_place_id)
  where google_place_id is not null;

-- =====================================================================
-- Verify:
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='dealer_accounts'
--      and column_name='google_place_id';
-- =====================================================================
