-- phase31_lead_demo_numbers.sql
-- Adds stable, human-readable numbers to CRM leads & demo leads.
--
--   crm_leads.lead_no      INTEGER UNIQUE  (sequence starts at 1000  → L-1000, L-1001, ...)
--   crm_demo_leads.demo_no INTEGER UNIQUE  (sequence starts at 8000  → D-8000, D-8001, ...)
--
-- Existing rows are backfilled in created_at order using the sequences,
-- so older rows get the lowest numbers and never change after assignment.
-- The internal UUID `id` is unchanged and remains the technical key.
--
-- Safe to run multiple times (IF NOT EXISTS / DO blocks).

-- ────────────── LEADS ──────────────
CREATE SEQUENCE IF NOT EXISTS public.crm_lead_no_seq
  START WITH 1000
  INCREMENT BY 1
  MINVALUE 1000
  NO MAXVALUE
  CACHE 1;

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS lead_no INTEGER;

-- Backfill existing rows in created_at order. Only rows still NULL.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.crm_leads
    WHERE lead_no IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.crm_leads
       SET lead_no = nextval('public.crm_lead_no_seq')
     WHERE id = r.id;
  END LOOP;
END $$;

-- Future inserts get a number automatically.
ALTER TABLE public.crm_leads
  ALTER COLUMN lead_no SET DEFAULT nextval('public.crm_lead_no_seq');

-- Make sure the sequence is owned by the column so it gets dropped with it.
ALTER SEQUENCE public.crm_lead_no_seq OWNED BY public.crm_leads.lead_no;

-- Uniqueness — and never-NULL going forward.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'crm_leads_lead_no_key'
  ) THEN
    ALTER TABLE public.crm_leads
      ADD CONSTRAINT crm_leads_lead_no_key UNIQUE (lead_no);
  END IF;
END $$;

ALTER TABLE public.crm_leads
  ALTER COLUMN lead_no SET NOT NULL;


-- ────────────── DEMO LEADS ──────────────
CREATE SEQUENCE IF NOT EXISTS public.crm_demo_no_seq
  START WITH 8000
  INCREMENT BY 1
  MINVALUE 8000
  NO MAXVALUE
  CACHE 1;

ALTER TABLE public.crm_demo_leads
  ADD COLUMN IF NOT EXISTS demo_no INTEGER;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.crm_demo_leads
    WHERE demo_no IS NULL
    ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.crm_demo_leads
       SET demo_no = nextval('public.crm_demo_no_seq')
     WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.crm_demo_leads
  ALTER COLUMN demo_no SET DEFAULT nextval('public.crm_demo_no_seq');

ALTER SEQUENCE public.crm_demo_no_seq OWNED BY public.crm_demo_leads.demo_no;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'crm_demo_leads_demo_no_key'
  ) THEN
    ALTER TABLE public.crm_demo_leads
      ADD CONSTRAINT crm_demo_leads_demo_no_key UNIQUE (demo_no);
  END IF;
END $$;

ALTER TABLE public.crm_demo_leads
  ALTER COLUMN demo_no SET NOT NULL;
