create or replace function public.crm_dashboard_sales_outcome_kpis(
  p_seller_user_id uuid default null,
  p_seller_initials text default null,
  p_seller_email text default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
with seller_filter as (
  select
    p_seller_user_id as seller_user_id,
    case
      when upper(nullif(trim(p_seller_initials), '')) in ('AKR', 'AK') then 'AK'
      else upper(nullif(trim(p_seller_initials), ''))
    end as seller_initials,
    lower(nullif(trim(p_seller_email), '')) as seller_email
),
configuration_rows as (
  select
    c.id,
    c.created_at,
    c.last_saved_at,
    c.case_status,
    c.status,
    c.case_type,
    c.document_type,
    c.seller_initials,
    c.seller_email,
    c.assigned_seller_id,
    c.created_by_user_id,
    c.order_sent_at,
    c.submitted_at
  from public.configurations c
  cross join seller_filter sf
  where coalesce(c.case_status, 'aktiv') <> 'deleted'
    and (
      sf.seller_user_id is null and sf.seller_initials is null and sf.seller_email is null
      or c.assigned_seller_id = sf.seller_user_id
      or c.created_by_user_id = sf.seller_user_id
      or (
        sf.seller_email is not null
        and c.seller_email is not null
        and lower(c.seller_email) = sf.seller_email
      )
      or (
        sf.seller_initials is not null
        and (
          case
            when upper(nullif(trim(c.seller_initials), '')) in ('AKR', 'AK') then 'AK'
            else upper(nullif(trim(c.seller_initials), ''))
          end
        ) = sf.seller_initials
      )
    )
),
order_rows as (
  select
    r.id,
    coalesce(r.order_sent_at, r.submitted_at, r.last_saved_at, r.created_at) as closed_at
  from configuration_rows r
  where (r.document_type = 'order' or r.case_type = 'order' or r.case_status = 'ordre_afgivet')
    and (
      r.order_sent_at is not null
      or r.submitted_at is not null
      or lower(coalesce(r.case_status, '')) = 'ordre_afgivet'
      or lower(coalesce(r.status, '')) = 'ordre_afgivet'
    )
),
activity_rows as (
  select
    a.id,
    a.activity_type,
    a.activity_date,
    a.status,
    a.configuration_id,
    a.meta
  from public.crm_activities a
  cross join seller_filter sf
  where (
    sf.seller_user_id is null and sf.seller_initials is null and sf.seller_email is null
    or a.assigned_owner_user_id = sf.seller_user_id
    or a.created_by_user_id = sf.seller_user_id
    or (
      sf.seller_user_id is not null
      and coalesce(a.meta ->> 'seller_user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (a.meta ->> 'seller_user_id')::uuid = sf.seller_user_id
    )
    or (
      sf.seller_email is not null
      and lower(coalesce(a.meta ->> 'seller_email', a.meta ->> 'created_by_email', '')) = sf.seller_email
    )
    or (
      sf.seller_initials is not null
      and (
        case
          when upper(nullif(trim(coalesce(a.meta ->> 'seller_initials', a.assigned_owner_name)), '')) in ('AKR', 'AK') then 'AK'
          else upper(nullif(trim(coalesce(a.meta ->> 'seller_initials', a.assigned_owner_name)), ''))
        end
      ) = sf.seller_initials
    )
  )
),
lost_rows as (
  select *
  from activity_rows
  where activity_type = 'lead_rejected'
    or (activity_type = 'order_sent' and lower(coalesce(status, '')) = 'lost')
),
quote_dates as (
  select configuration_id, min(activity_date) as quote_date
  from activity_rows
  where activity_type = 'quote_created'
    and configuration_id is not null
  group by configuration_id
),
sales_cycles as (
  select
    extract(epoch from (o.closed_at - q.quote_date)) / 86400 as days
  from order_rows o
  join quote_dates q on q.configuration_id = o.id
  where o.closed_at >= q.quote_date
    and o.closed_at < q.quote_date + interval '365 days'
),
totals as (
  select
    (select count(*) from order_rows)::int as won_orders_count,
    (select count(*) from lost_rows)::int as lost_count,
    (select count(*) from sales_cycles)::int as sales_cycles_count,
    coalesce(round(avg(days))::int, 0) as avg_sales_days
  from sales_cycles
)
select jsonb_build_object(
  'won_orders_count', totals.won_orders_count,
  'lost_count', totals.lost_count,
  'win_rate', case
    when totals.won_orders_count + totals.lost_count = 0 then 0
    else round((totals.won_orders_count::numeric / (totals.won_orders_count + totals.lost_count)::numeric) * 100)::int
  end,
  'avg_sales_days', totals.avg_sales_days,
  'sales_cycles_count', totals.sales_cycles_count,
  'raw_records_scanned', jsonb_build_object(
    'configurations', (select count(*) from configuration_rows),
    'orders', (select count(*) from order_rows),
    'crm_activities', (select count(*) from activity_rows),
    'lost_activities', (select count(*) from lost_rows),
    'quote_created_activities', (select count(*) from quote_dates)
  )
)
from totals;
$$;

revoke all on function public.crm_dashboard_sales_outcome_kpis(uuid, text, text) from public;
grant execute on function public.crm_dashboard_sales_outcome_kpis(uuid, text, text) to authenticated;
