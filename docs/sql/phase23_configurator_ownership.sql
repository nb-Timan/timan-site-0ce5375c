-- Phase 23 — Configurator quote/order ownership.
--
-- HOW TO RUN
-- 1. Open Supabase project → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent). No existing rows are dropped or overwritten.
--
-- WHAT THIS DOES
-- - Adds clear seller / dealer / context columns to public.configurations so
--   every quote and order created from the configurator is correctly
--   attributed to:
--     • the responsible Timan Sælger (initials/email/name)
--     • the dealer/account it was made for (dealer_number, dealer_name)
--     • the user who actually created it (created_by_email, created_by_role)
--     • the active "view as" mode used at the time of creation (active_mode)
--     • a human-readable status snapshot.
-- - Ensures quote_sent_at / order_sent_at columns exist (the app code uses
--   these names; some older databases only have quote_sent_date /
--   order_sent_date — both are kept side by side, the view exposes a single
--   *_at field that falls back to *_date for legacy rows).
-- - Adds indexes used by the new CRM Quotes / Orders pages.
-- - Creates a small view that the SPA reads from for both Quotes and
--   Orders lists (read-only, security_invoker so it inherits RLS).
--
-- WHAT THIS DOES NOT DO
-- - Does not change pricing, discounts, configurator calculations, PDF
--   generation, n8n flows, Supabase Auth, or quote/order calculation logic.
-- - Does not rename or drop existing columns.
-- - Does not touch existing rows other than additive columns.

-- 1) Ownership columns ---------------------------------------------------
alter table public.configurations
  add column if not exists seller_initials   text,
  add column if not exists seller_email      text,
  add column if not exists seller_name       text,
  add column if not exists dealer_number     text,
  add column if not exists dealer_name       text,
  add column if not exists dealer_account_id uuid references public.dealer_accounts(id) on delete set null,
  add column if not exists created_by_role   text,
  add column if not exists active_mode       text,
  add column if not exists owner_status      text;

-- assigned_seller_id was added in phase 3; ensure it exists for older projects.
alter table public.configurations
  add column if not exists assigned_seller_id uuid references public.app_users(id) on delete set null;

-- 1b) Sent-at timestamp columns the app code expects.
-- Older databases only have quote_sent_date / order_sent_date. We add the
-- *_at columns the SPA reads/writes today, without removing the legacy
-- *_date columns. The view below merges them.
alter table public.configurations
  add column if not exists quote_sent_at  timestamptz,
  add column if not exists order_sent_at  timestamptz,
  add column if not exists submitted_at   timestamptz;

-- 2) Indexes -------------------------------------------------------------
create index if not exists configurations_seller_initials_idx on public.configurations (seller_initials);
create index if not exists configurations_seller_email_idx    on public.configurations (lower(seller_email));
create index if not exists configurations_dealer_number_idx   on public.configurations (dealer_number);
create index if not exists configurations_doc_type_idx        on public.configurations (document_type);
create index if not exists configurations_dealer_account_idx  on public.configurations (dealer_account_id);

-- 3) Read-only view used by the new CRM Quotes / Orders pages -----------
-- Returns one row per saved configuration with the fields the UI needs,
-- already joined to dealer_accounts when possible. security_invoker = on
-- so the existing RLS on configurations / dealer_accounts is preserved.
--
-- The quote_sent_at / order_sent_at columns coalesce the new *_at columns
-- with the legacy *_date columns (cast to timestamptz) so existing rows
-- that were stamped under the old schema still appear correctly.
create or replace view public.crm_configurations_view
with (security_invoker = on)
as
select
  c.id,
  c.created_at,
  c.last_saved_at,
  c.case_status,
  coalesce(c.document_type, c.case_type) as document_type,
  c.quote_number,
  c.order_number,
  c.title,
  c.seller_initials,
  c.seller_email,
  c.seller_name,
  c.assigned_seller_id,
  c.dealer_number,
  c.dealer_name,
  c.dealer_account_id,
  c.created_by_email,
  c.created_by_user_id,
  c.created_by_role,
  c.active_mode,
  c.owner_status,
  coalesce(
    c.quote_sent_at,
    (to_jsonb(c) ->> 'quote_sent_date')::timestamptz
  ) as quote_sent_at,
  coalesce(
    c.order_sent_at,
    (to_jsonb(c) ->> 'order_sent_date')::timestamptz
  ) as order_sent_at,
  c.submitted_at,
  da.company_name as dealer_company_name,
  da.account_number as dealer_account_number,
  da.country       as dealer_country
from public.configurations c
left join public.dealer_accounts da
  on da.id = c.dealer_account_id
   or (c.dealer_account_id is null and da.account_number = c.dealer_number)
where coalesce(c.case_status, 'aktiv') <> 'deleted';

comment on view public.crm_configurations_view is
  'Ownership-aware view of public.configurations used by the CRM Quotes and Orders pages.';

-- Notes:
-- * No DROP/DELETE statements — re-running this file is safe.
-- * No data backfill is performed. Existing rows show empty seller/dealer
--   fields until they are re-saved or backfilled manually.
-- * The (to_jsonb(c) ->> 'quote_sent_date') trick lets this script work
--   whether or not the legacy quote_sent_date / order_sent_date columns
--   exist — it never references them by name directly.
