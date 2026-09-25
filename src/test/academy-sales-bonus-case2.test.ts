import { beforeEach, describe, expect, it } from 'vitest';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import {
  ACADEMY_BONUS_CASE_2,
  ACADEMY_CASE_3,
  academySandbox,
  type AcademySalesBonusCase2Input,
} from '@/lib/academySandbox';
import {
  ACADEMY_SALES_BONUS_CAMPAIGN,
  ACADEMY_SALES_BONUS_CAMPAIGN_ID,
  ACADEMY_SALES_BONUS_CUSTOMER,
  withAcademySalesBonusCampaign,
} from '@/lib/academySalesBonusCampaign';
import { hasAdvancedSalesBadge } from '@/lib/academyCurriculum';
import { setAcademyCycleStorageScope } from '@/lib/academyCycleStorage';
import { replacePublishedCampaigns, type ProductCampaign } from '@/lib/configuratorCampaigns';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { validateConfiguratorLead } from '@/lib/configuratorLeadValidation';
import type { ConfiguratorState } from '@/types/configurator';

const NOW = new Date('2026-09-25T12:00:00.000Z').getTime();

function validState() {
  const state = createEmptyConfiguratorState('da', 'order');
  state.machineConfigs = [
    {
      id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'shared',
      acc: ['712060', '712146', '712141', '712143', '721122_standalone'],
    },
    {
      id: 'm1', type: 'Loader Line', qty: 1, configMode: 'shared',
      acc: ['725142', '725142__712902', '725142__725120', '725142__725747'],
    },
  ];
  state.deliveryMethod = 'send';
  state.date = '2026-10-20';
  state.customerMode = 'manual';
  state.manualCustomerDraft = {
    firmanavn: ACADEMY_SALES_BONUS_CUSTOMER.firmanavn,
    kontaktperson: ACADEMY_SALES_BONUS_CUSTOMER.kontaktperson,
    telefon: ACADEMY_SALES_BONUS_CUSTOMER.telefon,
    emailRecipient: ACADEMY_SALES_BONUS_CUSTOMER.emailRecipient,
    address: ACADEMY_SALES_BONUS_CUSTOMER.address,
    postalCode: ACADEMY_SALES_BONUS_CUSTOMER.postalCode,
    city: ACADEMY_SALES_BONUS_CUSTOMER.city,
    country: ACADEMY_SALES_BONUS_CUSTOMER.country,
  };
  Object.assign(state, ACADEMY_SALES_BONUS_CUSTOMER);
  return state;
}

function input(state: ConfiguratorState): AcademySalesBonusCase2Input {
  const result = calculateConfiguration(state, { now: NOW });
  return {
    machineConfigs: state.machineConfigs,
    individualUnitConfigs: state.individualUnitConfigs,
    deliveryMethod: state.deliveryMethod,
    flowType: state.flowType,
    campaignLines: result.campaignLines ?? [],
    customerValid: validateConfiguratorLead(state).valid,
    customerIsSynthetic: true,
  };
}

describe('Academy Sales Bonus Case 2', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    replacePublishedCampaigns([ACADEMY_SALES_BONUS_CAMPAIGN]);
    academySandbox.enterSession();
    // The bonus case has the same direct prerequisite as CRM Case 1.
    setAcademyCycleStorageScope('test-cycle', 0, 'completed', ['sales.case_2_video_3330']);
    academySandbox.startSalesBonusCase2();
  });

  it('uses canonical product groups, delivery and all required SKU selections', () => {
    expect(academySandbox.evaluateSalesBonusCase2(input(validState()))).toMatchObject({
      machinesCorrect: true,
      deliveryCorrect: true,
      timan3330OptionsCorrect: true,
      dependency721122Added: true,
      tractorEquipmentCorrect: true,
      orderMode: true,
      syntheticCustomerValid: true,
    });

    const state = validState();
    state.machineConfigs[0].acc = state.machineConfigs[0].acc.filter(id => id !== '721122_standalone');
    expect(academySandbox.evaluateSalesBonusCase2(input(state)).dependency721122Added).toBe(false);
    expect(state.machineConfigs[0].acc).not.toContain('721122_standalone');
  });

  it.each([
    ['712060', 'timan3330OptionsCorrect'], ['712146', 'timan3330OptionsCorrect'],
    ['712141', 'timan3330OptionsCorrect'], ['712143', 'timan3330OptionsCorrect'],
    ['725142', 'tractorEquipmentCorrect'], ['725142__712902', 'tractorEquipmentCorrect'],
    ['725142__725120', 'tractorEquipmentCorrect'], ['725142__725747', 'tractorEquipmentCorrect'],
  ])('requires %s through its canonical SKU group', (accessoryId, field) => {
    const state = validState();
    const machine = accessoryId.startsWith('725142') ? state.machineConfigs[1] : state.machineConfigs[0];
    machine.acc = machine.acc.filter(id => id !== accessoryId);
    expect(academySandbox.evaluateSalesBonusCase2(input(state))[field as 'timan3330OptionsCorrect']).toBe(false);
  });

  it('runs the Academy-only rule through the real campaign resolver and applies an exact zero-price benefit', () => {
    const result = calculateConfiguration(validState(), { now: NOW });
    expect(result.campaignLines).toHaveLength(1);
    expect(result.campaignLines?.[0]).toMatchObject({
      campaignId: ACADEMY_SALES_BONUS_CAMPAIGN_ID,
      triggerItemNumbers: ['712000'],
      benefitItemNumber: '725142',
      triggerSetCount: 1,
      benefitEntitlementQuantity: 1,
      targetPrice: 0,
      finalLineValue: 0,
      applied: true,
    });
    expect(result.campaignLines?.[0].discountAmount).toBeGreaterThan(0);
  });

  it('never leaks the Academy campaign into the ordinary campaign list', () => {
    const publicCampaign = { ...ACADEMY_SALES_BONUS_CAMPAIGN, id: 'public-campaign', code: 'PUBLIC' } as ProductCampaign;
    expect(withAcademySalesBonusCampaign([publicCampaign], null)).toEqual([publicCampaign]);
    const academy = withAcademySalesBonusCampaign([publicCampaign], ACADEMY_BONUS_CASE_2);
    expect(academy.map(campaign => campaign.id)).toEqual(['public-campaign', ACADEMY_SALES_BONUS_CAMPAIGN_ID]);
  });

  it('requires order mode and valid synthetic customer data', () => {
    const state = validState();
    state.flowType = 'quote';
    expect(academySandbox.evaluateSalesBonusCase2(input(state)).orderMode).toBe(false);
    state.flowType = 'order';
    const invalid = input(state);
    invalid.customerIsSynthetic = false;
    expect(academySandbox.evaluateSalesBonusCase2(invalid).syntheticCustomerValid).toBe(false);
  });

  it('submits exactly one local order, persists one bonus point and blocks production writes', () => {
    const first = academySandbox.submitSalesBonusCase2Order(input(validState()));
    const repeated = academySandbox.submitSalesBonusCase2Order(input(validState()));
    expect(first).toMatchObject({ completed: true, orderSubmitted: true, simulatedOrderCount: 1, bonusPoints: 1 });
    expect(first.simulatedOrderId).toMatch(/^academy-order-/);
    expect(repeated.simulatedOrderId).toBe(first.simulatedOrderId);
    expect(repeated.simulatedOrderCount).toBe(1);
    expect(academySandbox.getCompletedCaseIds()).toContain(ACADEMY_BONUS_CASE_2);
    expect(academySandbox.getSalesBonusCase2()).toEqual(repeated);
    expect(() => academySandbox.assertNoProductionWrite()).toThrow('Blocked: Academy mode');
  });

  it('awards Advanced Sales only after both optional cases while leaving each completion separate', () => {
    expect(hasAdvancedSalesBadge([ACADEMY_BONUS_CASE_2])).toBe(false);
    expect(hasAdvancedSalesBadge([ACADEMY_CASE_3])).toBe(false);
    expect(hasAdvancedSalesBadge([ACADEMY_CASE_3, ACADEMY_BONUS_CASE_2])).toBe(true);
  });
});
