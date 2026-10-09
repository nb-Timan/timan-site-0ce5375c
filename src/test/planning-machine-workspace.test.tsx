import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PlanningMachineWorkspace from '@/components/planning/PlanningMachineWorkspace';
import { PLANNING_TRANSLATIONS } from '@/lib/i18n/planningTranslations';
import { planningItemSummary, type PlanningData } from '@/lib/planningService';

const label = (key: string) => PLANNING_TRANSLATIONS.da[key];
const data: PlanningData = {
  sources: [{ source_system: 'qa-source', connected: true,
    last_synced_at: '2026-10-04T11:00:00Z', freshness_limit_hours: 24 }],
  units: [{ id: 'unit-1', source_system: 'qa-source', item_number: '410040',
    serial_number: '410040-QA-1', machine_ident_number: null, available_at: '2026-10-01',
    expected_delivery_at: null, supply_status: 'available', warehouse_location: null,
    source_updated_at: '2026-10-04T11:00:00Z' }],
  lots: [],
  reservations: [{ id: 'reservation-1', configuration_id: 'config-1', demand_key: 'machine-1',
    item_number: '410040', item_kind: 'serialized', supply_unit_id: 'unit-1', supply_lot_id: null,
    quantity: 1, reservation_type: 'soft_quote', status: 'active', requested_delivery_date: '2026-11-01',
    lock_review_date: null, created_at: '2026-10-04T11:00:00Z' }],
  requests: [],
  events: [{ id: 'event-1', configuration_id: 'config-1', event_type: 'quote_reservation',
    previous_supply_unit_id: null, next_supply_unit_id: 'unit-1', reason: 'QA',
    created_at: '2026-10-04T11:00:00Z' }],
  truncated: false,
};

const machines = [
  ['RC-751', '410040'], ['RC-1000S', '411000'], ['Timan 3330', '712000'], ['Timan 2620', '761000'],
].map(([key, itemNumber]) => ({ key, itemNumber, name: key, imageUrl: `/qa/${itemNumber}.png`,
  summary: planningItemSummary(data, itemNumber, new Date('2026-10-04T12:00:00Z')) }));

function renderWorkspace(override: Partial<ComponentProps<typeof PlanningMachineWorkspace>> = {}) {
  const props: ComponentProps<typeof PlanningMachineWorkspace> = {
    data, completeSupply: true, language: 'da', label, machines, selectedMachine: 'RC-751',
    selectedUnitId: null, privateDetail: null, query: '', onQueryChange: vi.fn(), matches: () => true,
    onSelectMachine: vi.fn(), onSelectUnit: vi.fn(), onShowAttachments: vi.fn(),
    onShowReservations: vi.fn(), onShowIncoming: vi.fn(), onShowTimeline: vi.fn(), ...override,
  };
  return { ...render(<PlanningMachineWorkspace {...props} />), props };
}

describe('Planning machine workspace', () => {
  it('renders the operational three-column machine, planning and detail hierarchy', () => {
    const { props } = renderWorkspace();
    expect(screen.getByTestId('planning-machine-workspace')).toHaveClass('xl:grid-cols-[220px_minmax(0,1fr)_290px]');
    expect(screen.getByLabelText('Vælg maskine')).toBeInTheDocument();
    expect(screen.getByLabelText('Maskindetaljer')).toHaveTextContent('410040');
    expect(screen.getByText('Basismaskine og tilhørende redskaber')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Lagerstatus' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Serienumre' })).toBeInTheDocument();
    expect(screen.getByText('410040-QA-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Timan 3330/ }));
    expect(props.onSelectMachine).toHaveBeenCalledWith('Timan 3330');
    expect(props.onSelectUnit).toHaveBeenCalledWith(null);
  });

  it('reuses the same rows for card view and keeps actions functional', () => {
    const { props } = renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Vis som kort' }));
    expect(screen.getByRole('button', { name: 'Vis som kort' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Se relaterede redskaber' }));
    expect(props.onShowAttachments).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Kommende leverancer' }));
    expect(props.onShowIncoming).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Kalendervisning' }));
    expect(props.onShowTimeline).toHaveBeenCalledTimes(1);
  });

  it('preserves a truthful unavailable state without fabricating stock', () => {
    const unavailableMachines = machines.map((machine) => ({ ...machine, summary: null }));
    renderWorkspace({ data: { ...data, sources: [], units: [], reservations: [], events: [] },
      completeSupply: false, machines: unavailableMachines });
    expect(screen.getAllByText('Ukendt').length).toBeGreaterThan(0);
    expect(screen.getByText('Forsyningsdata endnu ikke tilsluttet')).toBeInTheDocument();
    expect(screen.queryByText('1 på lager')).not.toBeInTheDocument();
  });
});
