-- =====================================================================
-- Phase 53 — Extend dealer_accounts for SharePoint sync (DebitorFiltered)
--
-- Adds the columns required by the `sharepoint-sync-dealers` Edge Function.
-- Additive only — does not drop or rename any existing column. Safe to run
-- multiple times. Existing phase 9 columns (customer_type, postal_code,
-- assigned_seller_*, source_changed_at, …) are preserved untouched.
-- =====================================================================

alter table public.dealer_accounts
  add column if not exists dealer_type                text,
  add column if not exists source                     text default 'sharepoint',
  add column if not exists external_id                text,
  add column if not exists source_customer_type_code  text,
  add column if not exists source_modified_at         timestamptz,
  add column if not exists last_synced_at             timestamptz,
  add column if not exists is_active                  boolean default true;

-- Backfill defaults for any pre-existing rows (NULL → defaults).
update public.dealer_accounts
   set source     = coalesce(source, 'sharepoint'),
       is_active  = coalesce(is_active, true);

-- Required indexes for sync + UI lookup
create index if not exists dealer_accounts_account_number_idx on public.dealer_accounts (account_number);
create index if not exists dealer_accounts_dealer_type_idx    on public.dealer_accounts (dealer_type);
create index if not exists dealer_accounts_source_idx         on public.dealer_accounts (source);
-- country index already created in phase 9, keep idempotent
create index if not exists dealer_accounts_country_idx        on public.dealer_accounts (country);

-- =====================================================================
-- Verify:
--   select column_name, data_type from information_schema.columns
--    where table_schema='public' and table_name='dealer_accounts'
--    order by ordinal_position;
-- =====================================================================
