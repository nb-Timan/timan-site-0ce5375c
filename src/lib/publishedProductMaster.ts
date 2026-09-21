/** Public commercial fields only. Costs and editorial audit never enter the browser catalog. */
export interface PublishedProductMaster {
  item_number: string;
  item_text_da?: string | null;
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
export function replaceProductMaster(rows: PublishedProductMaster[]): void {
  master = new Map(rows.filter(row => row.item_number.trim()).map(row => [row.item_number.trim(), row]));
}
export function notifyProductMaster(): void {
  revision += 1;
  listeners.forEach(listener => listener());
}

/** Only exact, known identity prefixes are replaced. Never guess which words are enrichment. */
export function resolvePublishedTitle(itemNumber: string | undefined, presentation: string): string {
  const row = publishedProduct(itemNumber);
  const title = row?.item_text_da?.trim();
  if (!title) return presentation;
  const aliases = [title, ...(row.identity_aliases || [])].filter(Boolean).sort((a, b) => b.length - a.length);
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
  const name = typeof item.name === 'string'
    ? resolvePublishedTitle(item.varenr, item.name)
    : { ...item.name, da: resolvePublishedTitle(item.varenr, item.name.da) };
  return {
    ...item, name,
    priceDKK: row.price_dkk ?? item.priceDKK,
    priceEUR: row.price_eur ?? item.priceEUR,
  };
}
