-- Manual operations stay behind the explicit Planning capability. Backend is
-- the global planner; Sellers can only change their own submitted orders.
create unique index planning_delivery_requests_open_unique
  on public.planning_delivery_requests (configuration_id, demand_key, item_number)
  where request_status = 'open';

create or replace function public.planning_assign_serial(
  p_reservation_id uuid, p_supply_unit_id uuid, p_reason text
)
returns public.planning_reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor public.app_users%rowtype;
  v_res public.planning_reservations%rowtype;
  v_target public.planning_reservations%rowtype;
  v_unit public.planning_supply_units%rowtype;
  v_previous uuid;
  v_backend boolean;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_REASON_REQUIRED';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid() limit 1;
  v_backend := v_actor.portal_role::text = 'timan_backend';
  select * into v_res from public.planning_reservations
    where id = p_reservation_id and status = 'active';
  if not found then raise exception using errcode = '23503', message = 'PLANNING_RESERVATION_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_res.item_number, 0));
  select r.* into v_res from public.planning_reservations r
    where r.id = p_reservation_id and r.status = 'active' for update;
  if not found then raise exception using errcode = '23503', message = 'PLANNING_RESERVATION_NOT_FOUND'; end if;
  if not public.planning_can_view_configuration(v_res.configuration_id)
    or (not v_backend and v_res.reservation_type <> 'order') then
    raise exception using errcode = '42501', message = 'PLANNING_SERIAL_CHANGE_DENIED';
  end if;
  if v_res.item_kind <> 'serialized' then
    raise exception using errcode = '23514', message = 'PLANNING_NOT_SERIALIZED';
  end if;
  select u.* into v_unit from public.planning_supply_units u
    join public.planning_supply_sources s on s.source_system = u.source_system
    where u.id = p_supply_unit_id and u.item_number = v_res.item_number
      and u.serial_number is not null
      and u.supply_status in ('available', 'incoming', 'in_production')
      and (u.supply_status = 'available' or u.available_at is not null)
      and s.connected and s.last_synced_at + s.freshness_limit_hours * interval '1 hour' >= now()
    for share of u;
  if not found then raise exception using errcode = '23514', message = 'PLANNING_SERIAL_NOT_ELIGIBLE'; end if;
  if v_res.supply_unit_id = p_supply_unit_id then return v_res; end if;
  select * into v_target from public.planning_reservations
    where supply_unit_id = p_supply_unit_id and status = 'active' for update;
  if found then
    if v_target.reservation_type = 'order'
      or (v_target.reservation_type = 'locked_quote' and not v_backend) then
      raise exception using errcode = '23514', message = 'PLANNING_SERIAL_PROTECTED';
    end if;
    update public.planning_reservations
      set supply_unit_id = null, assigned_at = null, updated_at = now()
      where id = v_target.id;
    insert into public.planning_events
      (reservation_id, configuration_id, event_type, actor_user_id, previous_supply_unit_id, reason)
      values (v_target.id, v_target.configuration_id, 'manual_displacement', v_actor.id,
        p_supply_unit_id, btrim(p_reason));
  end if;
  v_previous := v_res.supply_unit_id;
  update public.planning_reservations
    set supply_unit_id = p_supply_unit_id, assigned_at = now(), updated_at = now()
    where id = v_res.id returning * into v_res;
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, actor_user_id,
      previous_supply_unit_id, next_supply_unit_id, reason)
    values (v_res.id, v_res.configuration_id, 'manual_serial_change', v_actor.id,
      v_previous, p_supply_unit_id, btrim(p_reason));
  perform public.planning_reflow_soft(v_res.item_number);
  return v_res;
end;
$$;
revoke all on function public.planning_assign_serial(uuid,uuid,text) from public, anon;
grant execute on function public.planning_assign_serial(uuid,uuid,text) to authenticated;

create or replace function public.planning_release_reservation(
  p_reservation_id uuid, p_reason text
)
returns public.planning_reservations
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor public.app_users%rowtype;
  v_res public.planning_reservations%rowtype;
  v_previous uuid;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_REASON_REQUIRED';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid() limit 1;
  select * into v_res from public.planning_reservations
    where id = p_reservation_id and status = 'active';
  if not found then raise exception using errcode = '23503', message = 'PLANNING_RESERVATION_NOT_FOUND'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_res.item_number, 0));
  select * into v_res from public.planning_reservations
    where id = p_reservation_id and status = 'active' for update;
  if not found then raise exception using errcode = '23503', message = 'PLANNING_RESERVATION_NOT_FOUND'; end if;
  if not public.planning_can_view_configuration(v_res.configuration_id)
    or (v_res.reservation_type <> 'soft_quote' and v_actor.portal_role::text <> 'timan_backend') then
    raise exception using errcode = '42501', message = 'PLANNING_RELEASE_DENIED';
  end if;
  v_previous := v_res.supply_unit_id;
  update public.planning_reservations
    set status = 'released', released_at = now(), supply_unit_id = null,
      supply_lot_id = null, updated_at = now()
    where id = v_res.id returning * into v_res;
  insert into public.planning_events
    (reservation_id, configuration_id, event_type, actor_user_id, previous_supply_unit_id, reason)
    values (v_res.id, v_res.configuration_id, 'manual_release', v_actor.id, v_previous, btrim(p_reason));
  perform public.planning_reflow_soft(v_res.item_number);
  return v_res;
end;
$$;
revoke all on function public.planning_release_reservation(uuid,text) from public, anon;
grant execute on function public.planning_release_reservation(uuid,text) to authenticated;

create or replace function public.planning_request_delivery(
  p_configuration_id uuid, p_demand_key text, p_item_number text,
  p_requested_date date, p_note text
)
returns public.planning_delivery_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor public.app_users%rowtype;
  v_config public.configurations%rowtype;
  v_request public.planning_delivery_requests%rowtype;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid() limit 1;
  select * into v_config from public.configurations where id = p_configuration_id;
  if not found or not public.planning_can_view_configuration(p_configuration_id) then
    raise exception using errcode = '42501', message = 'PLANNING_CONFIGURATION_OUTSIDE_SCOPE';
  end if;
  if nullif(btrim(coalesce(p_demand_key, '')), '') is null
    or nullif(btrim(coalesce(p_item_number, '')), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_INVALID_DEMAND';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(v_config.state_json -> 'machineConfigs', '[]'::jsonb)) m
    cross join lateral generate_series(
      1, least(100, greatest(1, case when m.value ->> 'qty' ~ '^[0-9]{1,3}$'
        then (m.value ->> 'qty')::integer else 1 end))
    ) unit_no
    left join public.planning_machine_products mp on mp.machine_key = m.value ->> 'type'
    where p_demand_key = (m.value ->> 'id') || '_' || unit_no::text
      and (mp.item_number = p_item_number
        or exists (select 1 from jsonb_array_elements_text(coalesce(m.value -> 'acc', '[]'::jsonb)) a
          where split_part(a.value, '_', 1) = p_item_number)
        or exists (select 1 from jsonb_array_elements_text(
          coalesce(v_config.state_json -> 'individualUnitConfigs' -> p_demand_key -> 'acc', '[]'::jsonb)) a
          where split_part(a.value, '_', 1) = p_item_number))
  ) then
    raise exception using errcode = '23514', message = 'PLANNING_ITEM_NOT_IN_CONFIGURATION';
  end if;
  insert into public.planning_delivery_requests
    (configuration_id, demand_key, item_number, requested_delivery_date, note, requested_by)
    values (p_configuration_id, p_demand_key, p_item_number, p_requested_date,
      nullif(btrim(p_note), ''), v_actor.id)
    on conflict (configuration_id, demand_key, item_number) where request_status = 'open'
    do nothing returning * into v_request;
  if not found then
    select * into v_request from public.planning_delivery_requests
      where configuration_id = p_configuration_id and demand_key = p_demand_key
        and item_number = p_item_number and request_status = 'open';
    return v_request;
  end if;
  insert into public.planning_events
    (configuration_id, event_type, actor_user_id, reason)
    values (p_configuration_id, 'delivery_requested', v_actor.id, nullif(btrim(p_note), ''));
  return v_request;
end;
$$;
revoke all on function public.planning_request_delivery(uuid,text,text,date,text) from public, anon;
grant execute on function public.planning_request_delivery(uuid,text,text,date,text) to authenticated;

create or replace function public.planning_answer_delivery_request(
  p_request_id uuid, p_expected_available_at date, p_response_note text
)
returns public.planning_delivery_requests
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor public.app_users%rowtype;
  v_request public.planning_delivery_requests%rowtype;
begin
  if not public.can_manage_planning() then
    raise exception using errcode = '42501', message = 'PLANNING_ACCESS_DENIED';
  end if;
  select * into v_actor from public.app_users where auth_user_id = auth.uid() limit 1;
  if v_actor.portal_role::text <> 'timan_backend' then
    raise exception using errcode = '42501', message = 'PLANNING_PLANNER_REQUIRED';
  end if;
  if p_expected_available_at is null or nullif(btrim(coalesce(p_response_note, '')), '') is null then
    raise exception using errcode = '23514', message = 'PLANNING_RESPONSE_REQUIRED';
  end if;
  select * into v_request from public.planning_delivery_requests
    where id = p_request_id and request_status = 'open' for update;
  if not found then raise exception using errcode = '23503', message = 'PLANNING_REQUEST_NOT_OPEN'; end if;
  update public.planning_delivery_requests
    set request_status = 'answered', expected_available_at = p_expected_available_at,
      response_note = btrim(p_response_note), answered_by = v_actor.id, answered_at = now()
    where id = p_request_id returning * into v_request;
  insert into public.planning_events
    (configuration_id, event_type, actor_user_id, reason)
    values (v_request.configuration_id, 'delivery_answered', v_actor.id, btrim(p_response_note));
  return v_request;
end;
$$;
revoke all on function public.planning_answer_delivery_request(uuid,date,text) from public, anon;
grant execute on function public.planning_answer_delivery_request(uuid,date,text) to authenticated;
