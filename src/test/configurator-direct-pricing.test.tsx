import { afterEach, describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { calculateConfiguration, calcConfigurationTotals } from '@/lib/calcConfiguration';
import { canUseDirectPricing } from '@/lib/configuratorDirectPricing';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import { configuratorPricingSignature } from '@/lib/configuratorPricing';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { clearPublishedConfiguratorPricesForTest, replacePublishedConfiguratorPrices } from '@/data/machines';
import { replacePublishedCampaigns, type ProductCampaign } from '@/lib/configuratorCampaigns';
import { mergeEffectivePortalUser } from '@/lib/viewAsUser';
import { t } from '@/data/translations';
import type { SessionUser } from '@/context/AppUserContext';
import type { ConfiguratorState } from '@/types/configurator';

const NOW = Date.parse('2026-09-28T12:00:00Z');

const state = (language: 'da' | 'de' = 'da'): ConfiguratorState => ({
  ...createEmptyConfiguratorState(language),
  step: 4,
  pricingMode: 'direct',
  machineConfigs: [{ id: 'm0', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] }],
});

const campaign = (): ProductCampaign => ({
  id: 'qa-direct-campaign', code: 'QA-DIRECT', name: 'Direct isolation', status: 'published',
  type: 'fixed', benefitPricingType: null, discountPct: null, targetPriceDkk: 0, targetPriceEur: 0,
  triggerMinQuantity: 1, triggerMatchMode: 'any', benefitQuantity: 1, scaleBenefitWithTrigger: false,
  audience: 'public', startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z',
  products: [{
    campaignId: 'qa-direct-campaign', productKey: 'RC-751::RC-751', machineKey: 'RC-751',
    itemNumber: '410040', role: 'linked', quantity: 1,
  }],
});

const user = (portalRole: string): SessionUser => ({
  id: `qa-${portalRole}`, email: `${portalRole}@example.test`, role: portalRole.startsWith('timan_') ? 'timan_saelger' : 'partner',
  partner_type: portalRole === 'timan_importer' ? 'importoer' : portalRole === 'timan_dealer' ? 'forhandler' : null,
  portal_role: portalRole, approved: true, is_active: true, start_step: 1, max_step: 4,
  can_view_prices: true, can_submit_order: true, can_edit_discount: false, can_switch_customer_mode: false,
});

afterEach(() => {
  replacePublishedCampaigns([]);
  clearPublishedConfiguratorPricesForTest();
  localStorage.clear();
});

describe('Configurator Direct pricing mode', () => {
  it.each([
    ['timan_seller', true],
    ['timan_backend', true],
    ['timan_dealer', false],
    ['timan_importer', false],
    ['timan_service_partner', false],
    ['dealer_customer', false],
    ['dealer_user', false],
  ])('gates %s through the effective stable portal role', (role, expected) => {
    expect(canUseDirectPricing(user(role))).toBe(expected);
  });

  it('respects Backend View-as instead of inheriting Backend Direct access', () => {
    const backend = user('timan_backend');
    const viewedDealer = mergeEffectivePortalUser(backend, user('timan_dealer'), {
      key: 'DVP', initials: 'DVP', email: 'dealer@example.test', portalRole: 'timan_dealer',
      viewRole: 'dealer', label: 'Dealer', dealerNumber: '10458', companyDealer: 'QA Dealer',
    });
    const viewedSeller = mergeEffectivePortalUser(backend, user('timan_seller'), {
      key: 'BP', initials: 'BP', email: 'bp@timan.dk', portalRole: 'timan_seller',
      viewRole: 'seller', label: 'BP Seller',
    });
    expect(canUseDirectPricing(viewedDealer)).toBe(false);
    expect(canUseDirectPricing(viewedSeller)).toBe(true);
  });

  it.each([
    ['da', 200_000],
    ['de', 25_000],
  ] as const)('uses the canonical Product Master %s price directly', (language, expected) => {
    replacePublishedConfiguratorPrices([{ item_number: '410040', price_dkk: 200_000, price_eur: 25_000 }]);
    const result = calculateConfiguration(state(language), { now: NOW });
    expect(result.subtotal).toBe(expected);
    expect(result.currentPrice).toBe(expected);
    expect(result.discountDetails).toEqual([]);
  });

  it('disables every automatic layer and applies only bounded Extra discount', () => {
    replacePublishedCampaigns([campaign()]);
    const input = state();
    input.baseDiscountPct = 0.30;
    input.machineConfigs[0].qty = 4;
    input.date = '2098-01-01';
    input.manualDealerDiscountPct = 3;
    input.demoMachines = { '410040_1': true };
    const result = calculateConfiguration(input, { now: NOW });

    expect(result.discountDetails.map(row => row.kind)).toEqual(['direct']);
    expect(result.discountDetails[0]).toMatchObject({ percent: 3, txt: 'Ekstra rabat (3%)' });
    expect(result.currentPrice).toBeCloseTo(result.subtotal * 0.97, 2);
    expect(result.deliveryDiscounts).toEqual([]);
    expect(result.campaignLines).toEqual([]);
    expect(result.qtyPct).toBe(0);
    expect(result.lineItems.some(row => row.varenr === '795002')).toBe(false);
  });

  it('uses one Direct mode consistently across a multi-machine configuration', () => {
    const input = state();
    input.machineConfigs.push({ id: 'm1', type: 'RC-1000S', qty: 2, configMode: 'shared', acc: [] });
    input.manualDealerDiscountPct = 5;
    const result = calculateConfiguration(input, { now: NOW });
    expect(result.lineItems.filter(row => row.isMachine)).toHaveLength(3);
    expect(result.discountDetails).toHaveLength(1);
    expect(result.discountDetails[0].basis).toBe(result.subtotal);
    expect(result.currentPrice).toBeCloseTo(result.subtotal * 0.95, 2);
  });

  it('normalizes Direct and Demo as mutually exclusive and preserves Direct on reopen', () => {
    const reopened = normalizeConfiguratorState(JSON.parse(JSON.stringify({
      ...state(), manualDealerDiscountPct: 4, demoMachines: { '410040_1': true },
    })));
    expect(reopened.pricingMode).toBe('direct');
    expect(reopened.manualDealerDiscountPct).toBe(4);
    expect(reopened.demoMachines).toEqual({});
  });

  it('restores canonical campaign and normal discount logic after leaving Direct', () => {
    replacePublishedCampaigns([campaign()]);
    const input = state();
    const direct = calculateConfiguration(input, { now: NOW });
    const partner = calculateConfiguration({ ...input, pricingMode: 'partner' }, { now: NOW });
    expect(direct.discountDetails).toEqual([]);
    expect(partner.discountDetails.map(row => row.kind)).toEqual(['base', 'campaign']);
    expect(partner.campaignLines?.[0]).toMatchObject({ applied: true, finalLineValue: 0 });
  });

  it('keeps legacy/partner signatures stable while Direct has an explicit identity', () => {
    const legacy = createEmptyConfiguratorState();
    const partner = { ...legacy, pricingMode: 'partner' as const };
    const direct = { ...legacy, pricingMode: 'direct' as const };
    expect(configuratorPricingSignature(legacy)).toBe(configuratorPricingSignature(partner));
    expect(configuratorPricingSignature(direct)).not.toBe(configuratorPricingSignature(partner));
  });

  it('freezes and reopens Direct totals without reintroducing partner discounts', async () => {
    const input = state();
    input.manualDealerDiscountPct = 3;
    const saved = await finalizeConfiguratorPricingSnapshot(input);
    const reopened = normalizeConfiguratorState(JSON.parse(JSON.stringify(saved)));
    const document = buildSubmittedOrderDocument(reopened);
    expect(reopened.pricingMode).toBe('direct');
    expect(reopened.pricingSnapshot?.discountDetails?.map(row => row.kind)).toEqual(['direct']);
    expect(document.calcResult.discountDetails.map(row => row.kind)).toEqual(['direct']);
    expect(calcConfigurationTotals(reopened).finalPrice).toBe(saved.pricingSnapshot?.totals?.finalPrice);
  });

  it('renders only Direct price labels and discounts in the PDF', async () => {
    const input = state();
    input.manualDealerDiscountPct = 3;
    const saved = await finalizeConfiguratorPricingSnapshot(input);
    const calcResult = buildSubmittedOrderDocument(saved).calcResult;
    const pdf = buildConfiguratorPdf({
      jsPDF, state: saved, calcResult, flowType: 'quote', quoteNumber: 'QA-DIRECT', showPrices: true,
      uiLanguage: 'da', contentLanguage: 'da', T: key => t(key, 'da'), TC: key => t(key, 'da'),
    });
    const output = pdf.output();
    expect(output).toContain('Nettopris');
    expect(output).toContain('Ekstra rabat');
    expect(output).not.toContain('Grund rabat');
    expect(output).not.toContain('Kampagnerabat');
    expect(output).not.toContain('Demomaskinerabat');
    expect(output).not.toContain('Leveringsrabat');
  });

  it('does not retroactively alter an already frozen partner snapshot', async () => {
    const original = state();
    original.pricingMode = 'partner';
    const frozen = await finalizeConfiguratorPricingSnapshot(original);
    const before = JSON.stringify(frozen);
    expect(await finalizeConfiguratorPricingSnapshot(frozen)).toEqual(frozen);
    expect(JSON.stringify(frozen)).toBe(before);
  });
});
