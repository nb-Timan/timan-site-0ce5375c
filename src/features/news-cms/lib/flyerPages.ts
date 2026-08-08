import type { NewsFeatureBlock, NewsFlyerLink, NewsFlyerPage, NewsSpecRow } from '@/features/news-cms/templates/types';
import { NEWS_FEATURE_ICONS, NEWS_FEATURE_ICON_COLORS } from '@/features/news-cms/lib/featureIcons';
import type { NewsFeatureIconColor } from '@/features/news-cms/templates/types';

/**
 * Template 06 – flyer. One news item holds 1-3 pages and every page has its
 * OWN fixed A4 landscape layout:
 *   page 1 = hero / intro
 *   page 2 = product story with three highlights and a small secondary image
 *   page 3 = specification list plus up to two call-to-action links
 * Every editorial field is hard-capped to the space its layout actually
 * renders, so content can never resize or break the A4 canvas.
 */
export const FLYER_MAX_PAGES = 3;

/** Page 1 – hero. Kept as-is: wide headline column beside a full-height image. */
export const FLYER_HEADLINE_MAX = 60;
export const FLYER_SUBTITLE_MAX = 90;
export const FLYER_BODY_MAX = 420;

/** Page 2 – product story. Shorter body: the highlight row owns the bottom band. */
export const FLYER2_HEADLINE_MAX = 60;
export const FLYER2_SUBTITLE_MAX = 80;
export const FLYER2_BODY_MAX = 300;
export const FLYER_HIGHLIGHT_COUNT = 3;
export const FLYER_HIGHLIGHT_HEADING_MAX = 22;
export const FLYER_HIGHLIGHT_TEXT_MAX = 58;

/** Page 3 – specifications + CTA. */
export const FLYER3_HEADLINE_MAX = 55;
export const FLYER3_SUBTITLE_MAX = 80;
export const FLYER3_BODY_MAX = 220;
export const FLYER_SPEC_ROWS = 6;
export const FLYER_SPEC_LABEL_MAX = 26;
export const FLYER_SPEC_VALUE_MAX = 22;
export const FLYER_LINK_COUNT = 2;
export const FLYER_LINK_LABEL_MAX = 30;

export interface FlyerTextLimits {
  headline: number;
  subtitle: number;
  body: number;
}

/** Text limits for a 0-based page index. */
export function flyerTextLimits(index: number): FlyerTextLimits {
  if (index === 1) return { headline: FLYER2_HEADLINE_MAX, subtitle: FLYER2_SUBTITLE_MAX, body: FLYER2_BODY_MAX };
  if (index === 2) return { headline: FLYER3_HEADLINE_MAX, subtitle: FLYER3_SUBTITLE_MAX, body: FLYER3_BODY_MAX };
  return { headline: FLYER_HEADLINE_MAX, subtitle: FLYER_SUBTITLE_MAX, body: FLYER_BODY_MAX };
}

const DEFAULT_HIGHLIGHT_ICONS = ['engine', 'machine', 'shield'];

export function emptyFlyerHighlight(index: number): NewsFeatureBlock {
  const fallback = DEFAULT_HIGHLIGHT_ICONS[index];
  return {
    icon: NEWS_FEATURE_ICONS.some((icon) => icon.id === fallback) ? fallback : NEWS_FEATURE_ICONS[index % NEWS_FEATURE_ICONS.length].id,
    iconColor: 'green',
    customIconUrl: null,
    heading: '',
    description: '',
  };
}

export function normalizeFlyerHighlights(value: unknown): NewsFeatureBlock[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: FLYER_HIGHLIGHT_COUNT }, (_, index) => {
    const raw = (list[index] || {}) as Partial<NewsFeatureBlock>;
    const fallback = emptyFlyerHighlight(index);
    return {
      icon: typeof raw.icon === 'string' && raw.icon ? raw.icon : fallback.icon,
      iconColor: (NEWS_FEATURE_ICON_COLORS.some((color) => color.id === raw.iconColor) ? raw.iconColor : 'green') as NewsFeatureIconColor,
      customIconUrl: typeof raw.customIconUrl === 'string' && raw.customIconUrl ? raw.customIconUrl : null,
      heading: typeof raw.heading === 'string' ? raw.heading.slice(0, FLYER_HIGHLIGHT_HEADING_MAX) : '',
      description: typeof raw.description === 'string' ? raw.description.slice(0, FLYER_HIGHLIGHT_TEXT_MAX) : '',
    };
  });
}

export function normalizeFlyerSpecs(value: unknown): NewsSpecRow[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: FLYER_SPEC_ROWS }, (_, index) => {
    const raw = (list[index] || {}) as Partial<NewsSpecRow>;
    return {
      label: typeof raw.label === 'string' ? raw.label.slice(0, FLYER_SPEC_LABEL_MAX) : '',
      value: typeof raw.value === 'string' ? raw.value.slice(0, FLYER_SPEC_VALUE_MAX) : '',
    };
  });
}

/** Rows with content — empty rows never render. */
export function filledFlyerSpecs(value: unknown): NewsSpecRow[] {
  return normalizeFlyerSpecs(value).filter((row) => row.label.trim() || row.value.trim());
}

export function normalizeFlyerLinks(value: unknown): NewsFlyerLink[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: FLYER_LINK_COUNT }, (_, index) => {
    const raw = (list[index] || {}) as Partial<NewsFlyerLink>;
    return {
      label: typeof raw.label === 'string' ? raw.label.slice(0, FLYER_LINK_LABEL_MAX) : '',
      url: typeof raw.url === 'string' ? raw.url : '',
    };
  });
}

/** Links that should render: both a label and a URL are required. */
export function activeFlyerLinks(value: unknown): NewsFlyerLink[] {
  return normalizeFlyerLinks(value).filter((link) => link.label.trim() && link.url.trim());
}

export function emptyFlyerPage(index = 0): NewsFlyerPage {
  return {
    headline: '',
    subtitle: '',
    body: '',
    image: '',
    secondaryImage: '',
    highlights: normalizeFlyerHighlights(null),
    specs: normalizeFlyerSpecs(null),
    links: normalizeFlyerLinks(null),
  };
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
    const limits = flyerTextLimits(index);
    return {
      headline: str(raw.headline, limits.headline),
      subtitle: str(raw.subtitle, limits.subtitle),
      body: str(raw.body, limits.body),
      image: typeof raw.image === 'string' ? raw.image : '',
      secondaryImage: typeof raw.secondaryImage === 'string' ? raw.secondaryImage : '',
      highlights: normalizeFlyerHighlights(raw.highlights),
      specs: normalizeFlyerSpecs(raw.specs),
      links: normalizeFlyerLinks(raw.links),
    };
  });
}

/** Pages as stored in content (used by renderers that already know the count). */
export function flyerPagesFromContent(content: Record<string, unknown>): NewsFlyerPage[] {
  return normalizeFlyerPages(content.flyerPages, clampFlyerPageCount(content.pageCount));
}
