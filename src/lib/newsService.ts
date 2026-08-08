import { supabase } from './supabase';
import type { LocalizedNewsContent, NewsTemplateId } from '@/features/news-cms/templates/types';
import { getLocalizedNewsContent } from '@/features/news-cms/lib/newsContent';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

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

const LEGACY_NEWS_SELECT = 'id, title, excerpt, image_url, link_url, category, published_at, is_active, source';
const CMS_NEWS_SELECT = `${LEGACY_NEWS_SELECT}, template_id, status, slug, localized_content, template_data, assets, created_at, updated_at, created_by, updated_by, published_by`;

/**
 * Fetch the N newest active news posts, sorted by published_at desc.
 * Returns [] if the table doesn't exist yet or on any error — caller
 * is responsible for showing placeholder content in that case.
 */
export async function fetchLatestNews(limit = 4): Promise<NewsPost[]> {
  try {
    const { data, error } = await supabase
      .from('news_posts')
      .select(LEGACY_NEWS_SELECT)
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) {
      // Table may not exist yet — caller falls back to placeholders.
      console.warn('[newsService] fetchLatestNews error:', error.message);
      return [];
    }
    return (data ?? []) as NewsPost[];
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

  if (error) return { rows: [], error: error.message };
  return { rows: (data || []) as NewsCmsPost[], error: null };
}

export async function adminSaveNewsDraft(input: NewsCmsDraftInput): Promise<{ row: NewsCmsPost | null; error: string | null }> {
  const legacy = legacyFieldsFromLocalizedContent(input.localized_content);
  const payload = {
    template_id: input.template_id,
    status: input.status || 'draft',
    is_active: input.status === 'published',
    category: 'NYHED',
    source: 'news_cms',
    localized_content: input.localized_content,
    template_data: input.template_data || {},
    assets: input.assets || [],
    published_at: input.status === 'published' ? new Date().toISOString() : null,
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
