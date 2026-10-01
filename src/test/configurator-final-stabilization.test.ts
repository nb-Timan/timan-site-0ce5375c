import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { calculateConfiguration, calcConfigurationTotals, formatDiscountDetailLabel } from '@/lib/calcConfiguration';
import { canUseDirectPricing } from '@/lib/configuratorDirectPricing';
import { configuratorCustomerModeCopy, configuratorSubmittedOrderCopy } from '@/lib/configuratorStep4I18n';
import {
  assertValidConfiguratorCommercialState,
  createEmptyConfiguratorState,
  normalizeConfiguratorState,
  transitionConfiguratorFlowType,
} from '@/lib/configuratorState';
import { configuratorPricingSignature } from '@/lib/configuratorPricing';
import { getPaymentTermsLabel } from '@/lib/paymentTerms';
import {
  clearPublishedConfiguratorPricesForTest,
  getPriceForCurrency,
  PRODUCTS,
  replacePublishedConfiguratorPrices,
} from '@/data/machines';
import { t } from '@/data/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

const locales: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];

afterEach(() => {
  clearPublishedConfiguratorPricesForTest();
});

describe('Configurator final commercial-state matrix', () => {
  it('forces Direct off and removes its stale snapshot when Quote becomes Order', () => {
    const quote = createEmptyConfiguratorState('da', 'quote');
    quote.pricingMode = 'direct';
    quote.pricingSnapshot = {
      version: 1,
      capturedAt: '2026-10-01T10:00:00.000Z',
      currency: 'DKK',
      prices: {},
      signature: configuratorPricingSignature(quote),
    };

    const order = transitionConfiguratorFlowType(quote, 'order');
    expect(order).toMatchObject({ flowType: 'order', pricingMode: 'partner' });
    expect(order.pricingSnapshot).toBeUndefined();
    expect(() => assertValidConfiguratorCommercialState(order)).not.toThrow();
  });

  it('rejects ORDER + Direct at both application and database boundaries', () => {
    expect(() => assertValidConfiguratorCommercialState({
      flowType: 'order',
      pricingMode: 'direct',
    })).toThrow('ORDER_DIRECT_NOT_ALLOWED');

    const migration = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/20261001125857_guard_configurator_order_direct_state.sql'),
      'utf8',
    );
    expect(migration).toContain("effective_flow = 'order' and direct_enabled");
    expect(migration).toContain("raise exception 'ORDER_DIRECT_NOT_ALLOWED'");
    expect(migration).toContain('before insert or update of state_json');
  });

  it('repairs a stale stored ORDER + Direct state without retaining frozen Direct totals', () => {
    const repaired = normalizeConfiguratorState({
      ...createEmptyConfiguratorState('da', 'order'),
      pricingMode: 'direct',
      pricingSnapshot: {
        version: 1,
        capturedAt: '2026-10-01T10:00:00.000Z',
        prices: {},
        signature: 'stale-direct',
      },
    });
    expect(repaired.pricingMode).toBe('partner');
    expect(repaired.pricingSnapshot).toBeUndefined();
  });

  it.each([
    ['timan_backend', true],
    ['timan_seller', true],
    ['timan_dealer', false],
    ['timan_importer', false],
    ['timan_service_partner', false],
  ] as const)('keeps the %s Direct role rule stable', (portalRole, expected) => {
    expect(canUseDirectPricing({
      role: portalRole.startsWith('timan_') && !portalRole.includes('dealer') && !portalRole.includes('importer')
        ? 'timan_saelger'
        : 'partner',
      partner_type: null,
      portal_role: portalRole,
    })).toBe(expected);
  });

  it('keeps DKK, EUR and SEK as explicit canonical business currencies', () => {
    replacePublishedConfiguratorPrices([{
      item_number: '410040',
      price_dkk: 167_500,
      price_eur: 22_483.22,
      price_sek: 251_879.70,
    }]);
    const rc751 = PRODUCTS['RC-751'];
    expect(getPriceForCurrency(rc751, 'DKK')).toBe(167_500);
    expect(getPriceForCurrency(rc751, 'EUR')).toBe(22_483.22);
    expect(getPriceForCurrency(rc751, 'SEK')).toBe(251_879.70);
  });

  it.each(locales)('keeps commercial totals stable when only locale changes to %s', locale => {
    const state = createEmptyConfiguratorState('da', 'quote');
    state.currency = 'DKK';
    state.locale = locale;
    state.machineConfigs = [{ id: 'm0', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] }];
    const baseline = calcConfigurationTotals(state);
    const legacyLanguage = locale === 'da' ? 'da' : locale === 'de' ? 'de' : 'en';
    const localized = { ...state, language: legacyLanguage as 'da' | 'de' | 'en' };
    expect(calcConfigurationTotals(localized)).toEqual(baseline);
    expect(configuratorPricingSignature(localized)).toBe(configuratorPricingSignature(state));
  });

  it.each(locales)('provides complete Step 4 labels for %s', locale => {
    const copy = configuratorCustomerModeCopy(locale);
    const submittedOrderCopy = configuratorSubmittedOrderCopy(locale);
    expect(Object.values(copy).every(value => value.trim().length > 0)).toBe(true);
    expect(Object.values(submittedOrderCopy).every(value => value.trim().length > 0)).toBe(true);
    expect(getPaymentTermsLabel(locale).trim().length).toBeGreaterThan(0);
  });

  it('uses Swedish Step 4 and discount labels without English or Danish fallback', () => {
    expect(configuratorCustomerModeCopy('sv')).toMatchObject({
      title: 'Kunduppgifter',
      dealerContact: 'Kontaktperson',
      address: 'Adress',
      country: 'Land',
    });
    expect(getPaymentTermsLabel('sv')).toBe('Betalningsvillkor');
    expect(configuratorSubmittedOrderCopy('sv').editSubmittedOrder).toBe('Korrigera skickad order');
    expect(configuratorSubmittedOrderCopy('sv').startCorrection).toBe('Starta korrigering');
    expect(formatDiscountDetailLabel({
      kind: 'base',
      txt: 'Base discount',
      percent: 25,
      amount: 1,
      basis: 4,
    }, false, 'sv')).toContain('Grundrabatt');
  });

  it.each(locales)('provides localized Configurator lifecycle UI for %s', locale => {
    const keys = [
      'caseLoaded',
      'caseRestored',
      'confirmSubmission',
      'confirmOrderDescription',
      'confirmQuoteDescription',
      'saveAndSendOrderConfirmation',
      'orderSubmittedSuccessTitle',
      'leaveConfiguratorTitle',
      'linkedLead',
      'syncLead',
    ];
    for (const key of keys) {
      expect(t(key, locale)).not.toBe(key);
      expect(t(key, locale).trim().length).toBeGreaterThan(0);
    }
  });

  it('keeps Swedish lifecycle UI free of the former English and Danish fallbacks', () => {
    expect(t('caseLoaded', 'sv')).toBe('Ärendet har lästs in');
    expect(t('confirmSubmission', 'sv')).toBe('Bekräfta skickande');
    expect(t('leaveConfiguratorTitle', 'sv')).toBe('Lämna konfiguratorn?');
    expect(t('syncLead', 'sv')).toBe('Uppdatera lead');
  });

  it('does not use locale as a Configurator capability or delivery-startup condition', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/ConfiguratorPage.tsx'), 'utf8');
    expect(source).not.toMatch(/\b(?:lang|state\.language)\s*===\s*['"]/);
    expect(source).toContain("const needsStartup = displayCurrency === 'DKK' && state.deliveryMethod === 'deliver';");
  });

  it('keeps campaign-disabled and demo state independent from locale presentation', () => {
    const state = createEmptyConfiguratorState('da', 'quote');
    state.currency = 'DKK';
    state.campaignDisabled = true;
    state.demoMachines = { '410040_1': true };
    state.machineConfigs = [{ id: 'm0', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] }];
    const baseline = calculateConfiguration(state);

    for (const locale of locales) {
      const localized = { ...state, locale };
      expect(localized.campaignDisabled).toBe(true);
      expect(localized.demoMachines).toEqual(state.demoMachines);
      expect(calculateConfiguration(localized).currentPrice).toBe(baseline.currentPrice);
    }
  });

  it('guards Assistant actions with the same ORDER + Direct invariant', () => {
    const edgeFunction = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/functions/support-actions/index.ts'),
      'utf8',
    );
    expect(edgeFunction).toContain('assertConfiguratorCommercialState');
    expect(edgeFunction).toContain('ORDER_DIRECT_NOT_ALLOWED');
  });
});
