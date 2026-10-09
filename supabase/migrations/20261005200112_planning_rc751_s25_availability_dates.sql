-- RC-751 S25 delivery-to-stock dates were imported from the production-completion
-- column. Keep the production facts intact and reconcile only canonical availability.

with canonical_dates(serial_number, production_reference, production_completed_at, available_at) as (
  values
    ('410040-01-0390', 'S25-1', date '2026-06-05', date '2026-06-08'),
    ('410040-01-0391', 'S25-2', date '2026-06-05', date '2026-06-08'),
    ('410040-01-0392', 'S25-3', date '2026-06-05', date '2026-06-08'),
    ('410040-01-0393', 'S25-4', date '2026-06-05', date '2026-06-08'),
    ('410040-01-0394', 'S25-5', date '2026-06-12', date '2026-06-15'),
    ('410040-01-0395', 'S25-6', date '2026-06-12', date '2026-06-15'),
    ('410040-01-0396', 'S25-7', date '2026-06-12', date '2026-06-15'),
    ('410040-01-0397', 'S25-8', date '2026-06-12', date '2026-06-15')
)
update public.planning_supply_units as unit
set available_at = source.available_at
from canonical_dates as source
where unit.source_system = 'manual_supply_import'
  and unit.item_number = '410040'
  and unit.serial_number = source.serial_number
  and unit.production_reference = source.production_reference
  and unit.production_completed_at = source.production_completed_at
  and unit.available_at is distinct from source.available_at;
