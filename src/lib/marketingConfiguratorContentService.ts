import { ACCESSORIES, getAccessoriesFlat, getLocalizedName, PRODUCTS } from '@/data/machines';
import { supabase } from '@/lib/supabase';
import { PORTAL_LANGUAGE_CODES, type PortalUiLanguage } from '@/lib/portalLanguages';
import {
  emptyLocalizedProductText,
  localizedProductTextMap,
  normalizeLocalizedProductText,
  resolveLocalizedProductText,
  type LocalizedProductText,
} from '@/lib/productLanguages';
import type { Accessory, Machine, TechSpec } from '@/types/configurator';
import type { MarketingBadgeSchedule } from '@/lib/marketingBadgeSchedule';
import { isProductActive, publishedProduct, publishedProductText, type PublishedProductLanguage } from '@/lib/publishedProductMaster';

export type MarketingConfiguratorContentStatus = 'draft' | 'published';

export type LocalizedProductTitles = LocalizedProductText;

export type LocalizedProductDescriptions = LocalizedProductTitles;

export interface MarketingConfiguratorContentFields extends MarketingBadgeSchedule {
  title: string;
  localized_titles?: LocalizedProductTitles;
  description: string;
  localized_descriptions?: LocalizedProductDescriptions;
  key_features: string[];
  localized_key_features?: Record<PortalUiLanguage, string[]>;
  image_url: string;
  video_url: string;
  specification_url: string;
  specs: TechSpec[];
  localized_specs?: Record<PortalUiLanguage, TechSpec[]>;
  badge: string;
}

export interface MarketingConfiguratorContentRecord {
  id: string;
  product_key: string;
  machine_key: string;
  item_number: string;
  content: MarketingConfiguratorContentFields;
  status: MarketingConfiguratorContentStatus;
  published_at: string | null;
  updated_at: string;
}

export interface MarketingConfiguratorCatalogItem {
  productKey: string;
  machineKey: string;
  itemNumber: string;
  kind: 'machine' | 'accessory';
  item: Machine | Accessory;
  defaults: MarketingConfiguratorContentFields;
}

export const CONFIGURATOR_ALWAYS_VISIBLE_CONTENT_ACTION_SKUS = new Set([
  '331122',
  '720131',
  '720132',
  '720133',
]);

const EMPTY_CONTENT: MarketingConfiguratorContentFields = {
  title: '',
  description: '',
  key_features: [],
  image_url: '',
  video_url: '',
  specification_url: '',
  specs: [],
  badge: '',
  badge_starts_at: null,
  badge_ends_at: null,
  badge_show_countdown: false,
};

function firstUrl(item: { imageUrl?: string; images?: { url: string | null }[]; videoUrl?: string; videos?: { url: string | null }[] }, field: 'image' | 'video') {
  if (field === 'image') return item.images?.find((entry) => entry.url)?.url || item.imageUrl || '';
  return item.videos?.find((entry) => entry.url)?.url || item.videoUrl || '';
}

function defaultContent(item: Machine | Accessory, language: PortalUiLanguage): MarketingConfiguratorContentFields {
  const isMachine = 'techSpecs' in item;
  const specs = isMachine ? item.techSpecs : (item.specs || []);
  return {
    title: getLocalizedName(item.name, language),
    description: '',
    key_features: [],
    image_url: firstUrl(item, 'image'),
    video_url: firstUrl(item, 'video'),
    specification_url: '',
    specs,
    badge: 'isNew' in item && item.isNew ? 'Ny' : '',
  };
}

function normalizeContent(value: unknown): MarketingConfiguratorContentFields {
  const content = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const localized = content.localized_titles && typeof content.localized_titles === 'object'
    ? content.localized_titles as Record<string, unknown>
    : null;
  const localizedDescriptions = content.localized_descriptions && typeof content.localized_descriptions === 'object'
    ? content.localized_descriptions as Record<string, unknown>
    : null;
  const localizedFeatures = content.localized_key_features && typeof content.localized_key_features === 'object'
    ? content.localized_key_features as Record<string, unknown>
    : null;
  const localizedSpecs = content.localized_specs && typeof content.localized_specs === 'object'
    ? content.localized_specs as Record<string, unknown>
    : null;
  const normalizeFeatures = (candidate: unknown) => Array.isArray(candidate)
    ? candidate.filter((feature): feature is string => typeof feature === 'string').map((feature) => feature.trim()).filter(Boolean)
    : [];
  const normalizeSpecs = (candidate: unknown) => Array.isArray(candidate) ? candidate as TechSpec[] : [];
  const featuresByLanguage = Object.fromEntries(PORTAL_LANGUAGE_CODES.map((language) => [
    language,
    normalizeFeatures(localizedFeatures?.[language]),
  ])) as Record<PortalUiLanguage, string[]>;
  const specsByLanguage = Object.fromEntries(PORTAL_LANGUAGE_CODES.map((language) => [
    language,
    normalizeSpecs(localizedSpecs?.[language]),
  ])) as Record<PortalUiLanguage, TechSpec[]>;
  return {
    title: typeof content.title === 'string' ? content.title : '',
    ...(localized ? { localized_titles: normalizeLocalizedProductText(localized) } : {}),
    description: typeof content.description === 'string' ? content.description : '',
    ...(localizedDescriptions ? { localized_descriptions: normalizeLocalizedProductText(localizedDescriptions) } : {}),
    key_features: normalizeFeatures(content.key_features),
    ...(localizedFeatures ? { localized_key_features: featuresByLanguage } : {}),
    image_url: typeof content.image_url === 'string' ? content.image_url : '',
    video_url: typeof content.video_url === 'string' ? content.video_url : '',
    specification_url: typeof content.specification_url === 'string' ? content.specification_url : '',
    specs: normalizeSpecs(content.specs),
    ...(localizedSpecs ? { localized_specs: specsByLanguage } : {}),
    badge: typeof content.badge === 'string' ? content.badge : '',
    badge_starts_at: typeof content.badge_starts_at === 'string' ? content.badge_starts_at : null,
    badge_ends_at: typeof content.badge_ends_at === 'string' ? content.badge_ends_at : null,
    badge_show_countdown: content.badge_show_countdown === true,
  };
}

function toRecord(row: Record<string, unknown>): MarketingConfiguratorContentRecord {
  return {
    id: String(row.id),
    product_key: String(row.product_key),
    machine_key: String(row.machine_key),
    item_number: String(row.item_number),
    content: normalizeContent(row.content),
    status: row.status === 'published' ? 'published' : 'draft',
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '',
  };
}

export function productContentKey(machineKey: string, productKey: string) {
  return `${machineKey}::${productKey}`;
}

/** One canonical catalog index for both the editor and Sales content lookup. */
export function listMarketingConfiguratorCatalog(language: PortalUiLanguage = 'da'): MarketingConfiguratorCatalogItem[] {
  const rows: MarketingConfiguratorCatalogItem[] = [];
  const seen = new Set<string>();
  const add = (machineKey: string, kind: MarketingConfiguratorCatalogItem['kind'], item: Machine | Accessory) => {
    if (!item.id || !item.varenr || ('isHeader' in item && item.isHeader) || ('hidden' in item && item.hidden)) return;
    const productKey = productContentKey(machineKey, item.id);
    if (seen.has(productKey)) return;
    seen.add(productKey);
    rows.push({ productKey, machineKey, itemNumber: item.varenr, kind, item, defaults: defaultContent(item, language) });
  };

  for (const [machineKey, machine] of Object.entries(PRODUCTS)) {
    add(machineKey, 'machine', machine);
    for (const accessory of getAccessoriesFlat(machineKey)) add(machineKey, 'accessory', accessory);
  }

  // Keep accessory records available if a catalog entry is intentionally not
  // represented by the current product list, while still using the same key.
  for (const [machineKey, accessories] of Object.entries(ACCESSORIES)) {
    for (const accessory of accessories) add(machineKey, 'accessory', accessory);
  }

  return rows;
}

function normalizedMarketingProductIdentity(value: string | undefined) {
  return String(value || '').trim().toLocaleLowerCase('da-DK');
}

/** Resolve an editor target from canonical catalogue identity, never from a presentation row. */
export function resolveMarketingConfiguratorCatalogItem(
  catalog: MarketingConfiguratorCatalogItem[],
  machineKey: string,
  productIdentity: string | undefined,
): MarketingConfiguratorCatalogItem | null {
  if (!productIdentity) return null;
  const exact = catalog.find((item) => item.productKey === productContentKey(machineKey, productIdentity));
  if (exact) return exact;

  const normalizedIdentity = normalizedMarketingProductIdentity(productIdentity);
  return catalog.find((item) => {
    if (item.machineKey !== machineKey) return false;
    const aliases = publishedProduct(item.itemNumber)?.identity_aliases || [];
    return [item.item.id, item.itemNumber, ...aliases]
      .some((candidate) => normalizedMarketingProductIdentity(candidate) === normalizedIdentity);
  }) || null;
}

/**
 * Presentation content belongs to the canonical SKU. Prefer the exact context
 * when it exists, then reuse the same SKU record in another Configurator view.
 */
export function findMarketingConfiguratorContentRecord(
  records: Iterable<MarketingConfiguratorContentRecord>,
  item: Pick<MarketingConfiguratorCatalogItem, 'productKey' | 'itemNumber'>,
  status: MarketingConfiguratorContentStatus,
): MarketingConfiguratorContentRecord | null {
  const rows = [...records];
  return rows.find((record) => record.product_key === item.productKey && record.status === status)
    || rows.find((record) => record.item_number === item.itemNumber && record.status === status)
    || null;
}

/** Reuse an existing SKU row, or the first stable catalogue context for a new row. */
export function resolveMarketingConfiguratorEditorItem(
  catalog: MarketingConfiguratorCatalogItem[],
  records: MarketingConfiguratorContentRecord[],
  machineKey: string,
  productIdentity: string | undefined,
): MarketingConfiguratorCatalogItem | null {
  const contextualItem = resolveMarketingConfiguratorCatalogItem(catalog, machineKey, productIdentity);
  if (!contextualItem) return null;

  const existing = findMarketingConfiguratorContentRecord(records, contextualItem, 'draft')
    || findMarketingConfiguratorContentRecord(records, contextualItem, 'published');
  if (existing) {
    return catalog.find((item) => item.productKey === existing.product_key)
      || { ...contextualItem, productKey: existing.product_key, machineKey: existing.machine_key };
  }

  return catalog.find((item) => item.itemNumber === contextualItem.itemNumber) || contextualItem;
}

export function marketingPresentationActions(
  content: MarketingConfiguratorContentFields | null | undefined,
  itemNumber?: string,
) {
  const keepActionsVisible = CONFIGURATOR_ALWAYS_VISIBLE_CONTENT_ACTION_SKUS.has(String(itemNumber || '').trim());
  return {
    video: keepActionsVisible || Boolean(content?.video_url?.trim()),
    image: keepActionsVisible || Boolean(content?.image_url?.trim()),
    information: keepActionsVisible || Boolean(
      content?.description?.trim()
      || content?.key_features?.some((feature) => feature.trim())
      || content?.specs?.some((spec) => spec.label?.trim() && String(spec.value || '').trim()),
    ),
  };
}

export function mergeMarketingConfiguratorContent(
  defaults: MarketingConfiguratorContentFields,
  override: MarketingConfiguratorContentFields | null | undefined,
  itemNumber?: string,
  language: PublishedProductLanguage = 'da',
): MarketingConfiguratorContentFields {
  if (!override) return resolveMarketingProductIdentity(itemNumber, defaults, language);
  return resolveMarketingProductIdentity(itemNumber, {
    title: override.title || defaults.title,
    ...(override.localized_titles ? { localized_titles: override.localized_titles } : {}),
    description: override.description,
    ...(override.localized_descriptions ? { localized_descriptions: override.localized_descriptions } : {}),
    key_features: override.key_features.length ? override.key_features : defaults.key_features,
    ...(override.localized_key_features ? { localized_key_features: override.localized_key_features } : {}),
    image_url: override.image_url || defaults.image_url,
    video_url: override.video_url || defaults.video_url,
    specification_url: override.specification_url || defaults.specification_url,
    specs: override.specs.length ? override.specs : defaults.specs,
    ...(override.localized_specs ? { localized_specs: override.localized_specs } : {}),
    badge: override.badge || defaults.badge,
    badge_starts_at: override.badge_starts_at || null,
    badge_ends_at: override.badge_ends_at || null,
    badge_show_countdown: override.badge_show_countdown === true,
  }, language);
}

export function canonicalLocalizedProductTitles(
  itemNumber: string | undefined,
  fallbackDa = '',
): LocalizedProductTitles {
  return localizedProductTextMap(publishedProduct(itemNumber), fallbackDa);
}

export function localizedDraftTitles(
  content: MarketingConfiguratorContentFields | null | undefined,
  canonical: LocalizedProductTitles,
): LocalizedProductTitles {
  if (!content) return canonical;
  if (content.localized_titles) {
    const result = { ...canonical };
    for (const language of PORTAL_LANGUAGE_CODES) result[language] = content.localized_titles[language]?.trim() || canonical[language];
    return result;
  }
  return { ...canonical, da: canonical.da || content.title };
}

export function localizedDraftDescriptions(
  content: MarketingConfiguratorContentFields | null | undefined,
): LocalizedProductDescriptions {
  if (!content) return emptyLocalizedProductText();
  if (content.localized_descriptions) return { ...content.localized_descriptions };
  return { ...emptyLocalizedProductText(), da: content.description };
}

export function localizedDraftFeatures(content: MarketingConfiguratorContentFields | null | undefined) {
  if (!content?.localized_key_features) return { ...Object.fromEntries(PORTAL_LANGUAGE_CODES.map((language) => [language, language === 'da' ? [...(content?.key_features || [])] : []])) } as Record<PortalUiLanguage, string[]>;
  return Object.fromEntries(PORTAL_LANGUAGE_CODES.map((language) => [language, [...(content.localized_key_features?.[language] || [])]])) as Record<PortalUiLanguage, string[]>;
}

export function localizedDraftSpecs(content: MarketingConfiguratorContentFields | null | undefined) {
  if (!content?.localized_specs) return { ...Object.fromEntries(PORTAL_LANGUAGE_CODES.map((language) => [language, language === 'da' ? [...(content?.specs || [])] : []])) } as Record<PortalUiLanguage, TechSpec[]>;
  return Object.fromEntries(PORTAL_LANGUAGE_CODES.map((language) => [language, [...(content.localized_specs?.[language] || [])]])) as Record<PortalUiLanguage, TechSpec[]>;
}

/** Product identity comes from Product Master; presentation copy remains an independent exact value. */
export function resolveMarketingProductIdentity(
  itemNumber: string | undefined,
  content: MarketingConfiguratorContentFields,
  requestedLanguage: PublishedProductLanguage = 'da',
  localizedFallback?: string,
): MarketingConfiguratorContentFields {
  const language = requestedLanguage;
  const localizedTitles = localizedDraftTitles(content, canonicalLocalizedProductTitles(itemNumber, content.title));
  const localizedDescriptions = localizedDraftDescriptions(content);
  const localizedFeatures = localizedDraftFeatures(content);
  const localizedSpecs = localizedDraftSpecs(content);
  const resolvedContent = {
    ...content,
    title: resolveLocalizedProductText(localizedTitles, language),
    localized_titles: localizedTitles,
    description: resolveLocalizedProductText(localizedDescriptions, language),
    localized_descriptions: localizedDescriptions,
    key_features: localizedFeatures[language].length ? localizedFeatures[language] : localizedFeatures.da,
    localized_key_features: localizedFeatures,
    specs: localizedSpecs[language].length ? localizedSpecs[language] : localizedSpecs.da,
    localized_specs: localizedSpecs,
  };
  const row = publishedProduct(itemNumber);
  if (!row?.item_text_da) {
    const title = localizedFallback?.trim() || resolvedContent.title;
    return resolvedContent.description.trim() === title.trim()
      ? { ...resolvedContent, title, description: '' }
      : { ...resolvedContent, title };
  }
  const canonicalTitle = localizedTitles[language]?.trim()
    || localizedFallback?.trim()
    || publishedProductText(itemNumber, language);
  if (!canonicalTitle) return resolvedContent;
  return {
    ...resolvedContent,
    title: canonicalTitle,
    description: resolvedContent.description.trim() === canonicalTitle.trim() ? '' : resolvedContent.description,
  };
}

export async function listMarketingConfiguratorContent(): Promise<{ rows: MarketingConfiguratorContentRecord[]; error: string | null }> {
  const { data, error } = await supabase
    .from('marketing_configurator_product_content')
    .select('id, product_key, machine_key, item_number, content, status, published_at, updated_at')
    .order('machine_key')
    .order('item_number');
  return { rows: error ? [] : ((data || []) as Record<string, unknown>[]).map(toRecord), error: error?.message || null };
}

export async function listPublishedMarketingConfiguratorContent(): Promise<Map<string, MarketingConfiguratorContentRecord>> {
  const { data, error } = await supabase
    .from('marketing_configurator_product_content')
    .select('id, product_key, machine_key, item_number, content, status, published_at, updated_at')
    .eq('status', 'published')
    .not('published_at', 'is', null)
    .lte('published_at', new Date().toISOString());
  if (error) {
    console.warn('[marketingConfiguratorContent] published content lookup failed:', error.message);
    return new Map();
  }
  return new Map(((data || []) as Record<string, unknown>[]).filter(row => isProductActive(String(row.item_number))).map((row) => {
    const record = toRecord(row);
    return [record.product_key, record] as const;
  }));
}

export async function saveMarketingConfiguratorContent(
  item: Pick<MarketingConfiguratorCatalogItem, 'productKey' | 'machineKey' | 'itemNumber'>,
  content: MarketingConfiguratorContentFields,
  status: MarketingConfiguratorContentStatus,
): Promise<{ row: MarketingConfiguratorContentRecord | null; error: string | null }> {
  if (!isProductActive(item.itemNumber)) return { row: null, error: `Varenr. ${item.itemNumber} er udgået.` };
  if (status === 'published') {
    const { data, error } = await supabase.rpc('publish_marketing_configurator_product_content', {
      p_product_key: item.productKey,
      p_machine_key: item.machineKey,
      p_item_number: item.itemNumber,
      p_content: content,
    });
    const result = Array.isArray(data) ? data[0] : data;
    if (!error && result) window.dispatchEvent(new Event('timan:product-master-published'));
    return { row: result ? toRecord(result as Record<string, unknown>) : null, error: error?.message || null };
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('marketing_configurator_product_content')
    .upsert({
      product_key: item.productKey,
      machine_key: item.machineKey,
      item_number: item.itemNumber,
      content,
      status,
      published_at: null,
      updated_at: now,
    }, { onConflict: 'product_key,status' })
    .select('id, product_key, machine_key, item_number, content, status, published_at, updated_at')
    .single();
  return { row: data ? toRecord(data as Record<string, unknown>) : null, error: error?.message || null };
}

/** Removes only the unpublished editorial version for a canonical catalog item. */
export async function deleteMarketingConfiguratorDraftContent(
  item: Pick<MarketingConfiguratorCatalogItem, 'productKey'>,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('marketing_configurator_product_content')
    .delete()
    .eq('product_key', item.productKey)
    .eq('status', 'draft');
  return { error: error?.message || null };
}

export async function uploadMarketingConfiguratorImage(file: File): Promise<{ url: string | null; error: string | null }> {
  if (!file.type.startsWith('image/')) return { url: null, error: 'invalid_file' };
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const day = new Date().toISOString().slice(0, 10);
  const path = `marketing-configurator/${day}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('news-assets').upload(path, file, {
    upsert: false,
    contentType: file.type || 'image/jpeg',
  });
  if (error) return { url: null, error: error.message };
  const { data } = supabase.storage.from('news-assets').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export { EMPTY_CONTENT };
