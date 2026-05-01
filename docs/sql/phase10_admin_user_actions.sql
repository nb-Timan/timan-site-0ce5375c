-- =====================================================================
-- Phase 10 — Admin invite / password-reset metadata for app_users
--
-- Adds three optional columns the Edge Function `admin-user-actions`
-- writes to so the Brugere page can show a status per row:
--   • auth_status            — 'app_only' | 'invited' | 'auth_exists'
--   • last_invited_at        — when the last invite email was sent
--   • last_password_reset_at — when the last reset email was sent
--
-- IMPORTANT — no extra RLS policies are required for the Edge Function
-- itself: it uses the service-role key, which bypasses RLS. The function
-- enforces "only timan_backend may call this" in code.
--
-- Safe to run multiple times.
-- =====================================================================

alter table public.app_users
  add column if not exists auth_status            text,
  add column if not exists last_invited_at        timestamptz,
  add column if not exists last_password_reset_at timestamptz;

-- Optional sanity check constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_users_auth_status_check'
  ) then
    alter table public.app_users
      add constraint app_users_auth_status_check
      check (auth_status is null or auth_status in ('app_only','invited','auth_exists'));
  end if;
end $$;

create index if not exists app_users_auth_status_idx on public.app_users (auth_status);

-- =====================================================================
-- Done. Verify in Supabase:
--   select email, auth_status, last_invited_at, last_password_reset_at
--   from public.app_users limit 5;
-- =====================================================================
