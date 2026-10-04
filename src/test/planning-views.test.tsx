import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlanningIncomingView from '@/components/planning/PlanningIncomingView';
import PlanningTimelineView from '@/components/planning/PlanningTimelineView';
import { PLANNING_TRANSLATIONS } from '@/lib/i18n/planningTranslations';
import { planningIncomingSupply, planningTimelineEntries, planningTimelinePeriods } from '@/lib/planningViews';
import type { PlanningData, PlanningReservation, PlanningUnit } from '@/lib/planningService';

const now = new Date('2026-10-04T12:00:00Z');
const label = (key: string) => PLANNING_TRANSLATIONS.da[key];
const unit = (id: string, date: string, status: PlanningUnit['supply_status']): PlanningUnit => ({
  id, source_system: 'qa-source', item_number: '411000', serial_number: `411000-04-${id}`,
  machine_ident_number: null, production_reference: `S47-${id}`,
  production_order_number: '656331', erp_order_number: '138271',
  available_at: date, expected_delivery_at: date, supply_status: status,
  warehouse_location: null, source_updated_at: '2026-10-04T11:00:00Z',
});
const reservation = (id: string, unitId: string | null, type: PlanningReservation['reservation_type'],
  requestedDate: string): PlanningReservation => ({
  id, configuration_id: `config-${id}`, demand_key: `machine-${id}`, item_number: '411000',
  item_kind: 'serialized', supply_unit_id: unitId, supply_lot_id: null, quantity: 1,
  reservation_type: type, status: 'active', requested_delivery_date: requestedDate,
  lock_review_date: null, created_at: '2026-10-04T11:00:00Z',
});
const data: PlanningData = {
  sources: [{ source_system: 'qa-source', connected: true,
    last_synced_at: '2026-10-04T11:00:00Z', freshness_limit_hours: 24 }],
  units: [
    unit('1', '2026-11-15', 'incoming'), unit('2', '2026-09-20', 'available'),
    unit('3', '2026-12-01', 'incoming'), unit('4', '2026-11-10', 'available'),
    unit('5', '2026-12-10', 'blocked'),
  ],
  lots: [{ id: 'lot-1', source_system: 'qa-source', item_number: '730035',
    quantity: 4, available_at: '2026-12-10', supply_status: 'incoming' }],
  reservations: [
    reservation('soft', '1', 'soft_quote', '2026-11-20'),
    reservation('locked', '2', 'locked_quote', '2026-10-20'),
    reservation('late', '3', 'order', '2026-11-15'),
    reservation('order', '4', 'order', '2026-11-20'),
    reservation('missing', null, 'order', '2026-12-01'),
    { ...reservation('lot', null, 'order', '2026-12-10'), item_number: '730035',
      item_kind: 'quantity', supply_lot_id: 'lot-1', quantity: 2 },
  ],
  requests: [], events: [], truncated: false,
  documents: { 'config-soft': { quoteNumber: 'T-QA', orderNumber: null,
    seller: null, dealer: null, customer: null } },
};

describe('Planning incoming supply and timeline projections', () => {
  it('lists only future concrete supply, never generic catalogue rows or blocked units', () => {
    const incoming = planningIncomingSupply(data, now);
    expect(incoming?.units.map((row) => row.id)).toEqual(['4', '1', '3']);
    expect(incoming?.lots.map((row) => row.id)).toEqual(['lot-1']);
    expect(planningIncomingSupply({ ...data, sources: [] }, now)).toBeNull();
    expect(planningIncomingSupply({ ...data, truncated: true }, now)).toBeNull();
  });

  it('places the same canonical unit in its date period with current reservation and conflict state', () => {
    const incoming = planningIncomingSupply(data, now)!;
    const periods = planningTimelinePeriods('month', 6, now);
    const entries = planningTimelineEntries(data, '411000', periods[0].start, periods.at(-1)!.end, now)!;
    expect(entries.find((row) => row.unit?.id === incoming.units[1].id))?.toMatchObject({
      date: '2026-11-15', state: 'soft_quote',
    });
    expect(entries.find((row) => row.unit?.id === '2')?.state).toBe('locked_quote');
    expect(entries.find((row) => row.unit?.id === '3')?.state).toBe('problem');
    expect(entries.find((row) => row.unit?.id === '4')?.state).toBe('order');
    expect(entries.find((row) => row.reservation?.id === 'missing')?.state).toBe('problem');
    const conflict = { id: 'conflict-1', supply_unit_id: '1', field_name: 'production_order_number',
      existing_value: '656331', incoming_value: '656332', existing_source_system: 'qa-source',
      incoming_source_system: 'other-source', status: 'open' as const };
    expect(planningTimelineEntries({ ...data, conflicts: [conflict] }, '411000',
      periods[0].start, periods.at(-1)!.end, now)?.find((row) => row.unit?.id === '1')?.state).toBe('problem');
    expect(planningTimelineEntries(data, '730035', periods[0].start, periods.at(-1)!.end, now))
      .toEqual(expect.arrayContaining([expect.objectContaining({ lot: data.lots[0], date: '2026-12-10' })]));
    expect(planningTimelineEntries({ ...data, sources: [] }, '411000', periods[0].start, periods.at(-1)!.end, now))
      .toBeNull();
    const undatedStock = { ...data, units: [{ ...unit('stock', '2026-09-20', 'available'),
      available_at: null, expected_delivery_at: null }] };
    expect(planningTimelineEntries(undatedStock, '411000', periods[0].start, periods.at(-1)!.end, now))
      .toEqual(expect.arrayContaining([expect.objectContaining({ key: 'unit:stock', state: 'available' })]));
  });

  it('supports three, six and twelve months on both week and month axes', () => {
    expect(planningTimelinePeriods('month', 3, now)).toHaveLength(3);
    expect(planningTimelinePeriods('month', 6, now)).toHaveLength(6);
    expect(planningTimelinePeriods('month', 12, now)).toHaveLength(12);
    expect(planningTimelinePeriods('week', 3, now).length).toBeGreaterThan(12);
    expect(planningTimelinePeriods('week', 12, now).length).toBeGreaterThan(50);
  });

  it('renders incoming units and quantity lots with detail, not the overview table', () => {
    const onSelectUnit = vi.fn();
    const props = { data, language: 'da', label, itemLabel: (id: string) => `Produkt ${id}`,
      query: '', selectedUnitId: null, onSelectUnit, privateDetail: null };
    const { rerender } = render(<PlanningIncomingView {...props} />);
    expect(screen.getByRole('region', { name: 'Kommende enheder' })).toBeInTheDocument();
    expect(screen.getByText('Forventet ledigt antal')).toBeInTheDocument();
    expect(screen.getAllByText('S47-1').length).toBeGreaterThan(0);
    expect(screen.queryByText('På lager')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Vis detaljer' })[0]);
    expect(onSelectUnit).toHaveBeenCalledWith('4');
    rerender(<PlanningIncomingView {...props} selectedUnitId="1" />);
    expect(screen.getByRole('region', { name: 'Produktion & ERP' })).toHaveTextContent('656331');
    rerender(<PlanningIncomingView {...props} data={{ ...data, units: [], lots: [], reservations: [] }} />);
    expect(screen.getByText('Ingen kommende leverancer')).toBeInTheDocument();
    rerender(<PlanningIncomingView {...props} data={{ ...data, sources: [] }} />);
    expect(screen.getByText('Forsyningsdata endnu ikke tilsluttet')).toBeInTheDocument();
  });

  it('renders a scroll-contained visual time axis and canonical unit blocks', () => {
    const onSelectUnit = vi.fn();
    const props = { data, rows: [{ key: 'RC-1000S', itemNumber: '411000', name: 'RC-1000s',
      attachments: [{ itemNumber: '730035', name: 'Skovl Timan 3330' }] }],
      language: 'da', label, selectedUnitId: null, onSelectUnit, privateDetail: null,
      onShowException: vi.fn(), onShowReservations: vi.fn() };
    const { rerender } = render(<PlanningTimelineView {...props} />);
    expect(screen.getByTestId('planning-timeline-scroll')).toHaveClass('overflow-x-auto');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('RC-1000s')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /S47-1.*Reserveret til tilbud.*T-QA/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /S47-3.*Forsinket/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /S47-1.*Reserveret til tilbud.*T-QA/ }));
    expect(onSelectUnit).toHaveBeenCalledWith('1');
    fireEvent.click(screen.getByRole('button', { name: /config-m.*Kræver handling/ }));
    expect(props.onShowException).toHaveBeenCalledWith('missing');
    fireEvent.click(screen.getByRole('button', { name: '3 måneder' }));
    expect(screen.getByRole('button', { name: '3 måneder' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Uge' }));
    expect(screen.getByRole('button', { name: 'Uge' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Redskaber: RC-1000s' }));
    expect(screen.getByText('Skovl Timan 3330')).toBeInTheDocument();
    rerender(<PlanningTimelineView {...props} data={{ ...data, sources: [] }} />);
    expect(screen.getByText('Forsyningsdata endnu ikke tilsluttet')).toBeInTheDocument();
  });
});
