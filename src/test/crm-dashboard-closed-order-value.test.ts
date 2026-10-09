import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatConvertedMoney, toDkk } from '@/lib/currency';
import {
  resolveHistoricalOrderTotal,
  summarizeWonOrderValues,
} from '@/lib/crmClosedOrderValue';

describe('CRM Dashboard closed-order value', () => {
  it('counts and values the exact same global won-order set', () => {
    const summary = summarizeWonOrderValues([
      { total_value_dkk: 100_000 },
      { total_value_dkk: 250_000 },
      { total_value_dkk: 0 },
    ]);

    expect(summary).toEqual({
      wonOrdersCount: 3,
      valueDkk: 350_000,
      ordersWithValue: 3,
      ordersMissingValue: 0,
    });
  });

  it('keeps seller-scoped aggregation isolated', () => {
    const jtnRows = [{ total_value_dkk: 150_000 }, { total_value_dkk: 75_000 }];
    const otherSellerRows = [{ total_value_dkk: 999_000 }];

    expect(summarizeWonOrderValues(jtnRows)).toMatchObject({ wonOrdersCount: 2, valueDkk: 225_000 });
    expect(summarizeWonOrderValues([...jtnRows, ...otherSellerRows]).valueDkk).toBe(1_224_000);
  });

  it('aggregates mixed source currencies after canonical DKK normalization', () => {
    const summary = summarizeWonOrderValues([
      { total_value_dkk: 75_000 },
      { total_value_dkk: toDkk(10_000, 'EUR') },
    ]);

    expect(summary.valueDkk).toBe(149_600);
    expect(formatConvertedMoney(summary.valueDkk, 'DKK', 'DKK')).toContain('149.600');
    expect(formatConvertedMoney(summary.valueDkk, 'DKK', 'EUR')).toContain('20.054');
  });

  it('reports missing legacy values and treats a stored zero as valid', () => {
    expect(summarizeWonOrderValues([
      { total_value_dkk: 0 },
      { total_value_dkk: null },
      { total_value_dkk: Number.NaN },
    ])).toEqual({
      wonOrdersCount: 3,
      valueDkk: 0,
      ordersWithValue: 1,
      ordersMissingValue: 2,
    });
  });

  it('prefers the persisted historical total and only falls back to frozen snapshot totals', () => {
    const snapshot = { pricingSnapshot: { totals: { finalPrice: 80_000 } } };
    expect(resolveHistoricalOrderTotal(75_000, snapshot)).toBe(75_000);
    expect(resolveHistoricalOrderTotal(null, snapshot)).toBe(80_000);
    expect(resolveHistoricalOrderTotal(null, {})).toBeNull();
  });

  it('wires the displayed value and count to the same canonical quote/order RPC', () => {
    const dashboard = readFileSync('src/pages/crm/CrmDashboardPage.tsx', 'utf8');
    const fallback = readFileSync('src/lib/crmConfigurationsService.ts', 'utf8');

    expect(dashboard).toContain('wonOrdersCount: serverQuoteOrderKpis?.orderCount ?? base.wonOrdersCount');
    expect(dashboard).toContain('closedOrderValue: serverQuoteOrderKpis?.orderValueDkk ?? base.closedOrderValue');
    expect(dashboard).toContain('fmtKr(metrics.closedOrderValue, displayCurrency)');
    expect(dashboard).toContain('closedPctChange: serverQuoteOrderKpis?.closedPctChange ?? base.closedPctChange');
    expect(fallback).toContain('resolveHistoricalOrderTotal(r.total_price, state)');
    expect(fallback).not.toContain('total = calcConfigurationTotals(state).finalPrice');
  });
});
