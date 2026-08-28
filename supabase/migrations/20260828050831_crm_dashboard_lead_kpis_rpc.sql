create or replace function public.crm_dashboard_lead_kpis(
  p_seller_user_id uuid default null,
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
    (date_trunc('month', p_now at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') as month_start,
    (
      (
        date_trunc('month', (p_now at time zone 'Europe/Copenhagen') - interval '1 month')
        + make_interval(
          days => least(
            extract(day from p_now at time zone 'Europe/Copenhagen')::int - 1,
            extract(day from (
              date_trunc('month', p_now at time zone 'Europe/Copenhagen') - interval '1 day'
            ))::int - 1
          ),
          hours => extract(hour from p_now at time zone 'Europe/Copenhagen')::int,
          mins => extract(minute from p_now at time zone 'Europe/Copenhagen')::int
        )
      ) at time zone 'Europe/Copenhagen'
    ) as prev_window_to,
    (date_trunc('month', (p_now at time zone 'Europe/Copenhagen') - interval '1 month') at time zone 'Europe/Copenhagen') as prev_window_from
),
lead_rows as (
  select
    l.id,
    l.lead_no,
    l.title,
    l.owner_name,
    l.pipeline_value_snapshot,
    l.created_at,
    l.updated_at,
    coalesce(l.first_contact_date::timestamptz, l.created_at) as metric_date,
    case coalesce(
      nullif(trim(l.next_activity), ''),
      case l.pipeline_stage
        when 'Lead' then 'Wants to be contacted'
        when 'Qualified' then 'Follow-up on leads'
        when 'Offer sent' then 'Offer sent to the customer'
        when 'Negotiation' then 'Follow-up on leads'
        when 'Won' then 'Closed with order'
        when 'Lost' then 'Closed without order'
        else null
      end
    )
      when 'Customer requests a demonstration' then 'Demo planlagt'
      when 'Offer sent to the customer' then 'Tilbud sendt'
      when 'Closed with order' then 'Vundet'
      when 'Closed without order' then 'Tabt'
      when 'Not relevant' then 'Tabt'
      when 'Follow-up on leads' then 'Follow-up'
      else 'Lead'
    end as display_status
  from public.crm_leads l
  where p_seller_user_id is null or l.owner_user_id = p_seller_user_id
),
lead_bucket_rows as (
  select
    *,
    case
      when display_status = 'Vundet' then 'won'
      when display_status = 'Tabt' then 'lost'
      when display_status = 'Tilbud sendt' then 'quote_lead'
      when display_status = 'Demo planlagt' then 'demo'
      else 'lead'
    end as bucket
  from lead_rows
),
lead_counts as (
  select
    count(*) filter (where bucket = 'lead')::int as lead_count,
    count(*) filter (where bucket = 'demo')::int as demo_lead_count,
    count(*) filter (where bucket = 'quote_lead')::int as offer_lead_count,
    count(*) filter (where bucket = 'won')::int as won_lead_count,
    count(*) filter (where bucket = 'lost')::int as lost_lead_count,
    coalesce(sum(pipeline_value_snapshot) filter (where bucket = 'lead'), 0)::numeric as lead_pipeline_value,
    coalesce(sum(pipeline_value_snapshot) filter (where bucket = 'demo'), 0)::numeric as demo_pipeline_value
  from lead_bucket_rows
),
active_timing as (
  select metric_date
  from lead_bucket_rows
  where bucket in ('lead', 'demo')
),
timing_counts as (
  select
    count(*) filter (where metric_date >= (select month_start from bounds))::int as active_this_month,
    count(*) filter (
      where metric_date >= (select prev_window_from from bounds)
        and metric_date <= (select prev_window_to from bounds)
    )::int as active_prev_window
  from active_timing
),
stage_rows as (
  select
    bucket,
    jsonb_build_object(
      'id', id,
      'type', case when bucket = 'lost' then 'Tabt' when bucket = 'demo' then 'Demo' else 'Lead' end,
      'number', case when lead_no is null then '—' when lead_no >= 5000 then 'G-' || lead_no::text else 'L-' || lead_no::text end,
      'title', coalesce(nullif(title, ''), '—'),
      'dealer', '—',
      'seller', coalesce(nullif(owner_name, ''), '—'),
      'value', coalesce(pipeline_value_snapshot, 0),
      'status', display_status,
      'date', coalesce(updated_at, created_at),
      'metricDate', metric_date,
      'href', '/portal/crm/leads/' || id::text
    ) as row_json,
    coalesce(updated_at, created_at) as sort_date
  from lead_bucket_rows
  where bucket in ('lead', 'demo', 'won', 'lost')
)
select jsonb_build_object(
  'active_leads', (lc.lead_count + lc.demo_lead_count),
  'lead_count', lc.lead_count,
  'demo_lead_count', lc.demo_lead_count,
  'calendar_demo_count', 0,
  'offer_lead_count', lc.offer_lead_count,
  'won_lead_count', lc.won_lead_count,
  'lost_lead_count', lc.lost_lead_count,
  'lead_pipeline_value', lc.lead_pipeline_value,
  'demo_pipeline_value', lc.demo_pipeline_value,
  'active_this_month', tc.active_this_month,
  'active_prev_window', tc.active_prev_window,
  'leads_pct_change', case
    when tc.active_prev_window = 0 then case when tc.active_this_month > 0 then 100 else 0 end
    else round(((tc.active_this_month - tc.active_prev_window)::numeric / tc.active_prev_window::numeric) * 100)::int
  end,
  'activities_this_week', 0,
  'activities_this_month', 0,
  'raw_records_scanned', jsonb_build_object(
    'crm_leads', (select count(*) from lead_rows),
    'crm_calendar_activities', 0
  ),
  'status_counts', jsonb_build_object(
    'Lead', (select count(*) from lead_bucket_rows where display_status = 'Lead'),
    'Demo planlagt', (select count(*) from lead_bucket_rows where display_status = 'Demo planlagt'),
    'Tilbud sendt', (select count(*) from lead_bucket_rows where display_status = 'Tilbud sendt'),
    'Follow-up', (select count(*) from lead_bucket_rows where display_status = 'Follow-up'),
    'Vundet', (select count(*) from lead_bucket_rows where display_status = 'Vundet'),
    'Tabt', (select count(*) from lead_bucket_rows where display_status = 'Tabt')
  ),
  'stage_rows', jsonb_build_object(
    'lead', coalesce((select jsonb_agg(row_json order by sort_date desc) from stage_rows where bucket = 'lead'), '[]'::jsonb),
    'demo', coalesce((select jsonb_agg(row_json order by sort_date desc) from stage_rows where bucket = 'demo'), '[]'::jsonb),
    'won', coalesce((select jsonb_agg(row_json order by sort_date desc) from stage_rows where bucket = 'won'), '[]'::jsonb),
    'lost', coalesce((select jsonb_agg(row_json order by sort_date desc) from stage_rows where bucket = 'lost'), '[]'::jsonb)
  )
)
from lead_counts lc
cross join timing_counts tc;
$$;

revoke all on function public.crm_dashboard_lead_kpis(uuid, text, timestamptz) from public;
grant execute on function public.crm_dashboard_lead_kpis(uuid, text, timestamptz) to authenticated;
