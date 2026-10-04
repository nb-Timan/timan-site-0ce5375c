-- One physical unit can have several source records. A linked source record
-- never becomes a second physical unit, and field provenance stays separate.
create table public.planning_supply_unit_records (
  supply_unit_id uuid not null references public.planning_supply_units(id) on delete restrict,
  source_system text not null references public.planning_supply_sources(source_system),
  source_record_key text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (source_system, source_record_key)
);
create index planning_supply_unit_records_unit_idx
  on public.planning_supply_unit_records (supply_unit_id);
alter table public.planning_supply_unit_records enable row level security;
revoke all on public.planning_supply_unit_records from public, anon, authenticated;
grant all on public.planning_supply_unit_records to service_role;

-- A trusted source adapter calls this with one row at a time. It must mark
-- planning_supply_sources fresh only after its complete batch succeeds.
create or replace function public.planning_ingest_supply_unit(
  p_source_system text,
  p_source_record_key text,
  p_item_number text,
  p_serial_number text,
  p_supply_status text,
  p_source_updated_at timestamptz,
  p_fields jsonb default '{}'::jsonb
)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_unit public.planning_supply_units%rowtype;
  v_source public.planning_supply_unit_field_sources%rowtype;
  v_field text;
  v_incoming text;
  v_current text;
  v_cast text;
  v_values jsonb;
  v_updated boolean := false;
begin
  if p_source_system is null or btrim(p_source_system) = ''
    or p_source_record_key is null or btrim(p_source_record_key) = ''
    or p_item_number is null or btrim(p_item_number) = ''
    or p_supply_status not in ('available', 'incoming', 'in_production',
      'blocked', 'demo', 'unavailable')
    or p_source_updated_at is null or p_source_updated_at > now() then
    raise exception using errcode = '23514', message = 'PLANNING_INVALID_SOURCE_RECORD';
  end if;
  if not exists (select 1 from public.planning_supply_sources
    where source_system = p_source_system) then
    raise exception using errcode = '23503', message = 'PLANNING_SOURCE_NOT_REGISTERED';
  end if;
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    raise exception using errcode = '23514', message = 'PLANNING_INVALID_SOURCE_FIELDS';
  end if;
  v_values := p_fields || pg_catalog.jsonb_build_object(
    'item_number', btrim(p_item_number),
    'serial_number', nullif(btrim(coalesce(p_serial_number, '')), ''),
    'supply_status', p_supply_status);
  for v_field in select key from pg_catalog.jsonb_each(v_values)
  loop
    if v_field not in (
      'item_number', 'serial_number', 'supply_status',
      'machine_ident_number', 'production_reference', 'production_order_number',
      'sales_order_number', 'slot_number', 'production_completed_at',
      'production_completed_week', 'production_completed_year',
      'first_planned_delivery_date', 'current_planned_delivery_date',
      'confirmed_customer_delivery_date', 'source_status',
      'responsible_initials', 'production_notes', 'available_at',
      'expected_delivery_at', 'warehouse_location', 'dealer_account_id',
      'customer_name', 'source_comment') then
      raise exception using errcode = '23514', message = 'PLANNING_UNSUPPORTED_SOURCE_FIELD';
    end if;
  end loop;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'planning-record:' || p_source_system || ':' || p_source_record_key, 0));
  if nullif(btrim(coalesce(p_serial_number, '')), '') is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'planning-serial:' || upper(btrim(p_serial_number)), 0));
  end if;
  select u.* into v_unit from public.planning_supply_units u
  join public.planning_supply_unit_records r on r.supply_unit_id = u.id
  where r.source_system = p_source_system and r.source_record_key = p_source_record_key
  for update of u;
  if not found and nullif(btrim(coalesce(p_serial_number, '')), '') is not null then
    select * into v_unit from public.planning_supply_units
    where upper(serial_number) = upper(btrim(p_serial_number))
    order by source_updated_at desc, id limit 1 for update;
  end if;
  if found and v_unit.item_number <> btrim(p_item_number) then
    insert into public.planning_supply_conflicts
      (supply_unit_id, field_name, existing_value, incoming_value,
        existing_source_system, incoming_source_system)
    values (v_unit.id, 'item_number', v_unit.item_number, btrim(p_item_number),
      v_unit.source_system, p_source_system)
    on conflict (supply_unit_id, field_name) where status = 'open'
    do nothing;
    return v_unit.id;
  end if;
  if not found then
    insert into public.planning_supply_units
      (source_system, source_record_key, item_number, serial_number,
        supply_status, source_updated_at)
    values (p_source_system, p_source_record_key, btrim(p_item_number),
      nullif(btrim(coalesce(p_serial_number, '')), ''), p_supply_status,
      p_source_updated_at)
    returning * into v_unit;
  end if;
  insert into public.planning_supply_unit_records
    (supply_unit_id, source_system, source_record_key)
  values (v_unit.id, p_source_system, p_source_record_key)
  on conflict (source_system, source_record_key)
  do update set last_seen_at = now();

  for v_field, v_incoming in
    select key, nullif(btrim(value), '')
    from pg_catalog.jsonb_each_text(v_values)
  loop
    if v_incoming is null then continue; end if;
    v_current := to_jsonb(v_unit) ->> v_field;
    select * into v_source from public.planning_supply_unit_field_sources
    where supply_unit_id = v_unit.id and field_name = v_field for update;
    if nullif(btrim(coalesce(v_current, '')), '') is not null
      and v_current <> v_incoming
      and coalesce(v_source.source_system, v_unit.source_system) <> p_source_system then
      insert into public.planning_supply_conflicts
        (supply_unit_id, field_name, existing_value, incoming_value,
          existing_source_system, incoming_source_system)
      values (v_unit.id, v_field, v_current, v_incoming,
        coalesce(v_source.source_system, v_unit.source_system), p_source_system)
      on conflict (supply_unit_id, field_name) where status = 'open'
      do nothing;
      continue;
    end if;
    if v_current = v_incoming
      and coalesce(v_source.source_system, v_unit.source_system) <> p_source_system then
      continue;
    end if;
    if coalesce(v_source.source_updated_at, v_unit.source_updated_at) > p_source_updated_at
      and coalesce(v_source.source_system, v_unit.source_system) = p_source_system then
      continue;
    end if;
    if v_current is distinct from v_incoming then
      if v_field in ('production_completed_at', 'first_planned_delivery_date',
        'current_planned_delivery_date', 'confirmed_customer_delivery_date',
        'available_at', 'expected_delivery_at') then
        v_cast := 'date';
      elsif v_field in ('production_completed_week', 'production_completed_year') then
        v_cast := 'smallint';
      elsif v_field = 'dealer_account_id' then
        v_cast := 'uuid';
      else
        v_cast := 'text';
      end if;
      execute pg_catalog.format(
        'update public.planning_supply_units set %I = $1::%s where id = $2',
        v_field, v_cast) using v_incoming, v_unit.id;
      v_updated := true;
    end if;
    insert into public.planning_supply_unit_field_sources
      (supply_unit_id, field_name, source_system, source_record_key, source_updated_at)
    values (v_unit.id, v_field, p_source_system, p_source_record_key, p_source_updated_at)
    on conflict (supply_unit_id, field_name) do update
    set source_system = excluded.source_system,
      source_record_key = excluded.source_record_key,
      source_updated_at = excluded.source_updated_at;
  end loop;
  if v_updated then
    update public.planning_supply_units
    set source_updated_at = greatest(source_updated_at, p_source_updated_at),
      ingested_at = now()
    where id = v_unit.id;
  end if;
  return v_unit.id;
end;
$$;
revoke all on function public.planning_ingest_supply_unit(
  text,text,text,text,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.planning_ingest_supply_unit(
  text,text,text,text,text,timestamptz,jsonb) to service_role;

-- Personal/commercial source fields are exposed only to an internal Backend
-- planner on a specific unit. The broad supply list keeps its column grants.
create or replace function public.planning_get_unit_private_details(p_unit_id uuid)
returns table (
  dealer_name text,
  customer_name text,
  source_comment text,
  production_notes text,
  responsible_initials text
)
language sql stable security definer set search_path = ''
as $$
  select d.company_name, u.customer_name, u.source_comment,
    u.production_notes, u.responsible_initials
  from public.planning_supply_units u
  left join public.dealer_accounts d on d.id = u.dealer_account_id
  where u.id = p_unit_id
    and public.can_access_planning()
    and exists (
      select 1 from public.app_users a
      where a.auth_user_id = auth.uid()
        and a.portal_role::text = 'timan_backend'
        and a.approved is true and a.is_active is true
    );
$$;
revoke all on function public.planning_get_unit_private_details(uuid) from public, anon;
grant execute on function public.planning_get_unit_private_details(uuid) to authenticated;

create or replace function public.planning_search_private_units(p_query text)
returns table (unit_id uuid)
language sql stable security definer set search_path = ''
as $$
  select u.id
  from public.planning_supply_units u
  left join public.dealer_accounts d on d.id = u.dealer_account_id
  where length(btrim(coalesce(p_query, ''))) >= 2
    and public.can_access_planning()
    and exists (
      select 1 from public.app_users a
      where a.auth_user_id = auth.uid()
        and a.portal_role::text = 'timan_backend'
        and a.approved is true and a.is_active is true
    )
    and (d.company_name ilike '%' || btrim(p_query) || '%'
      or u.customer_name ilike '%' || btrim(p_query) || '%')
  order by u.id
  limit 500;
$$;
revoke all on function public.planning_search_private_units(text) from public, anon;
grant execute on function public.planning_search_private_units(text) to authenticated;
