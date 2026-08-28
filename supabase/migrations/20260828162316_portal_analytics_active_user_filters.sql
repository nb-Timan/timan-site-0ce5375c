-- Backend -> Portal Analytics user filters.
-- The analytics KPI RPC intentionally summarizes portal_module_usage server-side,
-- but the selectable users must come from active portal users, not only users
-- who already have module usage rows.

create or replace function public.get_backend_portal_analytics_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_result jsonb;
begin
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can read portal usage analytics filters'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', id,
        'email', email,
        'display_name', display_name,
        'portal_role', portal_role,
        'dealer_number', dealer_number
      ) order by display_name, email)
      from (
        select
          au.id,
          lower(au.email) as email,
          coalesce(
            nullif(au.display_name, ''),
            nullif(au.full_name, ''),
            nullif(au.initials, ''),
            au.email
          ) as display_name,
          coalesce(au.portal_role::text, au.role) as portal_role,
          au.dealer_number
        from public.app_users au
        where nullif(au.email, '') is not null
          and coalesce(au.is_active, true) = true
          and coalesce(au.approved, true) = true
          and coalesce(au.status, 'active') = 'active'
      ) u
    ), '[]'::jsonb),
    'roles', coalesce((
      select jsonb_agg(role order by role)
      from (
        select distinct coalesce(au.portal_role::text, au.role) as role
        from public.app_users au
        where nullif(coalesce(au.portal_role::text, au.role), '') is not null
          and coalesce(au.is_active, true) = true
          and coalesce(au.approved, true) = true
          and coalesce(au.status, 'active') = 'active'
        union
        select distinct pmu.portal_role as role
        from public.portal_module_usage pmu
        where nullif(pmu.portal_role, '') is not null
      ) r
    ), '[]'::jsonb),
    'dealer_numbers', coalesce((
      select jsonb_agg(dealer_number order by dealer_number)
      from (
        select distinct au.dealer_number
        from public.app_users au
        where nullif(au.dealer_number, '') is not null
          and coalesce(au.is_active, true) = true
          and coalesce(au.approved, true) = true
          and coalesce(au.status, 'active') = 'active'
        union
        select distinct pmu.dealer_number
        from public.portal_module_usage pmu
        where nullif(pmu.dealer_number, '') is not null
      ) d
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(module_key order by module_key)
      from (
        select distinct module_key
        from public.portal_module_usage
        where nullif(module_key, '') is not null
      ) m
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_backend_portal_analytics_filter_options() from public, anon;
grant execute on function public.get_backend_portal_analytics_filter_options() to authenticated, service_role;
