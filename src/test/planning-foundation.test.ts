import { describe, expect, it } from 'vitest';
import { hasAreaAccess, type PortalAccessUser } from '@/lib/portalAccess';
import { PORTAL_AREA_ROUTES } from '@/lib/portalNavigation';
import { findPortalCapabilityContract } from '../../supabase/functions/_shared/portalCapabilityContract';
import {
  filterPlanningReservations, isPlanningSourceFresh, planningExceptions, planningItemSummary, planningSourceState,
  planningTimelineBucket, planningTimelineUnits,
  type PlanningData,
} from '@/lib/planningService';
import { PLANNING_TRANSLATIONS } from '@/lib/i18n/planningTranslations';

const emptyData: PlanningData = {
  sources: [], units: [], lots: [], reservations: [], requests: [], events: [], truncated: false,
};
const now = new Date('2026-10-04T12:00:00Z');
const freshSource = {
  source_system: 'qa-source', connected: true,
  last_synced_at: '2026-10-04T11:00:00Z', freshness_limit_hours: 24,
};

describe('Planning opt-in and source safety', () => {
  it('denies Backend and Seller by default, plus any external role even with a forged area', () => {
    const backend: PortalAccessUser = { role: 'timan_saelger', partner_type: null, portal_role: 'timan_backend' };
    const seller = { ...backend, portal_role: 'timan_seller' };
    const dealer = { ...backend, portal_role: 'timan_dealer' };
    expect(hasAreaAccess(backend, 'planning')).toBe(false);
    expect(hasAreaAccess(seller, 'planning')).toBe(false);
    expect(hasAreaAccess({ ...backend, allowed_areas: ['planning'] }, 'planning')).toBe(true);
    expect(hasAreaAccess({ ...seller, allowed_areas: ['planning'] }, 'planning')).toBe(true);
    expect(hasAreaAccess({ ...dealer, allowed_areas: ['planning'] }, 'planning')).toBe(false);
  });

  it('uses the shared route contract and does not add planning to role defaults', () => {
    expect(PORTAL_AREA_ROUTES.planning).toBe('/portal/planning');
    expect(findPortalCapabilityContract('area.planning')?.access).toEqual({ kind: 'area', key: 'planning' });
  });

  it('never presents disconnected or stale supply as available stock', () => {
    expect(planningSourceState(emptyData, now)).toBe('missing');
    expect(planningItemSummary(emptyData, '411000', now)).toBeNull();
    const stale = { ...freshSource, last_synced_at: '2026-10-02T00:00:00Z' };
    expect(isPlanningSourceFresh(stale, now)).toBe(false);
    expect(planningSourceState({ ...emptyData, sources: [stale] }, now)).toBe('stale');
    expect(planningExceptions({ ...emptyData, sources: [stale] }, now)).toContainEqual({
      kind: 'source_stale', key: 'qa-source',
    });
  });

  it('counts only eligible serialized units and quantity lots from a fresh source', () => {
    const data: PlanningData = {
      ...emptyData, sources: [freshSource],
      units: [
        { id: 's1', source_system: 'qa-source', item_number: '411000', serial_number: 'ACA-1',
          machine_ident_number: null, available_at: '2026-09-01', expected_delivery_at: null,
          supply_status: 'available', warehouse_location: null, source_updated_at: '2026-09-01' },
        { id: 's2', source_system: 'qa-source', item_number: '411000', serial_number: 'ACA-2',
          machine_ident_number: null, available_at: '2026-11-01', expected_delivery_at: null,
          supply_status: 'incoming', warehouse_location: null, source_updated_at: '2026-09-01' },
        { id: 's3', source_system: 'qa-source', item_number: '411000', serial_number: 'ACA-3',
          machine_ident_number: null, available_at: '2026-09-01', expected_delivery_at: null,
          supply_status: 'demo', warehouse_location: null, source_updated_at: '2026-09-01' },
      ],
      lots: [{ id: 'lot', source_system: 'qa-source', item_number: '730035',
        quantity: 3, available_at: '2026-09-01', supply_status: 'available' }],
    };
    expect(planningItemSummary(data, '411000', now)).toMatchObject({
      stock: 1, incoming: 1, nextAvailable: '2026-09-01',
    });
    expect(planningItemSummary(data, '730035', now)?.stock).toBe(3);
    expect(planningItemSummary(data, '761000', now)).toBeNull();
    expect(planningTimelineUnits(data, '411000', new Date('2026-08-31'), new Date('2026-12-01'), now)).toBe(2);
    expect(planningTimelineUnits({ ...data, sources: [{ ...freshSource, connected: false }] }, '411000',
      new Date('2026-08-31'), new Date('2026-12-01'), now)).toBeNull();
    expect(planningItemSummary({ ...data, truncated: true }, '411000', now)).toBeNull();
  });

  it('flags unassigned orders, late serials and overdue quote locks', () => {
    const data: PlanningData = {
      ...emptyData, sources: [freshSource],
      units: [{ id: 's2', source_system: 'qa-source', item_number: '411000', serial_number: 'ACA-2',
        machine_ident_number: null, available_at: '2026-11-01', expected_delivery_at: null,
        supply_status: 'incoming', warehouse_location: null, source_updated_at: '2026-09-01' }],
      reservations: [
        { id: 'r1', configuration_id: 'c1', demand_key: 'm0_1', item_number: '411000', item_kind: 'serialized',
          supply_unit_id: null, supply_lot_id: null, quantity: 1, reservation_type: 'order',
          status: 'active', requested_delivery_date: '2026-10-10', lock_review_date: null,
          created_at: '2026-10-01' },
        { id: 'r2', configuration_id: 'c2', demand_key: 'm0_1', item_number: '411000', item_kind: 'serialized',
          supply_unit_id: 's2', supply_lot_id: null, quantity: 1, reservation_type: 'locked_quote',
          status: 'active', requested_delivery_date: '2026-10-10', lock_review_date: '2026-10-01',
          created_at: '2026-10-01' },
      ],
    };
    expect(planningExceptions(data, now).map((item) => item.kind)).toEqual([
      'order_unassigned', 'delivery_late', 'lock_review',
    ]);
    expect(planningTimelineBucket(data, '411000', new Date('2026-10-01'), new Date('2026-11-01'), now))
      .toEqual({ available: 0, incoming: 0, soft: 0, locked: 1, orders: 1, problems: 2 });
    expect(planningTimelineBucket({ ...data, truncated: true }, '411000',
      new Date('2026-10-01'), new Date('2026-11-01'), now)).toBeNull();
    expect(filterPlanningReservations(data, 'all')).toHaveLength(2);
    expect(filterPlanningReservations(data, 'order').map((row) => row.id)).toEqual(['r1']);
    expect(filterPlanningReservations(data, 'locked_quote').map((row) => row.id)).toEqual(['r2']);
    expect(filterPlanningReservations(data, 'soft_quote')).toEqual([]);
    expect(filterPlanningReservations(data, 'problem').map((row) => row.id)).toEqual(['r1', 'r2']);
  });

  it('counts quantity lots without offering fully allocated lots as next free supply', () => {
    const data: PlanningData = {
      ...emptyData, sources: [freshSource],
      lots: [
        { id: 'lot-1', source_system: 'qa-source', item_number: '720121', quantity: 2,
          available_at: '2026-10-10', supply_status: 'incoming' },
        { id: 'lot-2', source_system: 'qa-source', item_number: '720121', quantity: 3,
          available_at: '2026-11-01', supply_status: 'incoming' },
      ],
      reservations: [1, 2].map((piece) => ({ id: `r${piece}`, configuration_id: 'qa-config',
        demand_key: `m0_1|720121|${piece}`, item_number: '720121', item_kind: 'quantity' as const,
        supply_unit_id: null, supply_lot_id: 'lot-1', quantity: 1,
        reservation_type: 'order' as const, status: 'active' as const,
        requested_delivery_date: '2026-10-01', lock_review_date: null,
        created_at: '2026-10-01' })),
    };
    expect(planningItemSummary(data, '720121', now)).toMatchObject({
      stock: 0, incoming: 5, nextAvailable: '2026-11-01',
    });
    expect(planningTimelineUnits(data, '720121', new Date('2026-10-01'),
      new Date('2026-12-01'), now)).toBe(5);
    expect(planningExceptions(data, now).filter((item) => item.kind === 'delivery_late'))
      .toHaveLength(2);
  });

  it('has localized Planning labels in all nine portal languages', () => {
    expect(Object.keys(PLANNING_TRANSLATIONS).sort()).toEqual(['cs', 'da', 'de', 'en', 'fr', 'hu', 'it', 'pl', 'sv']);
    const keys = Object.keys(PLANNING_TRANSLATIONS.da).sort();
    for (const dictionary of Object.values(PLANNING_TRANSLATIONS)) {
      expect(Object.keys(dictionary).sort()).toEqual(keys);
      expect(Object.values(dictionary).every((value) => value.trim().length > 0)).toBe(true);
    }
  });
});
