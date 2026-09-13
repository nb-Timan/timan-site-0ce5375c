alter table public.warranty_registrations add column if not exists machine_order_source text;

create unique index if not exists warranty_registrations_active_machine_order_unique
on public.warranty_registrations (legacy_warranty_reference)
where is_active_in_source and legacy_warranty_reference is not null and btrim(legacy_warranty_reference) <> '';

update public.warranty_registrations
set machine_order_source = 'legacy_import'
where source = 'legacy_machine_import' and is_active_in_source
  and nullif(btrim(legacy_warranty_reference), '') is not null
  and machine_order_source is null;

with max_mo as (
  select coalesce(max((regexp_match(legacy_warranty_reference, '^MO-([0-9]+)$'))[1]::bigint), 0) suffix
  from public.warranty_registrations
  where is_active_in_source and legacy_warranty_reference ~ '^MO-[0-9]+$'
), targets as (
  select distinct on (upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')))
    wr.id, to_jsonb(wr) before_snapshot,
    upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')) normalized_serial
  from public.warranty_registrations wr
  where wr.is_active_in_source and wr.source <> 'legacy_machine_import'
    and coalesce(wr.machine_serial_number, '') <> ''
    and nullif(btrim(wr.legacy_warranty_reference), '') is null
  order by upper(regexp_replace(wr.machine_serial_number, '[^A-Za-z0-9]+', '', 'g')),
    (wr.dealer_account_id is not null) desc, wr.delivery_date desc nulls last, wr.created_at desc, wr.id
), assignments as (
  select id, before_snapshot,
    (select suffix from max_mo) + row_number() over (order by normalized_serial) suffix
  from targets
), updated as (
  update public.warranty_registrations wr
  set legacy_warranty_reference = 'MO-' || assignments.suffix::text,
      machine_order_source = 'portal_assigned',
      updated_at = now()
  from assignments where wr.id = assignments.id
  returning wr.id, assignments.before_snapshot, wr.legacy_warranty_reference
)
insert into public.warranty_registration_history (registration_id, change_source, snapshot, diff)
select id, 'machine_order_backfill', before_snapshot,
  jsonb_build_object('event', 'Machine Order tildelt',
    'machine_order_reference', jsonb_build_object('old', null, 'new', legacy_warranty_reference),
    'machine_order_source', 'portal_assigned')
from updated;

do $$
declare v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'machine_registry_page_scoped'
    and pg_get_function_identity_arguments(p.oid) =
      'p_allowed_dealers text[], p_query text, p_dealer text, p_model text, p_warranty_type text, p_health text, p_warranty_match text, p_demo_only boolean, p_date_from date, p_date_to date, p_sort text, p_direction text, p_limit integer, p_offset integer';

  if v_definition is null or position('lc.machine_order_number' in v_definition) = 0 then
    raise exception 'machine registry function did not contain the expected machine order resolution';
  end if;

  execute replace(
    v_definition,
    'lc.machine_order_number',
    'coalesce(nullif(btrim(wr.legacy_warranty_reference), ''''), lc.machine_order_number) machine_order_number'
  );
end
$$;;
