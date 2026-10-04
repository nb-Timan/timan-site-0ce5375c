-- These helpers are callable only inside the guarded planning RPC/trigger.
create or replace function public.planning_pick_serial(
  p_item_number text,
  p_requested_date date,
  p_allow_soft boolean default false
)
returns uuid language sql stable security definer set search_path = ''
as $$
  select u.id
  from public.planning_supply_units u
  join public.planning_supply_sources s on s.source_system = u.source_system
  left join public.planning_reservations r
    on r.supply_unit_id = u.id and r.status = 'active'
  where u.item_number = p_item_number
    and u.serial_number is not null
    and u.supply_status in ('available', 'incoming', 'in_production')
    and (u.supply_status = 'available' or u.available_at is not null)
    and s.connected
    and s.last_synced_at + s.freshness_limit_hours * interval '1 hour' >= now()
    and (r.id is null or (p_allow_soft and r.reservation_type = 'soft_quote'))
  order by
    case when coalesce(u.available_at, case when u.supply_status = 'available' then current_date end)
      <= coalesce(p_requested_date, current_date) then 0 else 1 end,
    case when coalesce(u.available_at, current_date) <= coalesce(p_requested_date, current_date)
      then coalesce(u.available_at, current_date) end desc nulls last,
    case when coalesce(u.available_at, current_date) > coalesce(p_requested_date, current_date)
      then u.available_at end asc nulls last,
    u.source_updated_at asc, u.id
  limit 1;
$$;
revoke all on function public.planning_pick_serial(text,date,boolean) from public, anon, authenticated;

create or replace function public.planning_reflow_soft(p_item_number text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_row record;
  v_unit uuid;
begin
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, previous_supply_unit_id, reason)
  select id, configuration_id, 'soft_reflow_release', supply_unit_id, 'Automatic best-fit reflow'
  from public.planning_reservations
  where item_number = p_item_number and status = 'active'
    and reservation_type = 'soft_quote' and supply_unit_id is not null;

  update public.planning_reservations set supply_unit_id = null, assigned_at = null, updated_at = now()
  where item_number = p_item_number and status = 'active' and reservation_type = 'soft_quote';

  for v_row in
    select id, configuration_id, requested_delivery_date
    from public.planning_reservations
    where item_number = p_item_number and status = 'active' and reservation_type = 'soft_quote'
    order by requested_delivery_date nulls first, created_at, id
  loop
    v_unit := public.planning_pick_serial(p_item_number, v_row.requested_delivery_date, false);
    if v_unit is not null then
      update public.planning_reservations
      set supply_unit_id = v_unit, assigned_at = now(), updated_at = now()
      where id = v_row.id;
      insert into public.planning_events
        (reservation_id, configuration_id, event_type, next_supply_unit_id, reason)
      values (v_row.id, v_row.configuration_id, 'soft_reflow_assign', v_unit, 'Automatic best-fit reflow');
    end if;
  end loop;
end;
$$;
revoke all on function public.planning_reflow_soft(text) from public, anon, authenticated;

create or replace function public.planning_reserve_machine(
  p_configuration_id uuid,
  p_demand_key text,
  p_item_number text,
  p_requested_date date,
  p_kind text
)
returns public.planning_reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_config public.configurations%rowtype;
  v_actor public.app_users%rowtype;
  v_res public.planning_reservations%rowtype;
  v_unit uuid;
  v_previous_unit uuid;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if p_kind not in ('soft_quote', 'order') or nullif(btrim(p_demand_key), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_INVALID_DEMAND';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid()
    and approved is true and is_active is true limit 1;
  select * into v_config from public.configurations where id = p_configuration_id;
  if not found then
    raise exception using errcode = '23503', message = 'PLANNING_CONFIGURATION_NOT_FOUND';
  end if;
  if v_actor.portal_role::text <> 'timan_backend'
    and v_config.created_by_user_id is distinct from auth.uid()
    and v_config.assigned_seller_id is distinct from v_actor.id then
    raise exception using errcode = '42501', message = 'PLANNING_CONFIGURATION_OUTSIDE_SCOPE';
  end if;
  if (p_kind = 'soft_quote' and (v_config.quote_number is null
      or (v_config.order_number is not null and v_config.submitted_at is not null)))
    or (p_kind = 'order' and (v_config.order_number is null or v_config.submitted_at is null)) then
    raise exception using errcode = '23514', message = 'PLANNING_DOCUMENT_NOT_ACTIVE';
  end if;
  if not exists (
    select 1 from public.planning_machine_products m where m.item_number = p_item_number
      and exists (
        select 1 from jsonb_array_elements(coalesce(v_config.state_json -> 'machineConfigs', '[]'::jsonb)) c
        cross join lateral generate_series(
          1, least(100, greatest(1, case when c.value ->> 'qty' ~ '^[0-9]{1,3}$'
            then (c.value ->> 'qty')::integer else 1 end))
        ) unit_no
        where c.value ->> 'type' = m.machine_key
          and p_demand_key = (c.value ->> 'id') || '_' || unit_no::text
      )
  ) then
    raise exception using errcode = '23514', message = 'PLANNING_ITEM_NOT_IN_CONFIGURATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_item_number, 0));
  select * into v_res from public.planning_reservations
  where configuration_id = p_configuration_id and demand_key = p_demand_key and status = 'active'
  for update;
  if found and v_res.item_number <> p_item_number then
    raise exception using errcode = '23514', message = 'PLANNING_DEMAND_ITEM_CHANGED';
  end if;
  if found and v_res.reservation_type = 'order' and p_kind = 'soft_quote' then
    return v_res;
  end if;
  if found and v_res.reservation_type = 'locked_quote' and p_kind = 'soft_quote' then
    update public.planning_reservations
    set requested_delivery_date = p_requested_date, updated_at = now()
    where id = v_res.id returning * into v_res;
    return v_res;
  end if;
  if found and v_res.reservation_type = p_kind and v_res.requested_delivery_date is not distinct from p_requested_date then
    return v_res;
  end if;
  v_previous_unit := v_res.supply_unit_id;

  if found then
    update public.planning_reservations
    set supply_unit_id = null, reservation_type = p_kind,
      requested_delivery_date = p_requested_date, lock_reason = null,
      lock_review_date = null, assigned_at = null, updated_at = now()
    where id = v_res.id returning * into v_res;
  else
    insert into public.planning_reservations
      (configuration_id, demand_key, item_number, reservation_type, requested_delivery_date, created_by)
    values (p_configuration_id, p_demand_key, p_item_number, p_kind, p_requested_date, v_actor.id)
    returning * into v_res;
  end if;

  if p_kind = 'order' then
    select u.id into v_unit
    from public.planning_supply_units u
    join public.planning_supply_sources s on s.source_system = u.source_system
    where u.id = v_previous_unit and u.item_number = p_item_number
      and u.supply_status in ('available', 'incoming', 'in_production')
      and s.connected
      and s.last_synced_at + s.freshness_limit_hours * interval '1 hour' >= now();
    if v_unit is null then
      v_unit := public.planning_pick_serial(p_item_number, p_requested_date, true);
    end if;
    if v_unit is not null then
      -- A soft quote can be displaced; locked quotes and orders cannot.
      insert into public.planning_events
        (reservation_id, configuration_id, event_type, previous_supply_unit_id, reason)
      select id, configuration_id, 'quote_displaced_by_order', supply_unit_id,
        'Higher priority order allocation'
      from public.planning_reservations
      where supply_unit_id = v_unit and status = 'active' and reservation_type = 'soft_quote';
      update public.planning_reservations
      set supply_unit_id = null, assigned_at = null, updated_at = now()
      where supply_unit_id = v_unit and status = 'active' and reservation_type = 'soft_quote';
      update public.planning_reservations
      set supply_unit_id = v_unit, assigned_at = now(), updated_at = now()
      where id = v_res.id returning * into v_res;
    end if;
  end if;
  perform public.planning_reflow_soft(p_item_number);
  select * into v_res from public.planning_reservations where id = v_res.id;
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, actor_user_id, next_supply_unit_id)
  values (v_res.id, p_configuration_id,
    case when p_kind = 'order' then 'order_allocation' else 'quote_reservation' end,
    v_actor.id, v_res.supply_unit_id);
  return v_res;
end;
$$;
revoke all on function public.planning_reserve_machine(uuid,text,text,date,text) from public, anon;
grant execute on function public.planning_reserve_machine(uuid,text,text,date,text) to authenticated;

create or replace function public.planning_lock_quote(
  p_reservation_id uuid, p_reason text, p_review_date date default null, p_locked boolean default true
)
returns public.planning_reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.planning_reservations%rowtype;
  v_actor public.app_users%rowtype;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_REASON_REQUIRED';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid() limit 1;
  select r.* into v_row from public.planning_reservations r
    where r.id = p_reservation_id and r.status = 'active';
  if not found then raise exception using errcode = '23503', message = 'PLANNING_RESERVATION_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_row.item_number, 0));
  select r.* into v_row from public.planning_reservations r
    join public.configurations c on c.id = r.configuration_id
    where r.id = p_reservation_id and r.status = 'active'
      and r.reservation_type in ('soft_quote', 'locked_quote')
      and (v_actor.portal_role::text = 'timan_backend'
        or c.created_by_user_id = auth.uid() or c.assigned_seller_id = v_actor.id)
    for update of r;
  if not found then raise exception using errcode = '42501', message = 'PLANNING_QUOTE_OUTSIDE_SCOPE'; end if;
  update public.planning_reservations
  set reservation_type = case when p_locked then 'locked_quote' else 'soft_quote' end,
    lock_reason = case when p_locked then btrim(p_reason) else null end,
    lock_review_date = case when p_locked then p_review_date else null end,
    updated_at = now()
  where id = p_reservation_id returning * into v_row;
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, actor_user_id,
     previous_supply_unit_id, next_supply_unit_id, reason)
  values (v_row.id, v_row.configuration_id,
    case when p_locked then 'quote_lock' else 'quote_unlock' end,
    v_actor.id, v_row.supply_unit_id, v_row.supply_unit_id, btrim(p_reason));
  if not p_locked then perform public.planning_reflow_soft(v_row.item_number); end if;
  return v_row;
end;
$$;
revoke all on function public.planning_lock_quote(uuid,text,date,boolean) from public, anon;
grant execute on function public.planning_lock_quote(uuid,text,date,boolean) to authenticated;

create or replace view analytics_export.planning_events as
select e.id as event_id, e.reservation_id, e.configuration_id, e.event_type,
  e.actor_user_id, e.previous_supply_unit_id, e.next_supply_unit_id,
  e.reason, e.created_at
from public.planning_events e;
revoke all on analytics_export.planning_events from public, anon, authenticated;
grant select on analytics_export.planning_events to service_role;
do $grants$ begin
  if exists (select 1 from pg_roles where rolname = 'fabric_reader') then
    execute 'grant select on analytics_export.planning_events to fabric_reader';
  end if;
end $grants$;

-- The commercial boundary is the existing configuration quote number or
-- submitted order. No trigger fires for ordinary case/lead saves.
create or replace function public.planning_sync_configuration_transition()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_machine jsonb;
  v_item text;
  v_key text;
  v_date date;
  v_unit integer;
  v_count integer;
  v_kind text;
  v_seen text[] := array[]::text[];
  v_old public.planning_reservations%rowtype;
begin
  if not public.can_manage_planning() then return new; end if;
  if coalesce(new.case_status, '') = 'deleted' or coalesce(new.status, '') = 'deleted' then
    for v_old in
      select * from public.planning_reservations
      where configuration_id = new.id and status = 'active'
    loop
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_old.item_number, 0));
      update public.planning_reservations
      set status = 'released', released_at = now(), supply_unit_id = null,
        supply_lot_id = null, updated_at = now()
      where id = v_old.id;
      insert into public.planning_events
        (reservation_id, configuration_id, event_type, previous_supply_unit_id, reason)
      values (v_old.id, new.id, 'document_deleted', v_old.supply_unit_id, 'Canonical document deleted');
      perform public.planning_reflow_soft(v_old.item_number);
    end loop;
    return new;
  end if;
  if new.order_number is not null and new.submitted_at is not null then
    v_kind := 'order';
  elsif new.quote_number is not null
    and coalesce(new.document_type, new.case_type, 'quote') <> 'order'
    and coalesce(new.case_status, new.status, '') <> 'deleted' then
    v_kind := 'soft_quote';
  else
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.quote_number is not distinct from old.quote_number
      and new.order_number is not distinct from old.order_number
      and new.submitted_at is not distinct from old.submitted_at
      and new.delivery_date is not distinct from old.delivery_date
      and new.state_json is not distinct from old.state_json then
      return new;
    end if;
  end if;
  for v_machine in select value from jsonb_array_elements(coalesce(new.state_json -> 'machineConfigs', '[]'::jsonb))
  loop
    select item_number into v_item from public.planning_machine_products
    where machine_key = v_machine ->> 'type';
    if v_item is null or nullif(v_machine ->> 'id', '') is null then continue; end if;
    v_count := least(100, greatest(1, case when v_machine ->> 'qty' ~ '^[0-9]{1,3}$'
      then (v_machine ->> 'qty')::integer else 1 end));
    for v_unit in 1..v_count loop
      v_key := (v_machine ->> 'id') || '_' || v_unit::text;
      v_seen := array_append(v_seen, v_key);
      v_date := new.delivery_date;
      if (new.state_json -> 'machineDeliveryDates' ->> v_key) ~ '^\d{4}-\d{2}-\d{2}$' then
        v_date := (new.state_json -> 'machineDeliveryDates' ->> v_key)::date;
      end if;
      perform public.planning_reserve_machine(new.id, v_key, v_item, v_date, v_kind);
    end loop;
  end loop;
  for v_old in
    select * from public.planning_reservations
    where configuration_id = new.id and status = 'active'
      and not (demand_key = any(v_seen))
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_old.item_number, 0));
    update public.planning_reservations
    set status = 'released', released_at = now(), supply_unit_id = null, updated_at = now()
    where id = v_old.id;
    insert into public.planning_events
      (reservation_id, configuration_id, event_type, previous_supply_unit_id, reason)
    values (v_old.id, new.id, 'demand_removed', v_old.supply_unit_id, 'Configuration revised');
    perform public.planning_reflow_soft(v_old.item_number);
  end loop;
  return new;
end;
$$;
revoke all on function public.planning_sync_configuration_transition() from public, anon, authenticated;
create trigger planning_configuration_transition
after insert or update of quote_number, order_number, submitted_at, delivery_date, state_json, case_status, status
on public.configurations for each row
execute function public.planning_sync_configuration_transition();
