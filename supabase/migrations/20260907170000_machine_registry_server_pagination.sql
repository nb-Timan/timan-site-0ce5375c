-- Canonical, RLS-invoker machine registry read model.
-- Filtering and ordering happen before pagination so PostgREST's max-rows
-- setting can never silently truncate totals or later pages.
create or replace function public.machine_registry_page(
  p_query text default null, p_dealer text default null, p_model text default null,
  p_warranty_type text default 'all', p_date_from date default null, p_date_to date default null,
  p_sort text default 'activity', p_direction text default 'desc',
  p_limit integer default 50, p_offset integer default 0
) returns jsonb
language sql security invoker set search_path = public
as $$
with canonical as (
  select distinct on (upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')))
    wr.machine_serial_number as serial,
    upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) as serial_key,
    wr.machine_model as model,
    coalesce(da.company_name, wr.dealer_name_snapshot) as dealer_name,
    wr.dealer_account_number as dealer_number,
    wr.delivery_date,
    wr.legacy_operating_hours as operating_hours,
    coalesce(wr.legacy_last_activity_at, wr.registration_date, wr.delivery_date::timestamptz, wr.created_at) as activity_at,
    case when wr.source = 'legacy_machine_import' then wr.legacy_warranty_reference
      when wr.sharepoint_form_id is not null then 'SP-' || wr.sharepoint_form_id::text
      else 'SP-' || coalesce(wr.sharepoint_item_id, left(wr.id::text, 8)) end as warranty_id,
    case when wr.source = 'legacy_machine_import' then 'historical' else 'normal' end as warranty_type
  from public.warranty_registrations wr
  left join public.dealer_accounts da on da.id = wr.dealer_account_id
  where wr.is_active_in_source = true and coalesce(wr.machine_serial_number, '') <> ''
  order by upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')),
    (wr.dealer_account_id is not null) desc, wr.delivery_date desc nulls last, wr.created_at desc
), filtered as (
  select * from canonical
  where (nullif(trim(p_query), '') is null or serial ilike '%' || trim(p_query) || '%' or warranty_id ilike '%' || trim(p_query) || '%')
    and (nullif(trim(p_dealer), '') is null or dealer_number ilike '%' || trim(p_dealer) || '%' or dealer_name ilike '%' || trim(p_dealer) || '%')
    and (nullif(trim(p_model), '') is null or p_model = 'all' or model = p_model)
    and (coalesce(p_warranty_type, 'all') = 'all' or warranty_type = p_warranty_type)
    and (p_date_from is null or delivery_date >= p_date_from)
    and (p_date_to is null or delivery_date <= p_date_to)
), numbered as (select *, count(*) over () as filtered_total from filtered), page as (
  select * from numbered
  order by
    case when p_sort = 'warrantyId' and p_direction = 'asc' then warranty_id end asc nulls last,
    case when p_sort = 'warrantyId' and p_direction = 'desc' then warranty_id end desc nulls last,
    case when p_sort = 'serial' and p_direction = 'asc' then serial end asc nulls last,
    case when p_sort = 'serial' and p_direction = 'desc' then serial end desc nulls last,
    case when p_sort = 'model' and p_direction = 'asc' then model end asc nulls last,
    case when p_sort = 'model' and p_direction = 'desc' then model end desc nulls last,
    case when p_sort = 'dealer' and p_direction = 'asc' then dealer_name end asc nulls last,
    case when p_sort = 'dealer' and p_direction = 'desc' then dealer_name end desc nulls last,
    case when p_sort = 'delivery' and p_direction = 'asc' then delivery_date end asc nulls last,
    case when p_sort = 'delivery' and p_direction = 'desc' then delivery_date end desc nulls last,
    case when p_sort = 'hours' and p_direction = 'asc' then operating_hours end asc nulls last,
    case when p_sort = 'hours' and p_direction = 'desc' then operating_hours end desc nulls last,
    case when p_sort = 'activity' and p_direction = 'asc' then activity_at end asc nulls last,
    case when p_sort = 'activity' and p_direction = 'desc' then activity_at end desc nulls last,
    serial_key asc
  limit greatest(1, least(coalesce(p_limit, 50), 500)) offset greatest(0, coalesce(p_offset, 0))
)
select jsonb_build_object(
  'total', coalesce((select max(filtered_total) from numbered), 0),
  'normal', (select count(*) from canonical where warranty_type = 'normal'),
  'historical', (select count(*) from canonical where warranty_type = 'historical'),
  'rows', coalesce((select jsonb_agg(jsonb_build_object('serial', serial, 'normalizedSerial', serial_key, 'machineModel', model, 'dealerName', dealer_name, 'dealerNumber', dealer_number, 'deliveryDate', delivery_date, 'operatingHours', operating_hours, 'latestActivityDate', activity_at, 'warrantyId', warranty_id, 'warrantyType', warranty_type) order by serial_key) from page), '[]'::jsonb)
);
$$;

revoke all on function public.machine_registry_page(text,text,text,text,date,date,text,text,integer,integer) from public;
grant execute on function public.machine_registry_page(text,text,text,text,date,date,text,text,integer,integer) to authenticated;
