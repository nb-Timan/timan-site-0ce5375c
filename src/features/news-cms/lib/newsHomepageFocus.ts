import type { NewsTemplateId } from '@/features/news-cms/templates/types';
import { readNewsImageTransform } from '@/features/news-cms/lib/newsImageTransform';

export interface NewsHomepageFocus {
  /** Center point of the fixed homepage-card frame, relative to the hero image. */
  x: number;
  y: number;
}

export const HOMEPAGE_FOCUS_FRAME_SIZE = 56;

const FRAME_EDGE = HOMEPAGE_FOCUS_FRAME_SIZE / 2;

export const DEFAULT_NEWS_HOMEPAGE_FOCUS: NewsHomepageFocus = { x: 50, y: 50 };

export interface NewsHomepageMedia {
  imageUrl: string;
  imageTransform: ReturnType<typeof readNewsImageTransform>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Keeps the fixed square focus frame entirely inside the source image. */
export function normalizeNewsHomepageFocus(value?: Partial<NewsHomepageFocus> | null): NewsHomepageFocus {
  return {
    x: clamp(typeof value?.x === 'number' ? value.x : DEFAULT_NEWS_HOMEPAGE_FOCUS.x, FRAME_EDGE, 100 - FRAME_EDGE),
    y: clamp(typeof value?.y === 'number' ? value.y : DEFAULT_NEWS_HOMEPAGE_FOCUS.y, FRAME_EDGE, 100 - FRAME_EDGE),
  };
}

/** Returns undefined until an editor has deliberately positioned the homepage frame. */
export function readNewsHomepageFocus(value: unknown): NewsHomepageFocus | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return normalizeNewsHomepageFocus(value as Partial<NewsHomepageFocus>);
}

/** Resolves the shared source image used by both the editor and homepage card. */
export function resolveNewsHomepageMedia(
  templateId: NewsTemplateId,
  content: Record<string, unknown>,
): NewsHomepageMedia {
  const readImage = (key: string) => (typeof content[key] === 'string' ? content[key] : '');
  const media = (imageKey: string): NewsHomepageMedia => ({
    imageUrl: readImage(imageKey),
    imageTransform: readNewsImageTransform(content[`${imageKey}Transform`]),
  });

  if (templateId === 'template-03-hero-news') return media('heroImage');
  if (templateId === 'template-04-technical-feature') {
    return readImage('productImage') ? media('productImage') : media('secondaryImage');
  }
  if (templateId === 'template-06-flyer') {
    const firstPage = Array.isArray(content.flyerPages) ? content.flyerPages[0] : null;
    return {
      imageUrl: firstPage && typeof firstPage === 'object' && typeof (firstPage as Record<string, unknown>).image === 'string'
        ? (firstPage as Record<string, unknown>).image as string
        : '',
      imageTransform: undefined,
    };
  }
  return media('mainImage');
}
