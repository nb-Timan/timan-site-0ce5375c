-- Phase 1 foundation for Timan Assistant Support access.
-- The permission remains in app_users.permissions and defaults to OFF when
-- absent. This RPC is the canonical server-side authorization boundary for
-- future Support APIs and never accepts a caller-supplied user id.

create or replace function public.can_access_support()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users as u
    where auth.uid() is not null
      and (
        u.auth_user_id = auth.uid()
        or lower(u.email) = lower(nullif(auth.jwt() ->> 'email', ''))
      )
      and u.portal_role::text = 'timan_backend'
      and coalesce(u.approved, false) = true
      and coalesce(u.is_active, false) = true
      and coalesce((u.permissions ->> 'support_access')::boolean, false) = true
  );
$$;

revoke all on function public.can_access_support() from public, anon, authenticated, service_role;
grant execute on function public.can_access_support() to authenticated;

comment on function public.can_access_support() is
  'True only for the authenticated, active, approved Timan Backend user with permissions.support_access=true.';
