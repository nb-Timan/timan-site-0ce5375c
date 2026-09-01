-- Harden the minimal user directory view so it remains read-only for browser
-- clients and respects the RLS policies on public.app_users.

alter view public.app_user_directory
  set (security_invoker = true);

revoke all privileges on table public.app_user_directory from anon;
revoke all privileges on table public.app_user_directory from authenticated;
revoke all privileges on table public.app_user_directory from public;
revoke all privileges on table public.app_user_directory from service_role;

grant select on table public.app_user_directory to authenticated;
grant select on table public.app_user_directory to service_role;

update public.app_users
set initials = 'NB'
where lower(email) = 'nb@timan.dk'
  and nullif(upper(trim(coalesce(initials, ''))), '') is distinct from 'NB';
