-- Phase 38 — Lead ↔ Demo Lead relations.
--
-- Additive only. Safe to run manually in Supabase SQL Editor.
-- No DELETE, no TRUNCATE, no reseed, no RLS changes.
--
-- Adds:
--   * crm_demo_leads.source_lead_id  → references crm_leads(id)
--   * crm_leads.converted_demo_lead_id → references crm_demo_leads(id)
--   * Helpful indexes on both columns
--
-- ON DELETE SET NULL on both FKs so that deleting one row never cascades
-- and never blocks the other; the relation simply becomes empty.

BEGIN;

-- crm_demo_leads.source_lead_id
ALTER TABLE public.crm_demo_leads
  ADD COLUMN IF NOT EXISTS source_lead_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_demo_leads_source_lead_id_fkey'
  ) THEN
    ALTER TABLE public.crm_demo_leads
      ADD CONSTRAINT crm_demo_leads_source_lead_id_fkey
      FOREIGN KEY (source_lead_id)
      REFERENCES public.crm_leads(id)
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_crm_demo_leads_source_lead_id
  ON public.crm_demo_leads(source_lead_id);

-- crm_leads.converted_demo_lead_id
ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS converted_demo_lead_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_leads_converted_demo_lead_id_fkey'
  ) THEN
    ALTER TABLE public.crm_leads
      ADD CONSTRAINT crm_leads_converted_demo_lead_id_fkey
      FOREIGN KEY (converted_demo_lead_id)
      REFERENCES public.crm_demo_leads(id)
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_crm_leads_converted_demo_lead_id
  ON public.crm_leads(converted_demo_lead_id);

COMMIT;
