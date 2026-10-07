import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { jsPDF } from 'jspdf';
import * as catalog from '@/data/machines';
import { t } from '@/data/translations';
import { ConfiguratorNettoLines } from '@/components/configurator/ConfiguratorNettoLines';
import { calculateConfiguration, calcConfigurationTotals, roundPricingMoney } from '@/lib/calcConfiguration';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { isConfiguratorNettoSku } from '@/lib/configuratorPricing';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { replacePublishedCampaigns, type ProductCampaign } from '@/lib/configuratorCampaigns';
import { buildSubmittedOrderDocument, buildSubmittedOrderMailSummary } from '@/lib/submittedOrderConfirmation';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import type { ConfiguratorState } from '@/types/configurator';

const SKUS = ['795050', '795015', '795016', '795017', '795018'];
const NOW = Date.parse('2026-10-07T12:00:00Z');
const accessories = catalog.getAccessoriesFlat;

// Local catalogue fixture exercises the same policy even for SKUs absent from 3330.
function input(sku?: string, currency: 'DKK' | 'EUR' = 'DKK'): ConfiguratorState {
  vi.spyOn(catalog, 'getAccessoriesFlat').mockImplementation(type => [
    ...accessories(type).filter(item => !SKUS.includes(item.varenr)),
    ...SKUS.map(varenr => ({ id: varenr, varenr, name: `QA NETTO ${varenr}`, priceDKK: 4950, priceEUR: 665 })),
  ]);
  return { ...createEmptyConfiguratorState(currency === 'DKK' ? 'da' : 'en'), currency,
    machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: 2, configMode: 'shared', acc: ['725138', ...(sku ? [sku] : [])] }],
    date: '2098-01-06', manualDealerDiscountPct: 10,
  };
}

function campaign(sku: string, type: 'percentage' | 'fixed' | 'conditional'): ProductCampaign {
  return {
    id: 'qa-netto', code: 'QA-NETTO', name: 'QA local only', status: 'published', type,
    benefitPricingType: type === 'conditional' ? 'fixed' : null, discountPct: 50, targetPriceDkk: 0, targetPriceEur: 0,
    triggerMinQuantity: 1, triggerMatchMode: 'any', benefitQuantity: 5, scaleBenefitWithTrigger: false,
    audience: 'public', eligiblePartnerTypes: ['dealer', 'importer', 'service_partner'],
    startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z',
    products: [
      ...(type === 'conditional' ? [{ campaignId: 'qa-netto', productKey: 'Timan 3330::Timan 3330', machineKey: 'Timan 3330', itemNumber: '712000', role: 'trigger' as const, quantity: 1 }] : []),
      { campaignId: 'qa-netto', productKey: `Timan 3330::${sku}`, machineKey: 'Timan 3330', itemNumber: sku, role: type === 'conditional' ? 'benefit' : 'linked', quantity: 1 },
    ],
  };
}

afterEach(() => { vi.restoreAllMocks(); replacePublishedCampaigns([]); });

describe('canonical netto SKU pricing', () => {
  it('contains exactly the five specified SKUs, not the demo surcharge', () => {
    for (const sku of SKUS) expect(isConfiguratorNettoSku(sku)).toBe(true);
    for (const sku of ['795002', '725138', '712000', '795019']) expect(isConfiguratorNettoSku(sku)).toBe(false);
  });

  it.each(SKUS)('%s excludes base, delivery, quantity and dealer discounts without changing normal lines', sku => {
    for (const currency of ['DKK', 'EUR'] as const) {
      const state = input(sku, currency);
      state.accQty = { [`m0_${sku}`]: 2 };
      const result = calculateConfiguration(state, { now: NOW });
      const normal = calculateConfiguration({ ...state, machineConfigs: [{ ...state.machineConfigs[0], acc: ['725138'] }] }, { now: NOW });
      const netto = result.commercialLines!.filter(line => line.itemNo === sku);
      expect(netto).toHaveLength(2);
      expect(netto.every(line => line.discountApplications.length === 0 && line.finalNetAmount === line.grossAmount && line.quantity === 2)).toBe(true);
      const sum = netto.reduce((total, line) => total + line.grossAmount, 0);
      expect(result.nettoTotal).toBe(sum);
      expect(result.currentPrice).toBe(roundPricingMoney(normal.currentPrice + sum));
      expect(result.discountDetails).toEqual(normal.discountDetails);
      expect(result.deliveryDiscounts).toEqual(normal.deliveryDiscounts);
      expect(result.totalPct).toBe(normal.totalPct);
      expect(result.lineItems.filter(line => line.subtotal)).toEqual(normal.lineItems.filter(line => line.subtotal));
      expect(result.discountDetails.map(detail => detail.kind)).toEqual(['base', 'delivery', 'quantity', 'dealer']);
    }
  });

  it.each(SKUS)('%s remains full price under demo, Direct and exhibition/manual pricing', sku => {
    for (const mode of ['demo', 'direct', 'gross'] as const) {
      const state = input(sku);
      if (mode === 'demo') state.demoMachines = { '712000_1': true, '712000_2': true };
      if (mode === 'direct') state.pricingMode = 'direct';
      const options = { now: NOW, grossManualDiscountOnly: mode === 'gross' };
      const result = calculateConfiguration(state, options);
      const normal = calculateConfiguration({ ...state, machineConfigs: [{ ...state.machineConfigs[0], acc: ['725138'] }] }, options);
      expect(result.commercialLines!.filter(line => line.itemNo === sku).every(line => line.finalNetAmount === line.grossAmount && !line.discountApplications.length)).toBe(true);
      expect(result.currentPrice).toBe(roundPricingMoney(normal.currentPrice + 9900));
      expect(result.discountDetails).toEqual(normal.discountDetails);
      if (mode === 'demo') {
        expect(result.discountDetails[0].percent).toBe(32.5);
        expect(result.commercialLines!.filter(line => line.itemNo === '795002').every(line => line.discountApplications[0].kind === 'demo')).toBe(true);
      }
    }
  });

  it.each(SKUS)('%s rejects percentage, fixed and conditional campaign benefit without suppressing normal discounts', sku => {
    for (const type of ['percentage', 'fixed', 'conditional'] as const) {
      const state = input(sku);
      const normal = calculateConfiguration({ ...state, machineConfigs: [{ ...state.machineConfigs[0], acc: ['725138'] }] }, { now: NOW });
      replacePublishedCampaigns([campaign(sku, type)]);
      const result = calculateConfiguration(state, { now: NOW });
      expect(result.campaignLines).toEqual([]);
      expect(result.discountDetails).toEqual(normal.discountDetails);
      expect(result.currentPrice).toBe(roundPricingMoney(normal.currentPrice + 9900));
      replacePublishedCampaigns([]);
    }
  });

  it('keeps an ordinary campaign unchanged alongside a netto item', () => {
    const state = input('795018');
    replacePublishedCampaigns([campaign('725138', 'percentage')]);
    const result = calculateConfiguration(state, { now: NOW });
    const normal = calculateConfiguration({ ...state, machineConfigs: [{ ...state.machineConfigs[0], acc: ['725138'] }] }, { now: NOW });
    expect(result.campaignLines).toEqual(normal.campaignLines);
    expect(result.discountDetails).toEqual(normal.discountDetails);
    expect(result.currentPrice).toBe(normal.currentPrice + 9900);
  });

  it('handles the real 795050 startup line as netto outside all discount bases', () => {
    const state = input();
    state.deliveryMethod = 'deliver'; state.deliveryDeliverStartup = 'no_bridge';
    const result = calculateConfiguration(state, { now: NOW });
    const normal = calculateConfiguration({ ...state, deliveryMethod: '' }, { now: NOW });
    expect(result.commercialLines!.find(line => line.itemNo === '795050')).toMatchObject({ grossAmount: 1500, finalNetAmount: 1500, discountApplications: [] });
    expect(result.currentPrice).toBe(normal.currentPrice + 1500);
    expect(result.discountDetails).toEqual(normal.discountDetails);
  });

  it.each(['quote', 'order'] as const)('persists full netto prices and matching %s/PDF totals on save/reopen', async flowType => {
    const state = input('795018'); state.flowType = flowType;
    const live = calculateConfiguration(state);
    expect(buildQuoteContentSummary(state).machines[0].units.every(unit => unit.accessories.find(line => line.varenr === '795018')?.is_netto)).toBe(true);
    const frozen = await finalizeConfiguratorPricingSnapshot(state);
    const reopened = JSON.parse(JSON.stringify(frozen)) as ConfiguratorState;
    const document = buildSubmittedOrderDocument(reopened);
    expect(document.totals.finalPrice).toBe(live.currentPrice);
    expect(document.calcResult.nettoTotal).toBe(9900);
    expect(reopened.pricingSnapshot!.lines!.filter(line => line.itemNo === '795018').every(line => line.finalNetAmount === line.total && !line.discountApplications!.length)).toBe(true);
    const mail = buildSubmittedOrderMailSummary(reopened);
    expect(mail.machines[0].units.every(unit => unit.accessories.find(line => line.varenr === '795018')?.unit_price === 4950)).toBe(true);
    expect(mail.machines[0].units.every(unit => unit.accessories.find(line => line.varenr === '795018')?.is_netto)).toBe(true);
    const pdf = buildConfiguratorPdf({ jsPDF, state: reopened, calcResult: document.calcResult, flowType,
      showPrices: true, uiLanguage: 'da', contentLanguage: 'da', T: key => t(key, 'da'), TC: key => t(key, 'da') });
    expect(pdf.output()).toContain('795018'); expect(pdf.output()).toContain('Netto');
    if (process.env.CONFIGURATOR_QA_PDF_DIR) writeFileSync(`${process.env.CONFIGURATOR_QA_PDF_DIR}/netto-${flowType}.pdf`, Buffer.from(pdf.output('arraybuffer')));
  });

  it('does not reprice or relabel an old frozen order', async () => {
    const state = await finalizeConfiguratorPricingSnapshot(input('795018'));
    delete state.pricingSnapshot!.nettoPricingVersion;
    const before = JSON.stringify(state);
    expect(buildSubmittedOrderDocument(state).calcResult.nettoTotal).toBeUndefined();
    expect(buildSubmittedOrderDocument(state).calcResult.lineItems.some(line => line.isNetto)).toBe(false);
    expect(calcConfigurationTotals(state)).toEqual(state.pricingSnapshot!.totals);
    expect(await finalizeConfiguratorPricingSnapshot(state)).toBe(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('renders only netto lines with SKU, description, quantity and price', () => {
    const result = calculateConfiguration(input('795018'));
    render(<ConfiguratorNettoLines lines={result.lineItems} label="Netto" showPrices formatMoney={n => `${n} DKK`} />);
    expect(screen.getByRole('region', { name: 'Netto' })).toHaveTextContent('795018');
    expect(screen.getByRole('region', { name: 'Netto' })).toHaveTextContent('QA NETTO 795018');
    expect(screen.queryByText(/725138/)).toBeNull();
    expect(screen.getAllByText('4950 DKK')).toHaveLength(2);
    const page = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    expect(page).toContain('lineItems.filter(item => !item.isNetto)');
    expect(page.indexOf('<ConfiguratorNettoLines lines=')).toBeGreaterThan(page.indexOf('border-b border-dashed border-emerald-400'));
  });

  it('hides the section when empty and respects price visibility', () => {
    const { rerender } = render(<ConfiguratorNettoLines lines={[]} label="Netto" showPrices formatMoney={String} />);
    expect(screen.queryByTestId('configurator-netto-lines')).toBeNull();
    rerender(<ConfiguratorNettoLines lines={calculateConfiguration(input('795018')).lineItems} label="Netto" showPrices={false} formatMoney={() => 'SECRET PRICE'} />);
    expect(screen.queryByText('SECRET PRICE')).toBeNull();
  });
});
