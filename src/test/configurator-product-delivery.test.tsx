import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { da } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import { t } from '@/data/translations';
import { ConfiguratorProductDeliveryDates } from '@/components/configurator/ConfiguratorProductDeliveryDates';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import { machineDeliveryDate, lineDeliveryDates, productDeliveryDate, productDeliveryUnits } from '@/lib/configuratorDelivery';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { buildSubmittedOrderDocument, buildSubmittedOrderMailSummary } from '@/lib/submittedOrderConfirmation';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { buildSubmittedOrderCsv } from '@/lib/submittedOrderCsv';
import type { ConfiguratorState } from '@/types/configurator';

function stateFor(type = 'LOOSE_TOOL', qty = 1): ConfiguratorState {
  return { ...createEmptyConfiguratorState(), date: '2026-10-30', deliveryMethod: 'send',
    machineConfigs: [{ id: 'm0', type, qty, configMode: 'shared', acc: ['725161'] }],
    accQty: { m0_725161: 3 } };
}

describe('canonical Loader-Line, CS-200 and loose product delivery', () => {
  it.each(['Loader Line', 'LOOSE_TOOL'])('uses the standard case date/method for %s quantity one', type => {
    const state = stateFor(type);
    state.accQty = {};
    expect(machineDeliveryDate(state, 1)).toBe(state.date);
    expect(lineDeliveryDates(state, 1, '725161')).toEqual([state.date]);
    expect(normalizeConfiguratorState(state).deliveryMethod).toBe('send');
  });

  it.each(['Loader Line', 'LOOSE_TOOL'])('preserves group-unit split dates for %s including shared configurations', type => {
    const state = stateFor(type, 3);
    state.machineDeliveryDates = { m0_2: '2026-11-16', m0_3: '2026-12-01' };
    const restored = normalizeConfiguratorState(JSON.parse(JSON.stringify(state)));
    expect([1, 2, 3].map(unit => machineDeliveryDate(restored, unit))).toEqual(['2026-10-30', '2026-11-16', '2026-12-01']);
    expect(restored.machineConfigs).toHaveLength(1);
  });

  it('preserves accessory quantity dates without duplicating products or changing pricing', () => {
    const state = stateFor();
    const before = calculateConfiguration(state);
    const units = productDeliveryUnits(state);
    expect(units).toHaveLength(3);
    state.machineDeliveryDates = { [units[1].key]: '2026-11-16', [units[2].key]: '2026-12-01' };
    const restored = normalizeConfiguratorState(JSON.parse(JSON.stringify(state)));
    expect(lineDeliveryDates(restored, 1, '725161')).toEqual(['2026-10-30', '2026-11-16', '2026-12-01']);
    expect(calculateConfiguration(restored)).toEqual(before);
    expect(restored.accQty).toEqual({ m0_725161: 3 });
  });

  it('keeps mixed products and shared-unit accessory quantity groups independent', () => {
    const state = stateFor('Loader Line', 2);
    state.machineConfigs.push({ id: 'm1', type: 'LOOSE_TOOL', qty: 1, configMode: 'shared', acc: ['725161'] });
    state.accQty.m1_725161 = 3;
    const units = productDeliveryUnits(state);
    const target = units.find(unit => unit.parentUnitNumber === 2 && unit.ordinal === 2)!;
    state.machineDeliveryDates = { [target.key]: '2026-12-01' };
    expect(productDeliveryDate(state, target)).toBe('2026-12-01');
    expect(units.filter(unit => unit.parentUnitNumber === 3).map(unit => productDeliveryDate(state, unit)))
      .toEqual(['2026-10-30', '2026-10-30', '2026-10-30']);
  });

  it('removes stale unit keys after quantity reduction without losing sibling dates', () => {
    const state = stateFor();
    const units = productDeliveryUnits(state);
    state.machineDeliveryDates = Object.fromEntries(units.map(unit => [unit.key, '2026-12-01']));
    state.accQty.m0_725161 = 2;
    expect(Object.keys(normalizeConfiguratorState(state).machineDeliveryDates!)).toEqual(units.slice(0, 2).map(unit => unit.key));
  });

  it('renders quantity split controls only when needed and a read-only Step 4 summary', () => {
    const state = stateFor();
    const units = productDeliveryUnits(state);
    state.machineDeliveryDates = { [units[2].key]: '2026-12-01' };
    render(<ConfiguratorProductDeliveryDates state={state} T={key => t(key)} locale={da} />);
    expect(screen.getAllByText(/Stk\./)).toHaveLength(3);
    expect(screen.getByText('2026-12-01')).toBeInTheDocument();
    cleanup();
    state.accQty = {};
    render(<ConfiguratorProductDeliveryDates state={state} T={key => t(key)} locale={da} />);
    expect(screen.queryByTestId('product-delivery-date-editor')).not.toBeInTheDocument();
    cleanup();
  });

  it.each(['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'])('localizes the per-unit control in %s', language => {
    expect(t('customizeProductDeliveryDates', language)).not.toBe('customizeProductDeliveryDates');
  });

  it.each(['quote', 'order'] as const)('keeps split dates in frozen %s summaries and structured PDF', async flowType => {
    const state = stateFor();
    state.flowType = flowType;
    const units = productDeliveryUnits(state);
    state.machineDeliveryDates = { [units[1].key]: '2026-11-16', [units[2].key]: '2026-12-01' };
    const frozen = await finalizeConfiguratorPricingSnapshot(state);
    const summary = flowType === 'quote' ? buildQuoteContentSummary(frozen) : buildSubmittedOrderMailSummary(frozen);
    expect(summary.machines[0].units[0].accessories[0].delivery_dates).toEqual(['2026-10-30', '2026-11-16', '2026-12-01']);
    const pdf = buildConfiguratorPdf({ jsPDF, state: frozen, calcResult: buildSubmittedOrderDocument(frozen).calcResult,
      flowType, showPrices: true, uiLanguage: 'da', contentLanguage: 'da', T: key => t(key), TC: key => t(key) });
    const content = pdf.output();
    expect(content).toContain('16.11.2026');
    expect(content).toContain('1.12.2026');
  });

  it('fails closed instead of flattening unsupported C5/NAV quantity-line split dates', async () => {
    const state = stateFor();
    state.flowType = 'order';
    const units = productDeliveryUnits(state);
    state.machineDeliveryDates = { [units[2].key]: '2026-12-01' };
    const frozen = await finalizeConfiguratorPricingSnapshot(state);
    expect(() => buildSubmittedOrderCsv({ state: frozen, orderNumber: 'QA-NOT-SUBMITTED', orderDate: '2026-10-09',
      dealerNumber: null, dealerName: null, sellerInitials: null })).toThrow('samme mængdelinje');
    expect(frozen.machineDeliveryDates?.[units[2].key]).toBe('2026-12-01');
  });
});
