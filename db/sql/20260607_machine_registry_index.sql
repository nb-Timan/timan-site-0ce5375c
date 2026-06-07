-- ============================================================
-- Machine Registry Index — Phase 2 of "Min Maskine"
-- ============================================================
-- Lightweight, additive identity layer for the Machine Journal.
-- Purpose: one row per normalized serial number, populated automatically
-- the moment a record with a serial is written into any of:
--   - warranty_registrations
--   - service_registrations
--   - service_tickets
--   - service_claims
--
-- This does NOT replace public.machines. The journal still prefers the
-- richer machines row when one exists. The registry index exists so the
-- machine becomes searchable in "Søg på maskine" the instant the first
-- record is created in any module, with no manual data entry.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.machine_registry_index (
  normalized_serial   text PRIMARY KEY,
  display_serial      text NOT NULL,
  machine_model       text,
  machine_type        text,
  last_source         text,                       -- 'warranty' | 'service' | 'ticket' | 'claim'
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS machine_registry_index_display_idx
  ON public.machine_registry_index (display_serial);
CREATE INDEX IF NOT EXISTS machine_registry_index_last_activity_idx
  ON public.machine_registry_index (last_activity_at DESC);

-- 2. Grants + RLS — INTERNAL ROLES ONLY.
--
-- Security rationale:
--   The registry holds one row per normalized serial across ALL dealers.
--   Exposing it to every authenticated user would leak the existence of
--   serial numbers (and model/type metadata) across dealer boundaries,
--   even though the underlying source tables are RLS-scoped.
--
--   The source tables (warranty_registrations, service_registrations,
--   service_tickets, service_claims) use heterogeneous dealer scoping
--   (dealer_account_id, dealer_company text, dealer email, etc.), so a
--   single per-row RLS predicate on the registry cannot reliably reproduce
--   every source policy without risking false-positive disclosure.
--
--   Therefore: only internal Timan roles (timan_backend, timan_service)
--   may SELECT directly from the registry. Dealer / importer / service
--   partner / partner / default users get machine search results from
--   scoped queries against the source tables (already RLS-protected),
--   exactly as today. The registry remains the fast cross-source index
--   for internal users and the trigger/backfill machinery still runs
--   for every write regardless of who performed it (SECURITY DEFINER).
GRANT SELECT ON public.machine_registry_index TO authenticated;
GRANT ALL    ON public.machine_registry_index TO service_role;

ALTER TABLE public.machine_registry_index ENABLE ROW LEVEL SECURITY;

-- Drop any earlier permissive policy from previous iterations.
DROP POLICY IF EXISTS "Authenticated read machine_registry_index"
  ON public.machine_registry_index;
DROP POLICY IF EXISTS machine_registry_index_select_internal
  ON public.machine_registry_index;

CREATE POLICY machine_registry_index_select_internal
  ON public.machine_registry_index
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.app_users au
      WHERE lower(au.email) = lower(auth.jwt() ->> 'email')
        AND au.is_active = true
        AND au.approved  = true
        AND au.portal_role IN ('timan_backend', 'timan_service')
    )
  );

-- No INSERT/UPDATE/DELETE policy for authenticated. All writes happen via
-- SECURITY DEFINER triggers (_machine_registry_touch) or the service role
-- during backfill, so dealer-side users cannot mutate the registry either.

-- 3. Normalization function — mirrors src/lib/machineJournalService.ts
--    normalizeSerial(): trim, uppercase, collapse whitespace. Separator
--    matching is handled in code via serialKey() to keep DB matching strict.
CREATE OR REPLACE FUNCTION public.normalize_machine_serial(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN v IS NULL OR btrim(v) = '' THEN NULL
    ELSE upper(regexp_replace(btrim(v), '\s+', ' ', 'g'))
  END
$$;

-- 4. Generic upsert helper
CREATE OR REPLACE FUNCTION public._machine_registry_touch(
  p_serial text,
  p_model  text,
  p_type   text,
  p_source text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  norm text := public.normalize_machine_serial(p_serial);
BEGIN
  IF norm IS NULL THEN RETURN; END IF;
  INSERT INTO public.machine_registry_index
    (normalized_serial, display_serial, machine_model, machine_type, last_source, last_activity_at)
  VALUES
    (norm, btrim(p_serial), p_model, p_type, p_source, now())
  ON CONFLICT (normalized_serial) DO UPDATE
    SET display_serial    = COALESCE(EXCLUDED.display_serial, public.machine_registry_index.display_serial),
        machine_model     = COALESCE(EXCLUDED.machine_model,  public.machine_registry_index.machine_model),
        machine_type      = COALESCE(EXCLUDED.machine_type,   public.machine_registry_index.machine_type),
        last_source       = EXCLUDED.last_source,
        last_activity_at  = now();
END;
$$;

-- 5. Triggers — one per source table, defensive (skip if table missing).
-- 5a. warranty_registrations
DO $$
BEGIN
  IF to_regclass('public.warranty_registrations') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.trg_machine_registry_warranty()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
    BEGIN
      PERFORM public._machine_registry_touch(
        NEW.machine_serial_number, NEW.machine_model, NULL, 'warranty');
      RETURN NEW;
    END $f$;

    DROP TRIGGER IF EXISTS trg_machine_registry_warranty_aiu ON public.warranty_registrations;
    CREATE TRIGGER trg_machine_registry_warranty_aiu
      AFTER INSERT OR UPDATE OF machine_serial_number
      ON public.warranty_registrations
      FOR EACH ROW EXECUTE FUNCTION public.trg_machine_registry_warranty();
  END IF;
END $$;

-- 5b. service_registrations
DO $$
BEGIN
  IF to_regclass('public.service_registrations') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.trg_machine_registry_service_reg()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
    BEGIN
      PERFORM public._machine_registry_touch(
        NEW.serial_number, NULL, NEW.machine_type, 'service');
      RETURN NEW;
    END $f$;

    DROP TRIGGER IF EXISTS trg_machine_registry_service_reg_aiu ON public.service_registrations;
    CREATE TRIGGER trg_machine_registry_service_reg_aiu
      AFTER INSERT OR UPDATE OF serial_number
      ON public.service_registrations
      FOR EACH ROW EXECUTE FUNCTION public.trg_machine_registry_service_reg();
  END IF;
END $$;

-- 5c. service_tickets
DO $$
BEGIN
  IF to_regclass('public.service_tickets') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.trg_machine_registry_ticket()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
    BEGIN
      PERFORM public._machine_registry_touch(
        NEW.serial_number, NULL, NULL, 'ticket');
      RETURN NEW;
    END $f$;

    DROP TRIGGER IF EXISTS trg_machine_registry_ticket_aiu ON public.service_tickets;
    CREATE TRIGGER trg_machine_registry_ticket_aiu
      AFTER INSERT OR UPDATE OF serial_number
      ON public.service_tickets
      FOR EACH ROW EXECUTE FUNCTION public.trg_machine_registry_ticket();
  END IF;
END $$;

-- 5d. service_claims
DO $$
BEGIN
  IF to_regclass('public.service_claims') IS NOT NULL THEN
    CREATE OR REPLACE FUNCTION public.trg_machine_registry_claim()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
    BEGIN
      PERFORM public._machine_registry_touch(
        NEW.machine_serial, NEW.machine_model, NULL, 'claim');
      RETURN NEW;
    END $f$;

    DROP TRIGGER IF EXISTS trg_machine_registry_claim_aiu ON public.service_claims;
    CREATE TRIGGER trg_machine_registry_claim_aiu
      AFTER INSERT OR UPDATE OF machine_serial
      ON public.service_claims
      FOR EACH ROW EXECUTE FUNCTION public.trg_machine_registry_claim();
  END IF;
END $$;

-- 6. Backfill existing rows so already-created records become searchable.
DO $$
BEGIN
  IF to_regclass('public.warranty_registrations') IS NOT NULL THEN
    INSERT INTO public.machine_registry_index
      (normalized_serial, display_serial, machine_model, last_source, last_activity_at)
    SELECT public.normalize_machine_serial(machine_serial_number),
           btrim(machine_serial_number),
           machine_model,
           'warranty',
           COALESCE(updated_at, created_at, now())
      FROM public.warranty_registrations
     WHERE machine_serial_number IS NOT NULL
       AND btrim(machine_serial_number) <> ''
    ON CONFLICT (normalized_serial) DO NOTHING;
  END IF;

  IF to_regclass('public.service_registrations') IS NOT NULL THEN
    INSERT INTO public.machine_registry_index
      (normalized_serial, display_serial, machine_type, last_source, last_activity_at)
    SELECT public.normalize_machine_serial(serial_number),
           btrim(serial_number),
           machine_type,
           'service',
           COALESCE(updated_at, created_at, now())
      FROM public.service_registrations
     WHERE serial_number IS NOT NULL
       AND btrim(serial_number) <> ''
    ON CONFLICT (normalized_serial) DO NOTHING;
  END IF;

  IF to_regclass('public.service_tickets') IS NOT NULL THEN
    INSERT INTO public.machine_registry_index
      (normalized_serial, display_serial, last_source, last_activity_at)
    SELECT public.normalize_machine_serial(serial_number),
           btrim(serial_number),
           'ticket',
           COALESCE(updated_at, created_at, now())
      FROM public.service_tickets
     WHERE serial_number IS NOT NULL
       AND btrim(serial_number) <> ''
    ON CONFLICT (normalized_serial) DO NOTHING;
  END IF;

  IF to_regclass('public.service_claims') IS NOT NULL THEN
    INSERT INTO public.machine_registry_index
      (normalized_serial, display_serial, machine_model, last_source, last_activity_at)
    SELECT public.normalize_machine_serial(machine_serial),
           btrim(machine_serial),
           machine_model,
           'claim',
           created_at
      FROM public.service_claims
     WHERE machine_serial IS NOT NULL
       AND btrim(machine_serial) <> ''
    ON CONFLICT (normalized_serial) DO NOTHING;
  END IF;
END $$;
