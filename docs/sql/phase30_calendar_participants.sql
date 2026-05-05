-- Phase 30: multi-seller participants on planned calendar activities.
-- Run manually in Supabase SQL Editor. Safe to re-run.
--
-- Adds an array column on public.crm_calendar_activities so that one or more
-- additional sellers (besides the owner stored in seller_initials) can be
-- assigned to a single activity (fairs, demos, shared visits).
--
-- The existing seller_initials / seller_user_id / seller_name columns remain
-- the OWNER (creator). participant_seller_initials lists EVERY seller (incl.
-- the owner) that should see the activity in their calendar / activity list.
--
-- Existing rows default to '{}' so legacy single-seller activities keep
-- working without any data migration.

alter table public.crm_calendar_activities
  add column if not exists participant_seller_initials text[] not null default '{}';

create index if not exists crm_calendar_activities_participants_idx
  on public.crm_calendar_activities using gin (participant_seller_initials);

-- No RLS / policy change required: the table already has open SELECT/INSERT/
-- UPDATE policies (matching the rest of the CRM module). Visibility is still
-- enforced client-side via crmCalendarService.listActivities().
