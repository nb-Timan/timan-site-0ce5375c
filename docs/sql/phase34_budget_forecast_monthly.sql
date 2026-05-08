-- Phase 34 — Persist exact per-month working forecast values.
--
-- Today crm_budget_forecasts only stores the annual qty_forecast. The page
-- recomputes the per-month split from crm_budget_lines.monthly_split on every
-- read, which silently redistributes the seller's manually entered values.
--
-- This migration adds monthly_qty: numeric[] (length 12, Jan..Dec) so the
-- exact draft values entered in "Rediger arbejdsbudget" round-trip without
-- any redistribution. qty_forecast is still maintained as the sum.

alter table public.crm_budget_forecasts
  add column if not exists monthly_qty numeric[];

comment on column public.crm_budget_forecasts.monthly_qty is
  'Per-month Arbejdsbudget quantities (length 12, Jan..Dec). When present, the UI uses these values verbatim instead of redistributing qty_forecast across monthly_split.';
