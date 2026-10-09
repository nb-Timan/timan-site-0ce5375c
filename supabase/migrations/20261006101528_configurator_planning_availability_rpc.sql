-- Configurator receives only aggregate Planning availability. The underlying
-- Planning tables remain protected by their existing RLS policies and grants.
create or replace function public.can_access_configurator_planning_availability()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users actor
    where (select auth.uid()) is not null
      and actor.auth_user_id = (select auth.uid())
      and actor.approved is true
      and actor.is_active is true
      and (
        actor.portal_role::text in ('timan_backend', 'timan_seller', 'timan_service')
        or btrim(coalesce(actor.dealer_number, '')) = '100'
      )
  );
$$;

revoke all on function public.can_access_configurator_planning_availability() from public, anon;
grant execute on function public.can_access_configurator_planning_availability() to authenticated;

create or replace function public.planning_get_configurator_availability(
  p_sku text,
  p_requested_date date default null,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sku text := btrim(coalesce(p_sku, ''));
  v_requested_date date := coalesce(p_requested_date, current_date);
  v_has_fresh_source boolean := false;
  v_total_qty integer := 0;
  v_free_stock_qty integer := 0;
  v_free_by_date integer := 0;
  v_soft_by_date integer := 0;
  v_next_incoming_date date;
  v_next_incoming_qty integer := 0;
  v_availability_status text := 'unknown';
begin
  if not public.can_access_configurator_planning_availability() then
    raise exception using errcode = '42501', message = 'CONFIGURATOR_AVAILABILITY_ACCESS_DENIED';
  end if;

  if v_sku = '' or length(v_sku) > 64
    or p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception using errcode = '23514', message = 'CONFIGURATOR_AVAILABILITY_INVALID_REQUEST';
  end if;

  select exists (
    select 1
    from public.planning_supply_sources source
    where source.connected
      and source.last_synced_at is not null
      and source.last_synced_at <= pg_catalog.now()
      and source.last_synced_at
        + source.freshness_limit_hours * interval '1 hour' >= pg_catalog.now()
  ) into v_has_fresh_source;

  if v_has_fresh_source then
    with serialized_capacity as (
      select
        1::integer as total_qty,
        unit.supply_status,
        coalesce(
          unit.available_at,
          case when unit.supply_status = 'available' then current_date end
        ) as ready_date,
        case when active_reservation.is_reserved then 0 else 1 end as free_qty,
        case when active_reservation.has_soft_quote then 1 else 0 end as soft_qty
      from public.planning_supply_units unit
      join public.planning_supply_sources source
        on source.source_system = unit.source_system
      left join lateral (
        select
          coalesce(bool_or(reservation.status = 'active'), false) as is_reserved,
          coalesce(bool_or(
            reservation.status = 'active'
            and reservation.reservation_type = 'soft_quote'
          ), false) as has_soft_quote
        from public.planning_reservations reservation
        where reservation.supply_unit_id = unit.id
      ) active_reservation on true
      where unit.item_number = v_sku
        and unit.supply_status in ('available', 'incoming', 'in_production')
        and source.connected
        and source.last_synced_at is not null
        and source.last_synced_at <= pg_catalog.now()
        and source.last_synced_at
          + source.freshness_limit_hours * interval '1 hour' >= pg_catalog.now()
    ),
    lot_capacity as (
      select
        lot.quantity as total_qty,
        lot.supply_status,
        coalesce(
          lot.available_at,
          case when lot.supply_status = 'available' then current_date end
        ) as ready_date,
        greatest(0, lot.quantity - active_reservation.reserved_qty)::integer as free_qty,
        least(lot.quantity, active_reservation.soft_quote_qty)::integer as soft_qty
      from public.planning_supply_lots lot
      join public.planning_supply_sources source
        on source.source_system = lot.source_system
      left join lateral (
        select
          coalesce(sum(reservation.quantity) filter (where reservation.status = 'active'), 0)::integer
            as reserved_qty,
          coalesce(sum(reservation.quantity) filter (
            where reservation.status = 'active'
              and reservation.reservation_type = 'soft_quote'
          ), 0)::integer as soft_quote_qty
        from public.planning_reservations reservation
        where reservation.supply_lot_id = lot.id
      ) active_reservation on true
      where lot.item_number = v_sku
        and lot.quantity > 0
        and lot.supply_status in ('available', 'incoming', 'in_production')
        and source.connected
        and source.last_synced_at is not null
        and source.last_synced_at <= pg_catalog.now()
        and source.last_synced_at
          + source.freshness_limit_hours * interval '1 hour' >= pg_catalog.now()
    ),
    capacity as (
      select * from serialized_capacity
      union all
      select * from lot_capacity
    ),
    aggregate_capacity as (
      select
        coalesce(sum(total_qty), 0)::integer as total_qty,
        coalesce(sum(free_qty) filter (
          where supply_status = 'available' and ready_date <= current_date
        ), 0)::integer as free_stock_qty,
        coalesce(sum(free_qty) filter (where ready_date <= v_requested_date), 0)::integer
          as free_by_date,
        coalesce(sum(soft_qty) filter (where ready_date <= v_requested_date), 0)::integer
          as soft_by_date,
        min(ready_date) filter (
          where ready_date > current_date and free_qty > 0
        ) as next_incoming_date
      from capacity
    )
    select
      aggregate_capacity.total_qty,
      aggregate_capacity.free_stock_qty,
      aggregate_capacity.free_by_date,
      aggregate_capacity.soft_by_date,
      aggregate_capacity.next_incoming_date,
      coalesce((
        select sum(capacity.free_qty)::integer
        from capacity
        where capacity.ready_date = aggregate_capacity.next_incoming_date
      ), 0)
    into
      v_total_qty,
      v_free_stock_qty,
      v_free_by_date,
      v_soft_by_date,
      v_next_incoming_date,
      v_next_incoming_qty
    from aggregate_capacity;
  end if;

  if not v_has_fresh_source or v_total_qty = 0 then
    v_availability_status := 'unknown';
  elsif v_free_stock_qty >= p_quantity then
    v_availability_status := 'green';
  elsif v_free_by_date + v_soft_by_date >= p_quantity then
    v_availability_status := 'yellow';
  else
    v_availability_status := 'red';
  end if;

  return pg_catalog.jsonb_build_object(
    'sku', v_sku,
    'free_stock_qty', v_free_stock_qty,
    'next_incoming_date', v_next_incoming_date,
    'next_incoming_qty', v_next_incoming_qty,
    'availability_status', v_availability_status
  );
end;
$$;

revoke all on function public.planning_get_configurator_availability(text, date, integer)
  from public, anon;
grant execute on function public.planning_get_configurator_availability(text, date, integer)
  to authenticated;

comment on function public.planning_get_configurator_availability(text, date, integer) is
  'Read-only aggregate Configurator availability; never exposes serials, reservations, orders, customers or dealer relations.';
