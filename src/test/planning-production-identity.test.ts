import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizePlanningUnit, planningExceptions, planningUnitMatchesQuery,
  type PlanningData, type PlanningUnit } from '@/lib/planningService';

const migration = readFileSync('supabase/migrations/20261004142626_planning_production_identity.sql', 'utf8');
const sourceMerge = readFileSync('supabase/migrations/20261004161955_planning_source_merge.sql', 'utf8');
const unit: PlanningUnit = {
  id: 'qa-unit', source_system: 'qa-production', item_number: '411000',
  serial_number: '411000-04-1557', machine_ident_number: '411000-04-1557',
  production_reference: 'S47-1', production_series: 47, production_series_position: 1,
  production_order_number: '656331', erp_order_number: '138271', slot_number: 'B12',
  available_at: null, expected_delivery_at: null, supply_status: 'in_production',
  warehouse_location: null, source_updated_at: '2026-10-04T12:00:00Z',
};

describe('Planning production identity', () => {
  it('maps the one stored sales-order source column to the canonical ERP display field', () => {
    const normalized = normalizePlanningUnit({ ...unit, erp_order_number: undefined, sales_order_number: '138271' });
    expect(normalized.erp_order_number).toBe('138271');
    expect(normalized).not.toHaveProperty('sales_order_number');
    expect(normalized.production_order_number).toBe('656331');
  });
  it('keeps serial, P-nr, production order, ERP and Portal order independently searchable', () => {
    for (const term of ['411000-04-1557', 's47-1', '47', '656331', '138271', 'O-7026']) {
      expect(planningUnitMatchesQuery(unit, term, ['O-7026'])).toBe(true);
    }
    expect(planningUnitMatchesQuery(unit, 'O-7026')).toBe(false);
    expect(planningUnitMatchesQuery(unit, 'unrelated')).toBe(false);
  });

  it('keeps the ERP value in the existing source column and derives series from P-nr', () => {
    expect(migration).not.toMatch(/\brename column\b|\bdrop\s+(column|table)\b/i);
    expect(migration).toContain('on public.planning_supply_units (sales_order_number)');
    expect(migration).not.toContain('add column erp_order_number');
    expect(migration).toContain('add column production_reference text');
    expect(migration).toContain('add column production_series integer generated always');
    expect(migration).toContain('add column production_series_position integer generated always');
    expect(migration).toContain('add column slot_number text');
    expect(migration).not.toContain('add column portal_order_number');
  });

  it('keeps delivery dates and source lineage as separate attributes with opt-in access', () => {
    for (const column of ['first_planned_delivery_date', 'current_planned_delivery_date',
      'confirmed_customer_delivery_date', 'production_completed_week', 'production_completed_year']) {
      expect(migration).toContain(`add column ${column}`);
    }
    expect(migration).toContain('create table public.planning_supply_unit_field_sources');
    expect(migration).toContain('create table public.planning_supply_conflicts');
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('public.can_access_planning()');
  });

  it('surfaces only open source conflicts as action items without mutating the unit', () => {
    const data: PlanningData = {
      sources: [], units: [unit], lots: [], reservations: [], requests: [], events: [], truncated: false,
      conflicts: [{ id: 'conflict-1', supply_unit_id: unit.id, field_name: 'sales_order_number',
        existing_value: '138271', incoming_value: '138999', existing_source_system: 'portal',
        incoming_source_system: 'legacy', status: 'open' }],
    };
    expect(planningExceptions(data)).toContainEqual({
      kind: 'source_conflict', key: 'conflict-1', itemNumber: '411000',
    });
    expect(data.units[0].erp_order_number).toBe('138271');
    expect(planningExceptions({ ...data, conflicts: [{ ...data.conflicts![0], status: 'resolved' }] }))
      .not.toContainEqual(expect.objectContaining({ kind: 'source_conflict' }));
  });

  it('limits source ingestion to service role and preserves empty and conflicting fields', () => {
    expect(sourceMerge).toContain('create table public.planning_supply_unit_records');
    expect(sourceMerge).toContain('enable row level security');
    expect(sourceMerge).toContain('security invoker');
    expect(sourceMerge).toContain('to service_role');
    expect(sourceMerge).toContain('if v_incoming is null then continue; end if;');
    expect(sourceMerge).toContain('if v_current is distinct from v_incoming then');
    expect(sourceMerge).toContain('insert into public.planning_supply_conflicts');
    expect(sourceMerge).toContain('and v_current <> v_incoming');
    expect(sourceMerge).toContain('if v_current = v_incoming');
    expect(sourceMerge).toContain("if found and v_unit.item_number <> btrim(p_item_number) then");
    expect(sourceMerge).toContain("values (v_unit.id, 'item_number'");
    expect(sourceMerge).not.toMatch(/\b(?:drop|truncate)\s+(?:table|column)\b/i);
    expect(sourceMerge).not.toMatch(/\b(?:update|delete\s+from)\s+public\.(?:configurations|crm_leads)\b/i);
    expect(sourceMerge).toContain('public.planning_get_unit_private_details');
    expect(sourceMerge).toContain('public.planning_search_private_units');
    expect(sourceMerge).toContain("a.portal_role::text = 'timan_backend'");
    expect(sourceMerge).toContain('and public.can_access_planning()');
  });
});
