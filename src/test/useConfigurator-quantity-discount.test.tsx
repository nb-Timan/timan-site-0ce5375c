import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConfiguratorState, MachineConfig } from '@/types/configurator';
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

describe('live basket stk. rabat eligibility', () => {
  it('removes an already-selected accessory from an individual unit', () => {
    const { result } = renderHook(() => useConfigurator());

    act(() => result.current.setState(() => stateWith([
      { id: 'm0', type: 'RC-1000S', qty: 1, configMode: 'individual', acc: [] },
    ])));
    act(() => result.current.setState((state) => ({
      ...state,
      individualUnitConfigs: { m0_1: { acc: ['410910', '411701', '411800'] } },
      currentMachineIndex: 0,
    })));

    act(() => result.current.toggleAcc('411701'));

    expect(result.current.state.individualUnitConfigs.m0_1.acc).toEqual(['410910', '411800']);
  });

  it('removes an already-selected accessory from a shared unit', () => {
    const { result } = renderHook(() => useConfigurator());

    act(() => result.current.setState(() => stateWith([
      { id: 'm0', type: 'RC-1000S', qty: 1, configMode: 'shared', acc: ['410910', '411701', '411800'] },
    ])));

    act(() => result.current.toggleAcc('411701'));

    expect(result.current.state.machineConfigs[0].acc).toEqual(['410910', '411800']);
  });

  it('does not show or apply stk. rabat for Loader-Line only', () => {
    const { result } = renderHook(() => useConfigurator());

    act(() => result.current.setState(() => stateWith([
      { id: 'm0', type: 'Loader Line', qty: 4, configMode: 'shared', acc: ['725161'] },
    ])));

    expect(result.current.calcResult?.discountDetails.some(d => d.txt.includes('Stk. rabat'))).toBe(false);
    expect(result.current.calcResult?.totalDiscount).toBe(45600);
    expect(result.current.calcResult?.currentPrice).toBe(136800);
  });

  it('does not show or apply stk. rabat for loose tools only', () => {
    const { result } = renderHook(() => useConfigurator());

    act(() => result.current.setState(() => stateWith([
      { id: 'm0', type: 'LOOSE_TOOL', qty: 4, configMode: 'shared', acc: ['410910'] },
    ])));

    expect(result.current.calcResult?.discountDetails.some(d => d.txt.includes('Stk. rabat'))).toBe(false);
    expect(result.current.calcResult?.totalDiscount).toBe(43900);
    expect(result.current.calcResult?.currentPrice).toBe(131700);
  });
});
