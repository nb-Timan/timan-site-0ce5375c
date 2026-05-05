-- Phase 27 — Payment terms on quotes/orders
--
-- Safe / additive only:
--   * Adds a single nullable column `payment_terms` to public.configurations.
--   * No DELETE, no UPDATE of existing rows, no changes to RLS, no changes
--     to other tables, no changes to functions, indexes or triggers.
--   * No backfill — existing rows keep payment_terms = NULL and the app
--     falls back to "Standard NET21" on read.
--
-- The new per-user permission `can_manage_payment_terms` is stored inside
-- the existing `app_users.permissions` jsonb column (added by phase 2),
-- so NO schema change is needed for the permission itself.
--
-- Idempotent — safe to re-run.

alter table public.configurations
  add column if not exists payment_terms text;

comment on column public.configurations.payment_terms is
  'Payment terms label shown on quote/order (information only, no effect on totals). Null = legacy row, app displays "Standard NET21".';
