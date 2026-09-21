import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  filterPriceHistory,
  isPriceHistoryPriceField,
  priceHistoryDelta,
  type PriceListHistoryEntry,
} from '@/lib/priceListService';

function entry(field_name: PriceListHistoryEntry['field_name'], oldValue: number | null, newValue: number | null): PriceListHistoryEntry {
  return {
    id: `${field_name}-${newValue ?? 'text'}`,
    change_set_id: 'change-set',
    item_id: 'item',
    item_number: '725135',
    actor_user_id: 'actor',
    actor_name: 'Nicolai Bjerg Moesgaard',
    actor_initials: 'NB',
    actor_email: 'nicolai@example.test',
    field_name,
    old_value: oldValue == null ? null : String(oldValue),
    new_value: newValue == null ? null : String(newValue),
    old_numeric_value: oldValue,
    new_numeric_value: newValue,
    changed_at: '2026-09-21T08:00:00.000Z',
  };
}

describe('price-list item history', () => {
  it('classifies price and text fields for compact history filters', () => {
    const entries = [entry('price_dkk', 40900, 60800), entry('item_text_da', null, null)];

    expect(isPriceHistoryPriceField('price_dkk')).toBe(true);
    expect(isPriceHistoryPriceField('item_text_da')).toBe(false);
    expect(filterPriceHistory(entries, 'all')).toHaveLength(2);
    expect(filterPriceHistory(entries, 'price')).toEqual([entries[0]]);
    expect(filterPriceHistory(entries, 'text')).toEqual([entries[1]]);
  });

  it('calculates a positive amount and percentage from an actual price change', () => {
    expect(priceHistoryDelta(entry('price_dkk', 40900, 60800))).toEqual({ amount: 19900, percentage: expect.closeTo(48.655, 3) });
  });

  it('calculates a negative amount and percentage for a decrease', () => {
    expect(priceHistoryDelta(entry('price_dkk', 60800, 40900))).toEqual({ amount: -19900, percentage: expect.closeTo(-32.73, 2) });
  });

  it('does not invent a percentage when the previous value is zero or missing', () => {
    expect(priceHistoryDelta(entry('price_dkk', 0, 100))).toEqual({ amount: 100, percentage: null });
    expect(priceHistoryDelta(entry('price_dkk', null, 100))).toEqual({ amount: null, percentage: null });
  });

  it('keeps unchanged saves out of the append-only trigger', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260921073553_price_list_item_history.sql'), 'utf8');
    expect(migration).toContain('if old.item_number is not distinct from new.item_number');
    expect(migration).toContain('return new;');
    expect(migration).toContain('after update on public.price_list_items');
  });
});
