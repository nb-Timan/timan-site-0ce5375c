import { supabase } from './supabase';
import type { LocalizedNewsContent, NewsTemplateId } from '@/features/news-cms/templates/types';
import { getLocalizedNewsContent } from '@/features/news-cms/lib/newsContent';
import { portalLanguageLookupOrder, type PortalUiLanguage } from '@/lib/portalLanguages';

export type NewsCategory = 'NYHED' | 'SERVICE' | string;
export type NewsStatus = 'draft' | 'published' | 'archived';

export interface NewsPost {
  id: string;
  title: string;
  excerpt: string | null;
  image_url: string | null;
  link_url: string | null;
  category: NewsCategory;
  published_at: string;
  is_active: boolean;
  source: string | null;
  template_id?: NewsTemplateId | string | null;
  status?: NewsStatus | null;
  slug?: string | null;
  localized_content?: LocalizedNewsContent | null;
  template_data?: Record<string, unknown> | null;
  assets?: unknown[] | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface NewsCmsPost extends NewsPost {
  template_id: NewsTemplateId | string;
  status: NewsStatus;
  slug: string | null;
  localized_content: LocalizedNewsContent | null;
  template_data: Record<string, unknown> | null;
  assets: unknown[] | null;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
}

export interface NewsCmsDraftInput {
  id?: string;
  template_id: NewsTemplateId;
  localized_content: LocalizedNewsContent;
  template_data?: Record<string, unknown>;
  assets?: unknown[];
  status?: NewsStatus;
}

export const NEWS_MANUAL_ORDER_KEY = 'manual_order';

const LEGACY_NEWS_SELECT = 'id, title, excerpt, image_url, link_url, category, published_at, is_active, source';
const CMS_NEWS_SELECT = `${LEGACY_NEWS_SELECT}, template_id, status, slug, localized_content, template_data, assets, created_at, updated_at, created_by, updated_by, published_by`;

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstLocalizedString(
  localizedContent: LocalizedNewsContent | null | undefined,
  keys: string[],
): string {
  if (!localizedContent) return '';
  for (const content of Object.values(localizedContent)) {
    if (!content) continue;
    for (const key of keys) {
      const value = stringValue(content[key]);
      if (value) return value;
    }
  }
  return '';
}

function firstStringFromContent(content: Record<string, unknown> | undefined, keys: string[]): string {
  if (!content) return '';
  for (const key of keys) {
    const value = stringValue(content[key]);
    if (value) return value;
  }
  return '';
}

function localizedStringForLanguage(
  localizedContent: LocalizedNewsContent | null | undefined,
  lang: PortalUiLanguage,
  keys: string[],
): string {
  if (!localizedContent) return '';

  const contentByLanguage = localizedContent as Record<string, Record<string, unknown> | undefined>;
  const languageKeys = Array.from(new Set([
    ...portalLanguageLookupOrder(lang, true),
    ...Object.keys(contentByLanguage),
  ]));

  for (const languageKey of languageKeys) {
    const value = firstStringFromContent(contentByLanguage[languageKey], keys);
    if (value) return value;
  }

  return '';
}

export function resolvePublicNewsFields(
  row: Partial<NewsCmsPost>,
  lang: PortalUiLanguage,
): Pick<NewsPost, 'title' | 'excerpt' | 'image_url'> {
  const localizedContent = row.localized_content;
  if (!localizedContent) {
    return {
      title: row.title || 'Untitled news',
      excerpt: row.excerpt || null,
      image_url: row.image_url || null,
    };
  }

  const title =
    localizedStringForLanguage(localizedContent, lang, ['headline', 'title']) ||
    row.title ||
    'Untitled news';
  const excerpt =
    localizedStringForLanguage(localizedContent, lang, ['subtitle', 'excerpt', 'body']) ||
    row.excerpt ||
    null;
  const imageUrl =
    localizedStringForLanguage(localizedContent, lang, [
      'mainImage',
      'heroImage',
      'productImage',
      'secondaryImage',
      'image_url',
    ]) ||
    firstLocalizedString(localizedContent, ['mainImage', 'heroImage', 'productImage', 'secondaryImage', 'image_url']) ||
    row.image_url ||
    null;

  return { title, excerpt, image_url: imageUrl };
}

function toPublicNewsPost(row: NewsCmsPost, lang: PortalUiLanguage): NewsPost {
  const localizedFields = resolvePublicNewsFields(row, lang);
  return {
    ...row,
    ...localizedFields,
    published_at: row.published_at || row.updated_at || row.created_at || new Date().toISOString(),
  };
}

export function getNewsManualOrder(row: Pick<NewsPost, 'template_data' | 'published_at' | 'updated_at' | 'created_at'>): number {
  const value = row.template_data?.[NEWS_MANUAL_ORDER_KEY];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  const fallbackDate = row.published_at || row.updated_at || row.created_at || '';
  const timestamp = new Date(fallbackDate).getTime();
  return Number.isFinite(timestamp) ? -timestamp : Number.MAX_SAFE_INTEGER;
}

export function sortNewsByManualOrder<T extends Pick<NewsPost, 'template_data' | 'published_at' | 'updated_at' | 'created_at'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const orderDiff = getNewsManualOrder(a) - getNewsManualOrder(b);
    if (orderDiff !== 0) return orderDiff;
    const aDate = a.published_at || a.updated_at || a.created_at || '';
    const bDate = b.published_at || b.updated_at || b.created_at || '';
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
}

/**
 * Fetch the N active news posts shown first in the news feed.
 * Returns [] if the table doesn't exist yet or on any error — caller
 * is responsible for showing placeholder content in that case.
 */
export async function fetchLatestNews(limit = 4, language: PortalUiLanguage = 'da'): Promise<NewsPost[]> {
  try {
    const { data, error } = await supabase
      .from('news_posts')
      .select(CMS_NEWS_SELECT)
      .eq('is_active', true)
      .order('published_at', { ascending: false });

    if (error) {
      // Table may not exist yet — caller falls back to placeholders.
      console.warn('[newsService] fetchLatestNews error:', error.message);
      const fallback = await supabase
        .from('news_posts')
        .select(LEGACY_NEWS_SELECT)
        .eq('is_active', true)
        .order('published_at', { ascending: false })
        .limit(limit);

      if (fallback.error) return [];
      return (fallback.data ?? []) as NewsPost[];
    }
    return sortNewsByManualOrder((data ?? []) as NewsCmsPost[]).slice(0, limit).map((row) => toPublicNewsPost(row, language));
  } catch (err) {
    console.warn('[newsService] fetchLatestNews exception:', err);
    return [];
  }
}

function legacyFieldsFromLocalizedContent(localizedContent: LocalizedNewsContent, lang: PortalUiLanguage = 'da') {
  const content = getLocalizedNewsContent(localizedContent, lang);
  const title = String(content.headline || content.title || '').trim();
  const excerpt = String(content.subtitle || content.excerpt || '').trim();
  const imageUrl = String(content.mainImage || content.heroImage || content.image_url || '').trim();
  return {
    title: title || 'Untitled news',
    excerpt: excerpt || null,
    image_url: imageUrl || null,
  };
}

export async function adminListNewsPosts(): Promise<{ rows: NewsCmsPost[]; error: string | null }> {
  const { data, error } = await supabase
    .from('news_posts')
    .select(CMS_NEWS_SELECT)
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) {
    const fallback = await supabase
      .from('news_posts')
      .select(LEGACY_NEWS_SELECT)
      .order('published_at', { ascending: false })
      .limit(200);

    if (fallback.error) return { rows: [], error: error.message };

    const legacyRows = (fallback.data || []).map((row) => ({
      ...row,
      template_id: 'legacy',
      status: row.is_active ? 'published' : 'draft',
      slug: null,
      localized_content: null,
      template_data: null,
      assets: [],
      created_at: null,
      updated_at: row.published_at || null,
      created_by: null,
      updated_by: null,
      published_by: null,
    }));

    return { rows: legacyRows as NewsCmsPost[], error: null };
  }
  return { rows: sortNewsByManualOrder((data || []) as NewsCmsPost[]), error: null };
}

export async function adminSaveNewsDraft(input: NewsCmsDraftInput): Promise<{ row: NewsCmsPost | null; error: string | null }> {
  const legacy = legacyFieldsFromLocalizedContent(input.localized_content);
  const now = new Date().toISOString();
  const payload = {
    template_id: input.template_id,
    status: input.status || 'draft',
    is_active: input.status === 'published',
    category: 'NYHED',
    source: 'news_cms',
    localized_content: input.localized_content,
    template_data: input.template_data || {},
    assets: input.assets || [],
    published_at: input.status === 'published' ? now : null,
    updated_at: now,
    ...legacy,
  };

  const query = input.id
    ? supabase.from('news_posts').update(payload).eq('id', input.id).select(CMS_NEWS_SELECT).maybeSingle()
    : supabase.from('news_posts').insert(payload).select(CMS_NEWS_SELECT).maybeSingle();

  const { data, error } = await query;
  if (error) return { row: null, error: error.message };
  return { row: data as NewsCmsPost | null, error: null };
}

export async function adminPublishNewsPost(input: NewsCmsDraftInput): Promise<{ row: NewsCmsPost | null; error: string | null }> {
  return adminSaveNewsDraft({ ...input, status: 'published' });
}

export async function adminUpdateNewsStatus(id: string, status: NewsStatus): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const payload = {
    status,
    is_active: status === 'published',
    published_at: status === 'published' ? now : null,
    updated_at: now,
  };

  const { error } = await supabase.from('news_posts').update(payload).eq('id', id);
  return { error: error?.message || null };
}

export async function adminUpdateNewsManualOrder(rows: Pick<NewsCmsPost, 'id' | 'template_data'>[]): Promise<{ error: string | null }> {
  for (const [index, row] of rows.entries()) {
    const templateData = {
      ...(row.template_data || {}),
      [NEWS_MANUAL_ORDER_KEY]: index + 1,
    };
    const { error } = await supabase
      .from('news_posts')
      .update({ template_data: templateData, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (error) return { error: error.message };
  }

  return { error: null };
}

export async function adminDeleteNewsPost(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('news_posts').delete().eq('id', id);
  return { error: error?.message || null };
}
