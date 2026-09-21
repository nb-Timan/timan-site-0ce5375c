import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateConfiguration, roundPricingMoney } from '@/lib/calcConfiguration';
import {
  commonMachineDeliveryDate,
  hasMachineDeliveryOverride,
  isDeliveryDiscountEligible,
  machineDeliveryDate,
} from '@/lib/configuratorDelivery';
import { configuratorPricingSignature } from '@/lib/configuratorPricing';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';

const NOW = new Date('2026-09-21T12:00:00+02:00').getTime();

function twoMachineState() {
  const state = createEmptyConfiguratorState('da', 'quote');
  state.date = '2026-10-12';
  state.deliveryMethod = 'send';
  state.machineConfigs = [
    { id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'shared', acc: [] },
    { id: 'm1', type: 'RC-1000S', qty: 1, configMode: 'shared', acc: [] },
  ];
  return state;
}

describe('per-machine delivery dates and sequential delivery discount', () => {
  it('keeps the existing one-machine common-date behavior', () => {
    const state = twoMachineState();
    state.machineConfigs = [state.machineConfigs[0]];
    state.date = '2027-01-21';
    const result = calculateConfiguration(state, { now: NOW });
    const delivery = result.discountDetails.find(detail => detail.kind === 'delivery');

    expect(delivery?.basis).toBe(roundPricingMoney(result.subtotal * 0.75));
    expect(delivery?.amount).toBe(roundPricingMoney(result.subtotal * 0.75 * 0.02));
  });

  it('uses the common date until one machine receives an override', () => {
    const state = twoMachineState();
    expect(machineDeliveryDate(state, 1)).toBe('2026-10-12');
    expect(machineDeliveryDate(state, 2)).toBe('2026-10-12');
    expect(commonMachineDeliveryDate(state)).toBe('2026-10-12');

    state.machineDeliveryDates = { m1_1: '2027-01-21' };
    expect(machineDeliveryDate(state, 1)).toBe('2026-10-12');
    expect(machineDeliveryDate(state, 2)).toBe('2027-01-21');
    expect(hasMachineDeliveryOverride(state, 2)).toBe(true);
    expect(commonMachineDeliveryDate(state)).toBeNull();
  });

  it('changes only non-overridden machines when the default date changes and falls back after removal', () => {
    const state = twoMachineState();
    state.machineDeliveryDates = { m1_1: '2027-01-21' };
    state.date = '2026-11-15';

    expect(machineDeliveryDate(state, 1)).toBe('2026-11-15');
    expect(machineDeliveryDate(state, 2)).toBe('2027-01-21');
    expect(calculateConfiguration(state, { now: NOW }).discountDetails.some(detail => detail.kind === 'delivery')).toBe(true);

    delete state.machineDeliveryDates.m1_1;
    expect(machineDeliveryDate(state, 2)).toBe('2026-11-15');
    expect(hasMachineDeliveryOverride(state, 2)).toBe(false);
    expect(calculateConfiguration(state, { now: NOW }).discountDetails.some(detail => detail.kind === 'delivery')).toBe(false);
  });

  it('keeps an override on its machine when another machine is removed and drops stale keys', () => {
    const state = twoMachineState();
    state.machineDeliveryDates = { m0_1: '2026-11-01', m1_1: '2027-01-21', stale_1: '2099-01-01' };
    state.machineConfigs = [state.machineConfigs[1]];
    const normalized = normalizeConfiguratorState(state);

    expect(normalized.machineDeliveryDates).toEqual({ m1_1: '2027-01-21' });
    expect(machineDeliveryDate(normalized, 1)).toBe('2027-01-21');
  });

  it('canonicalizes early unit-number override keys on load', () => {
    const state = twoMachineState();
    state.machineDeliveryDates = { machine_2: '2027-01-21' };
    const normalized = normalizeConfiguratorState(state);

    expect(normalized.machineDeliveryDates).toEqual({ m1_1: '2027-01-21' });
  });

  it('applies 2% only to the eligible machine after base discount and before quantity discount', () => {
    const state = twoMachineState();
    state.machineDeliveryDates = { m1_1: '2027-01-21' };
    const result = calculateConfiguration(state, { now: NOW });
    const machine2Gross = result.lineItems.find(line => line.isMachine && line.index === 2)?.price ?? 0;
    const delivery = result.discountDetails.find(detail => detail.kind === 'delivery');
    const quantity = result.discountDetails.find(detail => detail.kind === 'quantity');

    expect(delivery?.basis).toBe(roundPricingMoney(machine2Gross * 0.75));
    expect(delivery?.amount).toBe(roundPricingMoney(machine2Gross * 0.75 * 0.02));
    expect(delivery?.amount).toBe(roundPricingMoney(result.deliveryDiscounts?.reduce((sum, item) => sum + item.amount, 0) ?? 0));
    expect(quantity?.basis).toBe(roundPricingMoney(result.subtotal * 0.75 - (delivery?.amount ?? 0)));
  });

  it('handles neither, both, and exactly one eligible machine without cart-wide leakage', () => {
    const state = twoMachineState();
    expect(calculateConfiguration(state, { now: NOW }).discountDetails.some(detail => detail.kind === 'delivery')).toBe(false);

    state.date = '2027-01-21';
    const both = calculateConfiguration(state, { now: NOW });
    expect(both.discountDetails.find(detail => detail.kind === 'delivery')?.basis)
      .toBe(roundPricingMoney(both.subtotal * 0.75));

    state.date = '2026-10-12';
    state.machineDeliveryDates = { m1_1: '2027-01-21' };
    const one = calculateConfiguration(state, { now: NOW });
    expect(one.discountDetails.find(detail => detail.kind === 'delivery')?.basis)
      .toBeLessThan(roundPricingMoney(one.subtotal * 0.75));
  });

  it('keeps three-calendar-month eligibility deterministic', () => {
    expect(isDeliveryDiscountEligible('2026-12-21', NOW)).toBe(false);
    expect(isDeliveryDiscountEligible('2026-12-22', NOW)).toBe(true);
  });

  it('persists effective dates and override metadata in the canonical quote summary', () => {
    const state = twoMachineState();
    state.machineDeliveryDates = { m1_1: '2027-01-21' };
    const restored = normalizeConfiguratorState(JSON.parse(JSON.stringify(state)));
    const summary = buildQuoteContentSummary(restored);

    expect(restored.machineDeliveryDates).toEqual({ m1_1: '2027-01-21' });
    expect(summary.machines.flatMap(machine => machine.units).map(unit => ({
      date: unit.delivery_date,
      overridden: unit.delivery_date_overridden,
    }))).toEqual([
      { date: '2026-10-12', overridden: false },
      { date: '2027-01-21', overridden: true },
    ]);
  });

  it('freezes per-machine delivery discount percentages and amounts in the pricing snapshot', async () => {
    const state = twoMachineState();
    state.machineDeliveryDates = { m1_1: '2027-01-21' };
    const frozen = await finalizeConfiguratorPricingSnapshot(state);

    expect(frozen.pricingSnapshot?.deliveryDiscounts).toHaveLength(2);
    expect(frozen.pricingSnapshot?.deliveryDiscounts?.[0]).toMatchObject({
      unitNumber: 1,
      date: '2026-10-12',
      overridden: false,
      percent: 0,
      amount: 0,
    });
    expect(frozen.pricingSnapshot?.deliveryDiscounts?.[1]).toMatchObject({
      unitNumber: 2,
      date: '2027-01-21',
      overridden: true,
      percent: 2,
    });
    expect(frozen.pricingSnapshot?.deliveryDiscounts?.[1].amount).toBeGreaterThan(0);
  });

  it('does not invalidate historical signatures that predate machine overrides', () => {
    const legacy = twoMachineState();
    delete legacy.machineDeliveryDates;
    const legacySignature = configuratorPricingSignature(legacy);
    const normalized = normalizeConfiguratorState(JSON.parse(JSON.stringify(legacy)));

    expect(normalized.machineDeliveryDates).toEqual({});
    expect(configuratorPricingSignature(normalized)).toBe(legacySignature);

    normalized.machineDeliveryDates = { m1_1: '2027-01-21' };
    expect(configuratorPricingSignature(normalized)).not.toBe(legacySignature);
  });

  it('keeps the override control inside the compact machine summary', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    expect(source).toContain("T('useDifferentDeliveryDate')");
    expect(source).toContain('machineDeliveryDate(state, item.index)');
    expect(source).toContain('setMachineDeliveryOverride(item.index!, event.target.checked)');
    expect(source).toContain('type="date"');
  });
});
