import type { NewsImageTransform } from '@/features/news-cms/templates/types';

export const DEFAULT_NEWS_IMAGE_TRANSFORM: NewsImageTransform = { x: 0, y: 0, scale: 1 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeNewsImageTransform(value?: Partial<NewsImageTransform> | null): NewsImageTransform {
  return {
    x: clamp(typeof value?.x === 'number' ? value.x : DEFAULT_NEWS_IMAGE_TRANSFORM.x, -45, 45),
    y: clamp(typeof value?.y === 'number' ? value.y : DEFAULT_NEWS_IMAGE_TRANSFORM.y, -45, 45),
    scale: clamp(typeof value?.scale === 'number' ? value.scale : DEFAULT_NEWS_IMAGE_TRANSFORM.scale, 1, 2.5),
  };
}

/** Returns undefined when no editorial crop has been selected yet. */
export function readNewsImageTransform(value: unknown): NewsImageTransform | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return normalizeNewsImageTransform(value as Partial<NewsImageTransform>);
}
