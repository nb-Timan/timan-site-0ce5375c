import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { t } from '@/data/translations';
import { calculateConfiguration, calcConfigurationTotals } from '@/lib/calcConfiguration';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { configuratorPricingSignature, createConfiguratorPricingSnapshot } from '@/lib/configuratorPricing';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import type { ConfiguratorState, Language } from '@/types/configurator';
import fs from 'node:fs';
import path from 'node:path';

class NoRasterJsPDF extends jsPDF {
  addImage(): this {
    throw new Error('Currency regression PDF test forbids raster rendering');
  }
}

const DKK_PRICES = {
  'machine:RC-1000S': 235000,
  'accessory:RC-1000S:13101003': 0,
  'accessory:RC-1000S:410910': 43900,
  'accessory:RC-1000S:HFS-1012': 66950,
  'machine:RC-751': 167500,
};

const EUR_PRICES = {
  'machine:RC-1000S': 31590,
  'accessory:RC-1000S:13101003': 0,
  'accessory:RC-1000S:410910': 5905,
  'accessory:RC-1000S:HFS-1012': 9000,
  'machine:RC-751': 22515,
};

function t4014State(language: Language): ConfiguratorState {
  const state = createEmptyConfiguratorState(language, 'quote');
  state.machineConfigs = [
    { id: 'm0', type: 'RC-1000S', qty: 1, configMode: 'individual', acc: [] },
    { id: 'm1', type: 'RC-751', qty: 1, configMode: 'individual', acc: [] },
  ];
  state.individualUnitConfigs = {
    m0_1: { acc: ['13101003', '410910', 'HFS-1012'] },
    m1_1: { acc: [] },
  };
  state.baseDiscountPct = 0.25;
  state.manualDealerDiscountPct = 7.48;
  return state;
}

function frozenDkkT4014(): ConfiguratorState {
  const state = t4014State('da');
  state.pricingSnapshot = {
    version: 1,
    capturedAt: '2026-09-24T10:00:00.000Z',
    prices: DKK_PRICES,
    signature: configuratorPricingSignature(state),
    totals: { subtotal: 513350, totalDiscount: 164260.71, finalPrice: 349089.29 },
  };
  return state;
}

function expectLinePrices(state: ConfiguratorState, expected: Record<string, number>) {
  const lines = calculateConfiguration(state).lineItems.filter(line => line.varenr !== 'SUBTOTAL');
  const actual = Object.fromEntries(lines.map(line => [line.varenr, line.unitPrice]));
  expect(actual).toEqual({
    '411000': expected['machine:RC-1000S'],
    '13101003': expected['accessory:RC-1000S:13101003'],
    '410910': expected['accessory:RC-1000S:410910'],
    'HFS-1012': expected['accessory:RC-1000S:HFS-1012'],
    '410040': expected['machine:RC-751'],
  });
}

function expectDiscounts(state: ConfiguratorState, expected: {
  subtotal: number;
  base: number;
  quantity: number;
  dealer: number;
  finalPrice: number;
}) {
  const calculation = calculateConfiguration(state);
  expect(calculation.subtotal).toBe(expected.subtotal);
  expect(calculation.discountDetails.map(detail => ({ kind: detail.kind, percent: detail.percent, amount: detail.amount }))).toEqual([
    { kind: 'base', percent: 25, amount: expected.base },
    { kind: 'quantity', percent: 2, amount: expected.quantity },
    { kind: 'dealer', percent: 7.48, amount: expected.dealer },
  ]);
  expect(calculation.currentPrice).toBe(expected.finalPrice);
}

describe('Configurator quote currency switches', () => {
  it('persists the canonical currency column on both create and update', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/configurationsService.ts'), 'utf8');

    expect(source).toContain('currency: currencyFromLanguage(state.language)');
    expect(source).toContain('currency: currencyFromLanguage(stateForPersistence.language)');
  });

  it('recalculates a reopened DKK quote from canonical EUR line prices for DA to DE', () => {
    const original = frozenDkkT4014();
    const switched = { ...original, language: 'de' as const };

    expectLinePrices(switched, EUR_PRICES);
    expectDiscounts(switched, {
      subtotal: 69010,
      base: 17252.5,
      quantity: 1035.15,
      dealer: 3794.03,
      finalPrice: 46928.32,
    });
    expect(original.pricingSnapshot?.prices).toEqual(DKK_PRICES);
    expect(calcConfigurationTotals(original)).toEqual({ subtotal: 513350, totalDiscount: 164260.71, finalPrice: 349089.29 });
  });

  it('recalculates a reopened EUR quote from canonical DKK line prices for DE to DA', () => {
    const original = t4014State('de');
    original.pricingSnapshot = {
      ...createConfiguratorPricingSnapshot(original),
      signature: configuratorPricingSignature(original),
      totals: { subtotal: 69010, totalDiscount: 22081.68, finalPrice: 46928.32 },
    };
    const switched = { ...original, language: 'da' as const };

    expectLinePrices(switched, DKK_PRICES);
    expectDiscounts(switched, {
      subtotal: 513350,
      base: 128337.5,
      quantity: 7700.25,
      dealer: 28222.96,
      finalPrice: 349089.29,
    });
  });

  it.each([
    ['da', 'en', EUR_PRICES, 69010, 46928.32],
    ['en', 'de', EUR_PRICES, 69010, 46928.32],
  ] as const)('keeps every line in one canonical currency for %s to %s', (from, to, prices, subtotal, finalPrice) => {
    const original = t4014State(from);
    original.pricingSnapshot = {
      ...createConfiguratorPricingSnapshot(original),
      signature: configuratorPricingSignature(original),
      totals: calculateConfiguration(original),
    };
    const switched = { ...original, language: to };

    expectLinePrices(switched, prices);
    expect(calculateConfiguration(switched)).toMatchObject({ subtotal, currentPrice: finalPrice });
  });

  it('persists and reopens a fresh target-currency snapshot without carrying DKK values into EUR', async () => {
    const original = frozenDkkT4014();
    const switched = { ...original, language: 'de' as const };

    const saved = await finalizeConfiguratorPricingSnapshot(switched);
    expect(saved.pricingSnapshot).toMatchObject({ currency: 'EUR', prices: EUR_PRICES });
    expect(saved.pricingSnapshot?.capturedAt).not.toBe(original.pricingSnapshot?.capturedAt);
    expect(saved.pricingSnapshot?.totals).toEqual({ subtotal: 69010, totalDiscount: 22081.68, finalPrice: 46928.32 });

    const reopened = normalizeConfiguratorState(JSON.parse(JSON.stringify(saved)));
    expect(calcConfigurationTotals(reopened)).toEqual({ subtotal: 69010, totalDiscount: 22081.68, finalPrice: 46928.32 });
    expectLinePrices(reopened, EUR_PRICES);
  });

  it.each([
    ['da', '513.350', '69.010'],
    ['de', '69.010', '513.350'],
  ] as const)('renders the %s quote PDF from its canonical currency totals', (language, expectedGross, wrongGross) => {
    const state = { ...frozenDkkT4014(), language };
    const calculation = calculateConfiguration(state);
    const pdf = buildConfiguratorPdf({
      jsPDF: NoRasterJsPDF,
      state: {
        ...state,
        firmanavn: 'QA Currency Test',
        kontaktperson: 'QA',
        telefon: '00000000',
        email: 'qa@example.invalid',
        emailRecipient: 'qa@example.invalid',
      },
      calcResult: calculation,
      flowType: 'quote',
      quoteNumber: 'T-4014-QA',
      showPrices: true,
      uiLanguage: language,
      contentLanguage: language,
      T: key => t(key, language),
      TC: key => t(key, language),
    });
    const output = pdf.output();

    expect(output).toContain('T-4014-QA');
    expect(output).toContain(expectedGross);
    expect(output).not.toContain(wrongGross);
  });
});
