-- Portal Analytics audience scopes.
-- Adds canonical partner-type metadata to the existing filter-options RPC so
-- the frontend can resolve one exact user set for both metrics and user lists.

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
        'dealer_number', dealer_number,
        'partner_type', partner_type,
        'dealer_customer_type', dealer_customer_type,
        'dealer_customer_type_label', dealer_customer_type_label,
        'dealer_type', dealer_type,
        'partner_account_type', partner_account_type
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
          au.dealer_number,
          au.partner_type::text as partner_type,
          da.customer_type::text as dealer_customer_type,
          da.customer_type_label::text as dealer_customer_type_label,
          da.dealer_type::text as dealer_type,
          case
            when lower(coalesce(da.customer_type_label::text, da.customer_type::text, da.dealer_type::text, '')) in ('forhandler', 'dealer') then 'dealer'
            when lower(coalesce(da.customer_type_label::text, da.customer_type::text, da.dealer_type::text, '')) in ('importør', 'importor', 'importoer', 'importer') then 'importer'
            when lower(coalesce(da.customer_type_label::text, da.customer_type::text, da.dealer_type::text, '')) in ('service partner', 'servicepartner', 'service_partner') then 'service_partner'
            when lower(coalesce(da.customer_type_label::text, da.customer_type::text, da.dealer_type::text, '')) in ('forhandlerkunde', 'dealer customer', 'dealer_customer') then 'dealer_customer'
            when coalesce(au.portal_role::text, au.role) in ('timan_dealer', 'dealer_user') then 'dealer'
            when coalesce(au.portal_role::text, au.role) = 'timan_importer' then 'importer'
            when coalesce(au.portal_role::text, au.role) = 'timan_service_partner' then 'service_partner'
            when coalesce(au.portal_role::text, au.role) = 'dealer_customer' then 'dealer_customer'
            else null
          end as partner_account_type
        from public.app_users au
        left join public.dealer_accounts da
          on nullif(au.dealer_number, '') is not null
          and da.account_number = au.dealer_number
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
