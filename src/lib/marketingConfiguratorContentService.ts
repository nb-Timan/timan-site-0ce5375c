import { ACCESSORIES, getAccessoriesFlat, getLocalizedName, PRODUCTS } from '@/data/machines';
import { supabase } from '@/lib/supabase';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { Accessory, Machine, TechSpec } from '@/types/configurator';
import type { MarketingBadgeSchedule } from '@/lib/marketingBadgeSchedule';

export type MarketingConfiguratorContentStatus = 'draft' | 'published';

export interface MarketingConfiguratorContentFields extends MarketingBadgeSchedule {
  title: string;
  description: string;
  key_features: string[];
  image_url: string;
  video_url: string;
  specification_url: string;
  specs: TechSpec[];
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

function catalogLanguage(language: PortalUiLanguage) {
  return language === 'sv' || language === 'fr' || language === 'pl' || language === 'cs' ? 'en' : language;
}

function textOf(value: unknown, language: PortalUiLanguage): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const values = value as Record<string, unknown>;
    const preferred = values[catalogLanguage(language)] ?? values.da ?? values.en;
    return typeof preferred === 'string' ? preferred : '';
  }
  return '';
}

function firstUrl(item: { imageUrl?: string; images?: { url: string | null }[]; videoUrl?: string; videos?: { url: string | null }[] }, field: 'image' | 'video') {
  if (field === 'image') return item.images?.find((entry) => entry.url)?.url || item.imageUrl || '';
  return item.videos?.find((entry) => entry.url)?.url || item.videoUrl || '';
}

function defaultContent(item: Machine | Accessory, language: PortalUiLanguage): MarketingConfiguratorContentFields {
  const isMachine = 'techSpecs' in item;
  const specs = isMachine ? item.techSpecs : (item.specs || []);
  const description = 'techSpecs' in item
    ? textOf(item.machineDetails?.main, language)
    : textOf(item.specs?.find((spec) => spec.label === 'Beskrivelse')?.value, language);
  return {
    title: getLocalizedName(item.name, catalogLanguage(language)),
    description,
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
  return {
    title: typeof content.title === 'string' ? content.title : '',
    description: typeof content.description === 'string' ? content.description : '',
    key_features: Array.isArray(content.key_features)
      ? content.key_features.filter((feature): feature is string => typeof feature === 'string').map((feature) => feature.trim()).filter(Boolean)
      : [],
    image_url: typeof content.image_url === 'string' ? content.image_url : '',
    video_url: typeof content.video_url === 'string' ? content.video_url : '',
    specification_url: typeof content.specification_url === 'string' ? content.specification_url : '',
    specs: Array.isArray(content.specs) ? content.specs as TechSpec[] : [],
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

export function mergeMarketingConfiguratorContent(
  defaults: MarketingConfiguratorContentFields,
  override: MarketingConfiguratorContentFields | null | undefined,
): MarketingConfiguratorContentFields {
  if (!override) return defaults;
  return {
    title: override.title || defaults.title,
    description: override.description || defaults.description,
    key_features: override.key_features.length ? override.key_features : defaults.key_features,
    image_url: override.image_url || defaults.image_url,
    video_url: override.video_url || defaults.video_url,
    specification_url: override.specification_url || defaults.specification_url,
    specs: override.specs.length ? override.specs : defaults.specs,
    badge: override.badge || defaults.badge,
    badge_starts_at: override.badge_starts_at || null,
    badge_ends_at: override.badge_ends_at || null,
    badge_show_countdown: override.badge_show_countdown === true,
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
  return new Map(((data || []) as Record<string, unknown>[]).map((row) => {
    const record = toRecord(row);
    return [record.product_key, record] as const;
  }));
}

export async function saveMarketingConfiguratorContent(
  item: Pick<MarketingConfiguratorCatalogItem, 'productKey' | 'machineKey' | 'itemNumber'>,
  content: MarketingConfiguratorContentFields,
  status: MarketingConfiguratorContentStatus,
): Promise<{ row: MarketingConfiguratorContentRecord | null; error: string | null }> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('marketing_configurator_product_content')
    .upsert({
      product_key: item.productKey,
      machine_key: item.machineKey,
      item_number: item.itemNumber,
      content,
      status,
      published_at: status === 'published' ? now : null,
      updated_at: now,
    }, { onConflict: 'product_key,status' })
    .select('id, product_key, machine_key, item_number, content, status, published_at, updated_at')
    .single();
  return { row: data ? toRecord(data as Record<string, unknown>) : null, error: error?.message || null };
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
