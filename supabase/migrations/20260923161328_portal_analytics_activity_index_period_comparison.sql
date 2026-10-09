-- Extend the canonical Portal Analytics response with an equivalent preceding
-- period and per-user metrics for the transparent activity index. The v2 RPC
-- remains the source for all existing analytics payload fields.

create or replace function public.get_backend_user_activity_analytics_v3(
  p_user_keys text[] default null,
  p_roles text[] default null,
  p_dealer_numbers text[] default null,
  p_module_keys text[] default null,
  p_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_timezone text := 'Europe/Copenhagen';
  v_now timestamptz := now();
  v_current_from timestamptz;
  v_previous_from timestamptz;
  v_has_audience_filter boolean := coalesce(array_length(p_user_keys, 1), 0) > 0
    or coalesce(array_length(p_roles, 1), 0) > 0
    or coalesce(array_length(p_dealer_numbers, 1), 0) > 0;
  v_has_module_filter boolean := coalesce(array_length(p_module_keys, 1), 0) > 0;
  v_base jsonb;
  v_supplement jsonb;
begin
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can read portal usage analytics'
      using errcode = '42501';
  end if;

  v_current_from := v_now - make_interval(days => v_days);
  v_previous_from := v_current_from - make_interval(days => v_days);

  v_base := public.get_backend_user_activity_analytics_v2(
    p_user_keys,
    p_roles,
    p_dealer_numbers,
    p_module_keys,
    v_days
  );

  with usage_identity as (
    select
      pmu.*,
      coalesce(pmu.user_id, au.id) as canonical_user_id,
      lower(coalesce(nullif(au.email, ''), nullif(pmu.email, ''))) as canonical_email,
      coalesce(pmu.portal_role, au.portal_role::text, au.role) as canonical_portal_role,
      coalesce(pmu.dealer_number, au.dealer_number) as canonical_dealer_number,
      coalesce(
        nullif(au.display_name, ''),
        nullif(au.full_name, ''),
        nullif(trim(coalesce(au.first_name, '') || ' ' || coalesce(au.last_name, '')), ''),
        nullif(au.initials, ''),
        pmu.email
      ) as canonical_display_name
    from public.portal_module_usage pmu
    left join public.app_users au
      on au.id = pmu.user_id
      or au.auth_user_id = pmu.auth_user_id
      or lower(au.email) = lower(pmu.email)
  ),
  scoped_usage as (
    select *
    from usage_identity ui
    where ui.last_active_at >= v_previous_from
      and ui.last_active_at <= v_now
      and (
        not v_has_audience_filter
        or ui.canonical_user_id::text = any(p_user_keys)
        or ui.canonical_email = any(p_user_keys)
        or ui.canonical_portal_role = any(p_roles)
        or ui.canonical_dealer_number = any(p_dealer_numbers)
      )
      and (
        not v_has_module_filter
        or ui.module_key = any(p_module_keys)
      )
  ),
  user_metrics as (
    select
      coalesce(su.canonical_user_id::text, su.canonical_email) as user_key,
      max(su.canonical_user_id::text)::uuid as user_id,
      max(su.canonical_email) as email,
      max(su.canonical_display_name) as display_name,
      max(su.canonical_portal_role) as portal_role,
      max(su.canonical_dealer_number) as dealer_number,
      count(distinct ((su.last_active_at at time zone v_timezone)::date))
        filter (where su.last_active_at >= v_current_from)::bigint as current_active_days,
      coalesce(sum(su.active_seconds)
        filter (where su.last_active_at >= v_current_from), 0)::bigint as current_active_seconds,
      count(distinct su.session_id)
        filter (where su.last_active_at >= v_current_from)::bigint as current_sessions,
      coalesce(sum(su.visit_count)
        filter (where su.last_active_at >= v_current_from), 0)::bigint as current_visits,
      count(distinct ((su.last_active_at at time zone v_timezone)::date))
        filter (where su.last_active_at >= v_previous_from and su.last_active_at < v_current_from)::bigint as previous_active_days,
      coalesce(sum(su.active_seconds)
        filter (where su.last_active_at >= v_previous_from and su.last_active_at < v_current_from), 0)::bigint as previous_active_seconds,
      count(distinct su.session_id)
        filter (where su.last_active_at >= v_previous_from and su.last_active_at < v_current_from)::bigint as previous_sessions,
      coalesce(sum(su.visit_count)
        filter (where su.last_active_at >= v_previous_from and su.last_active_at < v_current_from), 0)::bigint as previous_visits
    from scoped_usage su
    group by coalesce(su.canonical_user_id::text, su.canonical_email)
  ),
  period_comparison as (
    select
      coalesce(sum(su.visit_count) filter (where su.last_active_at >= v_current_from), 0)::bigint as current_visits,
      coalesce(sum(su.visit_count) filter (where su.last_active_at < v_current_from), 0)::bigint as previous_visits,
      coalesce(sum(su.active_seconds) filter (where su.last_active_at >= v_current_from), 0)::bigint as current_seconds,
      coalesce(sum(su.active_seconds) filter (where su.last_active_at < v_current_from), 0)::bigint as previous_seconds,
      count(distinct su.session_id) filter (where su.last_active_at >= v_current_from)::bigint as current_sessions,
      count(distinct su.session_id) filter (where su.last_active_at < v_current_from)::bigint as previous_sessions,
      count(distinct coalesce(su.canonical_user_id::text, su.canonical_email))
        filter (where su.last_active_at >= v_current_from)::bigint as current_users,
      count(distinct coalesce(su.canonical_user_id::text, su.canonical_email))
        filter (where su.last_active_at < v_current_from)::bigint as previous_users,
      count(distinct ((su.last_active_at at time zone v_timezone)::date))
        filter (where su.last_active_at >= v_current_from)::bigint as current_active_days,
      count(distinct ((su.last_active_at at time zone v_timezone)::date))
        filter (where su.last_active_at < v_current_from)::bigint as previous_active_days,
      count(*) filter (where su.last_active_at < v_current_from) > 0 as has_previous_data
    from scoped_usage su
  )
  select jsonb_build_object(
    'activity_users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_key', um.user_key,
          'user_id', um.user_id,
          'email', um.email,
          'display_name', um.display_name,
          'portal_role', um.portal_role,
          'dealer_number', um.dealer_number,
          'current_active_days', um.current_active_days,
          'current_active_seconds', um.current_active_seconds,
          'current_sessions', um.current_sessions,
          'current_visits', um.current_visits,
          'previous_active_days', um.previous_active_days,
          'previous_active_seconds', um.previous_active_seconds,
          'previous_sessions', um.previous_sessions,
          'previous_visits', um.previous_visits
        )
        order by lower(coalesce(um.display_name, um.email, um.user_key))
      ) from user_metrics um
    ), '[]'::jsonb),
    'selected_period_comparison', (
      select jsonb_build_object(
        'days', v_days,
        'current_from', v_current_from,
        'current_to', v_now,
        'previous_from', v_previous_from,
        'previous_to', v_current_from,
        'current_visits', pc.current_visits,
        'previous_visits', pc.previous_visits,
        'current_seconds', pc.current_seconds,
        'previous_seconds', pc.previous_seconds,
        'current_sessions', pc.current_sessions,
        'previous_sessions', pc.previous_sessions,
        'current_users', pc.current_users,
        'previous_users', pc.previous_users,
        'current_active_days', pc.current_active_days,
        'previous_active_days', pc.previous_active_days,
        'has_previous_data', pc.has_previous_data
      ) from period_comparison pc
    )
  ) into v_supplement;

  return v_base || v_supplement;
end;
$$;

revoke all on function public.get_backend_user_activity_analytics_v3(text[], text[], text[], text[], integer) from public, anon;
grant execute on function public.get_backend_user_activity_analytics_v3(text[], text[], text[], text[], integer) to authenticated, service_role;
