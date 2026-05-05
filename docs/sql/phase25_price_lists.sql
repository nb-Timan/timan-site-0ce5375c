-- ============================================================
-- Phase 25 — Price list management (Backend/Admin only)
-- Run manually in Supabase SQL Editor.
-- Safe to re-run (idempotent).
--
-- Creates:
--   * public.price_list_items          — master price list table
--   * public.price_list_import_logs    — audit log for CSV imports
--   * public.upsert_price_list_items() — SECURITY DEFINER bulk upsert
--   * public.update_price_list_item()  — SECURITY DEFINER manual edit
--
-- DOES NOT:
--   * touch configurator, quotes, orders, calc, PDFs, email, n8n, CRM
--   * delete any existing data (no DELETE policy / no DELETE in any RPC)
-- ============================================================

-- 1) price_list_items table -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_list_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_number   text NOT NULL UNIQUE,
  item_text_da  text,
  price_dkk     numeric(12,2),
  price_eur     numeric(12,2),
  price_sek     numeric(12,2),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users(id),
  updated_by_email text
);

CREATE INDEX IF NOT EXISTS price_list_items_item_number_idx
  ON public.price_list_items (item_number);

ALTER TABLE public.price_list_items ENABLE ROW LEVEL SECURITY;

-- Drop & recreate policies (idempotent)
DROP POLICY IF EXISTS price_list_items_select_backend ON public.price_list_items;
DROP POLICY IF EXISTS price_list_items_insert_backend ON public.price_list_items;
DROP POLICY IF EXISTS price_list_items_update_backend ON public.price_list_items;
-- NOTE: intentionally no DELETE policy — rows can never be removed via the API.

CREATE POLICY price_list_items_select_backend ON public.price_list_items
  FOR SELECT TO authenticated
  USING (public.is_timan_backend());

CREATE POLICY price_list_items_insert_backend ON public.price_list_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_timan_backend());

CREATE POLICY price_list_items_update_backend ON public.price_list_items
  FOR UPDATE TO authenticated
  USING (public.is_timan_backend())
  WITH CHECK (public.is_timan_backend());


-- 2) price_list_import_logs ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_list_import_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by       uuid REFERENCES auth.users(id),
  imported_by_email text,
  imported_at       timestamptz NOT NULL DEFAULT now(),
  file_name         text,
  created_count     integer NOT NULL DEFAULT 0,
  updated_count     integer NOT NULL DEFAULT 0,
  skipped_count     integer NOT NULL DEFAULT 0,
  error_count       integer NOT NULL DEFAULT 0,
  errors            jsonb
);

ALTER TABLE public.price_list_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_list_logs_select_backend ON public.price_list_import_logs;
DROP POLICY IF EXISTS price_list_logs_insert_backend ON public.price_list_import_logs;

CREATE POLICY price_list_logs_select_backend ON public.price_list_import_logs
  FOR SELECT TO authenticated
  USING (public.is_timan_backend());

CREATE POLICY price_list_logs_insert_backend ON public.price_list_import_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_timan_backend());


-- 3) Bulk upsert RPC ------------------------------------------------------
-- Accepts payload: { rows: [{ item_number, item_text_da, price_dkk, price_eur, price_sek }, ...] }
-- Empty / null fields NEVER overwrite existing values (COALESCE).
-- Never deletes anything. Returns counts + errors.
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
          (item_number, item_text_da, price_dkk, price_eur, price_sek, updated_by, updated_by_email)
        VALUES
          (v_item, v_text, v_dkk, v_eur, v_sek, v_uid, v_email);
        v_created := v_created + 1;
      ELSE
        IF (v_text IS NULL OR v_text = COALESCE(v_existing.item_text_da,''))
           AND (v_dkk  IS NULL OR v_dkk  = v_existing.price_dkk)
           AND (v_eur  IS NULL OR v_eur  = v_existing.price_eur)
           AND (v_sek  IS NULL OR v_sek  = v_existing.price_sek) THEN
          v_skipped := v_skipped + 1;
        ELSE
          UPDATE public.price_list_items
             SET item_text_da     = COALESCE(v_text, item_text_da),
                 price_dkk        = COALESCE(v_dkk,  price_dkk),
                 price_eur        = COALESCE(v_eur,  price_eur),
                 price_sek        = COALESCE(v_sek,  price_sek),
                 updated_at       = now(),
                 updated_by       = v_uid,
                 updated_by_email = v_email
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


-- 4) Manual single-row edit RPC ------------------------------------------
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
  v_uid   uuid := auth.uid();
  v_email text;
  v_row   public.price_list_items%ROWTYPE;
BEGIN
  IF NOT public.is_timan_backend() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  UPDATE public.price_list_items
     SET item_text_da     = p_item_text_da,
         price_dkk        = p_price_dkk,
         price_eur        = p_price_eur,
         price_sek        = p_price_sek,
         updated_at       = now(),
         updated_by       = v_uid,
         updated_by_email = v_email
   WHERE item_number = p_item_number
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'item_number % not found', p_item_number USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_price_list_item(text, text, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_price_list_item(text, text, numeric, numeric, numeric) TO authenticated;
