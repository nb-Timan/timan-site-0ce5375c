-- Phase 29: per-session last_seen heartbeat for accurate duration.
-- Run this in Supabase SQL Editor.
--
-- Adds a `last_seen` column to guest_sessions so the analytics dashboard can
-- compute duration as coalesce(duration_seconds, last_seen - started_at) for
-- sessions that never received an end-of-session beacon (e.g. tab killed).
--
-- Safe to re-run.

alter table public.guest_sessions
  add column if not exists last_seen timestamptz;

create index if not exists idx_guest_sessions_last_seen
  on public.guest_sessions(last_seen desc);

-- The existing "anon update sessions" policy from phase7 already permits
-- anon + authenticated to update guest_sessions rows, so no policy change
-- is required for the heartbeat writes.
