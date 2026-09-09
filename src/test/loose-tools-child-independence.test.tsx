import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConfiguratorState, MachineConfig } from '@/types/configurator';
import { getAccessoriesFlat, LOOSE_TOOL_KEY } from '@/data/machines';
import {
  shouldEnforceAccessoryParentDependency,
  shouldIncludeQuantityAccessory,
  shouldRenderAccessory,
} from '@/lib/looseToolDependencies';
import { useConfigurator } from '@/hooks/useConfigurator';

const baseState: Omit<ConfiguratorState, 'machineConfigs'> = {
  step: 4,
  flowType: 'quote',
  language: 'da',
  individualUnitConfigs: {},
  ralCodes: {},
  accQty: {},
  date: '',
  deliveryMethod: '',
  deliveryDeliverStartup: null,
  manualDealerDiscountPct: 0,
  demoMachines: {},
  reqNumbers: {},
  currentMachineIndex: 0,
  firmanavn: '',
  kontaktperson: '',
  telefon: '',
  email: '',
  emailRecipient: '',
  comment: '',
  internalNote: '',
};

function stateWith(machineConfigs: MachineConfig[]): ConfiguratorState {
  return { ...baseState, machineConfigs };
}

describe('loose tool child independence', () => {
  it('renders and prices the forkostesæt child quantity without its parent', () => {
    const brush = getAccessoriesFlat(LOOSE_TOOL_KEY).find(item => item.id === '720485');
    expect(brush).toBeDefined();
    expect(shouldRenderAccessory(LOOSE_TOOL_KEY, brush!, [])).toBe(true);
    expect(shouldIncludeQuantityAccessory(LOOSE_TOOL_KEY, brush!, [], 2)).toBe(true);

    const { result } = renderHook(() => useConfigurator());
    act(() => result.current.setState(() => stateWith([
      { id: 'm0', type: LOOSE_TOOL_KEY, qty: 1, configMode: 'shared', acc: [] },
    ])));
    act(() => result.current.setState(state => ({
      ...state,
      accQty: { m0_720485: 2 },
    })));

    expect(result.current.calcResult?.lineItems).toContainEqual(expect.objectContaining({ varenr: '720485', price: 1900 }));
  });

  it('keeps a selected V-plow child when its loose-tools parent is removed', () => {
    const { result } = renderHook(() => useConfigurator());
    act(() => result.current.setState(() => stateWith([
      { id: 'm0', type: LOOSE_TOOL_KEY, qty: 1, configMode: 'shared', acc: ['730114', 'LT_730276'] },
    ])));

    act(() => result.current.toggleAcc('730114'));

    expect(result.current.state.machineConfigs[0].acc).toEqual(['LT_730276']);
    expect(result.current.calcResult?.lineItems).toContainEqual(expect.objectContaining({ varenr: '730276', price: 1810 }));
  });

  it('retains parent dependency rules outside loose tools', () => {
    const vPlowBlade = getAccessoriesFlat('RC-1000S').find(item => item.varenr === '730276');
    expect(vPlowBlade).toBeDefined();
    expect(shouldEnforceAccessoryParentDependency('RC-1000S')).toBe(true);
    expect(shouldRenderAccessory('RC-1000S', vPlowBlade!, [])).toBe(false);
    expect(shouldIncludeQuantityAccessory('RC-1000S', vPlowBlade!, [], 2)).toBe(false);
  });

  it('removes a normal configurator child when its parent is removed', () => {
    const { result } = renderHook(() => useConfigurator());
    act(() => result.current.setState(() => stateWith([
      { id: 'm0', type: 'RC-1000S', qty: 1, configMode: 'shared', acc: ['411742', '730276'] },
    ])));

    act(() => result.current.toggleAcc('411742'));

    expect(result.current.state.machineConfigs[0].acc).toEqual([]);
  });
});
