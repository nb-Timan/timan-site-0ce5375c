import { describe, expect, it } from 'vitest';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { configuratorPricingSignature } from '@/lib/configuratorPricing';
import { buildSubmittedOrderCsv, sequentialEquivalentDiscountPct } from '@/lib/submittedOrderCsv';
import type { ConfiguratorLineDiscountApplication, ConfiguratorState } from '@/types/configurator';

const application = (
  kind: ConfiguratorLineDiscountApplication['kind'],
  percent: number,
  basis: number,
  amount: number,
): ConfiguratorLineDiscountApplication => ({ kind, percent, basis, amount });

function frozenState(applications: ConfiguratorLineDiscountApplication[], finalNetAmount: number): ConfiguratorState {
  const state = createEmptyConfiguratorState('da', 'order');
  state.firmanavn = 'QA Kunde A/S';
  state.date = '2026-12-15';
  state.machineConfigs = [{ id: 'm1', type: 'Timan 3330', qty: 1, configMode: 'shared', acc: [] }];
  state.pricingSnapshot = {
    version: 1,
    discountEngineVersion: 2,
    capturedAt: '2026-10-05T12:00:00.000Z',
    currency: 'DKK',
    prices: {},
    signature: configuratorPricingSignature(state),
    totals: { subtotal: 1000, totalDiscount: 1000 - finalNetAmount, finalPrice: finalNetAmount },
    discountDetails: [],
    lines: [{
      unitNumber: 1,
      itemNo: '563219',
      description: 'Timan 3330',
      note: '',
      unitPrice: 1000,
      quantity: 1,
      total: 1000,
      finalNetAmount,
      discountApplications: applications,
    }],
  };
  return state;
}

function build(state: ConfiguratorState) {
  return buildSubmittedOrderCsv({
    state,
    orderNumber: 'O-7019',
    orderDate: '2026-10-05T12:00:00.000Z',
    dealerNumber: 'D-100',
    dealerName: 'QA Forhandler',
    sellerInitials: 'NB',
  });
}

describe('submitted order C5/NAV CSV', () => {
  it('combines only the three base components sequentially', () => {
    expect(sequentialEquivalentDiscountPct(25, 2, 2)).toBeCloseTo(27.97, 10);
    expect(sequentialEquivalentDiscountPct(25, 2, 0)).toBeCloseTo(26.5, 10);
    expect(sequentialEquivalentDiscountPct(25, 0, 0)).toBeCloseTo(25, 10);
    expect(sequentialEquivalentDiscountPct(30, 2, 2)).toBeCloseTo(32.772, 10);
  });

  it('exports UTF-8 semicolon data from exact frozen line allocations', () => {
    const state = frozenState([
      application('base', 25, 1000, 250),
      application('delivery', 2, 750, 15),
      application('quantity', 2, 735, 14.7),
      application('dealer', 7.48, 720.3, 53.88),
    ], 666.42);
    const csv = build(state);
    const [header, row] = csv.content.replace(/^\uFEFF/, '').trim().split('\r\n');
    const headers = header.split(';');
    const values = row.split(';');
    const value = (name: string) => values[headers.indexOf(name)];

    expect(csv.filename).toBe('Timan_Order_O-7019_2026-10-05.csv');
    expect(csv.encoding).toBe('UTF-8-BOM');
    expect(csv.delimiter).toBe(';');
    expect(csv.lineCount).toBe(1);
    expect(csv.matchesOrderTotal).toBe(true);
    expect(value('StandardDiscountPct')).toBe('25,0000');
    expect(value('QuantityDiscountPct')).toBe('2,0000');
    expect(value('DeliveryDiscountPct')).toBe('2,0000');
    expect(value('NAVBaseDiscountPct')).toBe('27,9700');
    expect(value('ExtraDealerDiscountPct')).toBe('7,4800');
    expect(value('NetAfterNAVBaseDiscount')).toBe('720,30');
    expect(value('NetAfterExtraDiscount')).toBe('666,42');
    expect(value('FinalLineNetAmount')).toBe('666,42');
    expect(value('OrderNetTotal')).toBe('666,42');
    expect(value('CSVMatchesOrderTotal')).toBe('YES');
    expect(atob(csv.base64)).toContain('Timan_Order'.replace('Timan_Order', 'OrderNumber'));
  });

  it('keeps campaign, demo and direct pricing explicit instead of inventing base discounts', () => {
    const campaign = build(frozenState([
      application('base', 25, 1000, 250),
      application('campaign', 10, 750, 75),
    ], 675)).content;
    expect(campaign).toContain('25,0000;0,0000;0,0000;0,0000;10,0000;0,0000;0,0000;25,0000');

    const demo = build(frozenState([application('demo', 32.5, 1000, 325)], 675)).content;
    expect(demo).toContain('0,0000;0,0000;0,0000;0,0000;0,0000;32,5000;0,0000;32,5000');

    const directState = frozenState([application('direct', 5, 1000, 50)], 950);
    directState.pricingMode = 'direct';
    directState.pricingSnapshot!.signature = configuratorPricingSignature(directState);
    const direct = build(directState).content;
    expect(direct).toContain('0,0000;0,0000;0,0000;0,0000;0,0000;0,0000;5,0000;0,0000');
  });

  it('refuses incomplete historical snapshots instead of recalculating them', () => {
    const state = frozenState([], 1000);
    delete state.pricingSnapshot!.lines![0].finalNetAmount;
    expect(() => build(state)).toThrow(/canonical linjenet/);
  });
});
