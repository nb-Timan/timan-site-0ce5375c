-- Planning production identity is a read model. The existing sales_order_number
-- is the ERP number for this source; keep the physical column to make this
-- migration additive and expose it as ERP in the Planning service/UI.
-- Reservations remain separate relations and never update production facts.

alter table public.planning_supply_units
  add column production_reference text,
  add column production_series integer generated always as
    (substring(production_reference from '^[Ss]([0-9]+)-[0-9]+$')::integer) stored,
  add column production_series_position integer generated always as
    (substring(production_reference from '^[Ss][0-9]+-([0-9]+)$')::integer) stored,
  add column slot_number text,
  add column production_completed_week smallint check (production_completed_week between 1 and 53),
  add column production_completed_year smallint check (production_completed_year between 1900 and 2200),
  add column first_planned_delivery_date date,
  add column current_planned_delivery_date date,
  add column confirmed_customer_delivery_date date,
  add column source_status text,
  add column responsible_initials text,
  add column production_notes text;

create index planning_supply_units_ident_idx
  on public.planning_supply_units (item_number, upper(machine_ident_number))
  where machine_ident_number is not null;
create index planning_supply_units_production_ref_idx
  on public.planning_supply_units (upper(production_reference))
  where production_reference is not null;
create index planning_supply_units_production_order_idx
  on public.planning_supply_units (production_order_number)
  where production_order_number is not null;
create index planning_supply_units_erp_order_idx
  on public.planning_supply_units (sales_order_number)
  where sales_order_number is not null;

-- Lineage metadata has one row per field, not a second copy of the value.
create table public.planning_supply_unit_field_sources (
  supply_unit_id uuid not null references public.planning_supply_units(id) on delete restrict,
  field_name text not null,
  source_system text not null references public.planning_supply_sources(source_system),
  source_record_key text not null,
  source_updated_at timestamptz not null,
  primary key (supply_unit_id, field_name)
);

-- Conflicts are visible as action items; competing values stay in their
-- respective source systems until an authorized resolution is defined.
create table public.planning_supply_conflicts (
  id uuid primary key default gen_random_uuid(),
  supply_unit_id uuid not null references public.planning_supply_units(id) on delete restrict,
  field_name text not null,
  existing_value text not null,
  incoming_value text not null,
  existing_source_system text not null references public.planning_supply_sources(source_system),
  incoming_source_system text not null references public.planning_supply_sources(source_system),
  status text not null default 'open' check (status in ('open', 'resolved')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index planning_supply_conflicts_open_idx
  on public.planning_supply_conflicts (supply_unit_id) where status = 'open';
create unique index planning_supply_conflicts_one_open_per_field
  on public.planning_supply_conflicts (supply_unit_id, field_name) where status = 'open';

alter table public.planning_supply_unit_field_sources enable row level security;
alter table public.planning_supply_conflicts enable row level security;
create policy planning_unit_field_sources_read on public.planning_supply_unit_field_sources
  for select to authenticated using ((select public.can_access_planning()));
create policy planning_supply_conflicts_read on public.planning_supply_conflicts
  for select to authenticated using (
    (select public.can_access_planning()) and exists (
      select 1 from public.app_users u
      where u.auth_user_id = auth.uid() and u.portal_role::text = 'timan_backend'
        and u.approved is true and u.is_active is true
    )
  );
revoke all on public.planning_supply_unit_field_sources, public.planning_supply_conflicts
  from public, anon, authenticated;
grant select on public.planning_supply_unit_field_sources, public.planning_supply_conflicts to authenticated;
grant all on public.planning_supply_unit_field_sources, public.planning_supply_conflicts to service_role;

-- PII and commercial references are not automatically exposed to every
-- Planning user. Only the non-personal production identifiers are readable.
grant select (production_reference, production_series, production_series_position,
  production_order_number, sales_order_number, slot_number, production_completed_at,
  production_completed_week, production_completed_year, first_planned_delivery_date,
  current_planned_delivery_date, confirmed_customer_delivery_date, source_status)
  on public.planning_supply_units to authenticated;
