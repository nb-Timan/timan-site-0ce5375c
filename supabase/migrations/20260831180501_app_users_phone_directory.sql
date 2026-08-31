-- Add canonical Timan user phone numbers and expose them through the
-- existing minimal seller directory used by partner-detail seller cards.

alter table public.app_users
  add column if not exists phone text;

drop view if exists public.app_user_directory;
create view public.app_user_directory
with (security_invoker = off) as
  select
    u.id,
    lower(u.email) as email,
    upper(u.initials) as initials,
    u.full_name,
    u.portal_role::text as portal_role,
    u.company,
    u.phone
  from public.app_users u
  where u.initials is not null
    and u.portal_role in (
      'timan_backend'::public.portal_role,
      'timan_seller'::public.portal_role,
      'timan_service'::public.portal_role,
      'timan_importer'::public.portal_role
    );

revoke all on public.app_user_directory from anon, public;
grant select on public.app_user_directory to authenticated, service_role;
