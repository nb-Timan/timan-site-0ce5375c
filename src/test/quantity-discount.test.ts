import { describe, expect, it } from 'vitest';
import type { ConfiguratorState, MachineConfig } from '@/types/configurator';
import { calcConfigurationTotals } from '@/lib/calcConfiguration';

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

describe('stk. rabat quantity eligibility', () => {
  it('does not apply quantity discount for Loader-Line only', () => {
    const totals = calcConfigurationTotals(stateWith([
      { id: 'm0', type: 'Loader Line', qty: 4, configMode: 'shared', acc: ['725161'] },
    ]));

    expect(totals.subtotal).toBe(182400);
    expect(totals.totalDiscount).toBe(45600);
    expect(totals.finalPrice).toBe(136800);
  });

  it('does not apply quantity discount for loose tools only', () => {
    const totals = calcConfigurationTotals(stateWith([
      { id: 'm0', type: 'LOOSE_TOOL', qty: 4, configMode: 'shared', acc: ['410910'] },
    ]));

    expect(totals.subtotal).toBe(175600);
    expect(totals.totalDiscount).toBe(43900);
    expect(totals.finalPrice).toBe(131700);
  });

  it('does not let non-eligible products trigger quantity discount', () => {
    const totals = calcConfigurationTotals(stateWith([
      { id: 'm0', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] },
      { id: 'm1', type: 'Loader Line', qty: 3, configMode: 'shared', acc: ['725161'] },
    ]));

    expect(totals.subtotal).toBe(304300);
    expect(totals.totalDiscount).toBe(76075);
    expect(totals.finalPrice).toBe(228225);
  });

  it('applies quantity discount only to eligible machine base', () => {
    const totals = calcConfigurationTotals(stateWith([
      { id: 'm0', type: 'RC-751', qty: 2, configMode: 'shared', acc: [] },
      { id: 'm1', type: 'Loader Line', qty: 3, configMode: 'shared', acc: ['725161'] },
    ]));

    expect(totals.subtotal).toBe(471800);
    expect(totals.totalDiscount).toBe(122975);
    expect(totals.finalPrice).toBe(348825);
  });
});