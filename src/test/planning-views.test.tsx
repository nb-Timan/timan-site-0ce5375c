import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlanningIncomingView from '@/components/planning/PlanningIncomingView';
import PlanningTimelineView from '@/components/planning/PlanningTimelineView';
import { PLANNING_TRANSLATIONS } from '@/lib/i18n/planningTranslations';
import {
  comparePlanningSerialNumbers, planningIncomingSupply, planningTimelineEntries, planningTimelinePeriods,
  sortPlanningUnitsBySerial,
} from '@/lib/planningViews';
import type { PlanningData, PlanningReservation, PlanningUnit } from '@/lib/planningService';

const now = new Date('2026-10-04T12:00:00Z');
const label = (key: string) => PLANNING_TRANSLATIONS.da[key];
const unit = (id: string, date: string, status: PlanningUnit['supply_status'], itemNumber = '411000'): PlanningUnit => ({
  id, source_system: 'qa-source', item_number: itemNumber, serial_number: `${itemNumber}-04-${id}`,
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
    last_synced_at: '2026-10-04T11:00:00Z', freshness_limit_hours: 8760 }],
  units: [
    unit('1', '2026-11-15', 'incoming'), unit('2', '2026-09-20', 'available'),
    unit('3', '2026-12-01', 'incoming'), unit('4', '2026-11-10', 'available'),
    unit('5', '2026-12-10', 'blocked'), unit('6', '2026-11-20', 'incoming', '410040'),
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
const machineFamilies = [
  { id: 'RC-751', itemNumber: '410040', label: 'RC-751', equipmentItemNumbers: ['411687'] },
  { id: 'RC-1000S', itemNumber: '411000', label: 'RC-1000s', equipmentItemNumbers: ['412594'] },
  { id: 'Timan 3330', itemNumber: '712000', label: 'Timan 3330', equipmentItemNumbers: ['730035'] },
  { id: 'Timan 2620', itemNumber: '761000', label: 'Timan 2620', equipmentItemNumbers: ['770007'] },
  { id: 'Loader Line', itemNumber: '666-333', label: 'CS-200 til traktor', equipmentItemNumbers: ['725161'] },
];

describe('Planning incoming supply and timeline projections', () => {
  it('lists only future concrete supply, never generic catalogue rows or blocked units', () => {
    const incoming = planningIncomingSupply(data, now);
    expect(incoming?.units.map((row) => row.id)).toEqual(['4', '1', '6', '3']);
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
    expect(entries.find((row) => row.unit?.id === '2')).toBeUndefined();
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

  it('keeps a historical RC-751 availability date in its matching calendar month', () => {
    const s25 = { ...unit('s25-8', '2026-06-15', 'available', '410040'),
      serial_number: '410040-01-0397', production_reference: 'S25-8',
      production_completed_at: '2026-06-12', production_completed_week: 24,
      production_completed_year: 2026 };
    const historical = { ...data, units: [s25], reservations: [] };
    const entries = planningTimelineEntries(historical, '410040',
      new Date('2026-06-01T00:00:00Z'), new Date('2026-07-01T00:00:00Z'), now);
    expect(entries).toEqual([expect.objectContaining({
      key: 'unit:s25-8', date: '2026-06-15', state: 'available', unit: s25,
    })]);
    expect(planningTimelineEntries(historical, '410040',
      new Date('2026-10-01T00:00:00Z'), new Date('2027-04-01T00:00:00Z'), now))
      .toEqual([]);
  });

  it('supports three, six and twelve months on both week and month axes', () => {
    expect(planningTimelinePeriods('month', 3, now)).toHaveLength(3);
    expect(planningTimelinePeriods('month', 6, now)).toHaveLength(6);
    expect(planningTimelinePeriods('month', 12, now)).toHaveLength(12);
    expect(planningTimelinePeriods('week', 3, now).length).toBeGreaterThan(12);
    expect(planningTimelinePeriods('week', 12, now).length).toBeGreaterThan(50);
  });

  it('sorts serial numbers naturally without changing their leading zeros', () => {
    const rows = [
      { ...unit('serial-12', '2026-11-10', 'incoming', '410040'), serial_number: '410040-01-0412' },
      { ...unit('serial-10', '2026-11-12', 'incoming', '410040'), serial_number: '410040-01-0410' },
      { ...unit('serial-11', '2026-11-11', 'incoming', '410040'), serial_number: '410040-01-0411' },
      { ...unit('serial-100', '2026-11-13', 'incoming', '410040'), serial_number: '410040-01-0100' },
    ];

    expect(sortPlanningUnitsBySerial(rows).map((row) => row.serial_number)).toEqual([
      '410040-01-0100', '410040-01-0410', '410040-01-0411', '410040-01-0412',
    ]);
    expect(rows.map((row) => row.serial_number)).toEqual([
      '410040-01-0412', '410040-01-0410', '410040-01-0411', '410040-01-0100',
    ]);
    expect(comparePlanningSerialNumbers('410040-01-0410', '410040-01-0411')).toBeLessThan(0);
  });

  it('renders incoming units and quantity lots with detail, not the overview table', () => {
    const onSelectUnit = vi.fn();
    const props = { data, language: 'da', label, itemLabel: (id: string) => `Produkt ${id}`,
      machineFamilies, query: '', selectedUnitId: null, onSelectUnit, privateDetail: null };
    const { rerender } = render(<PlanningIncomingView {...props} />);
    expect(screen.getByRole('button', { name: 'Alle' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Kommende enheder' })).toBeInTheDocument();
    expect(screen.getByText('Forventet ledigt antal')).toBeInTheDocument();
    expect(screen.getAllByText('S47-1').length).toBeGreaterThan(0);
    expect(screen.queryByText('På lager')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Vis detaljer' })[0]);
    expect(onSelectUnit).toHaveBeenCalledWith('6');
    rerender(<PlanningIncomingView {...props} selectedUnitId="1" />);
    expect(screen.getByRole('region', { name: 'Produktion & ERP' })).toHaveTextContent('656331');
    rerender(<PlanningIncomingView {...props} data={{ ...data, units: [], lots: [], reservations: [] }} />);
    expect(screen.getByText('Ingen kommende leverancer')).toBeInTheDocument();
    rerender(<PlanningIncomingView {...props} data={{ ...data, sources: [] }} />);
    expect(screen.getByText('Forsyningsdata endnu ikke tilsluttet')).toBeInTheDocument();
  });

  it('combines the delivery category, canonical machine family and search filters', () => {
    const props = { data, language: 'da', label, itemLabel: (id: string) => `Produkt ${id}`,
      machineFamilies, query: '', selectedUnitId: null, onSelectUnit: vi.fn(), privateDetail: null };
    const { rerender } = render(<PlanningIncomingView {...props} />);

    expect(screen.getByRole('button', { name: 'RC-751' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'RC-1000s' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timan 3330' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timan 2620' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CS-200 til traktor' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'RC-751' }));
    expect(screen.getAllByText('Produkt 410040').length).toBeGreaterThan(0);
    expect(screen.queryByText('Produkt 411000')).not.toBeInTheDocument();
    expect(screen.queryByText('Produkt 730035')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Redskaber' }));
    expect(screen.getByRole('combobox', { name: 'Redskaber' })).toHaveTextContent('Produkt 411687');
    expect(screen.getByRole('combobox', { name: 'Redskaber' })).not.toHaveTextContent('Produkt 730035');
    expect(screen.getByText('Ingen kommende redskaber')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Timan 3330' }));
    expect(screen.getByRole('combobox', { name: 'Redskaber' })).toHaveTextContent('Produkt 730035');
    expect(screen.getAllByText('Produkt 730035').length).toBeGreaterThan(1);

    rerender(<PlanningIncomingView {...props} query="S47-6" />);
    fireEvent.click(screen.getByRole('button', { name: 'RC-751' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maskine' }));
    expect(screen.getAllByText('S47-6').length).toBeGreaterThan(0);
    rerender(<PlanningIncomingView {...props} query="findes-ikke" />);
    expect(screen.getByText('Ingen registreringer.')).toBeInTheDocument();

    rerender(<PlanningIncomingView {...props} query="730035" />);
    fireEvent.click(screen.getByRole('button', { name: 'Alle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Redskaber' }));
    expect(screen.getAllByText('Produkt 730035').length).toBeGreaterThan(1);
    expect(screen.queryByText('Produkt 410040')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Redskaber' }), { target: { value: '730035' } });
    expect(screen.getByRole('combobox', { name: 'Redskaber' })).toHaveValue('730035');

    rerender(<PlanningIncomingView {...props} query=""
      data={{ ...data, lots: [] }} />);
    expect(screen.getByText('Ingen kommende redskaber')).toBeInTheDocument();
  });

  it('keeps RC-751 and RC-1000s naturally sorted after machine and search filters', () => {
    const sortableData: PlanningData = {
      ...data,
      units: [
        { ...unit('rc751-12', '2026-11-10', 'incoming', '410040'), serial_number: '410040-01-0412' },
        { ...unit('rc1000-10', '2026-11-15', 'incoming'), serial_number: '411000-04-1610' },
        { ...unit('rc751-10', '2026-11-12', 'incoming', '410040'), serial_number: '410040-01-0410' },
        { ...unit('rc1000-08', '2026-11-17', 'incoming'), serial_number: '411000-04-1608' },
        { ...unit('rc751-11', '2026-11-11', 'incoming', '410040'), serial_number: '410040-01-0411' },
        { ...unit('rc1000-09', '2026-11-16', 'incoming'), serial_number: '411000-04-1609' },
      ],
      lots: [],
      reservations: [],
    };
    const props = { data: sortableData, language: 'da', label, itemLabel: (id: string) => `Produkt ${id}`,
      machineFamilies, query: '', selectedUnitId: null, onSelectUnit: vi.fn(), privateDetail: null };
    const { rerender } = render(<PlanningIncomingView {...props} />);
    const displayedSerials = () => screen.getAllByRole('row').slice(1)
      .map((row) => within(row).getAllByRole('cell')[1].textContent);

    fireEvent.click(screen.getByRole('button', { name: 'RC-751' }));
    expect(displayedSerials()).toEqual(['410040-01-0410', '410040-01-0411', '410040-01-0412']);

    fireEvent.click(screen.getByRole('button', { name: 'RC-1000s' }));
    expect(displayedSerials()).toEqual(['411000-04-1608', '411000-04-1609', '411000-04-1610']);

    rerender(<PlanningIncomingView {...props} query="411000-04-16" />);
    expect(displayedSerials()).toEqual(['411000-04-1608', '411000-04-1609', '411000-04-1610']);
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
