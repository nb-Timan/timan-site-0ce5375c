-- ============================================================
-- Phase 26 — Controlled publish from Backend Prislister to Configurator
-- Run manually in Supabase SQL Editor. Safe to re-run (idempotent).
--
-- Adds:
--   * price_list_items.is_dirty (boolean)
--   * price_list_items.last_published_at (timestamptz)
--   * public.price_list_published          — overlay table (NEW)
--   * public.price_list_publish_logs       — audit log
--   * public.publish_price_list_items()    — SECURITY DEFINER publish RPC
--   * Updates existing update_price_list_item() / upsert_price_list_items()
--     to set is_dirty = true when text/price actually changes.
--
-- DOES NOT:
--   * delete anything (no DELETE policy / no DELETE statements)
--   * touch quotes, orders, configurator code, calc, PDFs, email, n8n, CRM
--   * make the configurator read from price_list_published yet
-- ============================================================

-- 1) Extend price_list_items ---------------------------------------------
ALTER TABLE public.price_list_items
  ADD COLUMN IF NOT EXISTS is_dirty boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_published_at timestamptz;

CREATE INDEX IF NOT EXISTS price_list_items_dirty_idx
  ON public.price_list_items (is_dirty) WHERE is_dirty = true;


-- 2) price_list_published (overlay) --------------------------------------
CREATE TABLE IF NOT EXISTS public.price_list_published (
  item_number        text PRIMARY KEY,
  item_text_da       text,
  price_dkk          numeric(12,2),
  price_eur          numeric(12,2),
  price_sek          numeric(12,2),
  published_at       timestamptz NOT NULL DEFAULT now(),
  published_by       uuid REFERENCES auth.users(id),
  published_by_email text
);

ALTER TABLE public.price_list_published ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_list_published_select_backend ON public.price_list_published;
-- NOTE: no INSERT/UPDATE/DELETE policy — writes happen only via SECURITY DEFINER RPC.

CREATE POLICY price_list_published_select_backend ON public.price_list_published
  FOR SELECT TO authenticated
  USING (public.is_timan_backend());


-- 3) price_list_publish_logs (audit) -------------------------------------
CREATE TABLE IF NOT EXISTS public.price_list_publish_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  published_by       uuid REFERENCES auth.users(id),
  published_by_email text,
  published_at       timestamptz NOT NULL DEFAULT now(),
  created_count      integer NOT NULL DEFAULT 0,
  updated_count      integer NOT NULL DEFAULT 0,
  skipped_count      integer NOT NULL DEFAULT 0,
  error_count        integer NOT NULL DEFAULT 0,
  errors             jsonb,
  item_numbers       jsonb
);

ALTER TABLE public.price_list_publish_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_list_publish_logs_select_backend ON public.price_list_publish_logs;
DROP POLICY IF EXISTS price_list_publish_logs_insert_backend ON public.price_list_publish_logs;

CREATE POLICY price_list_publish_logs_select_backend ON public.price_list_publish_logs
  FOR SELECT TO authenticated
  USING (public.is_timan_backend());

CREATE POLICY price_list_publish_logs_insert_backend ON public.price_list_publish_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_timan_backend());


-- 4) Patch update_price_list_item() — flag dirty on real change ----------
CREATE OR REPLACE FUNCTION public.update_price_list_item(
  p_item_number text,
  p_item_text_da text,
  p_price_dkk numeric,
  p_price_eur numeric,
  p_price_sek numeric
)
RETURNS public.price_list_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_email   text;
  v_existing public.price_list_items%ROWTYPE;
  v_changed boolean := false;
  v_row     public.price_list_items%ROWTYPE;
BEGIN
  IF NOT public.is_timan_backend() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_existing FROM public.price_list_items WHERE item_number = p_item_number;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_number % not found', p_item_number USING ERRCODE = 'P0002';
  END IF;

  v_changed :=
        (p_item_text_da IS DISTINCT FROM v_existing.item_text_da)
     OR (p_price_dkk    IS DISTINCT FROM v_existing.price_dkk)
     OR (p_price_eur    IS DISTINCT FROM v_existing.price_eur)
     OR (p_price_sek    IS DISTINCT FROM v_existing.price_sek);

  UPDATE public.price_list_items
     SET item_text_da     = p_item_text_da,
         price_dkk        = p_price_dkk,
         price_eur        = p_price_eur,
         price_sek        = p_price_sek,
         updated_at       = now(),
         updated_by       = v_uid,
         updated_by_email = v_email,
         is_dirty         = CASE WHEN v_changed THEN true ELSE is_dirty END
   WHERE item_number = p_item_number
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_price_list_item(text, text, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_price_list_item(text, text, numeric, numeric, numeric) TO authenticated;


-- 5) Patch upsert_price_list_items() — flag dirty on real change ---------
CREATE OR REPLACE FUNCTION public.upsert_price_list_items(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_row    jsonb;
  v_item   text;
  v_text   text;
  v_dkk    numeric;
  v_eur    numeric;
  v_sek    numeric;
  v_existing public.price_list_items%ROWTYPE;
  v_created  integer := 0;
  v_updated  integer := 0;
  v_skipped  integer := 0;
  v_errors   jsonb := '[]'::jsonb;
  v_changed  boolean;
BEGIN
  IF NOT public.is_timan_backend() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(payload->'rows', '[]'::jsonb))
  LOOP
    BEGIN
      v_item := NULLIF(trim(v_row->>'item_number'), '');
      IF v_item IS NULL THEN
        v_errors := v_errors || jsonb_build_object('item_number', NULL, 'error', 'missing item_number');
        CONTINUE;
      END IF;

      v_text := NULLIF(trim(COALESCE(v_row->>'item_text_da', '')), '');

      v_dkk := CASE WHEN NULLIF(trim(COALESCE(v_row->>'price_dkk','')),'') IS NULL
                    THEN NULL ELSE (v_row->>'price_dkk')::numeric END;
      v_eur := CASE WHEN NULLIF(trim(COALESCE(v_row->>'price_eur','')),'') IS NULL
                    THEN NULL ELSE (v_row->>'price_eur')::numeric END;
      v_sek := CASE WHEN NULLIF(trim(COALESCE(v_row->>'price_sek','')),'') IS NULL
                    THEN NULL ELSE (v_row->>'price_sek')::numeric END;

      SELECT * INTO v_existing FROM public.price_list_items WHERE item_number = v_item;

      IF NOT FOUND THEN
        INSERT INTO public.price_list_items
          (item_number, item_text_da, price_dkk, price_eur, price_sek, updated_by, updated_by_email, is_dirty)
        VALUES
          (v_item, v_text, v_dkk, v_eur, v_sek, v_uid, v_email, true);
        v_created := v_created + 1;
      ELSE
        v_changed :=
              (v_text IS NOT NULL AND v_text IS DISTINCT FROM v_existing.item_text_da)
           OR (v_dkk  IS NOT NULL AND v_dkk  IS DISTINCT FROM v_existing.price_dkk)
           OR (v_eur  IS NOT NULL AND v_eur  IS DISTINCT FROM v_existing.price_eur)
           OR (v_sek  IS NOT NULL AND v_sek  IS DISTINCT FROM v_existing.price_sek);

        IF NOT v_changed THEN
          v_skipped := v_skipped + 1;
        ELSE
          UPDATE public.price_list_items
             SET item_text_da     = COALESCE(v_text, item_text_da),
                 price_dkk        = COALESCE(v_dkk,  price_dkk),
                 price_eur        = COALESCE(v_eur,  price_eur),
                 price_sek        = COALESCE(v_sek,  price_sek),
                 updated_at       = now(),
                 updated_by       = v_uid,
                 updated_by_email = v_email,
                 is_dirty         = true
           WHERE item_number = v_item;
          v_updated := v_updated + 1;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('item_number', v_item, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors',  v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_price_list_items(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_price_list_items(jsonb) TO authenticated;


-- 6) Publish RPC ---------------------------------------------------------
-- payload: { item_numbers: ["...", ...] }
-- Upserts only listed varenr from price_list_items into price_list_published
-- using COALESCE (empty/null source values never overwrite published values).
-- Clears is_dirty + stamps last_published_at on each source row.
-- Never deletes. Returns counts + errors.
CREATE OR REPLACE FUNCTION public.publish_price_list_items(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_email  text;
  v_item   text;
  v_src    public.price_list_items%ROWTYPE;
  v_pub    public.price_list_published%ROWTYPE;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  v_errors  jsonb := '[]'::jsonb;
  v_items   jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_timan_backend() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  FOR v_item IN
    SELECT DISTINCT NULLIF(trim(value::text, '"'), '')
      FROM jsonb_array_elements_text(COALESCE(payload->'item_numbers', '[]'::jsonb))
  LOOP
    BEGIN
      IF v_item IS NULL THEN CONTINUE; END IF;

      SELECT * INTO v_src FROM public.price_list_items WHERE item_number = v_item;
      IF NOT FOUND THEN
        v_errors := v_errors || jsonb_build_object('item_number', v_item, 'error', 'not found in price_list_items');
        CONTINUE;
      END IF;

      SELECT * INTO v_pub FROM public.price_list_published WHERE item_number = v_item;

      IF NOT FOUND THEN
        INSERT INTO public.price_list_published
          (item_number, item_text_da, price_dkk, price_eur, price_sek, published_by, published_by_email)
        VALUES
          (v_src.item_number, v_src.item_text_da, v_src.price_dkk, v_src.price_eur, v_src.price_sek, v_uid, v_email);
        v_created := v_created + 1;
      ELSE
        IF (v_src.item_text_da IS NULL OR v_src.item_text_da IS NOT DISTINCT FROM v_pub.item_text_da)
           AND (v_src.price_dkk IS NULL OR v_src.price_dkk IS NOT DISTINCT FROM v_pub.price_dkk)
           AND (v_src.price_eur IS NULL OR v_src.price_eur IS NOT DISTINCT FROM v_pub.price_eur)
           AND (v_src.price_sek IS NULL OR v_src.price_sek IS NOT DISTINCT FROM v_pub.price_sek) THEN
          v_skipped := v_skipped + 1;
        ELSE
          UPDATE public.price_list_published
             SET item_text_da       = COALESCE(v_src.item_text_da, item_text_da),
                 price_dkk          = COALESCE(v_src.price_dkk,    price_dkk),
                 price_eur          = COALESCE(v_src.price_eur,    price_eur),
                 price_sek          = COALESCE(v_src.price_sek,    price_sek),
                 published_at       = now(),
                 published_by       = v_uid,
                 published_by_email = v_email
           WHERE item_number = v_item;
          v_updated := v_updated + 1;
        END IF;
      END IF;

      UPDATE public.price_list_items
         SET is_dirty          = false,
             last_published_at = now()
       WHERE item_number = v_item;

      v_items := v_items || to_jsonb(v_item);
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('item_number', v_item, 'error', SQLERRM);
    END;
  END LOOP;

  INSERT INTO public.price_list_publish_logs
    (published_by, published_by_email, created_count, updated_count, skipped_count, error_count, errors, item_numbers)
  VALUES
    (v_uid, v_email, v_created, v_updated, v_skipped, jsonb_array_length(v_errors), v_errors, v_items);

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped', v_skipped,
    'errors',  v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.publish_price_list_items(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_price_list_items(jsonb) TO authenticated;
