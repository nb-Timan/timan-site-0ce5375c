-- Phase 39 — crm_logins table (login event log).
--
-- The original phase4 SQL also creates this table but was never run against
-- this Supabase project (PostgREST returns PGRST205 "Could not find the
-- table 'public.crm_logins'" on insert). This file is a focused, additive,
-- idempotent migration that just creates crm_logins + its RLS policies, so
-- login logging stops falling back to localStorage.
--
-- Safe to run multiple times. Does NOT touch auth, CRM data, or any other
-- table. Run manually in Supabase → SQL Editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_logins (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  user_name           text,
  user_email          text,
  account_id          uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  account_name        text,
  login_date          timestamptz NOT NULL DEFAULT now(),
  ip_placeholder      text,
  device_placeholder  text,
  meta                jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_logins_user_idx    ON public.crm_logins (user_id, login_date DESC);
CREATE INDEX IF NOT EXISTS crm_logins_account_idx ON public.crm_logins (account_id, login_date DESC);
CREATE INDEX IF NOT EXISTS crm_logins_date_idx    ON public.crm_logins (login_date DESC);

ALTER TABLE public.crm_logins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_logins_select ON public.crm_logins;
CREATE POLICY crm_logins_select ON public.crm_logins FOR SELECT USING (true);

DROP POLICY IF EXISTS crm_logins_insert ON public.crm_logins;
CREATE POLICY crm_logins_insert ON public.crm_logins FOR INSERT WITH CHECK (true);

COMMIT;

-- Verify:
--   SELECT count(*) FROM public.crm_logins;
