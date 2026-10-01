import { ACCESSORIES, PRODUCTS, getLocalizedName } from '@/data/machines';
import { buildConfiguratorSeed } from '@/lib/configuratorPriceSeed';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { Accessory } from '@/types/configurator';
import { getCurrentProductPrice } from '@/lib/publishedProductMaster';

export interface PublishedPriceOption {
  item_number?: unknown;
  item_text_da?: unknown;
  item_text_en?: unknown;
  item_text_de?: unknown;
  identity_aliases?: unknown;
  price_dkk?: unknown;
  price_eur?: unknown;
  price_sek?: unknown;
  published_at?: unknown;
}

export interface SupportProductPriceCandidate {
  item_number: string;
  name: string;
  machine_families: string[];
  price_dkk: number | null;
  price_eur: number | null;
  price_sek: number | null;
  published_at: string | null;
}

export interface SupportProductPriceLookupContext {
  domain: 'PRODUCT_PRICE_LOOKUP';
  catalog_source: 'canonical_configurator_catalog';
  lookup_status: 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND';
  candidates: SupportProductPriceCandidate[];
}

type CatalogEntry = SupportProductPriceCandidate & { aliases: Set<string> };

const PRICE_INTENT = /\b(hvad\s+(?:er\s+)?pris(?:en)?|hvad\s+koster|pris\s+på|koster|price|cost|how much|preis|kostet|prezzo|costa|ár|kerül|pris|kostar|prix|coûte|cena|kosztuje|cena|stojí)\b/i;
const STOP_WORDS = new Set([
  'hvad', 'er', 'prisen', 'pris', 'pa', 'på', 'koster', 'en', 'et', 'den', 'det', 'dette', 'for',
  'what', 'is', 'the', 'price', 'of', 'does', 'cost', 'how', 'much',
  'was', 'ist', 'der', 'preis', 'kostet', 'wie', 'viel',
  'qual', 'e', 'il', 'prezzo', 'costa', 'quanto',
  'mi', 'az', 'ara', 'ár', 'mennyibe', 'kerul',
  'vad', 'ar', 'priset', 'kostar',
  'quel', 'est', 'le', 'prix', 'coute',
  'jaka', 'jest', 'cena', 'kosztuje',
  'kolik', 'stoji',
  'varenummer', 'vareno', 'item', 'number', 'artikelnummer', 'artikel', 'numero', 'reference',
]);

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function finitePrice(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function localizedOptionName(option: PublishedPriceOption | undefined, language: PortalUiLanguage): string {
  if (!option) return '';
  const key = language === 'de' ? 'item_text_de' : language === 'en' ? 'item_text_en' : 'item_text_da';
  const localized = typeof option[key] === 'string' ? option[key].trim() : '';
  const danish = typeof option.item_text_da === 'string' ? option.item_text_da.trim() : '';
  return localized || danish;
}

function addAccessoryNames(entries: Map<string, CatalogEntry>, item: Accessory, family: string) {
  const itemNumber = String(item.varenr || '').trim();
  const entry = entries.get(itemNumber);
  if (entry) {
    entry.machine_families = [...new Set([...entry.machine_families, family])];
    for (const language of ['da', 'en', 'de', 'it', 'hu'] as const) {
      const name = getLocalizedName(item.name, language);
      if (name) entry.aliases.add(name);
    }
  }
  for (const child of item.subItems || []) addAccessoryNames(entries, child as Accessory, family);
}

function catalog(language: PortalUiLanguage, options: PublishedPriceOption[]): CatalogEntry[] {
  const optionMap = new Map(options.flatMap((option) => {
    const itemNumber = typeof option.item_number === 'string' ? option.item_number.trim() : '';
    return itemNumber ? [[itemNumber.toLowerCase(), option] as const] : [];
  }));
  const entries = new Map<string, CatalogEntry>();

  for (const row of buildConfiguratorSeed()) {
    const option = optionMap.get(row.item_number.toLowerCase());
    const aliases = new Set<string>([row.item_text_da]);
    for (const key of ['item_text_da', 'item_text_en', 'item_text_de'] as const) {
      if (typeof option?.[key] === 'string' && option[key].trim()) aliases.add(option[key].trim());
    }
    if (Array.isArray(option?.identity_aliases)) {
      option.identity_aliases.filter((alias): alias is string => typeof alias === 'string' && Boolean(alias.trim()))
        .forEach((alias) => aliases.add(alias.trim()));
    }
    entries.set(row.item_number, {
      item_number: row.item_number,
      name: localizedOptionName(option, language) || row.item_text_da,
      machine_families: [row.group],
      price_dkk: getCurrentProductPrice({
        itemNumber: row.item_number, currency: 'DKK',
        legacy: { DKK: row.price_dkk, EUR: row.price_eur, SEK: row.price_sek },
        released: option ? {
          item_number: row.item_number,
          price_dkk: finitePrice(option.price_dkk), price_eur: finitePrice(option.price_eur),
          price_sek: finitePrice(option.price_sek),
        } : undefined,
      }),
      price_eur: getCurrentProductPrice({
        itemNumber: row.item_number, currency: 'EUR',
        legacy: { DKK: row.price_dkk, EUR: row.price_eur, SEK: row.price_sek },
        released: option ? {
          item_number: row.item_number,
          price_dkk: finitePrice(option.price_dkk), price_eur: finitePrice(option.price_eur),
          price_sek: finitePrice(option.price_sek),
        } : undefined,
      }),
      price_sek: getCurrentProductPrice({
        itemNumber: row.item_number, currency: 'SEK',
        legacy: { DKK: row.price_dkk, EUR: row.price_eur, SEK: row.price_sek },
        released: option ? {
          item_number: row.item_number,
          price_dkk: finitePrice(option.price_dkk), price_eur: finitePrice(option.price_eur),
          price_sek: finitePrice(option.price_sek),
        } : undefined,
      }),
      published_at: typeof option?.published_at === 'string' ? option.published_at : null,
      aliases,
    });
  }

  for (const [family, items] of Object.entries(ACCESSORIES)) {
    items.forEach((item) => addAccessoryNames(entries, item, family));
  }
  for (const [family, machine] of Object.entries(PRODUCTS)) {
    const entry = entries.get(machine.varenr);
    if (!entry) continue;
    entry.machine_families = [...new Set([...entry.machine_families, family])];
    entry.aliases.add(getLocalizedName(machine.name, language === 'sv' || language === 'fr' || language === 'pl' || language === 'cs' ? 'en' : language));
  }
  return [...entries.values()];
}

function lookupTerms(content: string): string[] {
  return normalize(content).split(' ').filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
}

function score(entry: CatalogEntry, content: string, terms: string[]): number {
  const normalizedContent = normalize(content);
  if (normalizedContent.split(' ').includes(entry.item_number.toLowerCase())) return 1_000;
  const aliases = [...entry.aliases].map(normalize).filter(Boolean);
  const phrase = terms.join(' ');
  if (phrase && aliases.some((alias) => alias === phrase)) return 950;
  if (phrase && aliases.some((alias) => alias.includes(phrase))) return 900 + terms.length;
  const searchable = normalize(`${entry.item_number} ${aliases.join(' ')}`);
  const matched = terms.filter((term) => searchable.includes(term)).length;
  if (!matched || matched < Math.min(terms.length, 2)) return 0;
  return Math.round((matched / Math.max(terms.length, 1)) * 700) + matched;
}

export function isProductPriceQuestion(content: string): boolean {
  return PRICE_INTENT.test(content);
}

export function buildSupportProductPriceLookupContext(
  content: string,
  language: PortalUiLanguage,
  options: PublishedPriceOption[] = [],
): SupportProductPriceLookupContext | null {
  if (!isProductPriceQuestion(content)) return null;
  const terms = lookupTerms(content);
  const matches = catalog(language, options)
    .map((entry) => ({ entry, score: score(entry, content, terms) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name));

  if (!matches.length) {
    return { domain: 'PRODUCT_PRICE_LOOKUP', catalog_source: 'canonical_configurator_catalog', lookup_status: 'NOT_FOUND', candidates: [] };
  }
  const exact = matches[0].score >= 1_000;
  const unique = exact || matches.length === 1 || matches[0].score - matches[1].score >= 100;
  const selected = unique ? matches.slice(0, 1) : matches.filter((match) => match.score === matches[0].score).slice(0, 5);
  return {
    domain: 'PRODUCT_PRICE_LOOKUP',
    catalog_source: 'canonical_configurator_catalog',
    lookup_status: unique ? 'MATCHED' : 'AMBIGUOUS',
    candidates: selected.map(({ entry: { aliases: _aliases, ...entry } }) => entry),
  };
}
