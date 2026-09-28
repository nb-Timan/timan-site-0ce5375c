import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/publishedProductMaster', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/publishedProductMaster')>(),
  isProductActive: () => true,
}));
import {
  ACC_ID_VPLOW,
  ACC_ID_WIRE_HARNESS,
  ACC_ID_WORK_LIGHT,
  getAccessoriesFlat,
} from '@/data/machines';
import {
  getConfiguratorMachineUnits,
  setConfiguratorMachineQuantity,
  toggleConfiguratorAccessory,
} from '@/lib/configuratorDomain';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';

describe('shared canonical Configurator domain', () => {
  it('adds and removes the RC-1000S wire harness with its canonical dependency', () => {
    let state = setConfiguratorMachineQuantity(createEmptyConfiguratorState(), 'RC-1000S', 1);
    state = toggleConfiguratorAccessory(state, ACC_ID_WORK_LIGHT, 0).state;
    const withAttachment = toggleConfiguratorAccessory(state, ACC_ID_VPLOW, 0);
    expect(withAttachment.state.individualUnitConfigs.m0_1.acc).toContain(ACC_ID_WIRE_HARNESS);
    const withoutAttachment = toggleConfiguratorAccessory(withAttachment.state, ACC_ID_VPLOW, 0);
    expect(withoutAttachment.state.individualUnitConfigs.m0_1.acc).not.toContain(ACC_ID_WIRE_HARNESS);
  });

  it('replaces another option in the same mandatory group', () => {
    let state = setConfiguratorMachineQuantity(createEmptyConfiguratorState(), 'RC-1000S', 1);
    const oil = getAccessoriesFlat('RC-1000S').filter((item) => item.group === 'oil_1000');
    expect(oil.length).toBeGreaterThan(1);
    state = toggleConfiguratorAccessory(state, oil[0].id, 0).state;
    state = toggleConfiguratorAccessory(state, oil[1].id, 0).state;
    expect(state.individualUnitConfigs.m0_1.acc).toContain(oil[1].id);
    expect(state.individualUnitConfigs.m0_1.acc).not.toContain(oil[0].id);
  });

  it('enforces singleton item numbers across individual machine units', () => {
    let state = setConfiguratorMachineQuantity(createEmptyConfiguratorState(), 'Timan 3330', 2);
    const singleton = getAccessoriesFlat('Timan 3330').find((item) => ['721059', '721122'].includes(String(item.varenr)));
    expect(singleton).toBeTruthy();
    state = toggleConfiguratorAccessory(state, singleton!.id, 0).state;
    const second = toggleConfiguratorAccessory(state, singleton!.id, 1);
    expect(second.changed).toBe(false);
    expect(second.blockedReason).toBe('SINGLETON_LIMIT');
  });

  it('keeps stable unit indexes when quantities change', () => {
    let state = setConfiguratorMachineQuantity(createEmptyConfiguratorState(), 'RC-1000S', 2);
    state = setConfiguratorMachineQuantity(state, 'Timan 3330', 1);
    expect(getConfiguratorMachineUnits(state).map((unit) => unit.unitNumber)).toEqual([1, 2, 3]);
  });
});
