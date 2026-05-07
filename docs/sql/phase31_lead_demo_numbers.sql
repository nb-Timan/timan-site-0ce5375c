-- phase31_lead_demo_numbers.sql  (corrected)
--
-- Adds stable, human-readable numbers to CRM leads & demo leads.
--
--   crm_leads.lead_no      INTEGER UNIQUE NOT NULL  (sequence starts at 1000  → L-1000, L-1001, ...)
--   crm_demo_leads.demo_no INTEGER UNIQUE NOT NULL  (sequence starts at 8000  → D-8000, D-8001, ...)
--
-- Safe to run on a fresh database: if `public.crm_leads` or
-- `public.crm_demo_leads` do not exist yet they are CREATEd with the columns
-- the app currently uses (mirrors src/lib/crmLeadsService.ts). If they already
-- exist, only missing columns are added and existing rows are backfilled in
-- created_at order — no data is deleted, no rows are rewritten once numbered.
--
-- Idempotent: safe to run multiple times.

-- ════════════════════════════════════════════════════════════════════
-- 1. Ensure base tables exist
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 TEXT,
  owner_user_id         UUID,
  owner_name            TEXT,
  linked_dealer_id      TEXT,
  first_contact_date    DATE,
  expected_close_date   DATE,
  next_followup_date    DATE,
  machine_types         TEXT[],
  next_activity         TEXT,
  demo_has_run          TEXT,
  contact_type          TEXT,
  customer_type         TEXT,
  contact_information   TEXT,
  trade_fair            TEXT,
  country               TEXT,
  notes                 TEXT,
  estimated_value       NUMERIC,
  probability           NUMERIC,
  pipeline_stage        TEXT,
  lost_competitor       TEXT,
  lost_reason           TEXT,
  lost_comment          TEXT,
  status                TEXT,
  move_to_working_qty   INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_demo_leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id            TEXT,
  title                TEXT,
  owner_user_id        UUID,
  owner_name           TEXT,
  dealer_company       TEXT,
  dealer_country       TEXT,
  dealer_rep           TEXT,
  customer_name        TEXT,
  customer_address     TEXT,
  notes                TEXT,
  machine_category     TEXT[],
  demo_machine         TEXT,
  demo_equipment       TEXT[],
  demo_date            DATE,
  interest_level       INTEGER,
  wants_offer          TEXT,
  followup_date        DATE,
  estimated_value      NUMERIC,
  probability          NUMERIC,
  competitors_present  TEXT,
  competitor_name      TEXT,
  notes_after_demo     TEXT,
  result_status        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defensive: if the tables already existed without these columns, add them.
ALTER TABLE public.crm_leads      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.crm_demo_leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ════════════════════════════════════════════════════════════════════
-- 2. crm_leads.lead_no  (sequence starts at 1000 → "L-1000")
-- ════════════════════════════════════════════════════════════════════

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
DECLARE r RECORD;
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

-- Tie sequence lifecycle to the column.
ALTER SEQUENCE public.crm_lead_no_seq OWNED BY public.crm_leads.lead_no;

-- Uniqueness + NOT NULL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_leads_lead_no_key'
  ) THEN
    ALTER TABLE public.crm_leads
      ADD CONSTRAINT crm_leads_lead_no_key UNIQUE (lead_no);
  END IF;
END $$;

ALTER TABLE public.crm_leads
  ALTER COLUMN lead_no SET NOT NULL;


-- ════════════════════════════════════════════════════════════════════
-- 3. crm_demo_leads.demo_no  (sequence starts at 8000 → "D-8000")
-- ════════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS public.crm_demo_no_seq
  START WITH 8000
  INCREMENT BY 1
  MINVALUE 8000
  NO MAXVALUE
  CACHE 1;

ALTER TABLE public.crm_demo_leads
  ADD COLUMN IF NOT EXISTS demo_no INTEGER;

DO $$
DECLARE r RECORD;
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
    SELECT 1 FROM pg_constraint WHERE conname = 'crm_demo_leads_demo_no_key'
  ) THEN
    ALTER TABLE public.crm_demo_leads
      ADD CONSTRAINT crm_demo_leads_demo_no_key UNIQUE (demo_no);
  END IF;
END $$;

ALTER TABLE public.crm_demo_leads
  ALTER COLUMN demo_no SET NOT NULL;
