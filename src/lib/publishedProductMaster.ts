import { convertCurrency, type Currency } from '@/lib/currency';
import { PRODUCT_LANGUAGES, PRODUCT_LANGUAGE_FIELDS, storedProductText } from '@/lib/productLanguages';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

/** Public commercial fields only. Costs and editorial audit never enter the browser catalog. */
export interface PublishedProductMaster {
  item_number: string;
  is_active?: boolean;
  item_text_da?: string | null;
  item_text_de?: string | null;
  item_text_en?: string | null;
  item_text_it?: string | null;
  item_text_hu?: string | null;
  item_text_sv?: string | null;
  item_text_fr?: string | null;
  item_text_pl?: string | null;
  item_text_cs?: string | null;
  price_dkk: number | null;
  price_eur: number | null;
  price_sek?: number | null;
  identity_aliases?: string[];
  published_at?: string | null;
}

let master = new Map<string, PublishedProductMaster>();
let revision = 0;
const listeners = new Set<() => void>();
export const productMasterRevision = () => revision;
export const subscribeProductMaster = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const publishedProduct = (itemNumber?: string) => master.get(String(itemNumber || '').trim());
export const isProductActive = (itemNumber?: string) => publishedProduct(itemNumber)?.is_active !== false;
export function replaceProductMaster(rows: PublishedProductMaster[]): void {
  master = new Map(rows.filter(row => row.item_number.trim()).map(row => [row.item_number.trim(), row]));
}
export function notifyProductMaster(): void {
  revision += 1;
  listeners.forEach(listener => listener());
}

export type PublishedProductLanguage = PortalUiLanguage;

export interface LegacyProductPrices {
  DKK: number | null;
  EUR: number | null;
  SEK?: number | null;
}

/** Released price first; the static catalogue is only a compatibility fallback. */
export function getCurrentProductPrice(input: {
  itemNumber?: string;
  currency: Currency;
  legacy: LegacyProductPrices;
  released?: PublishedProductMaster;
}): number | null {
  const released = input.released ?? publishedProduct(input.itemNumber);
  const active = input.currency === 'DKK'
    ? released?.price_dkk
    : input.currency === 'EUR'
      ? released?.price_eur
      : released?.price_sek;
  if (typeof active === 'number' && Number.isFinite(active) && active >= 0) return active;

  const explicitFallback = input.legacy[input.currency];
  if (typeof explicitFallback === 'number' && Number.isFinite(explicitFallback) && explicitFallback >= 0) {
    return explicitFallback;
  }
  if (input.currency === 'SEK' && typeof input.legacy.DKK === 'number' && Number.isFinite(input.legacy.DKK)) {
    return convertCurrency(input.legacy.DKK, 'DKK', 'SEK');
  }
  return null;
}

/** Stored values remain independent; rendering may fall back to canonical Danish. */
export function publishedProductText(
  itemNumber: string | undefined,
  language: PublishedProductLanguage = 'da',
): string | null {
  const row = publishedProduct(itemNumber);
  const titleDa = row?.item_text_da?.trim();
  if (!titleDa) return null;
  return storedProductText(row, language) || titleDa;
}

export function publishedProductStoredText(
  itemNumber: string | undefined,
  language: PublishedProductLanguage,
): string | null {
  return storedProductText(publishedProduct(itemNumber), language) || null;
}

/** Only exact, known identity prefixes are replaced. Never guess which words are enrichment. */
export function resolvePublishedTitle(
  itemNumber: string | undefined,
  presentation: string,
  language: PublishedProductLanguage = 'da',
  localizedFallback?: string,
): string {
  const row = publishedProduct(itemNumber);
  const title = publishedProductStoredText(itemNumber, language)
    || localizedFallback?.trim()
    || publishedProductText(itemNumber, language);
  if (!title) return presentation;
  const aliases = [
    title,
    ...PRODUCT_LANGUAGES.map((code) => row?.[PRODUCT_LANGUAGE_FIELDS[code]]?.trim()),
    ...(row?.identity_aliases || []),
  ].filter((alias): alias is string => Boolean(alias)).sort((a, b) => b.length - a.length);
  const prefix = aliases.find(alias => presentation === alias
    || (presentation.startsWith(alias) && /^[\s.,;:!?-]/.test(presentation.slice(alias.length, alias.length + 1))));
  if (!presentation || prefix === presentation) return title;
  if (prefix) {
    const suffix = presentation.slice(prefix.length).trim().replace(/^[.\s]+/, '');
    return suffix ? `${title}${/[.!?]$/.test(title) ? '' : '.'} ${suffix}` : title;
  }
  return title;
}

type CatalogItem = {
  varenr?: string;
  name: string | { da: string; en: string; [key: string]: string | undefined };
  priceDKK: number;
  priceEUR: number;
};

export function resolvePublishedProduct<T extends CatalogItem>(item: T): T {
  const row = publishedProduct(item.varenr);
  if (!row) return item;
  let name = item.name;
  if (row.item_text_da?.trim()) {
    const baseName = typeof item.name === 'string' ? { da: item.name, en: item.name } : item.name;
    const localized = { ...baseName } as Record<string, string | undefined>;
    for (const language of PRODUCT_LANGUAGES) {
      const fallback = baseName[language] || baseName.en || baseName.da;
      localized[language] = resolvePublishedTitle(item.varenr, fallback || '', language, fallback);
    }
    name = localized as T['name'];
  }
  return {
    ...item, name,
    ...(row.is_active === false ? { hidden: true } : {}),
    priceDKK: getCurrentProductPrice({
      itemNumber: item.varenr,
      currency: 'DKK',
      legacy: { DKK: item.priceDKK, EUR: item.priceEUR },
      released: row,
    }) ?? item.priceDKK,
    priceEUR: getCurrentProductPrice({
      itemNumber: item.varenr,
      currency: 'EUR',
      legacy: { DKK: item.priceDKK, EUR: item.priceEUR },
      released: row,
    }) ?? item.priceEUR,
  };
}
