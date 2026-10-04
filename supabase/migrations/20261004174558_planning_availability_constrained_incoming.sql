-- Eligible incoming capacity can satisfy demand, but is constrained (yellow).
-- Only clean, unreserved supply already available today is green.
create or replace function public.planning_get_availability(
  p_item_number text, p_requested_date date, p_quantity integer default 1
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_date date := coalesce(p_requested_date, current_date);
  v_stock integer := 0;
  v_incoming integer := 0;
  v_free_by_date integer := 0;
  v_clean_now integer := 0;
  v_soft_by_date integer := 0;
  v_later integer := 0;
  v_serial_rows integer := 0;
  v_lot_rows integer := 0;
  v_lot_stock integer := 0;
  v_lot_incoming integer := 0;
  v_lot_free integer := 0;
  v_lot_clean integer := 0;
  v_lot_soft integer := 0;
  v_lot_later integer := 0;
  v_next_serial date;
  v_next_lot date;
  v_source_state text;
  v_status text;
begin
  if not public.can_access_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if nullif(btrim(coalesce(p_item_number, '')), '') is null
    or p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception using errcode = '23514', message = 'PLANNING_INVALID_AVAILABILITY_REQUEST';
  end if;
  if not exists (select 1 from public.planning_supply_sources where connected) then
    v_source_state := 'missing';
  elsif not exists (
    select 1 from public.planning_supply_sources
    where connected and last_synced_at is not null
      and last_synced_at <= now()
      and last_synced_at + freshness_limit_hours * interval '1 hour' >= now()
  ) then
    v_source_state := 'stale';
  else
    v_source_state := 'fresh';
  end if;
  if v_source_state = 'fresh' then
    with serialized as (
      select u.supply_status,
        coalesce(u.available_at,
          case when u.supply_status = 'available' then current_date end) as ready_date,
        r.reservation_type
      from public.planning_supply_units u
      join public.planning_supply_sources s on s.source_system = u.source_system
      left join public.planning_reservations r
        on r.supply_unit_id = u.id and r.status = 'active'
      where u.item_number = p_item_number and u.serial_number is not null
        and u.supply_status in ('available', 'incoming', 'in_production')
        and s.connected and s.last_synced_at is not null
        and s.last_synced_at <= now()
        and s.last_synced_at + s.freshness_limit_hours * interval '1 hour' >= now()
    )
    select count(*)::integer,
      count(*) filter (where supply_status = 'available'
        and ready_date <= current_date)::integer,
      count(*) filter (where supply_status in ('incoming', 'in_production'))::integer,
      count(*) filter (where ready_date <= v_date and reservation_type is null)::integer,
      count(*) filter (where supply_status = 'available'
        and ready_date <= current_date and reservation_type is null)::integer,
      count(*) filter (where ready_date <= v_date
        and reservation_type = 'soft_quote')::integer,
      count(*) filter (where ready_date > v_date and ready_date <= v_date + 90
        and reservation_type is null)::integer,
      min(ready_date) filter (where reservation_type is null)
    into v_serial_rows, v_stock, v_incoming, v_free_by_date, v_clean_now,
      v_soft_by_date, v_later, v_next_serial
    from serialized;

    with lots as (
      select l.quantity, l.supply_status,
        coalesce(l.available_at,
          case when l.supply_status = 'available' then current_date end) as ready_date,
        greatest(0, l.quantity - occupied.total) as free_quantity,
        occupied.soft as soft_quantity
      from public.planning_supply_lots l
      join public.planning_supply_sources s on s.source_system = l.source_system
      left join lateral (
        select count(*)::integer as total,
          count(*) filter (where r.reservation_type = 'soft_quote')::integer as soft
        from public.planning_reservations r
        where r.supply_lot_id = l.id and r.status = 'active'
      ) occupied on true
      where l.item_number = p_item_number and l.quantity > 0
        and l.supply_status in ('available', 'incoming', 'in_production')
        and s.connected and s.last_synced_at is not null
        and s.last_synced_at <= now()
        and s.last_synced_at + s.freshness_limit_hours * interval '1 hour' >= now()
    )
    select count(*)::integer,
      coalesce(sum(quantity) filter (where supply_status = 'available'
        and ready_date <= current_date), 0)::integer,
      coalesce(sum(quantity) filter (where supply_status in ('incoming', 'in_production')), 0)::integer,
      coalesce(sum(free_quantity) filter (where ready_date <= v_date), 0)::integer,
      coalesce(sum(free_quantity) filter (where supply_status = 'available'
        and ready_date <= current_date), 0)::integer,
      coalesce(sum(soft_quantity) filter (where ready_date <= v_date), 0)::integer,
      coalesce(sum(free_quantity) filter (where ready_date > v_date
        and ready_date <= v_date + 90), 0)::integer,
      min(ready_date) filter (where free_quantity > 0)
    into v_lot_rows, v_lot_stock, v_lot_incoming, v_lot_free, v_lot_clean,
      v_lot_soft, v_lot_later, v_next_lot
    from lots;
    v_stock := v_stock + v_lot_stock;
    v_incoming := v_incoming + v_lot_incoming;
    v_free_by_date := v_free_by_date + v_lot_free;
    v_clean_now := v_clean_now + v_lot_clean;
    v_soft_by_date := v_soft_by_date + v_lot_soft;
    v_later := v_later + v_lot_later;
  end if;
  if v_source_state <> 'fresh' or v_serial_rows + v_lot_rows = 0 then
    v_status := 'unknown';
  elsif v_clean_now >= p_quantity then
    v_status := 'green';
  elsif v_free_by_date + v_soft_by_date >= p_quantity then
    v_status := 'yellow';
  else
    v_status := 'red';
  end if;
  return pg_catalog.jsonb_build_object(
    'status', v_status, 'source_state', v_source_state,
    'item_number', p_item_number, 'requested_date', v_date,
    'stock', v_stock, 'incoming', v_incoming,
    'free_by_date', v_free_by_date, 'soft_by_date', v_soft_by_date,
    'next_available', coalesce(least(v_next_serial, v_next_lot),
      v_next_serial, v_next_lot)
  );
end;
$$;
revoke all on function public.planning_get_availability(text,date,integer) from public, anon;
grant execute on function public.planning_get_availability(text,date,integer) to authenticated;
