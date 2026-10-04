import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessoriesFlat } from '@/data/machines';
import { usePlanningAvailability, worstPlanningStatus } from '@/hooks/usePlanningAvailability';
import { planningSelectedAttachments } from '@/lib/planningConfigurationItems';
import { PlanningAvailabilityBadge } from '@/components/configurator/PlanningAvailabilityBadge';
import type { ConfiguratorState } from '@/types/configurator';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc } }));

describe('Planning Configurator gate', () => {
  beforeEach(() => mocks.rpc.mockReset());

  it('waits for View-as resolution before enabling Planning in Configurator', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    expect(source).toContain('useEffectivePortalUserState(appUser)');
    expect(source).toContain("!viewAsResolving\n    && hasAreaAccess(resolvedEffectiveUser, 'planning')");
  });

  it('makes no Planning request while the capability is off', async () => {
    const items = [{ itemNumber: '712000', quantity: 1 }];
    const { result, rerender } = renderHook(({ enabled }) =>
      usePlanningAvailability(enabled, items, '2026-12-01'), { initialProps: { enabled: false } });
    expect(result.current).toEqual({});
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: {
      status: 'unknown', source_state: 'missing', item_number: '712000', requested_date: '2026-12-01',
      stock: 0, incoming: 0, free_by_date: 0, soft_by_date: 0, next_available: null,
    }, error: null });
    rerender({ enabled: true });
    await waitFor(() => expect(result.current['712000']?.status).toBe('unknown'));
    expect(mocks.rpc).toHaveBeenCalledWith('planning_get_availability', {
      p_item_number: '712000', p_requested_date: '2026-12-01', p_quantity: 1,
    });
    rerender({ enabled: false });
    await waitFor(() => expect(result.current).toEqual({}));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('counts shared attachment selections per machine and applies the worst status', () => {
    const accessory = getAccessoriesFlat('Timan 3330').find((item) =>
      item.varenr && item.varenr !== 'HEADER' && !item.isQtyInput);
    expect(accessory).toBeTruthy();
    const state = {
      machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: 2, configMode: 'shared', acc: [accessory!.id] }],
      individualUnitConfigs: {}, accQty: {},
    } as unknown as ConfiguratorState;
    expect(planningSelectedAttachments(state)).toContainEqual({ itemNumber: accessory!.varenr, quantity: 2 });
    expect(worstPlanningStatus(['green', 'yellow'])).toBe('yellow');
    expect(worstPlanningStatus(['green', 'red'])).toBe('red');
  });

  it('shows missing supply as neutral unknown rather than a false red shortage', () => {
    render(<PlanningAvailabilityBadge language="da" availability={{
      status: 'unknown', source_state: 'missing', item_number: '712000',
      requested_date: '2026-12-01', stock: 0, incoming: 0,
      free_by_date: 0, soft_by_date: 0, next_available: null,
    }} />);
    expect(screen.getByText('Tilgængelighed ukendt')).toBeInTheDocument();
    expect(screen.queryByText('Ledige ved ønsket dato')).not.toBeInTheDocument();
    expect(document.querySelector('.bg-slate-400')).toBeInTheDocument();
  });

  it.each([
    ['green', 'Tilgængelig', 'bg-emerald-600'],
    ['yellow', 'Kræver planlægning', 'bg-amber-500'],
    ['red', 'Ikke tilgængelig', 'bg-red-600'],
    ['unknown', 'Tilgængelighed ukendt', 'bg-slate-400'],
  ] as const)('renders the server %s status unchanged in Configurator', async (status, label, color) => {
    mocks.rpc.mockResolvedValue({ data: {
      status, source_state: status === 'unknown' ? 'missing' : 'fresh',
      item_number: '712000', requested_date: '2026-12-15',
      stock: 8, incoming: 0, free_by_date: status === 'green' ? 8 : 5,
      soft_by_date: status === 'yellow' ? 3 : 0, next_available: '2026-12-01',
    }, error: null });
    const { result } = renderHook(() => usePlanningAvailability(true,
      [{ itemNumber: '712000', quantity: 8 }], '2026-12-15'));
    await waitFor(() => expect(result.current['712000']?.status).toBe(status));
    expect(mocks.rpc).toHaveBeenCalledWith('planning_get_availability', {
      p_item_number: '712000', p_requested_date: '2026-12-15', p_quantity: 8,
    });
    render(<PlanningAvailabilityBadge language="da" availability={result.current['712000']} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(document.querySelector(`.${color}`)).toBeInTheDocument();
  });
});
