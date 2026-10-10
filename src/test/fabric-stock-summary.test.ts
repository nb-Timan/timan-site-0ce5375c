import { describe, expect, it } from 'vitest';
import { filterFabricLoanStock, type FabricLoanAsset } from '@/lib/fabricLoanStock';
import { summarizeFabricStock, type FabricStockFactsResolver, type FabricStockVerifiedFacts } from '@/lib/fabricStockSummary';

const asset = (id: string, patch: Partial<FabricLoanAsset> = {}): FabricLoanAsset => ({
  asset_id: id, asset_instance_id: `LINE|DAT|${id}`, instance_ordinal: 1, company: 'DAT',
  account_number: '1010', order_number: '133225', line_number: 1, item_number: id,
  item_name: id, line_text: `Original ${id}`, serial_number: null, serial_number_normalized: null,
  warehouse_location_code: '2', warehouse_location_name: 'Lager 2', inventory_qty: 1, reserved_qty: 0,
  stock_last_changed: '2011-01-01', classification: 'LOAN_CANDIDATE', review_required: false,
  review_reason: null, identity_conflict: false, source_present: true, item_type: null,
  allocated: false, brik_number: null, ...patch,
});
const facts = (values: Record<string, Partial<FabricStockVerifiedFacts>>): FabricStockFactsResolver => row => values[row.asset_id] ? {
  valueDkk: null, valuationCurrency: null, valuationReference: null, receivedDate: null, receiptReference: null, ...values[row.asset_id],
} : null;
const value = (amount: number, reference: string): Partial<FabricStockVerifiedFacts> => ({ valueDkk: amount, valuationCurrency: 'DKK', valuationReference: reference });
const date = (receivedDate: string): Partial<FabricStockVerifiedFacts> => ({ receivedDate, receiptReference: 'documented-receipt' });

describe('filtered Fabric stock summaries', () => {
  it('does not mistake catalogue/order prices or source refresh dates for stock facts', () => {
    const summary = summarizeFabricStock([asset('210100-01')]);
    expect(summary).toMatchObject({ quantity: 1, lineCount: 1, valuedLineCount: 0, missingValueLines: 1, missingDateGroups: 1 });
    expect(summary.mostExpensive).toEqual([]);
    expect(summary.oldest).toEqual([]);
  });
  it('counts Shared Brik components once and an 18-piece line as 18 pieces, never 18 rows', () => {
    const rows = [asset('bucket', { brik_number: 96 }), asset('clamp', { brik_number: 96 }), asset('bulk', { inventory_qty: 18 })];
    const summary = summarizeFabricStock(rows, facts({ bucket: value(100, 'ledger-bucket'), clamp: value(50, 'ledger-clamp'), bulk: value(1800, 'ledger-bulk') }));
    expect(summary).toMatchObject({ quantity: 19, lineCount: 3, groupCount: 2, documentedValueDkk: 1950 });
    expect(summary.mostExpensive.map(item => [item.quantity, item.valueDkk, item.assets.length])).toEqual([[18, 1800, 1], [1, 150, 2]]);
  });
  it('counts duplicated source rows and a shared economic reference only once', () => {
    const a = asset('a', { brik_number: 96 }), b = asset('b', { brik_number: 96 });
    const summary = summarizeFabricStock([a, a, b], facts({ a: value(100, 'same-value'), b: value(100, 'same-value') }));
    expect(summary).toMatchObject({ lineCount: 2, quantity: 1, documentedValueDkk: 100 });
    expect(summary.mostExpensive[0].valueDkk).toBe(100);
  });
  it('keeps undocumented and conflicting amounts out of rankings and labels partial coverage', () => {
    const rows = ['a', 'b', 'c', 'unknown', 'bad', 'conflict'].map(id => asset(id));
    const summary = summarizeFabricStock(rows, facts({ a: value(100, 'same'), b: value(200, 'same'), c: value(0, 'zero'), bad: value(NaN, 'bad'), conflict: value(-1, 'negative') }));
    expect(summary).toMatchObject({ documentedValueDkk: 0, valuedLineCount: 1, missingValueLines: 5 });
    expect(summary.mostExpensive.map(item => item.assets[0].asset_id)).toEqual(['c']);
  });
  it('rejects one economic reference assigned to different physical groups and conflicting warehouse identity', () => {
    const rows = [asset('a', { brik_number: 96 }), asset('b', { brik_number: 157 })];
    expect(summarizeFabricStock(rows, facts({ a: value(100, 'same'), b: value(100, 'same') }))).toMatchObject({ valuedLineCount: 0, missingValueLines: 2, mostExpensive: [] });
    expect(summarizeFabricStock([asset('a', { brik_number: 96 }), asset('b', { brik_number: 96, warehouse_location_code: '4' })]).unknownQuantityGroups).toBe(1);
  });
  it('requires explicit DKK rather than relabelling foreign or unspecified currency', () => {
    for (const valuationCurrency of ['EUR', 'SEK', null]) {
      expect(summarizeFabricStock([asset('a')], facts({ a: { ...value(100, 'a'), valuationCurrency } }))).toMatchObject({ valuedLineCount: 0, missingValueLines: 1, mostExpensive: [] });
    }
  });
  it('ranks the three highest complete physical line/group values and rounds the total once', () => {
    const summary = summarizeFabricStock(['a', 'b', 'c', 'd', 'e'].map(id => asset(id)), facts({
      a: value(1.005, 'a'), b: value(1.005, 'b'), c: value(30, 'c'), d: value(40, 'd'), e: value(50, 'e'),
    }));
    expect(summary.documentedValueDkk).toBe(122.01);
    expect(summary.mostExpensive.map(item => item.assets[0].asset_id)).toEqual(['e', 'd', 'c']);
  });
  it('uses documented receipt dates, rejecting missing provenance, impossible/future dates and inconsistent group dates', () => {
    const rows = ['a', 'b', 'c', 'd', 'future', 'invalid', 'no-source'].map(id => asset(id));
    const summary = summarizeFabricStock(rows, facts({ a: date('2025-01-01'), b: date('2023-01-01'), c: date('2024-01-01'), d: date('2022-01-01'),
      future: date('2099-01-01'), invalid: date('2025-02-31'), 'no-source': { receivedDate: '2020-01-01' } }), '2026-10-10');
    expect(summary.oldest.map(item => item.assets[0].asset_id)).toEqual(['d', 'b', 'c']);
    expect(summary.missingDateGroups).toBe(3);
    expect(summarizeFabricStock([asset('a', { brik_number: 96 }), asset('b', { brik_number: 96 })], facts({ a: date('2020-01-01'), b: date('2021-01-01') })).oldest).toEqual([]);
  });
  it.each([{ inventory_qty: null }, { inventory_qty: -1 }, { inventory_qty: NaN }, { identity_conflict: true }, { brik_group_serial_conflict: true }])('marks uncertain quantity rather than inventing one piece: %j', patch => {
    expect(summarizeFabricStock([asset('a', patch)])).toMatchObject({ quantity: 0, unknownQuantityGroups: 1 });
  });
  it('does not collapse conflicting serials or disagreeing component quantities into a known physical count', () => {
    const rows = [asset('a', { brik_number: 96, serial_number_normalized: 'SERIAL-A' }), asset('b', { brik_number: 96, serial_number_normalized: 'SERIAL-B' })];
    expect(summarizeFabricStock(rows).unknownQuantityGroups).toBe(1);
    expect(summarizeFabricStock([asset('a', { brik_number: 96 }), asset('b', { brik_number: 96, inventory_qty: 2 })]).unknownQuantityGroups).toBe(1);
  });
  it.each(['all', '2', '4'])('follows all account combinations inside warehouse %s', warehouse => {
    const rows = [asset('a'), asset('b', { account_number: '1020' }), asset('c', { warehouse_location_code: '4' }), asset('d', { warehouse_location_code: '4', account_number: '1020' }), asset('hidden', { source_present: false })];
    const resolver = facts(Object.fromEntries(rows.map((row, i) => [row.asset_id, { ...value((i + 1) * 100, row.asset_id), ...date(`202${i}-01-01`) }])));
    for (const account of ['all', '1010', '1020']) {
      const filtered = filterFabricLoanStock(rows, warehouse, '', account);
      const summary = summarizeFabricStock(filtered, resolver);
      expect(summary.lineCount).toBe(filtered.length);
      expect(summary.quantity).toBe(filtered.length);
      expect(summary.documentedValueDkk).toBe(filtered.reduce((sum, row) => sum + resolver(row)!.valueDkk!, 0));
      expect(summary.mostExpensive.every(item => item.assets.every(row => filtered.includes(row)))).toBe(true);
      expect(summary.oldest.every(item => item.assets.every(row => filtered.includes(row)))).toBe(true);
    }
  });
  it('includes only searched components and recomputes after refreshed facts/quantities', () => {
    const rows = [asset('bucket', { brik_number: 96 }), asset('clamp', { brik_number: 96 })];
    const resolver = facts({ bucket: value(100, 'bucket'), clamp: value(50, 'clamp') });
    expect(summarizeFabricStock(filterFabricLoanStock(rows, 'all', 'bucket', 'all'), resolver)).toMatchObject({ lineCount: 1, quantity: 1, documentedValueDkk: 100 });
    expect(summarizeFabricStock([asset('bulk', { inventory_qty: 18 })], facts({ bulk: value(1800, 'bulk') })).documentedValueDkk).toBe(1800);
    expect(summarizeFabricStock([asset('bulk', { inventory_qty: 17 })], facts({ bulk: value(1700, 'bulk') }))).toMatchObject({ quantity: 17, documentedValueDkk: 1700 });
  });
});
