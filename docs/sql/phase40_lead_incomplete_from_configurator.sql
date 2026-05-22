-- Phase 40 — Mark leads created via the configurator's "Save as lead" button
-- as not yet finished. Backend / Sælger then opens the lead in CRM, fills
-- the missing required fields and saves — the flag is cleared automatically.
--
-- Safe to re-run (uses IF NOT EXISTS). Does NOT touch RLS, pricing, budget,
-- ownership, or any other lead column.

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS incomplete_from_configurator boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_crm_leads_incomplete_from_configurator
  ON public.crm_leads (incomplete_from_configurator)
  WHERE incomplete_from_configurator = true;
