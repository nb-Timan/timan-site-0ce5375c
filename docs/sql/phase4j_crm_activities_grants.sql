-- Phase 4j — CRM activities + logins GRANTs (fix for "permission denied")
--
-- HOW TO RUN
--   Open Supabase → SQL Editor → paste this file → Run.
--   Safe to re-run (idempotent). No data is dropped or modified.
--
-- WHY
--   public.crm_activities and public.crm_logins were created in phase4 with
--   RLS + permissive policies but WITHOUT explicit Data-API GRANTs. Supabase
--   no longer applies default grants to public-schema tables, so inserts
--   from the SPA fail with `permission denied for table crm_activities`.
--   This shows in the UI as "Gemt lokalt – ikke synkroniseret til serveren"
--   on every "Afsend tilbud" / "Afsend ordre" action.
--
-- WHAT THIS DOES
--   - Adds SELECT + INSERT grants for authenticated.
--   - Adds full grants for service_role (edge functions/admin).
--   - Does NOT add anon access (CRM is internal-only).
--   - Does NOT change RLS, policies, columns or data.

grant select, insert on public.crm_activities to authenticated;
grant all          on public.crm_activities to service_role;

grant select, insert on public.crm_logins to authenticated;
grant all          on public.crm_logins to service_role;
