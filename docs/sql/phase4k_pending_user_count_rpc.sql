-- =====================================================================
-- Phase 4k — pending_user_count RPC (fix 404 in console)
--
-- Safe to run multiple times. Creates the SECURITY DEFINER helper used by
-- the Timan Backend notification bell. Does NOT touch any data, RLS,
-- pricing, quotes, orders, configurator or CRM logic.
--
-- Run this in Supabase SQL editor.
-- =====================================================================

create or replace function public.pending_user_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.app_users
  where coalesce(approved, false) = false
    and coalesce(status, 'pending') = 'pending';
$$;

revoke all on function public.pending_user_count() from public;
grant execute on function public.pending_user_count() to authenticated;

-- Refresh PostgREST schema cache so the RPC is reachable immediately:
notify pgrst, 'reload schema';

-- Verify:
--   select public.pending_user_count();
