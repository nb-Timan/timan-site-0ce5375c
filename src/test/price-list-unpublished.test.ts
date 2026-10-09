import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ActivePriceListItem, PriceListItem } from '@/lib/priceListService';
import { isPriceListItemUnpublished, resolveUnpublishedPriceListItems } from '@/lib/priceListUnpublished';

const publishedAt = '2026-10-01T10:00:00.000Z';
const backendPage = readFileSync(resolve(process.cwd(), 'src/pages/backend/BackendPriceListsPage.tsx'), 'utf8');
const costDraftMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261008053343_price_list_cost_drafts_are_unpublished.sql'),
  'utf8',
);

function draft(overrides: Partial<PriceListItem> = {}): PriceListItem {
  return {
    id: 'draft-1',
    item_number: '410910',
    renamed_from_item_number: null,
    item_text_da: 'Fejesug',
    item_text_de: 'Kehrsauger',
    item_text_en: 'Sweeper',
    item_text_it: null,
    item_text_hu: null,
    item_text_sv: null,
    item_text_fr: null,
    item_text_pl: null,
    item_text_cs: null,
    price_dkk: 43_000,
    price_eur: 5_800,
    price_sek: 65_000,
    cost_price_dkk: 16_000,
    cost_price_source: 'qa.xlsx',
    cost_price_updated_at: publishedAt,
    updated_at: publishedAt,
    updated_by_email: 'qa@timan.dk',
    is_dirty: false,
    last_published_at: publishedAt,
    ...overrides,
  };
}

function published(overrides: Partial<ActivePriceListItem> = {}): ActivePriceListItem {
  return {
    item_number: '410910',
    item_text_da: 'Fejesug',
    item_text_de: 'Kehrsauger',
    item_text_en: 'Sweeper',
    item_text_it: null,
    item_text_hu: null,
    item_text_sv: null,
    item_text_fr: null,
    item_text_pl: null,
    item_text_cs: null,
    price_dkk: 43_000,
    price_eur: 5_800,
    price_sek: 65_000,
    published_at: publishedAt,
    published_by_email: 'qa@timan.dk',
    ...overrides,
  };
}

describe('canonical unpublished Price List rows', () => {
  it('marks a cost-price-only change', () => {
    expect(isPriceListItemUnpublished(draft({
      cost_price_dkk: 16_403.25,
      cost_price_updated_at: '2026-10-02T10:00:00.000Z',
    }), published())).toBe(true);
  });

  it('marks a DKK sales-price-only change', () => {
    expect(isPriceListItemUnpublished(draft({ price_dkk: 43_800 }), published())).toBe(true);
  });

  it.each([
    [{ price_sek: 66_000 }, 'SEK'],
    [{ price_eur: 5_900 }, 'EUR'],
  ] as const)('marks a %s publishable sales-price change', (change) => {
    expect(isPriceListItemUnpublished(draft(change), published())).toBe(true);
  });

  it('returns one row when several publishable fields changed', () => {
    const changed = draft({ price_dkk: 43_800, price_eur: 5_900, item_text_en: 'Updated sweeper' });
    expect(resolveUnpublishedPriceListItems([changed], [published()])).toEqual([changed]);
  });

  it('does not mark a row that matches the active release', () => {
    expect(isPriceListItemUnpublished(draft(), published())).toBe(false);
  });

  it('clears the result after the cost draft has been published', () => {
    expect(isPriceListItemUnpublished(draft({
      cost_price_dkk: 16_403.25,
      cost_price_updated_at: '2026-10-02T10:00:00.000Z',
      last_published_at: '2026-10-03T10:00:00.000Z',
      is_dirty: false,
    }), published())).toBe(false);
  });

  it('includes cost-price-only changes in the release count', () => {
    const costOnly = draft({ cost_price_updated_at: '2026-10-02T10:00:00.000Z' });
    const unchanged = draft({ id: 'draft-2', item_number: '410911' });
    const activeRows = [published(), published({ item_number: '410911' })];
    expect(resolveUnpublishedPriceListItems([costOnly, unchanged], activeRows)).toHaveLength(1);
  });

  it('uses the same changed-row set for row badges and the release count', () => {
    const costOnly = draft({ cost_price_updated_at: '2026-10-02T10:00:00.000Z' });
    const dkkOnly = draft({ id: 'draft-2', item_number: '410911', price_dkk: 43_800 });
    const rows = resolveUnpublishedPriceListItems(
      [costOnly, dkkOnly],
      [published(), published({ item_number: '410911' })],
    );
    const badgeSet = new Set(rows.map((row) => row.item_number));
    expect(rows).toHaveLength(2);
    expect([...badgeSet]).toEqual(['410910', '410911']);
    expect(backendPage).toContain('resolveUnpublishedPriceListItems(items, activeItems, configuratorSeedItems)');
    expect(backendPage).toContain('unpublishedItemNumbers.has(i.item_number)');
    expect(backendPage).toContain('Frigiv prisliste{unpublishedItems.length > 0');
    expect(backendPage).toContain('buildPublishPreview(unpublishedItems)');
  });

  it('preserves a new staged row without an active published counterpart', () => {
    expect(isPriceListItemUnpublished(draft({ item_number: 'NEW', is_dirty: true }), null)).toBe(true);
  });

  it('marks all cost-price write paths in the existing canonical staged row', () => {
    expect(costDraftMigration).toContain('before insert or update of cost_price_dkk on public.price_list_items');
    expect(costDraftMigration).toContain('new.is_dirty := true');
    expect(costDraftMigration).toContain('cost_price_updated_at > last_published_at');
    expect(costDraftMigration).not.toContain('add column');
  });
});
