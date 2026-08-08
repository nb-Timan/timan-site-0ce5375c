import type { NewsFlyerPage } from '@/features/news-cms/templates/types';

/**
 * Template 06 – flyer. One news item holds 1-3 pages; every page is a fixed
 * A4 landscape canvas, so the editorial fields are hard-capped to the space
 * actually rendered.
 */
export const FLYER_MAX_PAGES = 3;
export const FLYER_HEADLINE_MAX = 60;
export const FLYER_SUBTITLE_MAX = 90;
export const FLYER_BODY_MAX = 420;

export function emptyFlyerPage(): NewsFlyerPage {
  return { headline: '', subtitle: '', body: '', image: '' };
}

export function clampFlyerPageCount(value: unknown): number {
  const raw = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(FLYER_MAX_PAGES, Math.max(1, Math.trunc(raw)));
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** Always returns exactly `count` pages, padded with empty ones. */
export function normalizeFlyerPages(value: unknown, count: number): NewsFlyerPage[] {
  const list = Array.isArray(value) ? value : [];
  const total = clampFlyerPageCount(count);
  return Array.from({ length: total }, (_, index) => {
    const raw = (list[index] || {}) as Partial<NewsFlyerPage>;
    return {
      headline: str(raw.headline, FLYER_HEADLINE_MAX),
      subtitle: str(raw.subtitle, FLYER_SUBTITLE_MAX),
      body: str(raw.body, FLYER_BODY_MAX),
      image: typeof raw.image === 'string' ? raw.image : '',
    };
  });
}

/** Pages as stored in content (used by renderers that already know the count). */
export function flyerPagesFromContent(content: Record<string, unknown>): NewsFlyerPage[] {
  return normalizeFlyerPages(content.flyerPages, clampFlyerPageCount(content.pageCount));
}
