-- Phase 64 - tighten authenticated table grants on public.app_users.
--
-- Phase 63 removed anonymous access and replaced permissive RLS policies.
-- This follow-up removes leftover broad table privileges from authenticated
-- users, leaving only the grants required by the current RLS model.

revoke insert, delete, truncate, trigger, references
  on public.app_users
  from authenticated;

grant select, update
  on public.app_users
  to authenticated;

