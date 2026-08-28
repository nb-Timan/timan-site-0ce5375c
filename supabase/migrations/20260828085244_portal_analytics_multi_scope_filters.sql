-- Add multi-select filtering for Backend -> Portal Analytics.
-- Keeps raw portal_module_usage rows server-side and returns aggregated data only.

create or replace function public.get_backend_user_activity_analytics_v2(
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
  v_now timestamptz := now();
  v_from timestamptz := v_now - (least(greatest(coalesce(p_days, 30), 7), 365)::text || ' days')::interval;
  v_week_start timestamptz := date_trunc('week', v_now);
  v_prev_week_start timestamptz := date_trunc('week', v_now) - interval '7 days';
  v_month_start timestamptz := date_trunc('month', v_now);
  v_prev_month_start timestamptz := date_trunc('month', v_now) - interval '1 month';
  v_last_year_start timestamptz := (v_now - (least(greatest(coalesce(p_days, 30), 7), 365)::text || ' days')::interval) - interval '1 year';
  v_last_year_end timestamptz := v_now - interval '1 year';
  v_has_audience_filter boolean := coalesce(array_length(p_user_keys, 1), 0) > 0
    or coalesce(array_length(p_roles, 1), 0) > 0
    or coalesce(array_length(p_dealer_numbers, 1), 0) > 0;
  v_has_module_filter boolean := coalesce(array_length(p_module_keys, 1), 0) > 0;
  v_result jsonb;
begin
  if not public.is_timan_backend() then
    raise exception 'Only Timan Backend can read portal usage analytics'
      using errcode = '42501';
  end if;

  with filtered_usage as (
    select
      pmu.*
    from public.portal_module_usage pmu
    where pmu.last_active_at >= v_from
      and pmu.last_active_at <= v_now
      and (
        not v_has_audience_filter
        or pmu.user_id::text = any(p_user_keys)
        or lower(pmu.email) = any(p_user_keys)
        or pmu.portal_role = any(p_roles)
        or pmu.dealer_number = any(p_dealer_numbers)
      )
      and (
        not v_has_module_filter
        or pmu.module_key = any(p_module_keys)
      )
  ),
  user_rollup as (
    select
      fu.user_id,
      lower(fu.email) as email,
      max(coalesce(au.display_name, au.full_name, trim(coalesce(au.first_name, '') || ' ' || coalesce(au.last_name, '')), au.initials, fu.email)) as display_name,
      max(coalesce(fu.portal_role, au.portal_role::text, au.role)) as portal_role,
      max(coalesce(fu.dealer_number, au.dealer_number)) as dealer_number,
      max(au.last_login) as last_login,
      max(fu.last_active_at) as last_active_at,
      count(distinct fu.session_id)::bigint as session_count,
      sum(fu.visit_count)::bigint as visit_count,
      sum(fu.active_seconds)::bigint as active_seconds,
      count(distinct (fu.last_active_at::date)) filter (where fu.last_active_at >= v_now - interval '7 days')::bigint as active_days_7,
      count(distinct (fu.last_active_at::date)) filter (where fu.last_active_at >= v_now - interval '30 days')::bigint as active_days_30,
      count(distinct (fu.last_active_at::date)) filter (where fu.last_active_at >= v_now - interval '90 days')::bigint as active_days_90
    from filtered_usage fu
    left join public.app_users au
      on au.id = fu.user_id
      or lower(au.email) = lower(fu.email)
    group by fu.user_id, lower(fu.email)
  ),
  module_rollup as (
    select
      fu.module_key,
      count(distinct fu.user_id)::bigint as user_count,
      count(distinct fu.session_id)::bigint as session_count,
      sum(fu.visit_count)::bigint as visit_count,
      sum(fu.active_seconds)::bigint as active_seconds,
      max(fu.last_active_at) as last_active_at
    from filtered_usage fu
    group by fu.module_key
  ),
  top_module_by_user as (
    select distinct on (fu.user_id, lower(fu.email))
      fu.user_id,
      lower(fu.email) as email,
      fu.module_key,
      sum(fu.visit_count)::bigint as visit_count,
      sum(fu.active_seconds)::bigint as active_seconds
    from filtered_usage fu
    group by fu.user_id, lower(fu.email), fu.module_key
    order by fu.user_id, lower(fu.email), sum(fu.visit_count) desc, sum(fu.active_seconds) desc, fu.module_key
  ),
  week_modules as (
    select
      fu.module_key,
      sum(fu.visit_count)::bigint as visit_count,
      sum(fu.active_seconds)::bigint as active_seconds
    from filtered_usage fu
    where fu.last_active_at >= v_week_start
    group by fu.module_key
  ),
  month_modules as (
    select
      fu.module_key,
      sum(fu.visit_count)::bigint as visit_count,
      sum(fu.active_seconds)::bigint as active_seconds
    from filtered_usage fu
    where fu.last_active_at >= v_now - interval '30 days'
    group by fu.module_key
  ),
  active_days as (
    select
      d::date as day,
      count(distinct fu.user_id)::bigint as active_users,
      count(distinct fu.session_id)::bigint as session_count,
      coalesce(sum(fu.visit_count), 0)::bigint as visit_count,
      coalesce(sum(fu.active_seconds), 0)::bigint as active_seconds
    from generate_series(v_from::date, v_now::date, interval '1 day') d
    left join filtered_usage fu on fu.last_active_at::date = d::date
    group by d::date
    order by d::date
  ),
  comparison_scope as (
    select *
    from public.portal_module_usage pmu
    where (
        not v_has_audience_filter
        or pmu.user_id::text = any(p_user_keys)
        or lower(pmu.email) = any(p_user_keys)
        or pmu.portal_role = any(p_roles)
        or pmu.dealer_number = any(p_dealer_numbers)
      )
      and (
        not v_has_module_filter
        or pmu.module_key = any(p_module_keys)
      )
  ),
  comparisons as (
    select
      coalesce(sum(visit_count) filter (where last_active_at >= v_week_start and last_active_at <= v_now), 0)::bigint as week_current_visits,
      coalesce(sum(visit_count) filter (where last_active_at >= v_prev_week_start and last_active_at < v_week_start), 0)::bigint as week_previous_visits,
      coalesce(sum(active_seconds) filter (where last_active_at >= v_week_start and last_active_at <= v_now), 0)::bigint as week_current_seconds,
      coalesce(sum(active_seconds) filter (where last_active_at >= v_prev_week_start and last_active_at < v_week_start), 0)::bigint as week_previous_seconds,
      coalesce(sum(visit_count) filter (where last_active_at >= v_month_start and last_active_at <= v_now), 0)::bigint as month_current_visits,
      coalesce(sum(visit_count) filter (where last_active_at >= v_prev_month_start and last_active_at < v_month_start), 0)::bigint as month_previous_visits,
      coalesce(sum(active_seconds) filter (where last_active_at >= v_month_start and last_active_at <= v_now), 0)::bigint as month_current_seconds,
      coalesce(sum(active_seconds) filter (where last_active_at >= v_prev_month_start and last_active_at < v_month_start), 0)::bigint as month_previous_seconds,
      coalesce(sum(visit_count) filter (where last_active_at >= v_from and last_active_at <= v_now), 0)::bigint as period_current_visits,
      coalesce(sum(visit_count) filter (where last_active_at >= v_last_year_start and last_active_at <= v_last_year_end), 0)::bigint as period_last_year_visits,
      coalesce(sum(active_seconds) filter (where last_active_at >= v_from and last_active_at <= v_now), 0)::bigint as period_current_seconds,
      coalesce(sum(active_seconds) filter (where last_active_at >= v_last_year_start and last_active_at <= v_last_year_end), 0)::bigint as period_last_year_seconds
    from comparison_scope
  )
  select jsonb_build_object(
    'generated_at', v_now,
    'period', jsonb_build_object('days', v_days, 'from', v_from, 'to', v_now),
    'totals', (
      select jsonb_build_object(
        'user_count', coalesce(count(distinct user_id), 0),
        'session_count', coalesce(count(distinct session_id), 0),
        'visit_count', coalesce(sum(visit_count), 0),
        'active_seconds', coalesce(sum(active_seconds), 0),
        'active_days_7', coalesce(count(distinct last_active_at::date) filter (where last_active_at >= v_now - interval '7 days'), 0),
        'active_days_30', coalesce(count(distinct last_active_at::date) filter (where last_active_at >= v_now - interval '30 days'), 0),
        'active_days_90', coalesce(count(distinct last_active_at::date) filter (where last_active_at >= v_now - interval '90 days'), 0),
        'last_active_at', max(last_active_at)
      )
      from filtered_usage
    ),
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', ur.user_id,
          'email', ur.email,
          'display_name', nullif(trim(ur.display_name), ''),
          'portal_role', ur.portal_role,
          'dealer_number', ur.dealer_number,
          'last_login', ur.last_login,
          'last_active_at', ur.last_active_at,
          'session_count', ur.session_count,
          'visit_count', ur.visit_count,
          'active_seconds', ur.active_seconds,
          'active_days_7', ur.active_days_7,
          'active_days_30', ur.active_days_30,
          'active_days_90', ur.active_days_90,
          'top_module', tm.module_key,
          'top_module_visits', tm.visit_count
        )
        order by ur.last_active_at desc nulls last
      )
      from user_rollup ur
      left join top_module_by_user tm on tm.user_id is not distinct from ur.user_id and tm.email = ur.email
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'module_key', mr.module_key,
          'user_count', mr.user_count,
          'session_count', mr.session_count,
          'visit_count', mr.visit_count,
          'active_seconds', mr.active_seconds,
          'last_active_at', mr.last_active_at
        )
        order by mr.visit_count desc, mr.active_seconds desc, mr.module_key
      )
      from module_rollup mr
    ), '[]'::jsonb),
    'module_usage_this_week', coalesce((
      select jsonb_agg(jsonb_build_object('module_key', module_key, 'visit_count', visit_count, 'active_seconds', active_seconds) order by visit_count desc, active_seconds desc, module_key)
      from week_modules
    ), '[]'::jsonb),
    'module_usage_last_30_days', coalesce((
      select jsonb_agg(jsonb_build_object('module_key', module_key, 'visit_count', visit_count, 'active_seconds', active_seconds) order by visit_count desc, active_seconds desc, module_key)
      from month_modules
    ), '[]'::jsonb),
    'active_days_over_time', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'active_users', active_users, 'session_count', session_count, 'visit_count', visit_count, 'active_seconds', active_seconds) order by day)
      from active_days
    ), '[]'::jsonb),
    'comparisons', (
      select jsonb_build_object(
        'week', jsonb_build_object('current_visits', week_current_visits, 'previous_visits', week_previous_visits, 'current_seconds', week_current_seconds, 'previous_seconds', week_previous_seconds),
        'month', jsonb_build_object('current_visits', month_current_visits, 'previous_visits', month_previous_visits, 'current_seconds', month_current_seconds, 'previous_seconds', month_previous_seconds),
        'same_period_last_year', jsonb_build_object('current_visits', period_current_visits, 'previous_visits', period_last_year_visits, 'current_seconds', period_current_seconds, 'previous_seconds', period_last_year_seconds)
      )
      from comparisons
    ),
    'filters', jsonb_build_object(
      'users', coalesce((
        select jsonb_agg(jsonb_build_object(
          'user_id', user_id,
          'email', email,
          'display_name', display_name,
          'portal_role', portal_role,
          'dealer_number', dealer_number
        ) order by display_name, email)
        from (
          select distinct on (coalesce(au.id, pmu.user_id), lower(coalesce(au.email, pmu.email)))
            coalesce(au.id, pmu.user_id) as user_id,
            lower(coalesce(au.email, pmu.email)) as email,
            coalesce(nullif(au.display_name, ''), nullif(au.full_name, ''), au.initials, pmu.email) as display_name,
            coalesce(au.portal_role::text, pmu.portal_role, au.role) as portal_role,
            coalesce(au.dealer_number, pmu.dealer_number) as dealer_number
          from public.portal_module_usage pmu
          left join public.app_users au on au.id = pmu.user_id or lower(au.email) = lower(pmu.email)
          where pmu.last_active_at >= v_now - interval '365 days'
        ) u
      ), '[]'::jsonb),
      'roles', coalesce((
        select jsonb_agg(role order by role)
        from (
          select distinct coalesce(au.portal_role::text, pmu.portal_role, au.role) as role
          from public.portal_module_usage pmu
          left join public.app_users au on au.id = pmu.user_id or lower(au.email) = lower(pmu.email)
          where coalesce(au.portal_role::text, pmu.portal_role, au.role) is not null
        ) r
      ), '[]'::jsonb),
      'dealer_numbers', coalesce((
        select jsonb_agg(dealer_number order by dealer_number)
        from (
          select distinct coalesce(au.dealer_number, pmu.dealer_number) as dealer_number
          from public.portal_module_usage pmu
          left join public.app_users au on au.id = pmu.user_id or lower(au.email) = lower(pmu.email)
          where nullif(coalesce(au.dealer_number, pmu.dealer_number), '') is not null
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
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_backend_user_activity_analytics_v2(text[], text[], text[], text[], integer) from public, anon;
grant execute on function public.get_backend_user_activity_analytics_v2(text[], text[], text[], text[], integer) to authenticated, service_role;
