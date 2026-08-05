import flyerPdf from '@/assets/flyer/teaser.pdf.asset.json';

/**
 * Curated Messe news items shown on /messe/nyt.
 *
 * These are editorial, always-on items rendered above the dynamic
 * `news_posts` feed. All visible text is referenced by translation key and
 * resolved with `t(key, uiLanguage)` — never hardcoded in the component.
 */

export type MesseNewsKind = 'article' | 'flyer';

export interface MesseNewsItem {
  id: string;
  kind: MesseNewsKind;
  /** Translation key for the category chip. */
  categoryKey: string;
  /** Translation keys for the card. */
  titleKey: string;
  descKey: string;
  /** Card thumbnail (public path). Omit when `thumb` renders a component. */
  image?: string;
  /** Live, localized thumbnail rendered instead of a static image. */
  thumb?: 'flyer-front';
  /** Fallback image used if the thumbnail fails to load. */
  imageFallback?: string;
  /** Optional object-position override for the thumbnail crop. */
  imagePositionClass?: string;
}

/** Original PDF (download / open in new tab). */
export const FLYER_PDF = flyerPdf.url;

/** Route of the interactive Timan 2620 machine experience. */
export const TIMAN_2620_ROUTE = '/messe/timan-2620';

export const MESSE_NEWS_ITEMS: MesseNewsItem[] = [
  {
    id: 'timan-2620-new-generation',
    kind: 'article',
    categoryKey: 'messe_news_cat_news',
    titleKey: 'messe_news_2620_card_title',
    descKey: 'messe_news_2620_card_desc',
    image: '/images/timan-2620/cab_v_plow/01.jpg',
  },
  {
    id: 'timan-2620-teaser-flyer',
    kind: 'flyer',
    categoryKey: 'messe_news_cat_news',
    titleKey: 'messe_news_flyer_card_title',
    descKey: 'messe_news_flyer_card_desc',
    // Localized live render of the flyer front page (same component + strings
    // as the full teaser flyer modal) — never a static Danish image.
    thumb: 'flyer-front',
  },
];

/** Body paragraph keys for the Timan 2620 article modal. */
export const TIMAN_2620_BODY_KEYS = [
  'messe_news_2620_p1',
  'messe_news_2620_p2',
  'messe_news_2620_p3',
];

/** Highlight bullet keys for the Timan 2620 article modal. */
export const TIMAN_2620_HIGHLIGHT_KEYS = [
  'messe_news_2620_hl1',
  'messe_news_2620_hl2',
  'messe_news_2620_hl3',
  'messe_news_2620_hl4',
  'messe_news_2620_hl5',
  'messe_news_2620_hl6',
];
