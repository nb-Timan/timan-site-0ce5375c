import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261004161934_planning_attachment_mapping.sql', 'utf8');
const availabilityShortfall = readFileSync('supabase/migrations/20261004171537_planning_availability_shortfall.sql', 'utf8');
const availabilityConstrained = readFileSync('supabase/migrations/20261004174558_planning_availability_constrained_incoming.sql', 'utf8');

describe('Planning attachment reservation migration contract', () => {
  it('is Planning-only and keeps the existing business records untouched', () => {
    expect(migration).toContain('create table public.planning_accessory_products');
    expect(migration).toContain('alter table public.planning_accessory_products enable row level security');
    expect(migration).toContain('public.can_access_planning()');
    expect(migration).toContain('public.can_manage_planning()');
    expect(migration).not.toMatch(/\b(?:drop|truncate)\s+(?:table|column)\b/i);
    expect(migration).not.toMatch(/\b(?:update|delete\s+from)\s+public\.(?:configurations|crm_leads)\b/i);
  });

  it('validates canonical accessory IDs and per-piece quantity against the saved configuration', () => {
    expect(migration).toContain('public.planning_selected_accessory_quantity(');
    expect(migration).toContain('p_accessory_id text default null');
    expect(migration).toContain("v_unit_key || '|' || v_accessory.accessory_id || '|' || v_piece::text");
    expect(migration).toContain("v_ordinal_text !~ '^[1-9][0-9]{0,2}$'");
    expect(migration).toContain('PLANNING_ITEM_NOT_IN_CONFIGURATION');
    expect(migration).not.toContain("split_part(a.value, '_', 1)");
  });

  it('locks item allocation, protects hard reservations and reflows soft quotes', () => {
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(migration).toContain("reservation_type = 'soft_quote'");
    expect(migration).toContain('public.planning_reflow_quantity(p_item_number)');
    expect(migration).toContain('quote_quantity_displaced_by_order');
    expect(migration).toContain("item_kind = 'serialized'");
    expect(migration).toContain('supply_kind_changed');
    expect(migration).toContain('l.quantity > occupied.allocated');
  });

  it('counts only assigned lots for availability and leaves Planning OFF untouched', () => {
    expect(migration).toContain('r.supply_lot_id = l.id and r.status = \'active\'');
    expect(migration).toContain('greatest(0, l.quantity - occupied.total) as free_quantity');
    expect(migration).toContain('if not public.can_manage_planning() then return new; end if;');
    expect(migration).toContain('if not public.can_access_planning() then');
    expect(migration).toContain("v_status := 'unknown'");
  });

  it('does not count supply arriving after the requested date as yellow capacity', () => {
    expect(availabilityShortfall).toContain('v_free_by_date + v_soft_by_date >= p_quantity');
    expect(availabilityShortfall).not.toContain('v_free_by_date + v_soft_by_date + v_later >= p_quantity');
    expect(availabilityShortfall).not.toContain('or v_later > 0');
    expect(availabilityShortfall).toContain("v_status := 'red'");
  });

  it('keeps current clean stock green, eligible incoming yellow, and a true shortfall red', () => {
    expect(availabilityConstrained).toContain("supply_status = 'available'\n        and ready_date <= current_date and reservation_type is null");
    expect(availabilityConstrained).toContain('elsif v_clean_now >= p_quantity then');
    expect(availabilityConstrained).toContain('elsif v_free_by_date + v_soft_by_date >= p_quantity then');
    expect(availabilityConstrained).toContain("v_status := 'red'");
    expect(availabilityConstrained).not.toMatch(/\b(?:drop|truncate|delete)\b/i);
  });
});
