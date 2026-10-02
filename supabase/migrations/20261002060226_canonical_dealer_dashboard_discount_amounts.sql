-- Read dealer-dashboard discount components from the immutable submitted-order
-- snapshot. Legacy orders are only resolved when their frozen state proves the
-- component amount unambiguously; no current catalogue prices are consulted.
create or replace function public.crm_dealer_sales_dashboard(
  p_from date default null,
  p_to date default null,
  p_countries text[] default null,
  p_sellers text[] default null,
  p_dealer_numbers text[] default null,
  p_customers text[] default null,
  p_machines text[] default null,
  p_partner_types text[] default null,
  p_display_currency text default 'both',
  p_limit integer default 100,
  p_offset integer default 0,
  p_view_as_user_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $function$
declare
  v_actor public.app_users%rowtype;
  v_subject public.app_users%rowtype;
  v_role text;
  v_is_backend boolean := false;
  v_is_external boolean := false;
  v_display_currency text := upper(coalesce(nullif(trim(p_display_currency), ''), 'BOTH'));
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  select * into v_actor
  from public.app_users au
  where coalesce(au.approved, false)
    and coalesce(au.is_active, false)
    and (
      au.auth_user_id = auth.uid()
      or lower(trim(au.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  order by (au.auth_user_id = auth.uid()) desc
  limit 1;

  if not found then
    raise exception 'Authenticated portal user is required' using errcode = '42501';
  end if;

  v_is_backend := coalesce(v_actor.portal_role::text, v_actor.role) in ('timan_backend', 'timan_service');
  if p_view_as_user_id is not null and p_view_as_user_id <> v_actor.id then
    if not v_is_backend then
      raise exception 'Only Timan Backend may use a view-as dashboard scope' using errcode = '42501';
    end if;
    select * into v_subject
    from public.app_users au
    where au.id = p_view_as_user_id
      and coalesce(au.approved, false)
      and coalesce(au.is_active, false);
    if not found then
      raise exception 'Requested view-as user is not active' using errcode = '42501';
    end if;
  else
    v_subject := v_actor;
  end if;

  v_role := coalesce(v_subject.portal_role::text, v_subject.role, '');
  v_is_external := v_role in ('timan_importer', 'timan_dealer', 'timan_service_partner', 'dealer_customer', 'dealer_user');
  if v_display_currency not in ('DKK', 'EUR', 'BOTH') then
    raise exception 'Display currency must be DKK, EUR or BOTH' using errcode = '22023';
  end if;

  with recursive
  subject_account as (
    select da.id, da.account_number
    from public.dealer_accounts da
    where nullif(v_subject.dealer_number, '') is not null
      and da.account_number = v_subject.dealer_number
    limit 1
  ),
  seller_accounts as (
    select da.id, da.account_number
    from public.dealer_accounts da
    where v_role = 'timan_seller'
      and (
        da.assigned_seller_id = v_subject.id
        or lower(coalesce(da.assigned_seller_email, '')) = lower(coalesce(v_subject.email, ''))
        or upper(coalesce(da.assigned_seller_initials, '')) = upper(coalesce(v_subject.initials, ''))
      )
  ),
  account_scope as (
    select id, account_number from seller_accounts
    union
    select da.id, da.account_number
    from public.dealer_accounts da
    join seller_accounts parent on parent.account_number = da.parent_account_number
    union
    select id, account_number from subject_account
    union
    select da.id, da.account_number
    from public.dealer_accounts da
    join subject_account own on v_is_external and da.parent_account_number = own.account_number
    union
    select target.id, target.account_number
    from public.partner_account_relations par
    join subject_account own on own.id = par.source_account_id
    join public.dealer_accounts target on target.id = par.target_account_id
    where v_role = 'timan_service_partner' and par.active = true
  ),
  scoped_configurations as (
    select
      c.*,
      da.company_name as dealer_company_name,
      da.country as dealer_country,
      da.customer_type_label,
      da.customer_type,
      da.dealer_type,
      case
        when c.submitted_at is not null or c.order_sent_at is not null then 'order'
        when c.quote_sent_at is not null then 'quote'
        else 'draft'
      end as record_kind,
      coalesce(
        latest_revision.after_snapshot -> 'configuration',
        original_revision.before_snapshot -> 'configuration',
        to_jsonb(c)
      ) as frozen_configuration
    from public.configurations c
    left join public.dealer_accounts da
      on da.id = c.dealer_account_id
      or (c.dealer_account_id is null and da.account_number = c.dealer_number)
    left join lateral (
      select s.after_snapshot
      from public.configurator_order_correction_sessions s
      where s.configuration_id = c.id
        and s.status = 'completed'
        and s.completed_at is not null
        and s.after_snapshot is not null
      order by s.completed_at desc, s.started_at desc, s.id desc
      limit 1
    ) latest_revision on true
    left join lateral (
      select s.before_snapshot
      from public.configurator_order_correction_sessions s
      where s.configuration_id = c.id
      order by s.started_at, s.id
      limit 1
    ) original_revision on latest_revision.after_snapshot is null
    where coalesce(c.case_status, '') <> 'deleted'
      and (
        v_role in ('timan_backend', 'timan_service')
        or (
          v_role = 'timan_seller'
          and (
            c.assigned_seller_id = v_subject.id
            or c.dealer_account_id in (select id from account_scope)
            or c.dealer_number in (select account_number from account_scope)
          )
        )
        or (
          v_is_external
          and (
            c.dealer_account_id in (select id from account_scope)
            or c.dealer_number in (select account_number from account_scope)
          )
        )
      )
  ),
  expanded as (
    select
      sc.*,
      coalesce(sc.frozen_configuration -> 'state_json', sc.state_json) as frozen_state,
      coalesce(
        nullif(upper(sc.frozen_configuration ->> 'currency'), ''),
        nullif(upper(sc.currency), ''),
        case when coalesce(sc.frozen_configuration -> 'state_json' ->> 'language', 'da') = 'da' then 'DKK' else 'EUR' end
      ) as source_currency,
      coalesce(nullif(sc.frozen_configuration ->> 'subtotal', '')::numeric, sc.subtotal, 0)::numeric as list_price,
      coalesce(nullif(sc.frozen_configuration ->> 'total_price', '')::numeric, sc.total_price, 0)::numeric as net_value,
      coalesce(sc.order_sent_at, sc.submitted_at, sc.quote_sent_at, sc.created_at) as activity_at,
      coalesce(nullif(sc.dealer_company_name, ''), nullif(sc.dealer_name, ''), '—') as dealer,
      coalesce(nullif(sc.dealer_country, ''), '—') as country,
      coalesce(nullif(sc.customer_company, ''), nullif(sc.customer_name, ''), '—') as customer,
      coalesce(nullif(sc.seller_initials, ''), nullif(sc.seller_name, ''), '—') as timan_seller,
      case
        when lower(concat_ws(' ', sc.customer_type_label, sc.customer_type, sc.dealer_type)) like '%import%' then 'Importør'
        when lower(concat_ws(' ', sc.customer_type_label, sc.customer_type, sc.dealer_type)) like '%service%' then 'Servicepartner'
        when lower(concat_ws(' ', sc.customer_type_label, sc.customer_type, sc.dealer_type)) like '%forhandlerkunde%' then 'Forhandlerkunde'
        else 'Forhandler'
      end as partner_type
    from scoped_configurations sc
  ),
  priced as (
    select
      e.*,
      coalesce(e.frozen_state -> 'pricingSnapshot' -> 'discountDetails', 'null'::jsonb) as discount_details,
      coalesce(e.frozen_state -> 'machineConfigs', '[]'::jsonb) as machine_configs,
      case
        when abs(coalesce(nullif(e.frozen_state ->> 'baseDiscountPct', '')::numeric, 0)) <= 1
          then coalesce(nullif(e.frozen_state ->> 'baseDiscountPct', '')::numeric, 0) * 100
        else coalesce(nullif(e.frozen_state ->> 'baseDiscountPct', '')::numeric, 0)
      end as standard_discount_pct,
      case
        when abs(coalesce(nullif(e.frozen_state ->> 'manualDealerDiscountPct', '')::numeric, 0)) <= 1
          then coalesce(nullif(e.frozen_state ->> 'manualDealerDiscountPct', '')::numeric, 0) * 100
        else coalesce(nullif(e.frozen_state ->> 'manualDealerDiscountPct', '')::numeric, 0)
      end as legacy_extra_discount_pct
    from expanded e
  ),
  component_rows as (
    select
      p.*,
      jsonb_typeof(p.discount_details) = 'array'
        and not exists (
          select 1
          from jsonb_array_elements(p.discount_details) detail
          where nullif(detail ->> 'kind', '') is null
            or jsonb_typeof(detail -> 'amount') is distinct from 'number'
        ) as typed_snapshot_components,
      coalesce((
        select sum((detail ->> 'amount')::numeric)
        from jsonb_array_elements(
          case when jsonb_typeof(p.discount_details) = 'array' then p.discount_details else '[]'::jsonb end
        ) detail
        where detail ->> 'kind' in ('dealer', 'direct')
      ), 0)::numeric as snapshot_extra_discount_value,
      coalesce((
        select sum((detail ->> 'amount')::numeric)
        from jsonb_array_elements(
          case when jsonb_typeof(p.discount_details) = 'array' then p.discount_details else '[]'::jsonb end
        ) detail
        where detail ->> 'kind' in ('payment', 'delivery')
      ), 0)::numeric as snapshot_payment_delivery_discount_value,
      coalesce((
        select sum(coalesce(nullif(detail ->> 'percent', '')::numeric, 0))
        from jsonb_array_elements(
          case when jsonb_typeof(p.discount_details) = 'array' then p.discount_details else '[]'::jsonb end
        ) detail
        where detail ->> 'kind' in ('dealer', 'direct')
      ), p.legacy_extra_discount_pct)::numeric as component_extra_discount_pct,
      coalesce((
        select sum(coalesce(nullif(detail ->> 'percent', '')::numeric, 0))
        from jsonb_array_elements(
          case when jsonb_typeof(p.discount_details) = 'array' then p.discount_details else '[]'::jsonb end
        ) detail
        where detail ->> 'kind' in ('payment', 'delivery')
      ), 0)::numeric as component_payment_delivery_discount_pct,
      coalesce((
        select sum(greatest(coalesce(nullif(machine ->> 'qty', '')::integer, 0), 0))
        from jsonb_array_elements(p.machine_configs) machine
      ), 0)::integer as machine_count,
      coalesce((
        select string_agg(distinct nullif(machine ->> 'type', ''), ', ' order by nullif(machine ->> 'type', ''))
        from jsonb_array_elements(p.machine_configs) machine
      ), '—') as machine,
      exists (
        select 1
        from jsonb_each_text(
          case when jsonb_typeof(p.frozen_state -> 'demoMachines') = 'object'
            then p.frozen_state -> 'demoMachines' else '{}'::jsonb end
        ) demo
        where lower(demo.value) = 'true'
      ) as has_demo_machine,
      (
        nullif(p.frozen_state ->> 'date', '') is not null
        and (p.frozen_state ->> 'date')::date > (p.activity_at + interval '3 months')::date
      ) or exists (
        select 1
        from jsonb_each_text(
          case when jsonb_typeof(p.frozen_state -> 'machineDeliveryDates') = 'object'
            then p.frozen_state -> 'machineDeliveryDates' else '{}'::jsonb end
        ) delivery_date
        where nullif(delivery_date.value, '') is not null
          and delivery_date.value::date > (p.activity_at + interval '3 months')::date
      ) as may_have_legacy_delivery_discount
    from priced p
  ),
  rows as (
    select
      c.*,
      c.activity_at::date as activity_date,
      greatest(c.list_price - c.net_value, 0)::numeric as discount_value,
      case when c.list_price > 0 then round(((c.list_price - c.net_value) / c.list_price) * 100, 2) else null end as total_discount_pct,
      case when c.source_currency = 'EUR' then c.net_value * 7.46 else c.net_value end as net_dkk,
      case when c.source_currency = 'EUR' then c.list_price * 7.46 else c.list_price end as list_dkk,
      case
        when c.typed_snapshot_components then true
        when c.legacy_extra_discount_pct = 0 then true
        when c.legacy_extra_discount_pct > 0
          and c.legacy_extra_discount_pct < 100
          and not c.has_demo_machine then true
        else false
      end as extra_discount_available,
      case
        when c.typed_snapshot_components then c.snapshot_extra_discount_value
        when c.legacy_extra_discount_pct = 0 then 0
        when c.legacy_extra_discount_pct > 0
          and c.legacy_extra_discount_pct < 100
          and not c.has_demo_machine
          then round(c.net_value * c.legacy_extra_discount_pct / (100 - c.legacy_extra_discount_pct), 2)
        else null
      end as extra_discount_value,
      case
        when c.typed_snapshot_components then true
        when not c.may_have_legacy_delivery_discount then true
        else false
      end as payment_delivery_discount_available,
      case
        when c.typed_snapshot_components then c.snapshot_payment_delivery_discount_value
        when not c.may_have_legacy_delivery_discount then 0
        else null
      end as payment_delivery_discount_value,
      case
        when c.typed_snapshot_components then 'pricing_snapshot'
        when (
          (c.legacy_extra_discount_pct = 0 or (
            c.legacy_extra_discount_pct > 0
            and c.legacy_extra_discount_pct < 100
            and not c.has_demo_machine
          ))
          and not c.may_have_legacy_delivery_discount
        ) then 'legacy_frozen_totals'
        else 'unavailable'
      end as discount_component_source
    from component_rows c
    where c.record_kind in ('order', 'quote')
      and (p_from is null or c.activity_at::date >= p_from)
      and (p_to is null or c.activity_at::date <= p_to)
      and (coalesce(array_length(p_countries, 1), 0) = 0 or c.country = any(p_countries))
      and (coalesce(array_length(p_sellers, 1), 0) = 0 or c.timan_seller = any(p_sellers))
      and (coalesce(array_length(p_dealer_numbers, 1), 0) = 0 or c.dealer_number = any(p_dealer_numbers))
      and (coalesce(array_length(p_customers, 1), 0) = 0 or c.customer = any(p_customers))
      and (coalesce(array_length(p_partner_types, 1), 0) = 0 or c.partner_type = any(p_partner_types))
      and (
        coalesce(array_length(p_machines, 1), 0) = 0
        or exists (
          select 1
          from jsonb_array_elements(c.machine_configs) machine_config
          where machine_config ->> 'type' = any(p_machines)
        )
      )
  ),
  order_rows as (
    select * from rows where record_kind = 'order'
  ),
  display_rows as (
    select
      o.*,
      case when v_display_currency = 'EUR' then o.net_dkk / 7.46 else o.net_dkk end as display_net,
      case when v_display_currency = 'EUR' then o.list_dkk / 7.46 else o.list_dkk end as display_list,
      case
        when o.extra_discount_value is null then null
        when v_display_currency = 'EUR' then
          (case when o.source_currency = 'EUR' then o.extra_discount_value * 7.46 else o.extra_discount_value end) / 7.46
        else case when o.source_currency = 'EUR' then o.extra_discount_value * 7.46 else o.extra_discount_value end
      end as display_extra_discount_value,
      case
        when o.payment_delivery_discount_value is null then null
        when v_display_currency = 'EUR' then
          (case when o.source_currency = 'EUR' then o.payment_delivery_discount_value * 7.46 else o.payment_delivery_discount_value end) / 7.46
        else case when o.source_currency = 'EUR' then o.payment_delivery_discount_value * 7.46 else o.payment_delivery_discount_value end
      end as display_payment_delivery_discount_value
    from order_rows o
  ),
  partner_sales_label as (
    select case
      when not v_is_external then null
      when (
        select count(*)
        from public.dealer_contacts dc
        join subject_account own on own.id = dc.dealer_account_id
        where lower(coalesce(dc.contact_area, '')) in ('sales', 'salg')
          or lower(coalesce(dc.role_title, '')) like '%sales%'
      ) = 1 then (
        select coalesce(nullif(dc.name, ''), 'Info mangler')
        from public.dealer_contacts dc
        join subject_account own on own.id = dc.dealer_account_id
        where lower(coalesce(dc.contact_area, '')) in ('sales', 'salg')
          or lower(coalesce(dc.role_title, '')) like '%sales%'
        limit 1
      )
      else 'Info mangler'
    end as label
  )
  select jsonb_build_object(
    'scope', jsonb_build_object(
      'user_id', v_subject.id,
      'role', v_role,
      'is_backend', v_role in ('timan_backend', 'timan_service'),
      'is_external', v_is_external,
      'display_currency', v_display_currency
    ),
    'summary', jsonb_build_object(
      'revenue', coalesce((select sum(display_net) from display_rows), 0),
      'order_count', (select count(*) from display_rows),
      'machine_count', coalesce((select sum(machine_count) from display_rows), 0),
      'average_discount_pct', coalesce((select avg(total_discount_pct) from display_rows), 0),
      'extra_discount_value', case
        when exists (select 1 from display_rows where not extra_discount_available) then null
        else coalesce((select sum(display_extra_discount_value) from display_rows), 0)
      end,
      'extra_discount_missing_count', (select count(*) from display_rows where not extra_discount_available),
      'payment_delivery_discount_value', case
        when exists (select 1 from display_rows where not payment_delivery_discount_available) then null
        else coalesce((select sum(display_payment_delivery_discount_value) from display_rows), 0)
      end,
      'payment_delivery_discount_missing_count', (select count(*) from display_rows where not payment_delivery_discount_available),
      'top_country', (select country from display_rows group by country order by sum(display_net) desc, country limit 1),
      'top_dealer', (select dealer from display_rows group by dealer order by sum(display_net) desc, dealer limit 1),
      'quote_count', (select count(*) from rows where record_kind = 'quote')
    ),
    'charts', jsonb_build_object(
      'revenue_over_time', coalesce((
        select jsonb_agg(jsonb_build_object('name', to_char(activity_date, 'YYYY-MM'), 'date', to_char(activity_date, 'YYYY-MM-DD'), 'value', value) order by activity_date)
        from (select activity_date, sum(display_net) as value from display_rows group by activity_date) chart
      ), '[]'::jsonb),
      'revenue_by_year', coalesce((
        select jsonb_agg(jsonb_build_object('name', year, 'value', value) order by year)
        from (select extract(year from activity_date)::text as year, sum(display_net) as value from display_rows group by extract(year from activity_date)::text) chart
      ), '[]'::jsonb),
      'top_dealers', coalesce((
        select jsonb_agg(jsonb_build_object('name', dealer, 'value', value) order by value desc, dealer)
        from (select dealer, sum(display_net) as value from display_rows group by dealer order by value desc, dealer limit 10) chart
      ), '[]'::jsonb),
      'by_country', coalesce((
        select jsonb_agg(jsonb_build_object('name', country, 'value', value) order by value desc, country)
        from (select country, sum(display_net) as value from display_rows group by country) chart
      ), '[]'::jsonb),
      'by_seller', coalesce((
        select jsonb_agg(jsonb_build_object('name', case when v_is_external then (select label from partner_sales_label) else timan_seller end, 'value', value) order by value desc)
        from (select timan_seller, sum(display_net) as value from display_rows group by timan_seller) chart
      ), '[]'::jsonb),
      'machine_volume', coalesce((
        select jsonb_agg(jsonb_build_object('name', machine, 'value', value) order by value desc, machine)
        from (select machine, sum(machine_count) as value from display_rows group by machine) chart
      ), '[]'::jsonb),
      'machine_value', coalesce((
        select jsonb_agg(jsonb_build_object('name', machine, 'value', value) order by value desc, machine)
        from (select machine, sum(display_net) as value from display_rows group by machine) chart
      ), '[]'::jsonb),
      'dk_vs_de', coalesce((
        select jsonb_agg(jsonb_build_object('name', country, 'value', value) order by country)
        from (select country, sum(display_net) as value from display_rows where country in ('Danmark', 'Tyskland') group by country) chart
      ), '[]'::jsonb),
      'discount_by_machine', coalesce((
        select jsonb_agg(jsonb_build_object('name', machine, 'standard', standard, 'extra', extra, 'payment', payment) order by machine)
        from (
          select machine, avg(standard_discount_pct) as standard, avg(component_extra_discount_pct) as extra,
            avg(component_payment_delivery_discount_pct) as payment
          from display_rows group by machine
        ) chart
      ), '[]'::jsonb),
      'discount_over_time', coalesce((
        select jsonb_agg(jsonb_build_object('name', year, 'standard', standard, 'extra', extra, 'total', total) order by year)
        from (
          select extract(year from activity_date)::text as year, avg(standard_discount_pct) as standard,
            avg(component_extra_discount_pct) as extra, avg(total_discount_pct) as total
          from display_rows group by extract(year from activity_date)::text
        ) chart
      ), '[]'::jsonb),
      'discount_value_by_year', coalesce((
        select jsonb_agg(jsonb_build_object('name', year, 'standard', standard, 'extra', extra, 'payment', payment) order by year)
        from (
          select extract(year from activity_date)::text as year,
            sum(case when v_display_currency = 'EUR' then list_dkk / 7.46 * standard_discount_pct / 100 else list_dkk * standard_discount_pct / 100 end) as standard,
            case when bool_and(extra_discount_available) then sum(display_extra_discount_value) else null end as extra,
            case when bool_and(payment_delivery_discount_available) then sum(display_payment_delivery_discount_value) else null end as payment
          from display_rows group by extract(year from activity_date)::text
        ) chart
      ), '[]'::jsonb)
    ),
    'filters', jsonb_build_object(
      'countries', coalesce((select jsonb_agg(distinct country order by country) from rows), '[]'::jsonb),
      'sellers', coalesce((select jsonb_agg(distinct timan_seller order by timan_seller) from rows), '[]'::jsonb),
      'dealers', coalesce((
        select jsonb_agg(jsonb_build_object('number', dealer_number, 'name', dealer) order by dealer)
        from (select distinct dealer_number, dealer from rows) choices
      ), '[]'::jsonb),
      'customers', coalesce((select jsonb_agg(distinct customer order by customer) from rows), '[]'::jsonb),
      'machines', coalesce((select jsonb_agg(distinct machine order by machine) from rows where machine <> '—'), '[]'::jsonb),
      'partner_types', coalesce((select jsonb_agg(distinct partner_type order by partner_type) from rows), '[]'::jsonb)
    ),
    'detail', jsonb_build_object(
      'total_count', (select count(*) from display_rows),
      'limit', v_limit,
      'offset', v_offset,
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'record_kind', record_kind,
          'order_number', order_number,
          'quote_number', quote_number,
          'date', activity_date,
          'seller', timan_seller,
          'country', country,
          'dealer', dealer,
          'dealer_number', dealer_number,
          'customer', customer,
          'machine', machine,
          'machine_count', machine_count,
          'list_price', list_price,
          'net_value', net_value,
          'currency', source_currency,
          'standard_discount_pct', standard_discount_pct,
          'extra_discount_pct', component_extra_discount_pct,
          'extra_discount_value', extra_discount_value,
          'extra_discount_available', extra_discount_available,
          'payment_delivery_discount_pct', component_payment_delivery_discount_pct,
          'payment_delivery_discount_value', payment_delivery_discount_value,
          'payment_delivery_discount_available', payment_delivery_discount_available,
          'discount_component_source', discount_component_source,
          'total_discount_pct', total_discount_pct,
          'discount_value', discount_value
        ) order by activity_date desc, id)
        from (
          select * from display_rows
          order by activity_date desc, id
          limit v_limit offset v_offset
        ) paged
      ), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.crm_dealer_sales_dashboard(date, date, text[], text[], text[], text[], text[], text[], text, integer, integer, uuid) from public, anon;
grant execute on function public.crm_dealer_sales_dashboard(date, date, text[], text[], text[], text[], text[], text[], text, integer, integer, uuid) to authenticated, service_role;
