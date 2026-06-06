-- ============================================================
-- service_claims: create table + link to service_tickets
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Create service_claims if it doesn't exist
CREATE TABLE IF NOT EXISTS public.service_claims (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number        text UNIQUE NOT NULL,

  -- Dealer
  dealer_company      text,
  dealer_contact      text,
  dealer_email        text,
  dealer_phone        text,

  -- Owner / customer
  customer_name       text,
  customer_contact    text,
  customer_email      text,
  customer_phone      text,

  -- Machine
  machine_model       text,
  machine_serial      text,
  machine_year        text,

  -- Dates
  delivery_date       date,
  fault_date          date,
  repair_date         date,

  -- Descriptions
  description         text NOT NULL DEFAULT '',
  repair_description  text,

  -- Service / hours / km / lines
  work_hours          numeric,
  driven_km           numeric,
  parts               jsonb,
  work_lines          jsonb,
  total_price_net     numeric,

  -- Status / meta
  status              text NOT NULL DEFAULT 'draft',
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by_email    text
);

-- 2. Add service_ticket_id column. FK only if service_tickets exists.
ALTER TABLE public.service_claims
  ADD COLUMN IF NOT EXISTS service_ticket_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_tickets'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'service_claims'
      AND constraint_name = 'service_claims_service_ticket_id_fkey'
  ) THEN
    ALTER TABLE public.service_claims
      ADD CONSTRAINT service_claims_service_ticket_id_fkey
      FOREIGN KEY (service_ticket_id)
      REFERENCES public.service_tickets(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS service_claims_service_ticket_id_idx
  ON public.service_claims (service_ticket_id);

CREATE INDEX IF NOT EXISTS service_claims_status_idx
  ON public.service_claims (status);

CREATE INDEX IF NOT EXISTS service_claims_dealer_company_idx
  ON public.service_claims (dealer_company);

-- 4. Grants (Data API access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_claims TO authenticated;
GRANT ALL ON public.service_claims TO service_role;

-- 5. RLS
ALTER TABLE public.service_claims ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'service_claims'
      AND policyname = 'service_claims_authenticated_all'
  ) THEN
    CREATE POLICY service_claims_authenticated_all
      ON public.service_claims
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
