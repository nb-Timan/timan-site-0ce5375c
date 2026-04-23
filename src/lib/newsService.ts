import { supabase } from './supabase';

export type NewsCategory = 'NYHED' | 'SERVICE' | string;

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

/**
 * Fetch the N newest active news posts, sorted by published_at desc.
 * Returns [] if the table doesn't exist yet or on any error — caller
 * is responsible for showing placeholder content in that case.
 */
export async function fetchLatestNews(limit = 4): Promise<NewsPost[]> {
  try {
    const { data, error } = await supabase
      .from('news_posts')
      .select('id, title, excerpt, image_url, link_url, category, published_at, is_active, source')
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
