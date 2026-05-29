-- =====================================================================
-- Phase 4o — Add missing columns to configurations & configuration_items
--
-- Purpose:
--   Fix 400 errors caused by missing columns when the configurator
--   tries to write state_json, pdf_downloaded, pdf_downloaded_at,
--   accessories, config_mode, machine_qty, machine_type, unit_configs.
--
-- Additive only. No drops, no deletes, no truncates, no RLS changes.
-- Safe to re-run.
--
-- HOW TO RUN: Supabase → SQL Editor → paste this file → Run.
-- =====================================================================

-- configurations
ALTER TABLE public.configurations
  ADD COLUMN IF NOT EXISTS pdf_downloaded boolean,
  ADD COLUMN IF NOT EXISTS pdf_downloaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS state_json jsonb;

-- configuration_items
ALTER TABLE public.configuration_items
  ADD COLUMN IF NOT EXISTS accessories jsonb,
  ADD COLUMN IF NOT EXISTS config_mode text,
  ADD COLUMN IF NOT EXISTS machine_qty integer,
  ADD COLUMN IF NOT EXISTS machine_type text,
  ADD COLUMN IF NOT EXISTS unit_configs jsonb;

-- Verify:
--   select column_name, data_type
--     from information_schema.columns
--    where table_schema='public'
--      and table_name in ('configurations','configuration_items')
--      and column_name in (
--        'pdf_downloaded','pdf_downloaded_at','state_json',
--        'accessories','config_mode','machine_qty','machine_type','unit_configs'
--      );
