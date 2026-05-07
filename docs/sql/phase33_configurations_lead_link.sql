-- Phase 33 — Link configurator quotes to CRM leads.
--
-- Run in Supabase SQL Editor. Safe to re-run (uses IF NOT EXISTS / IF EXISTS).
-- Does NOT touch pricing, ownership, RLS for orders/quotes, or any data.
--
-- 1. Adds nullable lead_id on configurations.
-- 2. Foreign keys it to crm_leads(id) ON DELETE SET NULL so deleting a lead
--    does not delete the quote, just unlinks.
-- 3. Adds an index for "list quotes for lead X".
-- 4. Re-creates the crm_configurations_view to expose lead_id.

ALTER TABLE public.configurations
  ADD COLUMN IF NOT EXISTS lead_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'configurations_lead_id_fkey'
  ) THEN
    ALTER TABLE public.configurations
      ADD CONSTRAINT configurations_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.crm_leads(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_configurations_lead_id
  ON public.configurations (lead_id)
  WHERE lead_id IS NOT NULL;

-- Refresh the CRM view so lead_id is selectable. We only re-create if the
-- view already exists (created by phase23). Otherwise this is a no-op.
DO $$
DECLARE
  view_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'crm_configurations_view'
  ) INTO view_exists;

  IF view_exists THEN
    EXECUTE 'DROP VIEW public.crm_configurations_view';
    EXECUTE $v$
      CREATE VIEW public.crm_configurations_view AS
      SELECT c.*,
             da.company_name    AS dealer_company_name,
             da.account_number  AS dealer_account_number,
             da.country         AS dealer_country
      FROM public.configurations c
      LEFT JOIN public.dealer_accounts da
        ON da.id = c.dealer_account_id
    $v$;
  END IF;
END$$;
