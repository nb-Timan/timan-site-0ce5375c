import { ExternalLink, FileText, MapPin, Link2, PlayCircle } from 'lucide-react';
import type { ComponentType } from 'react';
import type { NewsCtaLink, NewsCtaLinkType } from '@/features/news-cms/templates/types';

export const NEWS_CTA_COUNT = 2;
export const NEWS_CTA_LABEL_MAX = 30;

export const NEWS_CTA_TYPES: Array<{ id: NewsCtaLinkType; labelKey: string; Icon: ComponentType<{ className?: string }> }> = [
  { id: 'website', labelKey: 'newsCmsCtaTypeWebsite', Icon: ExternalLink },
  { id: 'youtube', labelKey: 'newsCmsCtaTypeYoutube', Icon: PlayCircle },
  { id: 'pdf', labelKey: 'newsCmsCtaTypePdf', Icon: FileText },
  { id: 'dealer', labelKey: 'newsCmsCtaTypeDealer', Icon: MapPin },
  { id: 'external', labelKey: 'newsCmsCtaTypeExternal', Icon: Link2 },
];

export function ctaTypeOption(type: NewsCtaLinkType | undefined) {
  return NEWS_CTA_TYPES.find((option) => option.id === type) || NEWS_CTA_TYPES[0];
}

export function emptyCtaLink(): NewsCtaLink {
  return { enabled: false, type: 'website', label: '', url: '' };
}

export function normalizeCtaLinks(value: unknown): NewsCtaLink[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: NEWS_CTA_COUNT }).map((_, index) => {
    const raw = (source[index] || {}) as Partial<NewsCtaLink>;
    return {
      enabled: raw.enabled === true,
      type: NEWS_CTA_TYPES.some((option) => option.id === raw.type) ? (raw.type as NewsCtaLinkType) : 'website',
      label: typeof raw.label === 'string' ? raw.label.slice(0, NEWS_CTA_LABEL_MAX) : '',
      url: typeof raw.url === 'string' ? raw.url : '',
    };
  });
}

export function isValidCtaUrl(url: string): boolean {
  const value = (url || '').trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/** CTAs that are enabled and safe to render/publish. */
export function activeCtaLinks(value: unknown): NewsCtaLink[] {
  return normalizeCtaLinks(value).filter((cta) => cta.enabled && isValidCtaUrl(cta.url) && cta.label.trim().length > 0);
}

/** Enabled CTAs that are misconfigured (bad URL). */
export function invalidCtaLinks(value: unknown): NewsCtaLink[] {
  return normalizeCtaLinks(value).filter((cta) => cta.enabled && !isValidCtaUrl(cta.url));
}
