export interface NewsHomepageFocus {
  /** Center point of the fixed homepage-card frame, relative to the hero image. */
  x: number;
  y: number;
}

export const HOMEPAGE_FOCUS_FRAME_SIZE = 56;

const FRAME_EDGE = HOMEPAGE_FOCUS_FRAME_SIZE / 2;

export const DEFAULT_NEWS_HOMEPAGE_FOCUS: NewsHomepageFocus = { x: 50, y: 50 };

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
