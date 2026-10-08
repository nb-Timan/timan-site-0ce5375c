import type { ActivePriceListItem, PriceListItem } from '@/lib/priceListService';
import { PRODUCT_LANGUAGE_FIELDS, PRODUCT_LANGUAGES } from '@/lib/productLanguages';

type PublishedPriceListRow = Pick<ActivePriceListItem, 'item_number' | 'price_dkk' | 'price_eur' | 'price_sek'>
  & Partial<Pick<PriceListItem,
    | 'item_text_da'
    | 'item_text_de'
    | 'item_text_en'
    | 'item_text_it'
    | 'item_text_hu'
    | 'item_text_sv'
    | 'item_text_fr'
    | 'item_text_pl'
    | 'item_text_cs'
    | 'cost_price_dkk'
  >>;

function comparableNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasCostChangeAfterPublish(item: PriceListItem): boolean {
  if (!item.cost_price_updated_at) return false;
  if (!item.last_published_at) return true;
  return new Date(item.cost_price_updated_at).getTime() > new Date(item.last_published_at).getTime();
}

/**
 * One canonical definition of a Price List row that differs from the active
 * release. Null draft values are treated as "no override", matching the
 * release RPC's COALESCE semantics. Cost is compared directly when the active
 * model exposes it; the current model records its release boundary through
 * cost_price_updated_at / last_published_at.
 */
export function isPriceListItemUnpublished(
  item: PriceListItem,
  published: PublishedPriceListRow | null | undefined,
): boolean {
  if (!published) return item.is_dirty || hasCostChangeAfterPublish(item);
  if (item.item_number !== published.item_number) return true;

  for (const language of PRODUCT_LANGUAGES) {
    const field = PRODUCT_LANGUAGE_FIELDS[language];
    const draftValue = item[field];
    if (draftValue != null && draftValue !== published[field]) return true;
  }

  if (item.price_dkk != null && comparableNumber(item.price_dkk) !== comparableNumber(published.price_dkk)) return true;
  if (item.price_sek != null && comparableNumber(item.price_sek) !== comparableNumber(published.price_sek)) return true;
  if (item.price_eur != null && comparableNumber(item.price_eur) !== comparableNumber(published.price_eur)) return true;

  if ('cost_price_dkk' in published && published.cost_price_dkk != null) {
    return comparableNumber(item.cost_price_dkk) !== comparableNumber(published.cost_price_dkk);
  }
  return hasCostChangeAfterPublish(item);
}

export function resolveUnpublishedPriceListItems(
  items: PriceListItem[],
  publishedItems: ActivePriceListItem[],
  fallbackPublishedItems: PriceListItem[] = [],
): PriceListItem[] {
  const publishedByItemNumber = new Map(publishedItems.map((item) => [item.item_number, item]));
  const fallbackByItemNumber = new Map(fallbackPublishedItems.map((item) => [item.item_number, item]));

  return items.filter((item) => {
    const previousNumber = item.renamed_from_item_number;
    const published = publishedByItemNumber.get(item.item_number)
      ?? (previousNumber ? publishedByItemNumber.get(previousNumber) : undefined)
      ?? fallbackByItemNumber.get(item.item_number)
      ?? (previousNumber ? fallbackByItemNumber.get(previousNumber) : undefined);
    return isPriceListItemUnpublished(item, published);
  });
}
