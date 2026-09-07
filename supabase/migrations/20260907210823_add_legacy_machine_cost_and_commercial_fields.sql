-- Documented sales values. The three pricing/discount fields deliberately stay
-- NULL until an authoritative gross-price source is imported.
alter table public.warranty_registrations
  add column if not exists legacy_cost_amount numeric,
  add column if not exists legacy_gross_sales_price numeric,
  add column if not exists legacy_discount_amount numeric,
  add column if not exists legacy_discount_percent numeric;

create or replace function public.enrich_legacy_machine_sales(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_serial_key text;
  v_updated integer := 0;
  v_unmatched integer := 0;
begin
  if not public.is_timan_global_warranty() then
    raise exception 'Not authorized to enrich historic machine sales data';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Sales enrichment requires at least one row';
  end if;
  if jsonb_array_length(p_rows) > 5000 then
    raise exception 'Sales enrichment may contain at most 5000 rows';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_serial_key := upper(regexp_replace(coalesce(v_row ->> 'serial', ''), '[^A-Za-z0-9]+', '', 'g'));
    if v_serial_key = '' then
      v_unmatched := v_unmatched + 1;
      continue;
    end if;

    update public.warranty_registrations wr
    set
      legacy_warranty_reference = coalesce(nullif(trim(v_row ->> 'machineOrderNumber'), ''), wr.legacy_warranty_reference),
      legacy_erp_order_number = coalesce(nullif(trim(v_row ->> 'erpOrderNumber'), ''), wr.legacy_erp_order_number),
      legacy_invoice_number = coalesce(nullif(trim(v_row ->> 'invoiceNumber'), ''), wr.legacy_invoice_number),
      legacy_revenue = coalesce(nullif(trim(v_row ->> 'revenue'), '')::numeric, wr.legacy_revenue),
      legacy_cost_amount = coalesce(nullif(trim(v_row ->> 'costAmount'), '')::numeric, wr.legacy_cost_amount),
      legacy_contribution_margin_amount = coalesce(nullif(trim(v_row ->> 'contributionMarginAmount'), '')::numeric, wr.legacy_contribution_margin_amount),
      legacy_sales_updated_at = now()
    where wr.source = 'legacy_machine_import'
      and upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) = v_serial_key;

    if found then v_updated := v_updated + 1; else v_unmatched := v_unmatched + 1; end if;
  end loop;

  return jsonb_build_object('updated', v_updated, 'unmatched', v_unmatched);
end;
$$;

revoke execute on function public.enrich_legacy_machine_sales(jsonb) from anon;
revoke execute on function public.enrich_legacy_machine_sales(jsonb) from public;
grant execute on function public.enrich_legacy_machine_sales(jsonb) to authenticated;

-- Keep the established scoped function as the authorization gate. This wrapper
-- only adds commercial fields to its already RLS-filtered canonical rows.
alter function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer)
  rename to machine_registry_page_scoped_base;

create function public.machine_registry_page_scoped(
  p_allowed_dealers text[] default null, p_query text default null, p_dealer text default null,
  p_model text default null, p_warranty_type text default 'all', p_health text default 'all',
  p_warranty_match text default 'all', p_demo_only boolean default false,
  p_date_from date default null, p_date_to date default null, p_sort text default 'activity',
  p_direction text default 'desc', p_limit integer default 50, p_offset integer default 0
) returns jsonb language sql security invoker set search_path = public as $$
with registry as (
  select public.machine_registry_page_scoped_base(
    p_allowed_dealers, p_query, p_dealer, p_model, p_warranty_type, p_health,
    p_warranty_match, p_demo_only, p_date_from, p_date_to, p_sort, p_direction, p_limit, p_offset
  ) page
), commercial as (
  select distinct on (upper(regexp_replace(machine_serial_number, '[^A-Za-z0-9]+', '', 'g')))
    upper(regexp_replace(machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) normalized_serial,
    legacy_cost_amount, legacy_gross_sales_price, legacy_discount_amount, legacy_discount_percent
  from public.warranty_registrations
  where source = 'legacy_machine_import'
  order by upper(regexp_replace(machine_serial_number, '[^A-Za-z0-9]+', '', 'g')), updated_at desc
), enriched_rows as (
  select jsonb_agg(
    row_data || jsonb_build_object(
      'costAmount', commercial.legacy_cost_amount,
      'grossSalesPrice', commercial.legacy_gross_sales_price,
      'discountAmount', commercial.legacy_discount_amount,
      'discountPercent', commercial.legacy_discount_percent
    )
  ) rows
  from registry
  cross join lateral jsonb_array_elements(registry.page -> 'rows') row_data
  left join commercial on commercial.normalized_serial = row_data ->> 'normalizedSerial'
)
select jsonb_set(registry.page, '{rows}', coalesce(enriched_rows.rows, '[]'::jsonb))
from registry cross join enriched_rows;
$$;

revoke all on function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer) from public;
grant execute on function public.machine_registry_page_scoped(text[],text,text,text,text,text,text,boolean,date,date,text,text,integer,integer) to authenticated;
