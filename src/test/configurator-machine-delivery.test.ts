import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateConfiguration, roundPricingMoney } from '@/lib/calcConfiguration';
import {
  DELIVERY_DISCOUNT_PERCENT,
  commonMachineDeliveryDate,
  hasMachineDeliveryOverride,
  isDeliveryDateDisabled,
  isDeliveryDiscountEligible,
  isWeekendDeliveryDate,
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
    expect(one.deliveryDiscounts?.map(discount => ({
      unitNumber: discount.unitNumber,
      percent: discount.percent,
      eligible: discount.amount > 0,
    }))).toEqual([
      { unitNumber: 1, percent: 0, eligible: false },
      { unitNumber: 2, percent: DELIVERY_DISCOUNT_PERCENT, eligible: true },
    ]);
  });

  it('keeps calculator-backed machine badges in sync with standard dates and removed overrides', () => {
    const state = twoMachineState();
    state.date = '2027-01-21';
    state.machineDeliveryDates = { m0_1: '2026-10-12' };

    const overridden = calculateConfiguration(state, { now: NOW });
    expect(overridden.deliveryDiscounts?.map(discount => discount.percent)).toEqual([0, DELIVERY_DISCOUNT_PERCENT]);
    expect(overridden.deliveryDiscounts?.[1]).toMatchObject({
      unitNumber: 2,
      date: '2027-01-21',
      overridden: false,
    });

    delete state.machineDeliveryDates.m0_1;
    const inherited = calculateConfiguration(state, { now: NOW });
    expect(inherited.deliveryDiscounts?.map(discount => discount.percent))
      .toEqual([DELIVERY_DISCOUNT_PERCENT, DELIVERY_DISCOUNT_PERCENT]);
  });

  it('keeps three-calendar-month eligibility deterministic', () => {
    expect(isDeliveryDiscountEligible('2026-12-21', NOW)).toBe(false);
    expect(isDeliveryDiscountEligible('2026-12-22', NOW)).toBe(true);
  });

  it('uses one canonical weekend rule for global and per-machine calendars', () => {
    const saturday = new Date('2026-10-10T12:00:00');
    const sunday = new Date('2026-10-11T12:00:00');
    const monday = new Date('2026-10-12T12:00:00');

    expect(isWeekendDeliveryDate(saturday)).toBe(true);
    expect(isWeekendDeliveryDate(sunday)).toBe(true);
    expect(isWeekendDeliveryDate(monday)).toBe(false);
    expect(isDeliveryDateDisabled(saturday, true, NOW)).toBe(true);
    expect(isDeliveryDateDisabled(sunday, true, NOW)).toBe(true);
    expect(isDeliveryDateDisabled(monday, true, NOW)).toBe(false);
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

  it('reuses the Timan calendar in step 2 and keeps the cart summary read-only', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    const pickerSource = readFileSync('src/components/configurator/ConfiguratorDeliveryDatePicker.tsx', 'utf8');
    const step2Start = source.indexOf('{/* Step 2: Delivery */}');
    const step3Start = source.indexOf('{/* Step 3: Accessories */}');
    const cartSummaryStart = source.indexOf("!isExhibition && state.date && item.isMachine && item.index");
    const cartSummaryEnd = source.indexOf("!isExhibition && state.step === 4", cartSummaryStart);
    const step2Source = source.slice(step2Start, step3Start);
    const cartSummarySource = source.slice(cartSummaryStart, cartSummaryEnd);

    expect(step2Source).toContain("T('customizeMachineDeliveryDates')");
    expect(source).toContain("T('useDifferentDeliveryDate')");
    expect(source).toContain('machineDeliveryDate(state, item.index)');
    expect(step2Source).toContain('setMachineDeliveryOverride(unit.unitNumber, event.target.checked)');
    expect(step2Source).toContain('setMachineDeliveryDate(unit.unitNumber, value)');
    expect(step2Source.match(/<ConfiguratorDeliveryDatePicker/g)).toHaveLength(2);
    expect(step2Source).not.toContain('type="date"');
    expect(pickerSource).toContain('isDeliveryDateDisabled(date, canSelectPastDate)');
    expect(pickerSource).toContain("discount: (date) => !isWeekendDeliveryDate(date) && isDeliveryDiscountEligible(format(date, 'yyyy-MM-dd'))");
    expect(pickerSource).toContain("modifiersClassNames={{ discount: 'delivery-discount-date' }}");
    expect(cartSummarySource).toContain("'individualDeliveryDate' : 'standardDeliveryDate'");
    expect(cartSummarySource).toContain('machineDeliveryDiscount.percent');
    expect(cartSummarySource).not.toContain('type="checkbox"');
    expect(cartSummarySource).not.toContain('type="date"');
    expect(cartSummarySource).not.toContain('setMachineDeliveryOverride');
  });
});
