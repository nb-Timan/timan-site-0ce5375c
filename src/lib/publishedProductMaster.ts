/** Public commercial fields only. Costs and editorial audit never enter the browser catalog. */
export interface PublishedProductMaster {
  item_number: string;
  is_active?: boolean;
  item_text_da?: string | null;
  item_text_de?: string | null;
  item_text_en?: string | null;
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

export type PublishedProductLanguage = 'da' | 'de' | 'en';

/** DA is canonical; missing DE/EN deliberately falls back to DA, never static copy. */
export function publishedProductText(
  itemNumber: string | undefined,
  language: PublishedProductLanguage = 'da',
): string | null {
  const row = publishedProduct(itemNumber);
  const titleDa = row?.item_text_da?.trim();
  if (!titleDa) return null;
  if (language === 'de') return row?.item_text_de?.trim() || titleDa;
  if (language === 'en') return row?.item_text_en?.trim() || titleDa;
  return titleDa;
}

/** Only exact, known identity prefixes are replaced. Never guess which words are enrichment. */
export function resolvePublishedTitle(
  itemNumber: string | undefined,
  presentation: string,
  language: PublishedProductLanguage = 'da',
): string {
  const row = publishedProduct(itemNumber);
  const title = publishedProductText(itemNumber, language);
  if (!title) return presentation;
  const aliases = [
    title,
    row?.item_text_da?.trim(),
    row?.item_text_de?.trim(),
    row?.item_text_en?.trim(),
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
    const baseName = typeof item.name === 'string' ? { da: item.name, de: item.name, en: item.name } : item.name;
    const titleDa = resolvePublishedTitle(item.varenr, baseName.da, 'da');
    const titleDe = resolvePublishedTitle(item.varenr, baseName.de || baseName.da, 'de');
    const titleEn = resolvePublishedTitle(item.varenr, baseName.en || baseName.da, 'en');
    name = { ...baseName, da: titleDa, de: titleDe, en: titleEn };
  }
  return {
    ...item, name,
    ...(row.is_active === false ? { hidden: true } : {}),
    priceDKK: row.price_dkk ?? item.priceDKK,
    priceEUR: row.price_eur ?? item.priceEUR,
  };
}
