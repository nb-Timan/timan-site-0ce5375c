-- Phase 37 — Add optional `quick_actions` jsonb column to public.app_users.
--
-- Stores which "Hurtige handlinger" / "Quick actions" cards the user can see
-- on the portal front page. Pure additive frontend access layer:
--   - NULL  → fall back to role defaults (current behavior)
--   - []    → explicitly hide all quick actions
--   - ['create_lead', 'calendar', ...] → only show these keys
--
-- Keys (free-form text, validated client-side):
--   create_lead, create_demo, calendar, my_dealers
--
-- HOW TO RUN
-- 1. Open Supabase → SQL Editor.
-- 2. Paste this entire file and click "Run".
-- 3. Safe to re-run (idempotent).

alter table public.app_users
  add column if not exists quick_actions jsonb default null;

comment on column public.app_users.quick_actions is
  'Optional array of quick-action keys (create_lead, create_demo, calendar, my_dealers). NULL = role defaults.';
