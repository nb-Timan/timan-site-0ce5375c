-- Planning is opt-in. No existing app_user receives access or supply data here.
create or replace function public.can_access_planning()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.app_users u
    where auth.uid() is not null
      and u.auth_user_id = auth.uid()
      and u.portal_role::text in ('timan_backend', 'timan_seller', 'timan_service')
      and u.approved is true and u.is_active is true
      and 'planning' = any(coalesce(u.allowed_areas, array[]::text[]))
  );
$$;
revoke all on function public.can_access_planning() from public, anon;
grant execute on function public.can_access_planning() to authenticated;

create or replace function public.can_manage_planning()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.app_users u
    where auth.uid() is not null
      and u.auth_user_id = auth.uid()
      and u.portal_role::text in ('timan_backend', 'timan_seller')
      and u.approved is true and u.is_active is true
      and 'planning' = any(coalesce(u.allowed_areas, array[]::text[]))
  );
$$;
revoke all on function public.can_manage_planning() from public, anon;
grant execute on function public.can_manage_planning() to authenticated;

create or replace function public.planning_can_view_configuration(p_configuration_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.can_access_planning() and exists (
    select 1 from public.configurations c
    join public.app_users u on u.auth_user_id = auth.uid()
    where c.id = p_configuration_id
      and u.approved is true and u.is_active is true
      and (u.portal_role::text = 'timan_backend'
        or c.created_by_user_id = auth.uid()
        or c.assigned_seller_id = u.id)
  );
$$;
revoke all on function public.planning_can_view_configuration(uuid) from public, anon;
grant execute on function public.planning_can_view_configuration(uuid) to authenticated;

-- Identifier-only relation from Configurator machine keys to its canonical
-- product numbers. Product names, compatibility and prices remain upstream.
create table public.planning_machine_products (
  machine_key text primary key,
  item_number text not null unique
);
insert into public.planning_machine_products (machine_key, item_number) values
  ('RC-751', '410040'),
  ('RC-1000S', '411000'),
  ('Timan 3330', '712000'),
  ('Timan 2620', '761000');

-- Supply rows are read-model facts from a future approved source, not
-- operational assignments. Only the service role can ingest them.
create table public.planning_supply_sources (
  source_system text primary key,
  connected boolean not null default false,
  last_synced_at timestamptz,
  freshness_limit_hours integer not null default 24 check (freshness_limit_hours > 0),
  created_at timestamptz not null default now()
);

create table public.planning_supply_units (
  id uuid primary key default gen_random_uuid(),
  source_system text not null references public.planning_supply_sources(source_system),
  source_record_key text not null,
  item_number text not null,
  serial_number text,
  machine_ident_number text,
  production_order_number text,
  sales_order_number text,
  production_completed_at date,
  available_at date,
  expected_delivery_at date,
  warehouse_location text,
  supply_status text not null check (supply_status in ('available', 'incoming', 'in_production', 'blocked', 'demo', 'unavailable')),
  dealer_account_id uuid,
  customer_name text,
  source_comment text,
  source_updated_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (source_system, source_record_key)
);
create unique index planning_supply_units_serial_unique
  on public.planning_supply_units (item_number, upper(serial_number))
  where serial_number is not null;
create index planning_supply_units_available_idx
  on public.planning_supply_units (item_number, available_at)
  where supply_status in ('available', 'incoming', 'in_production');

create table public.planning_supply_lots (
  id uuid primary key default gen_random_uuid(),
  source_system text not null references public.planning_supply_sources(source_system),
  source_record_key text not null,
  item_number text not null,
  quantity integer not null check (quantity >= 0),
  available_at date,
  warehouse_location text,
  supply_status text not null check (supply_status in ('available', 'incoming', 'in_production', 'blocked', 'unavailable')),
  source_updated_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (source_system, source_record_key)
);
create index planning_supply_lots_item_date_idx on public.planning_supply_lots (item_number, available_at);

create table public.planning_reservations (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.configurations(id),
  demand_key text not null,
  item_number text not null,
  item_kind text not null default 'serialized' check (item_kind in ('serialized', 'quantity')),
  supply_unit_id uuid references public.planning_supply_units(id),
  supply_lot_id uuid references public.planning_supply_lots(id),
  quantity integer not null default 1 check (quantity > 0),
  reservation_type text not null check (reservation_type in ('soft_quote', 'locked_quote', 'order')),
  status text not null default 'active' check (status in ('active', 'released')),
  requested_delivery_date date,
  lock_reason text,
  lock_review_date date,
  assigned_at timestamptz,
  released_at timestamptz,
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supply_unit_id is null or supply_lot_id is null),
  check (reservation_type <> 'locked_quote' or nullif(btrim(lock_reason), '') is not null),
  check (supply_unit_id is null or quantity = 1),
  check ((item_kind = 'serialized' and supply_lot_id is null)
    or (item_kind = 'quantity' and supply_unit_id is null))
);
create unique index planning_reservations_demand_active_unique
  on public.planning_reservations (configuration_id, demand_key) where status = 'active';
create unique index planning_reservations_unit_active_unique
  on public.planning_reservations (supply_unit_id) where status = 'active' and supply_unit_id is not null;
create index planning_reservations_item_idx on public.planning_reservations (item_number, requested_delivery_date) where status = 'active';

create table public.planning_delivery_requests (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.configurations(id),
  demand_key text not null,
  item_number text not null,
  requested_delivery_date date,
  note text,
  request_status text not null default 'open' check (request_status in ('open', 'answered', 'closed')),
  response_note text,
  expected_available_at date,
  requested_by uuid not null references public.app_users(id),
  answered_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table public.planning_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.planning_reservations(id),
  configuration_id uuid references public.configurations(id),
  event_type text not null,
  actor_user_id uuid references public.app_users(id),
  previous_supply_unit_id uuid references public.planning_supply_units(id),
  next_supply_unit_id uuid references public.planning_supply_units(id),
  reason text,
  created_at timestamptz not null default now()
);
create index planning_events_configuration_idx on public.planning_events (configuration_id, created_at desc);

alter table public.planning_supply_sources enable row level security;
alter table public.planning_machine_products enable row level security;
alter table public.planning_supply_units enable row level security;
alter table public.planning_supply_lots enable row level security;
alter table public.planning_reservations enable row level security;
alter table public.planning_delivery_requests enable row level security;
alter table public.planning_events enable row level security;

create policy planning_sources_read on public.planning_supply_sources for select to authenticated using ((select public.can_access_planning()));
create policy planning_machine_products_read on public.planning_machine_products for select to authenticated using ((select public.can_access_planning()));
create policy planning_units_read on public.planning_supply_units for select to authenticated using ((select public.can_access_planning()));
create policy planning_lots_read on public.planning_supply_lots for select to authenticated using ((select public.can_access_planning()));
create policy planning_reservations_read on public.planning_reservations for select to authenticated
  using (public.planning_can_view_configuration(configuration_id));
create policy planning_requests_read on public.planning_delivery_requests for select to authenticated
  using (public.planning_can_view_configuration(configuration_id));
create policy planning_events_read on public.planning_events for select to authenticated
  using (configuration_id is not null and public.planning_can_view_configuration(configuration_id));

revoke all on public.planning_supply_sources, public.planning_supply_units, public.planning_supply_lots,
  public.planning_reservations, public.planning_delivery_requests, public.planning_events,
  public.planning_machine_products from public, anon, authenticated;
grant select on public.planning_supply_sources, public.planning_supply_lots,
  public.planning_reservations, public.planning_delivery_requests, public.planning_events,
  public.planning_machine_products to authenticated;
grant select (id, source_system, item_number, serial_number, machine_ident_number,
  available_at, expected_delivery_at, warehouse_location, supply_status, source_updated_at)
  on public.planning_supply_units to authenticated;
grant all on public.planning_supply_sources, public.planning_supply_units, public.planning_supply_lots,
  public.planning_reservations, public.planning_delivery_requests, public.planning_events,
  public.planning_machine_products to service_role;

-- Fabric receives structured analytical reads only, never operational writes.
create or replace view analytics_export.planning_reservations as
select r.id as reservation_id, r.reservation_type, r.status, r.configuration_id,
  c.quote_number, c.order_number, r.item_number, r.item_kind, r.quantity, u.serial_number,
  r.requested_delivery_date, u.available_at as assigned_availability_date,
  (r.reservation_type = 'locked_quote') as locked, c.assigned_seller_id as seller_id,
  c.dealer_account_id, r.created_at, r.released_at
from public.planning_reservations r
left join public.planning_supply_units u on u.id = r.supply_unit_id
join public.configurations c on c.id = r.configuration_id;
revoke all on analytics_export.planning_reservations from public, anon, authenticated;
grant select on analytics_export.planning_reservations to service_role;
do $grants$ begin
  if exists (select 1 from pg_roles where rolname = 'fabric_reader') then
    execute 'grant select on analytics_export.planning_reservations to fabric_reader';
  end if;
end $grants$;
