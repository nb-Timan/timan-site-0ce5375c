create table if not exists public.crm_calendar_activities (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  start_datetime timestamptz not null,
  end_datetime timestamptz,
  account_id uuid,
  dealer_name text,
  dealer_account_number text,
  dealer_assigned_seller_initials text,
  dealer_assigned_seller_email text,
  seller_user_id uuid,
  seller_initials text,
  seller_name text,
  participant_seller_initials text[] not null default '{}',
  activity_type text not null default 'andet',
  note text,
  status text not null default 'planned',
  outlook_event_id text,
  outlook_sync_status text,
  outlook_last_synced_at timestamptz,
  created_by_user_id uuid,
  created_by_email text,
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_calendar_activities add column if not exists end_datetime timestamptz;
alter table public.crm_calendar_activities add column if not exists account_id uuid;
alter table public.crm_calendar_activities add column if not exists dealer_name text;
alter table public.crm_calendar_activities add column if not exists dealer_account_number text;
alter table public.crm_calendar_activities add column if not exists dealer_assigned_seller_initials text;
alter table public.crm_calendar_activities add column if not exists dealer_assigned_seller_email text;
alter table public.crm_calendar_activities add column if not exists seller_user_id uuid;
alter table public.crm_calendar_activities add column if not exists seller_initials text;
alter table public.crm_calendar_activities add column if not exists seller_name text;
alter table public.crm_calendar_activities add column if not exists participant_seller_initials text[] not null default '{}';
alter table public.crm_calendar_activities add column if not exists activity_type text not null default 'andet';
alter table public.crm_calendar_activities add column if not exists note text;
alter table public.crm_calendar_activities add column if not exists status text not null default 'planned';
alter table public.crm_calendar_activities add column if not exists outlook_event_id text;
alter table public.crm_calendar_activities add column if not exists outlook_sync_status text;
alter table public.crm_calendar_activities add column if not exists outlook_last_synced_at timestamptz;
alter table public.crm_calendar_activities add column if not exists created_by_user_id uuid;
alter table public.crm_calendar_activities add column if not exists created_by_email text;
alter table public.crm_calendar_activities add column if not exists updated_by_user_id uuid;
alter table public.crm_calendar_activities add column if not exists created_at timestamptz not null default now();
alter table public.crm_calendar_activities add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_crm_cal_start
  on public.crm_calendar_activities (start_datetime);
create index if not exists idx_crm_cal_seller_user
  on public.crm_calendar_activities (seller_user_id);
create index if not exists idx_crm_cal_seller_initials
  on public.crm_calendar_activities (seller_initials);
create index if not exists idx_crm_cal_account
  on public.crm_calendar_activities (account_id);
create index if not exists idx_crm_cal_participants
  on public.crm_calendar_activities using gin (participant_seller_initials);
create index if not exists idx_crm_cal_status_start
  on public.crm_calendar_activities (status, start_datetime);

alter table public.crm_calendar_activities enable row level security;

revoke all on public.crm_calendar_activities from anon, public;
grant select, insert, update, delete on public.crm_calendar_activities to authenticated;
grant all on public.crm_calendar_activities to service_role;

drop policy if exists crm_calendar_activities_select_access on public.crm_calendar_activities;
create policy crm_calendar_activities_select_access
  on public.crm_calendar_activities
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where (
        au.auth_user_id = (select auth.uid())
        or lower(au.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
      )
      and coalesce(au.approved, false) = true
      and coalesce(au.is_active, false) = true
      and (
        au.portal_role::text = 'timan_backend'
        or crm_calendar_activities.seller_user_id = au.id
        or crm_calendar_activities.created_by_user_id = au.id
        or lower(coalesce(crm_calendar_activities.created_by_email, '')) = lower(au.email)
        or (
          nullif(trim(coalesce(au.initials, '')), '') is not null
          and (
            upper(crm_calendar_activities.seller_initials) = upper(au.initials)
            or crm_calendar_activities.participant_seller_initials @> array[upper(au.initials)]
          )
        )
      )
    )
  );

drop policy if exists crm_calendar_activities_insert_own on public.crm_calendar_activities;
create policy crm_calendar_activities_insert_own
  on public.crm_calendar_activities
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_users au
      where (
        au.auth_user_id = (select auth.uid())
        or lower(au.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
      )
      and coalesce(au.approved, false) = true
      and coalesce(au.is_active, false) = true
      and (
        au.portal_role::text = 'timan_backend'
        or crm_calendar_activities.seller_user_id = au.id
        or crm_calendar_activities.created_by_user_id = au.id
        or lower(coalesce(crm_calendar_activities.created_by_email, '')) = lower(au.email)
      )
    )
  );

drop policy if exists crm_calendar_activities_update_access on public.crm_calendar_activities;
create policy crm_calendar_activities_update_access
  on public.crm_calendar_activities
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where (
        au.auth_user_id = (select auth.uid())
        or lower(au.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
      )
      and coalesce(au.approved, false) = true
      and coalesce(au.is_active, false) = true
      and (
        au.portal_role::text = 'timan_backend'
        or crm_calendar_activities.seller_user_id = au.id
        or crm_calendar_activities.created_by_user_id = au.id
      )
    )
  )
  with check (
    exists (
      select 1
      from public.app_users au
      where (
        au.auth_user_id = (select auth.uid())
        or lower(au.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
      )
      and coalesce(au.approved, false) = true
      and coalesce(au.is_active, false) = true
      and (
        au.portal_role::text = 'timan_backend'
        or crm_calendar_activities.seller_user_id = au.id
        or crm_calendar_activities.created_by_user_id = au.id
      )
    )
  );

drop policy if exists crm_calendar_activities_delete_access on public.crm_calendar_activities;
create policy crm_calendar_activities_delete_access
  on public.crm_calendar_activities
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_users au
      where (
        au.auth_user_id = (select auth.uid())
        or lower(au.email) = lower(coalesce(((select auth.jwt()) ->> 'email'), ''))
      )
      and coalesce(au.approved, false) = true
      and coalesce(au.is_active, false) = true
      and (
        au.portal_role::text = 'timan_backend'
        or crm_calendar_activities.seller_user_id = au.id
        or crm_calendar_activities.created_by_user_id = au.id
      )
    )
  );

create or replace function public.crm_dashboard_calendar_activity_kpis(
  p_seller_initials text default null,
  p_now timestamptz default now()
)
returns jsonb
language sql
stable
set search_path = public
as $$
with bounds as (
  select
    p_now as now_at,
    (
      date_trunc('day', p_now at time zone 'Europe/Copenhagen')
      - ((((extract(dow from p_now at time zone 'Europe/Copenhagen')::int + 6) % 7)) * interval '1 day')
    ) at time zone 'Europe/Copenhagen' as week_start,
    (
      date_trunc('day', p_now at time zone 'Europe/Copenhagen')
      - ((((extract(dow from p_now at time zone 'Europe/Copenhagen')::int + 6) % 7)) * interval '1 day')
      + interval '7 days'
    ) at time zone 'Europe/Copenhagen' as week_end,
    (date_trunc('month', p_now at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') as month_start,
    ((date_trunc('month', p_now at time zone 'Europe/Copenhagen') + interval '1 month') at time zone 'Europe/Copenhagen') as month_end
),
seller_filter as (
  select case
    when upper(nullif(trim(p_seller_initials), '')) in ('AKR', 'AK') then 'AK'
    else upper(nullif(trim(p_seller_initials), ''))
  end as seller_initials
),
activity_rows as (
  select
    a.id,
    a.title,
    a.start_datetime,
    a.end_datetime,
    a.account_id,
    a.dealer_name,
    a.dealer_account_number,
    a.dealer_assigned_seller_initials,
    a.dealer_assigned_seller_email,
    a.seller_user_id,
    a.seller_initials,
    a.seller_name,
    a.participant_seller_initials,
    a.activity_type,
    a.note,
    a.status,
    a.outlook_event_id,
    a.outlook_sync_status,
    a.outlook_last_synced_at,
    a.created_by_user_id,
    a.created_by_email,
    a.updated_by_user_id,
    a.created_at,
    a.updated_at
  from public.crm_calendar_activities a
  cross join seller_filter sf
  where sf.seller_initials is null
    or (
      case
        when upper(nullif(trim(a.seller_initials), '')) in ('AKR', 'AK') then 'AK'
        else upper(nullif(trim(a.seller_initials), ''))
      end
    ) = sf.seller_initials
    or a.participant_seller_initials @> array[p_seller_initials]
    or (
      sf.seller_initials = 'AK'
      and (a.participant_seller_initials @> array['AK'] or a.participant_seller_initials @> array['AKR'])
    )
),
stats as (
  select
    count(*) filter (
      where coalesce(status, '') <> 'canceled'
        and start_datetime >= (select week_start from bounds)
        and start_datetime < (select week_end from bounds)
    )::int as activities_this_week,
    count(*) filter (
      where activity_type = 'demo'
        and coalesce(status, '') <> 'canceled'
        and start_datetime >= (select month_start from bounds)
        and start_datetime < (select month_end from bounds)
    )::int as demos_this_month,
    count(*) filter (
      where status = 'planned'
        and start_datetime < (select now_at from bounds)
    )::int as overdue_count
  from activity_rows
),
future_sellers as (
  select distinct initials
  from (
    select upper(nullif(trim(seller_initials), '')) as initials
    from activity_rows
    where coalesce(status, '') <> 'canceled'
      and start_datetime >= (select now_at from bounds)
    union all
    select upper(nullif(trim(unnest(participant_seller_initials)), '')) as initials
    from activity_rows
    where coalesce(status, '') <> 'canceled'
      and start_datetime >= (select now_at from bounds)
  ) sellers
  where initials is not null
),
no_plan as (
  select coalesce(jsonb_agg(s.initials order by s.initials), '[]'::jsonb) as initials
  from (values ('BP'), ('EM'), ('JTN'), ('AKR')) as s(initials)
  where not exists (
    select 1
    from future_sellers fs
    where fs.initials = s.initials
      or (s.initials = 'AKR' and fs.initials = 'AK')
  )
),
upcoming as (
  select coalesce(jsonb_agg(to_jsonb(u) order by u.start_datetime asc), '[]'::jsonb) as rows
  from (
    select *
    from activity_rows
    where coalesce(status, '') <> 'canceled'
      and start_datetime >= (select now_at from bounds)
    order by start_datetime asc
    limit 8
  ) u
)
select jsonb_build_object(
  'activities_this_week', stats.activities_this_week,
  'demos_this_month', stats.demos_this_month,
  'overdue_count', stats.overdue_count,
  'no_plan_initials', no_plan.initials,
  'upcoming_rows', upcoming.rows,
  'raw_records_scanned', jsonb_build_object(
    'crm_calendar_activities', (select count(*) from activity_rows)
  )
)
from stats
cross join no_plan
cross join upcoming;
$$;

revoke all on function public.crm_dashboard_calendar_activity_kpis(text, timestamptz) from public, anon;
grant execute on function public.crm_dashboard_calendar_activity_kpis(text, timestamptz) to authenticated;
