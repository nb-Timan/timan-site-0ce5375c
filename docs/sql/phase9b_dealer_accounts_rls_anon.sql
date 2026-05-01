-- =====================================================================
-- ⚠️  SUPERSEDED — DO NOT RUN.
--
-- This migration was a temporary fix that allowed the 'anon' role to read
-- public.dealer_accounts. That made dealer master data publicly readable
-- via the publishable key, which is not acceptable.
--
-- Use docs/sql/phase9c_dealer_accounts_backend_only.sql instead. It locks
-- SELECT to authenticated Timan Backend users (is_timan_backend()).
--
-- If you already ran phase9b, just run phase9c — it drops the anon policy
-- and replaces it with the backend-only one (idempotent).
-- =====================================================================

-- Intentionally empty.
select 1;
