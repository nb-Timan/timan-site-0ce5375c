import { beforeEach, describe, expect, it } from 'vitest';
import { ACC_ID_OIL_NORMAL, ACC_ID_WEEDBRUSH, ACC_ID_WIRE_HARNESS, ACC_ID_WORK_LIGHT } from '@/data/machines';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { ACADEMY_CASE_2_TARGET_VIDEO_ID, ACADEMY_CASE_3, academySandbox } from '@/lib/academySandbox';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import type { ConfiguratorState } from '@/types/configurator';

const NOW = new Date(2026, 8, 24, 12).getTime();

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function nextWeekday(from: Date, minimumDays: number) {
  const date = new Date(from);
  date.setDate(date.getDate() + minimumDays);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return isoDate(date);
}

function unlockAndStartCase3() {
  academySandbox.startCase1();
  academySandbox.evaluate({
    machineConfigs: [
      { type: 'RC-1000S', acc: [ACC_ID_OIL_NORMAL, '410910', ACC_ID_WEEDBRUSH, ACC_ID_WORK_LIGHT, ACC_ID_WIRE_HARNESS], qty: 1 },
      { type: 'RC-751', acc: [], qty: 1 },
    ],
    wiringHarnessInCart: true,
    quantityDiscount: true,
  });
  academySandbox.saveLead();
  academySandbox.generateQuote();
  academySandbox.startCase2();
  academySandbox.trackCase2Filters({ machineFilter: 'Timan 3330', contentType: 'maintenance', targetVisible: true });
  academySandbox.openCase2Video({ youtubeVideoId: ACADEMY_CASE_2_TARGET_VIDEO_ID, machineFilter: 'Timan 3330', contentType: 'maintenance', targetVisible: true });
  academySandbox.startCase3();
}

function validCase3State(): ConfiguratorState {
  const state = createEmptyConfiguratorState('da');
  const today = new Date(NOW);
  const threshold = new Date(NOW);
  threshold.setMonth(threshold.getMonth() + 3);
  state.machineConfigs = [{ id: 'm0', type: 'RC-1000S', qty: 2, configMode: 'individual', acc: [] }];
  state.individualUnitConfigs = {
    m0_1: { acc: ['410910'] },
    m0_2: { acc: ['410910', 'HFS-1012'] },
  };
  state.date = nextWeekday(today, 2);
  state.machineDeliveryDates = {
    m0_1: nextWeekday(today, 2),
    m0_2: nextWeekday(threshold, 1),
  };
  return state;
}

function evaluate(state: ConfiguratorState) {
  const calculation = calculateConfiguration(state, { now: NOW });
  return academySandbox.evaluateCase3({
    machineConfigs: state.machineConfigs,
    individualUnitConfigs: state.individualUnitConfigs,
    machineDeliveryDates: state.machineDeliveryDates,
    date: state.date,
    deliveryDiscounts: calculation.deliveryDiscounts,
    now: NOW,
  });
}

describe('Academy Sales Case 3', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/configurator?academy_mode=true&academy_case=3');
    unlockAndStartCase3();
  });

  it('requires exactly two RC-1000s in individual configuration mode', () => {
    const one = validCase3State();
    one.machineConfigs[0].qty = 1;
    expect(evaluate(one).twoMachinesDifferent).toBe(false);

    const shared = validCase3State();
    shared.machineConfigs[0].configMode = 'shared';
    expect(evaluate(shared).twoMachinesDifferent).toBe(false);

    expect(evaluate(validCase3State()).twoMachinesDifferent).toBe(true);
  });

  it('uses selectable relative dates and the canonical per-machine delivery discount result', () => {
    const state = validCase3State();
    const calculation = calculateConfiguration(state, { now: NOW });

    expect(calculation.deliveryDiscounts).toMatchObject([
      { unitNumber: 1, percent: 0 },
      { unitNumber: 2, percent: 2 },
    ]);
    expect(evaluate(state)).toMatchObject({
      individualDeliveryDates: true,
      deliveryDiscountOnlyMachine2: true,
    });

    state.machineDeliveryDates = { m0_1: state.machineDeliveryDates?.m0_2 ?? '', m0_2: state.machineDeliveryDates?.m0_1 ?? '' };
    expect(evaluate(state)).toMatchObject({
      individualDeliveryDates: false,
      deliveryDiscountOnlyMachine2: false,
    });
  });

  it('requires canonical flail and stump-grinder allocation by product id', () => {
    expect(evaluate(validCase3State()).equipmentCorrect).toBe(true);

    const wrong = validCase3State();
    wrong.individualUnitConfigs = {
      m0_1: { acc: ['410910', 'HFS-1012'] },
      m0_2: { acc: ['410910'] },
    };
    expect(evaluate(wrong).equipmentCorrect).toBe(false);
  });

  it('creates exactly one local lead, completes 5/5 and persists after reload', () => {
    expect(evaluate(validCase3State()).completed).toBe(false);
    const saved = academySandbox.saveLead();
    const repeated = academySandbox.saveLead();

    expect(saved).toMatchObject({ completed: true, twoMachinesDifferent: true, individualDeliveryDates: true, deliveryDiscountOnlyMachine2: true, equipmentCorrect: true });
    expect(repeated.leadId).toBe(saved.leadId);
    expect(saved.leadId).toMatch(/^academy-lead-/);
    expect(academySandbox.getCompletedCaseIds()).toContain(ACADEMY_CASE_3);
    expect(academySandbox.getCase3()).toEqual(repeated);
    expect(() => academySandbox.assertNoProductionWrite()).toThrow('Blocked: Academy mode');
  });
});
