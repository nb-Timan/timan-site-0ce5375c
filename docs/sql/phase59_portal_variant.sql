-- Phase 59 — Add `portal_variant` to public.app_users.
--
-- Lets us mark a user as a "Messe Portal" user without polluting the
-- portal_role enum with the synthetic `exhibition_user` value.
--
-- Allowed values (free-form text, validated client-side & by check):
--   'standard' (default) — normal portal behavior
--   'messe'              — user is locked to the /messe layout
--
-- HOW TO RUN
-- 1. Open Supabase → SQL Editor
-- 2. Paste this file and click Run
-- 3. Safe to re-run (idempotent)

alter table public.app_users
  add column if not exists portal_variant text not null default 'standard';

comment on column public.app_users.portal_variant is
  'Portal layout variant. ''standard'' = normal portal. ''messe'' = locked to /messe demo layout. Kept as text (not enum) for flexibility.';

-- Optional check constraint, added idempotently.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_portal_variant_chk'
  ) then
    alter table public.app_users
      add constraint app_users_portal_variant_chk
      check (portal_variant in ('standard', 'messe'));
  end if;
end$$;
