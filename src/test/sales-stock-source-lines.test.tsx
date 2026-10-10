import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { replaceProductMaster } from '@/lib/publishedProductMaster';
import { cleanup, render, screen } from '@testing-library/react';
import { SalesStockPricingPanel } from '@/components/configurator/SalesStockPricingPanel';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { buildSalesStockConfiguratorState, canLaunchSalesStockAsset, updateSalesStockAssetPricing } from '@/lib/salesStockConfigurator';
import { assertValidSalesStockState, normalizeConfiguratorState } from '@/lib/configuratorState';
import { createConfiguratorPricingSnapshot, hasFrozenConfiguratorPricing } from '@/lib/configuratorPricing';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { buildAccountCaseLines } from '@/lib/configuratorAccountSummaries';
import { buildSubmittedOrderCsv } from '@/lib/submittedOrderCsv';
import type { FabricLoanAsset } from '@/lib/fabricLoanStock';
import type { Currency } from '@/lib/currency';
import { jsPDF } from 'jspdf';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { t } from '@/data/translations';

const source = (sku = '210100-01', patch: Partial<FabricLoanAsset> = {}): FabricLoanAsset => ({
  asset_id: sku, asset_instance_id: `LINE|DAT|${sku}`, instance_ordinal: 1,
  company: 'DAT', account_number: '1010', order_number: '133225', line_number: 9,
  item_number: sku, item_name: 'C5 varetekst', line_text: 'Nr.96 C5 varetekst',
  serial_number: null, serial_number_normalized: null, brik_number: 96,
  warehouse_location_code: '2', warehouse_location_name: 'Lager 2',
  inventory_qty: 18, reserved_qty: null, stock_last_changed: '2026-10-08T00:00:00',
  classification: 'LOAN_CANDIDATE', review_required: false, review_reason: null,
  identity_conflict: false, source_present: true, item_type: null, allocated: false,
  ...patch,
});

beforeEach(() => replaceProductMaster([
  { item_number: '410040', price_dkk: 167500, price_eur: 22515, price_sek: 253790 },
  { item_number: '411666', price_dkk: 43800, price_eur: 5890, price_sek: 66335 },
]));
afterEach(() => { cleanup(); replaceProductMaster([]); });
describe('Fabric-native sales-stock lines', () => {
  it.each(['210100-01', '210112-02', '210123-00'])('accepts %s without fabricated catalogue identity or type', sku => {
    const state = buildSalesStockConfiguratorState([source(sku)]);
    expect(state.salesStockAssets?.[0]).toMatchObject({
      itemNumber: sku, itemText: 'Nr.96 C5 varetekst', catalogItemNumber: null, itemType: null,
      quantity: 18, originalListPrice: null, adjustedBasePrice: null, priceSource: 'manual',
    });
    expect(state.machineConfigs).toHaveLength(1);
    expect(normalizeConfiguratorState(JSON.parse(JSON.stringify(state))).salesStockAssets).toEqual(state.salesStockAssets);
    expect(calculateConfiguration(state).pricingIncomplete).toBe(true);
    expect(() => assertValidSalesStockState(state)).toThrow('SALES_STOCK_ADJUSTED_BASE_INVALID');
    expect(() => createConfiguratorPricingSnapshot(state)).toThrow();
  });

  it('shows explicit price-required state, never a zero selling price, and blocks discount-only pricing', () => {
    const state = buildSalesStockConfiguratorState([source()]);
    render(<SalesStockPricingPanel state={state} setState={() => {}} canEdit />);
    expect(screen.getAllByText('Salgspris kræver fastsættelse')).toHaveLength(2);
    expect(screen.getByLabelText('Salgslager-/demo-rabat 210100-01')).toBeDisabled();
    expect(screen.queryByText(/0,00.*kr/)).not.toBeInTheDocument();
    const snapshot = { ...state.salesStockAssets![0], pricingMethod: 'sales_stock_discount' as const };
    expect(() => assertValidSalesStockState({ ...state, salesStockAssets: [snapshot] })).toThrow('SALES_STOCK_PRICE_REQUIRED');
  });

  it('keeps a static catalogue match supplemental when no released selling price exists', () => {
    const state = buildSalesStockConfiguratorState([source('312010-00', { item_type: 'equipment' })]);
    expect(state.salesStockAssets![0]).toMatchObject({ catalogItemNumber: '312010', originalListPrice: null,
      priceSource: 'manual', pricingMethod: 'adjusted_base' });
    expect(calculateConfiguration(state).pricingIncomplete).toBe(true);
  });

  it.each([0, -1, NaN, Infinity])('rejects unsafe agreed price %s', price => {
    const state = updateSalesStockAssetPricing(buildSalesStockConfiguratorState([source()]), '210100-01', {
      adjustedBasePrice: price, pricingReason: 'Kontrolleret pris',
    });
    expect(() => assertValidSalesStockState(state)).toThrow();
  });

  it.each(['DKK', 'SEK', 'EUR'] as Currency[])('preserves quantity and raw SKU through quote/order/CRM snapshot and CSV in %s', async currency => {
    let state = buildSalesStockConfiguratorState([source()], 'da', currency);
    state = updateSalesStockAssetPricing(state, '210100-01', { adjustedBasePrice: 1000, pricingReason: 'Godkendt salgspris' });
    state = { ...state, flowType: 'order', manualDealerDiscountPct: 4, date: '2026-10-20' };
    const frozen = await finalizeConfiguratorPricingSnapshot(state);
    expect(hasFrozenConfiguratorPricing(frozen)).toBe(true);
    expect(frozen.pricingSnapshot?.lines).toHaveLength(1);
    expect(frozen.pricingSnapshot?.lines?.[0]).toMatchObject({
      itemNo: '210100-01', description: 'Nr.96 C5 varetekst', quantity: 18, unitPrice: 1000,
      total: 18000, finalNetAmount: 17280,
    });
    expect(buildAccountCaseLines(frozen, 'de')[0].itemNo).toBe('210100-01');
    expect(buildAccountCaseLines(normalizeConfiguratorState(JSON.parse(JSON.stringify(frozen))), 'da')).toEqual(buildAccountCaseLines(frozen, 'da'));
    const csv = buildSubmittedOrderCsv({ state: frozen, orderNumber: 'O-TEST', orderDate: '2026-10-10',
      dealerNumber: '10295', dealerName: 'Test', sellerInitials: 'NB' });
    expect(csv.lineCount).toBe(1);
    expect(csv.matchesOrderTotal).toBe(true);
    expect(csv.content).toContain(';210100-01;Nr.96 C5 varetekst;18;');
    expect(csv.content).toContain(';133225;');
  });

  it('exports sales-stock adjustment separately from the unchanged extra dealer discount', async () => {
    let state = buildSalesStockConfiguratorState([source('410040-01', { inventory_qty: 1, item_type: 'machine' })]);
    const original = state.salesStockAssets![0].originalListPrice!;
    state = updateSalesStockAssetPricing(state, '410040-01', { pricingMethod: 'adjusted_base', adjustedBasePrice: original / 2, pricingReason: 'Nedskrevet' });
    const frozen = await finalizeConfiguratorPricingSnapshot({ ...state, flowType: 'order', manualDealerDiscountPct: 4 });
    const line = frozen.pricingSnapshot!.lines![0];
    expect(line.discountApplications?.map(row => row.kind)).toEqual(['sales_stock_base', 'dealer']);
    const csv = buildSubmittedOrderCsv({ state: frozen, orderNumber: 'O-TEST', orderDate: '2026-10-10',
      dealerNumber: '10295', dealerName: 'Test', sellerInitials: 'NB' });
    const columns = csv.content.split('\r\n')[1].split(';');
    expect(columns[14]).toBe('50,0000');
    expect(columns[17]).toBe('4,0000');
    expect(columns[23]).toBe(columns[24]);
  });

  it('preserves fractional C5 quantity without lowering the agreed unit price', async () => {
    const priced = updateSalesStockAssetPricing(buildSalesStockConfiguratorState([source('210100-01', { inventory_qty: 0.5 })]),
      '210100-01', { adjustedBasePrice: 1000, pricingReason: 'Godkendt pris' });
    const frozen = await finalizeConfiguratorPricingSnapshot({ ...priced, flowType: 'order', manualDealerDiscountPct: 4 });
    expect(frozen.pricingSnapshot!.lines![0]).toMatchObject({ quantity: 0.5, unitPrice: 1000, total: 500, finalNetAmount: 480 });
    const csv = buildSubmittedOrderCsv({ state: frozen, orderNumber: 'O-TEST', orderDate: '2026-10-10',
      dealerNumber: '10295', dealerName: 'Test', sellerInitials: 'NB' });
    expect(csv.matchesOrderTotal).toBe(true);
    expect(csv.lineCount).toBe(1);
  });

  it('does not relabel a manual DKK price as EUR and requires renewed price confirmation', () => {
    const state = updateSalesStockAssetPricing(buildSalesStockConfiguratorState([source()]), '210100-01',
      { adjustedBasePrice: 1000, pricingReason: 'Pris i DKK' });
    const eur = { ...state, currency: 'EUR' as const };
    expect(calculateConfiguration(eur).pricingIncomplete).toBe(true);
    expect(() => createConfiguratorPricingSnapshot(eur)).toThrow('SALES_STOCK_PRICE_CURRENCY_MISMATCH');
    const confirmed = updateSalesStockAssetPricing(eur, '210100-01', { adjustedBasePrice: 150, pricingReason: 'Pris i EUR' });
    expect(confirmed.salesStockAssets![0].pricingCurrency).toBe('EUR');
    expect(calculateConfiguration(confirmed).pricingIncomplete).not.toBe(true);
  });

  it('reconfirms a catalogue-priced asset manually when the new currency has no released price', () => {
    let state = buildSalesStockConfiguratorState([source('410040-01', { item_type: 'machine' })]);
    replaceProductMaster([{ item_number: '410040', price_dkk: 167500, price_eur: null, price_sek: null }]);
    state = updateSalesStockAssetPricing({ ...state, currency: 'EUR' }, '410040-01', {
      pricingMethod: 'adjusted_base', adjustedBasePrice: 100, pricingReason: 'Godkendt EUR-pris',
    });
    expect(state.salesStockAssets![0]).toMatchObject({ originalListPrice: null, priceSource: 'manual', pricingCurrency: 'EUR' });
    expect(() => createConfiguratorPricingSnapshot(state)).not.toThrow();
  });

  it.each(['quote', 'order'] as const)('renders raw source identity and quantity in the %s PDF, rejecting missing prices', async flowType => {
    let state = { ...buildSalesStockConfiguratorState([source()]), flowType };
    const pdfInput = { jsPDF, flowType, quoteNumber: 'T-TEST', orderNumber: flowType === 'order' ? 'O-TEST' : null,
      sourceQuoteNumber: null, showPrices: true, uiLanguage: 'da' as const, contentLanguage: 'da' as const,
      T: (key: string) => t(key, 'da'), TC: (key: string) => t(key, 'da') };
    expect(() => buildConfiguratorPdf({ ...pdfInput, state, calcResult: calculateConfiguration(state) })).toThrow('SALES_STOCK_PRICE_REQUIRED');
    state = updateSalesStockAssetPricing(state, '210100-01', { adjustedBasePrice: 1000, pricingReason: 'Godkendt pris' });
    const frozen = await finalizeConfiguratorPricingSnapshot(state);
    const calc = calculateConfiguration(frozen);
    const output = buildConfiguratorPdf({ ...pdfInput, state: frozen, calcResult: calc }).output();
    expect(output).toContain('210100-01');
    expect(output).toContain('C5 varetekst');
    expect(calc.currentPrice).toBe(18000);
    expect(frozen.pricingSnapshot!.lines![0].quantity).toBe(18);
  });

  it('never adds the parent machine or ordinary demo/campaign/quantity/delivery layers to equipment', () => {
    const state = buildSalesStockConfiguratorState([source('411666-00', { inventory_qty: 3, item_type: 'equipment' })]);
    const calc = calculateConfiguration({ ...state, date: '2027-01-01', demoMachines: { '411000_1': true }, manualDealerDiscountPct: 4 });
    expect(calc.lineItems.filter(line => !line.subtotal).map(line => line.varenr)).toEqual(['411666-00']);
    expect(calc.discountDetails.map(row => row.kind)).toEqual(['sales_stock', 'dealer']);
    expect(calc.campaignLines).toEqual([]);
  });

  it.each([{ allocated: true }, { sales_committed: true }, { identity_conflict: true },
    { brik_group_serial_conflict: true }, { review_required: true }, { brik_number: null },
    { warehouse_location_code: '1' }, { account_number: 'OTHER' }])('retains physical eligibility protection %j', patch => {
    expect(canLaunchSalesStockAsset(source('210100-01', patch), 'DKK')).toBe(false);
    expect(() => buildSalesStockConfiguratorState([source('210100-01', patch)])).toThrow('SALES_STOCK_ASSET_UNAVAILABLE');
  });
});
