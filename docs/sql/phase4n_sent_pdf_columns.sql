-- =====================================================================
-- Phase 4n — Add sent PDF columns to public.configurations
--
-- Purpose:
--   uploadSentPdf() in src/lib/configurationsService.ts persists the
--   storage path + filename of the generated quote/order PDF on the
--   configurations row. If these columns are missing, the patch is
--   silently stripped by updateConfigurationRow and "Min konto" cannot
--   re-open the sent PDF.
--
-- Additive only. No drops, no deletes, no truncates, no RLS changes.
-- Safe to re-run.
--
-- HOW TO RUN: Supabase → SQL Editor → paste this file → Run.
-- =====================================================================

ALTER TABLE public.configurations
  ADD COLUMN IF NOT EXISTS sent_pdf_path text,
  ADD COLUMN IF NOT EXISTS sent_pdf_filename text,
  ADD COLUMN IF NOT EXISTS sent_pdf_bucket text;

-- Verify:
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='configurations'
--      and column_name like 'sent_pdf%';
