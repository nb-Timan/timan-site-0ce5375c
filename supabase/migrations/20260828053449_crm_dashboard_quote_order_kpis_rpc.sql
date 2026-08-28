create or replace function public.crm_dashboard_quote_order_kpis(
  p_seller_user_id uuid default null,
  p_seller_initials text default null,
  p_seller_email text default null,
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
seller_filter as (
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
    c.quote_number,
    c.order_number,
    c.title,
    c.total_price,
    c.state_json,
    c.seller_initials,
    c.seller_email,
    c.seller_name,
    c.assigned_seller_id,
    c.dealer_number,
    c.dealer_name,
    c.dealer_account_id,
    c.created_by_user_id,
    c.quote_sent_at,
    c.order_sent_at,
    c.submitted_at,
    da.company_name as dealer_company_name,
    da.account_number as dealer_account_number,
    da.country as dealer_country
  from public.configurations c
  left join public.dealer_accounts da
    on da.id = c.dealer_account_id
     or (c.dealer_account_id is null and da.account_number = c.dealer_number)
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
enriched as (
  select
    r.*,
    case
      when r.document_type = 'order' or r.case_type = 'order' or r.case_status = 'ordre_afgivet' then 'order'
      else 'quote'
    end as effective_document_type,
    case
      when coalesce(r.state_json ->> 'language', 'da') = 'da' then 'DKK'
      else 'EUR'
    end as currency,
    coalesce(r.total_price, 0)::numeric as total_value,
    case
      when coalesce(r.state_json ->> 'language', 'da') = 'da'
        then coalesce(r.total_price, 0)::numeric
      else coalesce(r.total_price, 0)::numeric * 7.46
    end as total_value_dkk,
    coalesce(r.quote_sent_at, r.order_sent_at, r.submitted_at, r.last_saved_at, r.created_at) as month_iso,
    coalesce(r.order_sent_at, r.submitted_at, r.last_saved_at, r.created_at) as closed_at,
    coalesce((
      select jsonb_object_agg(machine_key, qty_sum)
      from (
        select
          mc ->> 'type' as machine_key,
          sum(
            case
              when coalesce(mc ->> 'qty', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
                then greatest((mc ->> 'qty')::numeric, 0)
              else 0
            end
          )::int as qty_sum
        from jsonb_array_elements(coalesce(r.state_json -> 'machineConfigs', '[]'::jsonb)) mc
        where nullif(mc ->> 'type', '') is not null
        group by mc ->> 'type'
      ) qty
      where qty_sum > 0
    ), '{}'::jsonb) as machine_qty_by_key
  from configuration_rows r
),
quote_rows as (
  select *
  from enriched
  where effective_document_type = 'quote'
    and quote_number is not null
    and lower(coalesce(case_status, '')) not in ('ordre_afgivet', 'deleted', 'lost', 'tabt', 'cancelled', 'annulleret')
    and lower(coalesce(status, '')) <> 'ordre_afgivet'
),
order_rows as (
  select *
  from enriched
  where effective_document_type = 'order'
    and (
      order_sent_at is not null
      or submitted_at is not null
      or lower(coalesce(case_status, '')) = 'ordre_afgivet'
      or lower(coalesce(status, '')) = 'ordre_afgivet'
    )
),
order_timing as (
  select
    count(*) filter (where closed_at >= (select month_start from bounds))::int as orders_this_month,
    count(*) filter (
      where closed_at >= (select prev_window_from from bounds)
        and closed_at <= (select prev_window_to from bounds)
    )::int as orders_prev_window,
    coalesce(sum(total_value_dkk) filter (where closed_at >= (select month_start from bounds)), 0)::numeric as closed_value_this_month,
    coalesce(sum(total_value) filter (where closed_at >= (select month_start from bounds) and currency = 'EUR'), 0)::numeric as closed_value_this_month_eur,
    coalesce(sum(total_value_dkk) filter (
      where closed_at >= (select prev_window_from from bounds)
        and closed_at <= (select prev_window_to from bounds)
    ), 0)::numeric as closed_value_prev_window
  from order_rows
),
quote_totals as (
  select
    count(*)::int as quote_count,
    coalesce(sum(total_value_dkk), 0)::numeric as quote_value_dkk,
    coalesce(sum(total_value) filter (where currency = 'EUR'), 0)::numeric as quote_value_eur
  from quote_rows
),
order_totals as (
  select
    count(*)::int as order_count,
    coalesce(sum(total_value_dkk), 0)::numeric as order_value_dkk,
    coalesce(sum(total_value) filter (where currency = 'EUR'), 0)::numeric as order_value_eur
  from order_rows
)
select jsonb_build_object(
  'quote_count', qt.quote_count,
  'quote_value_dkk', qt.quote_value_dkk,
  'quote_value_eur', qt.quote_value_eur,
  'order_count', ot.order_count,
  'order_value_dkk', ot.order_value_dkk,
  'order_value_eur', ot.order_value_eur,
  'closed_count_this_month', timing.orders_this_month,
  'closed_value_this_month', timing.closed_value_this_month,
  'closed_value_this_month_eur', timing.closed_value_this_month_eur,
  'won_pct_change', case
    when timing.orders_prev_window = 0 then case when timing.orders_this_month > 0 then 100 else 0 end
    else round(((timing.orders_this_month - timing.orders_prev_window)::numeric / timing.orders_prev_window::numeric) * 100)::int
  end,
  'closed_pct_change', case
    when timing.closed_value_prev_window = 0 then case when timing.closed_value_this_month > 0 then 100 else 0 end
    else round(((timing.closed_value_this_month - timing.closed_value_prev_window) / timing.closed_value_prev_window) * 100)::int
  end,
  'raw_records_scanned', jsonb_build_object(
    'configurations', (select count(*) from configuration_rows),
    'quotes', (select count(*) from quote_rows),
    'orders', (select count(*) from order_rows)
  ),
  'stage_rows', jsonb_build_object(
    'quote', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'type', 'Tilbud',
        'number', coalesce(quote_number, '-'),
        'title', coalesce(nullif(title, ''), '-'),
        'dealer', coalesce(nullif(dealer_company_name, ''), nullif(dealer_name, ''), '-'),
        'seller', coalesce(nullif(seller_initials, ''), nullif(seller_name, ''), '-'),
        'value', total_value_dkk,
        'status', coalesce(nullif(case_status, ''), 'sent'),
        'date', month_iso,
        'href', '/portal/crm/quotes'
      ) order by month_iso desc)
      from quote_rows
    ), '[]'::jsonb),
    'won', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'type', 'Ordre',
        'number', coalesce(order_number, quote_number, '-'),
        'title', coalesce(nullif(title, ''), '-'),
        'dealer', coalesce(nullif(dealer_company_name, ''), nullif(dealer_name, ''), '-'),
        'seller', coalesce(nullif(seller_initials, ''), nullif(seller_name, ''), '-'),
        'value', total_value_dkk,
        'status', coalesce(nullif(case_status, ''), 'ordre_afgivet'),
        'date', closed_at,
        'href', '/portal/crm/orders'
      ) order by closed_at desc)
      from order_rows
    ), '[]'::jsonb)
  ),
  'order_rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'document_type', 'order',
      'case_type', case_type,
      'case_status', case_status,
      'status', status,
      'created_at', created_at,
      'last_saved_at', last_saved_at,
      'title', title,
      'quote_number', quote_number,
      'order_number', order_number,
      'total_price', total_value,
      'seller_initials', seller_initials,
      'seller_email', seller_email,
      'seller_name', seller_name,
      'assigned_seller_id', assigned_seller_id,
      'dealer_number', dealer_number,
      'dealer_name', dealer_name,
      'dealer_account_id', dealer_account_id,
      'dealer_company_name', dealer_company_name,
      'dealer_account_number', dealer_account_number,
      'dealer_country', dealer_country,
      'created_by_email', null,
      'created_by_user_id', created_by_user_id,
      'created_by_role', null,
      'active_mode', null,
      'owner_status', null,
      'lead_id', null,
      'quote_sent_at', quote_sent_at,
      'order_sent_at', order_sent_at,
      'submitted_at', submitted_at,
      'total_value', total_value,
      'total_value_dkk', total_value_dkk,
      'currency', currency,
      'machine_keys', coalesce((select jsonb_agg(k) from jsonb_object_keys(machine_qty_by_key) k), '[]'::jsonb),
      'machine_qty_by_key', machine_qty_by_key,
      'closed_at', closed_at
    ) order by closed_at desc)
    from order_rows
  ), '[]'::jsonb)
)
from quote_totals qt
cross join order_totals ot
cross join order_timing timing;
$$;

revoke all on function public.crm_dashboard_quote_order_kpis(uuid, text, text, timestamptz) from public;
grant execute on function public.crm_dashboard_quote_order_kpis(uuid, text, text, timestamptz) to authenticated;
