-- A machine order is the canonical physical-machine reference. It exists
-- independently of an optional SP warranty registration.
alter table public.warranty_registrations
  add column if not exists machine_order_source text;

create unique index if not exists warranty_registrations_active_machine_order_unique
  on public.warranty_registrations (legacy_warranty_reference)
  where is_active_in_source
    and legacy_warranty_reference is not null
    and btrim(legacy_warranty_reference) <> '';

update public.warranty_registrations
set machine_order_source = 'legacy_import'
where source = 'legacy_machine_import'
  and is_active_in_source
  and nullif(btrim(legacy_warranty_reference), '') is not null
  and machine_order_source is null;

with highest_existing as (
  select coalesce(max((regexp_match(legacy_warranty_reference, '^MO-([0-9]+)$'))[1]::bigint), 0) as suffix
  from public.warranty_registrations
  where is_active_in_source and legacy_warranty_reference ~ '^MO-[0-9]+$'
), canonical_missing_orders as (
  select distinct on (upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')))
    wr.id, to_jsonb(wr) as before_snapshot,
    upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) as normalized_serial
  from public.warranty_registrations wr
  where wr.is_active_in_source
    and wr.source <> 'legacy_machine_import'
    and coalesce(wr.machine_serial_number, '') <> ''
    and nullif(btrim(wr.legacy_warranty_reference), '') is null
  order by upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')),
    (wr.dealer_account_id is not null) desc, wr.delivery_date desc nulls last, wr.created_at desc, wr.id
), numbered_orders as (
  select id, before_snapshot, normalized_serial,
    (select suffix from highest_existing) + row_number() over (order by normalized_serial) as suffix
  from canonical_missing_orders
), assigned as (
  update public.warranty_registrations wr
  set legacy_warranty_reference = 'MO-' || numbered_orders.suffix::text,
      machine_order_source = 'portal_assigned',
      updated_at = now()
  from numbered_orders
  where wr.id = numbered_orders.id
  returning wr.id, numbered_orders.before_snapshot, wr.legacy_warranty_reference
)
insert into public.warranty_registration_history (registration_id, change_source, snapshot, diff)
select id, 'machine_order_backfill', before_snapshot,
  jsonb_build_object(
    'event', 'Machine Order tildelt',
    'machine_order_reference', jsonb_build_object('old', null, 'new', legacy_warranty_reference),
    'machine_order_source', 'portal_assigned'
  )
from assigned;

-- All ordering happens here, before the page slice is taken. IDs use their
-- numeric component and dates use their native value, never formatted text.
create or replace function public.machine_registry_page_scoped(
  p_allowed_dealers text[] default null, p_query text default null, p_dealer text default null,
  p_model text default null, p_warranty_type text default 'all', p_health text default 'all',
  p_warranty_match text default 'all', p_demo_only boolean default false,
  p_date_from date default null, p_date_to date default null, p_sort text default 'activity',
  p_direction text default 'desc', p_limit integer default 50, p_offset integer default 0
) returns jsonb language sql security invoker set search_path = public as $$
with legacy_commercial as (
  select distinct on (upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')))
    upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) normalized_serial,
    wr.legacy_warranty_reference machine_order_number, wr.legacy_erp_order_number erp_order_number,
    wr.legacy_invoice_number invoice_number, wr.legacy_revenue revenue, wr.legacy_cost_amount cost_amount,
    wr.legacy_contribution_margin_amount contribution_margin_amount,
    wr.legacy_gross_sales_price gross_sales_price, wr.legacy_discount_amount discount_amount,
    wr.legacy_discount_percent discount_percent
  from public.warranty_registrations wr
  where wr.source = 'legacy_machine_import'
  order by upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')), wr.updated_at desc
), canonical as (
  select distinct on (upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g')))
    wr.machine_serial_number serial, upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g')) normalized_serial,
    wr.machine_model, coalesce(dealer.company_name,wr.dealer_name_snapshot) dealer_name,
    wr.dealer_account_number dealer_number, wr.customer_name,
    coalesce(nullif(btrim(wr.legacy_warranty_reference), ''), lc.machine_order_number) machine_order_number,
    lc.erp_order_number,
    null::text portal_order_number, lc.invoice_number, lc.revenue, lc.cost_amount, lc.contribution_margin_amount,
    lc.gross_sales_price, lc.discount_amount, lc.discount_percent, coalesce(wr.is_demo,false) is_demo,
    wr.delivery_date, wr.legacy_operating_hours operating_hours,
    coalesce(wr.legacy_last_activity_at,wr.registration_date,wr.delivery_date::timestamptz,wr.created_at) latest_activity_at,
    case when wr.source <> 'legacy_machine_import' then case when wr.sharepoint_form_id is not null then 'SP-' || wr.sharepoint_form_id::text else 'SP-' || coalesce(wr.sharepoint_item_id,left(wr.id::text,8)) end else null end warranty_id,
    case when wr.source='legacy_machine_import' then 'historical' else 'normal' end warranty_type,
    (wr.source <> 'legacy_machine_import') has_canonical_warranty,
    (wr.dealer_match_status='matched' and dealer.id is not null and coalesce(dealer.is_active,true) and not coalesce(dealer.is_deleted,false) and not coalesce(dealer.is_blocked,false)) has_active_dealer,
    importer.company_name importer_name, 0::integer open_tickets, 0::integer open_claims, 0::integer pending_tsb,
    null::integer service_days, false has_hours_regression, false has_service_partner
  from public.warranty_registrations wr
  left join legacy_commercial lc on lc.normalized_serial = upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g'))
  left join public.dealer_accounts dealer on dealer.id=wr.dealer_account_id
  left join public.dealer_accounts importer on importer.account_number=dealer.parent_account_number
  where wr.is_active_in_source=true and coalesce(wr.machine_serial_number,'')<>''
    and (not (select public.is_timan_global_warranty()) or p_allowed_dealers is null or wr.dealer_account_number=any(p_allowed_dealers))
  order by upper(regexp_replace(wr.machine_serial_number,'[^A-Za-z0-9]+','','g')),
    (wr.source<>'legacy_machine_import') desc,(wr.dealer_account_id is not null) desc,wr.delivery_date desc nulls last,wr.created_at desc
), assessed as (
  select *, case when open_claims>0 or pending_tsb>0 or service_days>365 or has_hours_regression then 'critical' when open_tickets>0 or service_days>300 or importer_name is null or not has_service_partner then 'needs_attention' else 'healthy' end health,
  case when has_canonical_warranty and has_active_dealer then 'approved' when not has_canonical_warranty and not has_active_dealer then 'missing_warranty_and_dealer' else 'needs_clarification' end warranty_match_status,
  case when has_canonical_warranty and has_active_dealer then 'approved' when has_canonical_warranty then 'missing_active_dealer' when has_active_dealer then 'missing_warranty_registration' else 'missing_warranty_and_active_dealer' end warranty_match_detail
  from canonical
), base_filtered as (
  select * from assessed where
    (nullif(trim(p_query),'') is null or serial ilike '%'||trim(p_query)||'%' or coalesce(warranty_id,'') ilike '%'||trim(p_query)||'%' or coalesce(machine_order_number,'') ilike '%'||trim(p_query)||'%' or coalesce(erp_order_number,'') ilike '%'||trim(p_query)||'%' or coalesce(invoice_number,'') ilike '%'||trim(p_query)||'%' or coalesce(portal_order_number,'') ilike '%'||trim(p_query)||'%' or machine_model ilike '%'||trim(p_query)||'%')
    and (nullif(trim(p_dealer),'') is null or dealer_number ilike '%'||trim(p_dealer)||'%' or dealer_name ilike '%'||trim(p_dealer)||'%')
    and (nullif(trim(p_model),'') is null or machine_model=p_model)
    and (coalesce(p_warranty_type,'all')='all' or warranty_type=p_warranty_type)
    and (not coalesce(p_demo_only,false) or is_demo)
    and (p_date_from is null or delivery_date>=p_date_from) and (p_date_to is null or delivery_date<=p_date_to)
), counts as (
  select count(*)::integer scope_total,count(*) filter(where health='healthy')::integer healthy,count(*) filter(where health='needs_attention')::integer needs_attention,count(*) filter(where health='critical')::integer critical,count(*) filter(where warranty_type='normal')::integer normal,count(*) filter(where warranty_type='historical')::integer historical,count(*) filter(where warranty_match_status='approved')::integer approved,count(*) filter(where warranty_match_status='needs_clarification')::integer needs_clarification,count(*) filter(where warranty_match_status='missing_warranty_and_dealer')::integer missing_warranty_and_dealer from base_filtered
), filtered as (
  select * from base_filtered where (coalesce(p_health,'all')='all' or health=p_health) and (coalesce(p_warranty_match,'all')='all' or warranty_match_status=p_warranty_match)
), ordered as (
  select *,count(*) over()::integer filtered_total,row_number() over(order by
    case when p_sort='warrantyId' and p_direction='asc' then nullif(regexp_replace(warranty_id, '[^0-9]', '', 'g'), '')::bigint end asc nulls last, case when p_sort='warrantyId' and p_direction='desc' then nullif(regexp_replace(warranty_id, '[^0-9]', '', 'g'), '')::bigint end desc nulls last,
    case when p_sort='machineOrder' and p_direction='asc' then nullif(regexp_replace(machine_order_number, '[^0-9]', '', 'g'), '')::bigint end asc nulls last, case when p_sort='machineOrder' and p_direction='desc' then nullif(regexp_replace(machine_order_number, '[^0-9]', '', 'g'), '')::bigint end desc nulls last,
    case when p_sort='erpOrder' and p_direction='asc' and erp_order_number ~ '^[0-9]+$' then erp_order_number::bigint end asc nulls last, case when p_sort='erpOrder' and p_direction='desc' and erp_order_number ~ '^[0-9]+$' then erp_order_number::bigint end desc nulls last,
    case when p_sort='invoice' and p_direction='asc' and invoice_number ~ '^[0-9]+$' then invoice_number::bigint end asc nulls last, case when p_sort='invoice' and p_direction='desc' and invoice_number ~ '^[0-9]+$' then invoice_number::bigint end desc nulls last,
    case when p_sort='portalOrder' and p_direction='asc' and portal_order_number ~ '^[0-9]+$' then portal_order_number::bigint end asc nulls last, case when p_sort='portalOrder' and p_direction='desc' and portal_order_number ~ '^[0-9]+$' then portal_order_number::bigint end desc nulls last,
    case when p_sort='serial' and p_direction='asc' then normalized_serial end asc nulls last, case when p_sort='serial' and p_direction='desc' then normalized_serial end desc nulls last,
    case when p_sort='model' and p_direction='asc' then lower(machine_model) end asc nulls last, case when p_sort='model' and p_direction='desc' then lower(machine_model) end desc nulls last,
    case when p_sort='dealer' and p_direction='asc' then lower(dealer_name) end asc nulls last, case when p_sort='dealer' and p_direction='desc' then lower(dealer_name) end desc nulls last,
    case when p_sort='delivery' and p_direction='asc' then delivery_date end asc nulls last, case when p_sort='delivery' and p_direction='desc' then delivery_date end desc nulls last,
    case when p_sort='hours' and p_direction='asc' then operating_hours end asc nulls last, case when p_sort='hours' and p_direction='desc' then operating_hours end desc nulls last,
    case when p_sort='activity' and p_direction='asc' then latest_activity_at end asc nulls last, case when p_sort='activity' and p_direction='desc' then latest_activity_at end desc nulls last,
    case when p_sort='customer' and p_direction='asc' then lower(customer_name) end asc nulls last, case when p_sort='customer' and p_direction='desc' then lower(customer_name) end desc nulls last,
    case when p_sort='status' and p_direction='asc' then warranty_match_status end asc nulls last, case when p_sort='status' and p_direction='desc' then warranty_match_status end desc nulls last,
    case when p_sort='lifecycle' and p_direction='asc' then is_demo end asc nulls last, case when p_sort='lifecycle' and p_direction='desc' then is_demo end desc nulls last,
    case when p_sort='revenue' and p_direction='asc' then revenue end asc nulls last, case when p_sort='revenue' and p_direction='desc' then revenue end desc nulls last,
    case when p_sort='cost' and p_direction='asc' then cost_amount end asc nulls last, case when p_sort='cost' and p_direction='desc' then cost_amount end desc nulls last,
    case when p_sort='margin' and p_direction='asc' then contribution_margin_amount end asc nulls last, case when p_sort='margin' and p_direction='desc' then contribution_margin_amount end desc nulls last,
    case when p_sort='marginPercent' and p_direction='asc' then contribution_margin_amount / nullif(revenue,0) end asc nulls last, case when p_sort='marginPercent' and p_direction='desc' then contribution_margin_amount / nullif(revenue,0) end desc nulls last,
    normalized_serial asc) ordinal from filtered
), page as (
  select * from ordered where ordinal>greatest(0,coalesce(p_offset,0)) and ordinal<=greatest(0,coalesce(p_offset,0))+greatest(1,least(coalesce(p_limit,50),2000))
)
select jsonb_build_object('total',coalesce((select max(filtered_total) from ordered),0),'scopeTotal',(select scope_total from counts),'normal',(select normal from counts),'historical',(select historical from counts),'healthy',(select healthy from counts),'needsAttention',(select needs_attention from counts),'critical',(select critical from counts),'approved',(select approved from counts),'needsClarification',(select needs_clarification from counts),'missingWarrantyAndDealer',(select missing_warranty_and_dealer from counts),'rows',coalesce((select jsonb_agg(jsonb_build_object('serial',serial,'normalizedSerial',normalized_serial,'machineModel',machine_model,'dealerName',dealer_name,'dealerNumber',dealer_number,'customerName',customer_name,'machineOrderNumber',machine_order_number,'erpOrderNumber',erp_order_number,'portalOrderNumber',portal_order_number,'invoiceNumber',invoice_number,'revenue',revenue,'costAmount',cost_amount,'contributionMarginAmount',contribution_margin_amount,'grossSalesPrice',gross_sales_price,'discountAmount',discount_amount,'discountPercent',discount_percent,'isDemo',is_demo,'deliveryDate',delivery_date,'operatingHours',operating_hours,'latestActivityDate',latest_activity_at,'warrantyId',warranty_id,'warrantyType',warranty_type,'health',health,'warrantyMatchStatus',warranty_match_status,'warrantyMatchDetail',warranty_match_detail,'openTickets',open_tickets,'openClaims',open_claims,'openTsb',pending_tsb) order by ordinal) from page),'[]'::jsonb));
$$;

revoke all on function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer) from public;
grant execute on function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer) to authenticated;
