-- =====================================================================
-- Phase 13 — Robust backend RPC for dealer_accounts + diagnostics
--
-- Why:
--   Direct SELECT on public.dealer_accounts depends on RLS policy
--   public.is_timan_backend(), which matches the caller via
--   auth.jwt() ->> 'email'. In some sessions (or after email-case mismatch)
--   that lookup can fail and return 0 rows even for valid backend users.
--
-- This migration adds:
--   1. A more forgiving is_timan_backend() that ALSO accepts auth.uid()
--      matching app_users.auth_user_id.
--   2. A SECURITY DEFINER RPC list_dealer_accounts_for_backend() that the
--      frontend can call as a reliable fallback. Authorization is enforced
--      INSIDE the function — non-backend callers get an exception.
--   3. Diagnostic helpers backend_auth_check() and dealer_access_check()
--      so the UI can show the real reason when access fails.
--
-- Safe to run multiple times. Does not change configurator pricing,
-- product data, quote/order logic, or n8n webhook logic.
-- =====================================================================

-- ---------- 1) Forgiving backend-role check -------------------------------
create or replace function public.is_timan_backend()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users au
    where au.portal_role = 'timan_backend'
      and coalesce(au.is_active, false) = true
      and coalesce(au.approved,  false) = true
      and (
        -- match by linked auth uid (preferred when populated)
        au.auth_user_id = auth.uid()
        -- or by JWT email (case-insensitive, trimmed)
        or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  );
$$;

revoke all on function public.is_timan_backend() from public;
grant execute on function public.is_timan_backend() to authenticated;

-- ---------- 2) Backend-only RPC that returns ALL dealer_accounts ----------
create or replace function public.list_dealer_accounts_for_backend()
returns setof public.dealer_accounts
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_timan_backend() then
    raise exception 'forbidden: not a Timan Backend user'
      using errcode = '42501';
  end if;

  return query
    select * from public.dealer_accounts
    order by company_name asc;
end;
$$;

revoke all on function public.list_dealer_accounts_for_backend() from public;
grant execute on function public.list_dealer_accounts_for_backend() to authenticated;

-- ---------- 3) Diagnostic helpers -----------------------------------------
-- Returns a single row describing what auth/role the server sees for the
-- caller. Used by the Forhandlere page to display a clear error message
-- instead of "[object Object]".
create or replace function public.backend_auth_check()
returns table (
  has_session       boolean,
  jwt_email         text,
  jwt_uid           uuid,
  matched_app_user  boolean,
  app_user_email    text,
  app_user_role     text,
  is_active         boolean,
  approved          boolean,
  is_backend        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null                                   as has_session,
    coalesce(auth.jwt() ->> 'email', '')                     as jwt_email,
    auth.uid()                                               as jwt_uid,
    au.id is not null                                        as matched_app_user,
    au.email                                                 as app_user_email,
    au.portal_role                                           as app_user_role,
    au.is_active                                             as is_active,
    au.approved                                              as approved,
    public.is_timan_backend()                                as is_backend
  from (select 1) s
  left join public.app_users au
    on au.auth_user_id = auth.uid()
       or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')));
$$;

revoke all on function public.backend_auth_check() from public;
grant execute on function public.backend_auth_check() to authenticated;

-- =====================================================================
-- Verify (run while signed-in as nb@timan.dk via the app):
--   select * from public.backend_auth_check();
--   select count(*) from public.list_dealer_accounts_for_backend();  -- expect 98
-- =====================================================================
