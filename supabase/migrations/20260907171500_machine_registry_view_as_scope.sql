-- The canonical, paged machine registry. SECURITY INVOKER deliberately keeps
-- warranty_registrations RLS in force. p_allowed_dealers is an optional
-- additional restriction for a backend user's View-as seller mode.
create or replace function public.machine_registry_page_scoped(
  p_allowed_dealers text[] default null,
  p_query text default null,
  p_dealer text default null,
  p_model text default null,
  p_warranty_type text default 'all',
  p_health text default 'all',
  p_date_from date default null,
  p_date_to date default null,
  p_sort text default 'activity',
  p_direction text default 'desc',
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language sql
security invoker
set search_path = public
as $$
with canonical as (
  -- One row per normalized serial. A canonical SharePoint warranty wins over
  -- a historical import whenever both sources describe the same machine.
  select distinct on (upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')))
    wr.machine_serial_number as serial,
    upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) as normalized_serial,
    wr.machine_model as machine_model,
    coalesce(dealer.company_name, wr.dealer_name_snapshot) as dealer_name,
    wr.dealer_account_number as dealer_number,
    wr.delivery_date,
    wr.legacy_operating_hours as operating_hours,
    coalesce(wr.legacy_last_activity_at, wr.registration_date, wr.delivery_date::timestamptz, wr.created_at) as latest_activity_at,
    case
      when wr.source = 'legacy_machine_import' then wr.legacy_warranty_reference
      when wr.sharepoint_form_id is not null then 'SP-' || wr.sharepoint_form_id::text
      else 'SP-' || coalesce(wr.sharepoint_item_id, left(wr.id::text, 8))
    end as warranty_id,
    case when wr.source = 'legacy_machine_import' then 'historical' else 'normal' end as warranty_type,
    importer.company_name as importer_name,
    -- The current live schema has no persisted service/ticket/claim/TSB
    -- tables. These explicit canonical inputs are therefore zero/null today;
    -- their precedence mirrors resolveMachineHealth() when those sources are
    -- persisted, rather than silently treating missing data as healthy.
    0::integer as open_tickets,
    0::integer as open_claims,
    0::integer as pending_tsb,
    null::integer as service_days,
    false as has_hours_regression,
    false as has_service_partner
  from public.warranty_registrations wr
  left join public.dealer_accounts dealer on dealer.id = wr.dealer_account_id
  left join public.dealer_accounts importer on importer.account_number = dealer.parent_account_number
  where wr.is_active_in_source = true
    and coalesce(wr.machine_serial_number, '') <> ''
    -- RLS controls every caller. A client list can only narrow a caller that
    -- is already global; it is never an authorization grant for another role.
    and (
      not (select public.is_timan_global_warranty())
      or p_allowed_dealers is null
      or wr.dealer_account_number = any(p_allowed_dealers)
    )
  order by
    upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')),
    (wr.source <> 'legacy_machine_import') desc,
    (wr.dealer_account_id is not null) desc,
    wr.delivery_date desc nulls last,
    wr.created_at desc
), assessed as (
  select *,
    case
      when open_claims > 0 or pending_tsb > 0 or service_days > 365 or has_hours_regression then 'critical'
      when open_tickets > 0 or service_days > 300 or importer_name is null or not has_service_partner then 'needs_attention'
      else 'healthy'
    end as health
  from canonical
), base_filtered as (
  select * from assessed
  where (nullif(trim(p_query), '') is null or serial ilike '%' || trim(p_query) || '%' or warranty_id ilike '%' || trim(p_query) || '%')
    and (nullif(trim(p_dealer), '') is null or dealer_number ilike '%' || trim(p_dealer) || '%' or dealer_name ilike '%' || trim(p_dealer) || '%')
    and (nullif(trim(p_model), '') is null or machine_model = p_model)
    and (coalesce(p_warranty_type, 'all') = 'all' or warranty_type = p_warranty_type)
    and (p_date_from is null or delivery_date >= p_date_from)
    and (p_date_to is null or delivery_date <= p_date_to)
), counts as (
  select
    count(*)::integer as scope_total,
    count(*) filter (where health = 'healthy')::integer as healthy,
    count(*) filter (where health = 'needs_attention')::integer as needs_attention,
    count(*) filter (where health = 'critical')::integer as critical,
    count(*) filter (where warranty_type = 'normal')::integer as normal,
    count(*) filter (where warranty_type = 'historical')::integer as historical
  from base_filtered
), filtered as (
  select * from base_filtered where coalesce(p_health, 'all') = 'all' or health = p_health
), ordered as (
  select *, count(*) over ()::integer as filtered_total,
    row_number() over (order by
      case when p_sort = 'warrantyId' and p_direction = 'asc' then warranty_id end asc nulls last,
      case when p_sort = 'warrantyId' and p_direction = 'desc' then warranty_id end desc nulls last,
      case when p_sort = 'serial' and p_direction = 'asc' then serial end asc nulls last,
      case when p_sort = 'serial' and p_direction = 'desc' then serial end desc nulls last,
      case when p_sort = 'model' and p_direction = 'asc' then machine_model end asc nulls last,
      case when p_sort = 'model' and p_direction = 'desc' then machine_model end desc nulls last,
      case when p_sort = 'dealer' and p_direction = 'asc' then dealer_name end asc nulls last,
      case when p_sort = 'dealer' and p_direction = 'desc' then dealer_name end desc nulls last,
      case when p_sort = 'delivery' and p_direction = 'asc' then delivery_date end asc nulls last,
      case when p_sort = 'delivery' and p_direction = 'desc' then delivery_date end desc nulls last,
      case when p_sort = 'hours' and p_direction = 'asc' then operating_hours end asc nulls last,
      case when p_sort = 'hours' and p_direction = 'desc' then operating_hours end desc nulls last,
      case when p_sort = 'activity' and p_direction = 'asc' then latest_activity_at end asc nulls last,
      case when p_sort = 'activity' and p_direction = 'desc' then latest_activity_at end desc nulls last,
      normalized_serial asc
    ) as ordinal
  from filtered
), page as (
  select * from ordered
  where ordinal > greatest(0, coalesce(p_offset, 0))
    and ordinal <= greatest(0, coalesce(p_offset, 0)) + greatest(1, least(coalesce(p_limit, 50), 2000))
)
select jsonb_build_object(
  'total', coalesce((select max(filtered_total) from ordered), 0),
  'scopeTotal', (select scope_total from counts),
  'normal', (select normal from counts),
  'historical', (select historical from counts),
  'healthy', (select healthy from counts),
  'needsAttention', (select needs_attention from counts),
  'critical', (select critical from counts),
  'rows', coalesce((select jsonb_agg(jsonb_build_object(
    'serial', serial, 'normalizedSerial', normalized_serial, 'machineModel', machine_model,
    'dealerName', dealer_name, 'dealerNumber', dealer_number, 'deliveryDate', delivery_date,
    'operatingHours', operating_hours, 'latestActivityDate', latest_activity_at,
    'warrantyId', warranty_id, 'warrantyType', warranty_type, 'health', health,
    'openTickets', open_tickets, 'openClaims', open_claims, 'openTsb', pending_tsb
  ) order by ordinal) from page), '[]'::jsonb)
);
$$;

revoke all on function public.machine_registry_page_scoped(text[], text, text, text, text, text, date, date, text, text, integer, integer) from public;
grant execute on function public.machine_registry_page_scoped(text[], text, text, text, text, text, date, date, text, text, integer, integer) to authenticated;
