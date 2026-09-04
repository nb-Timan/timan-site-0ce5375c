import type { CSSProperties } from 'react';

export const NEWS_TYPOGRAPHY_KEY = 'news_typography';
export const NEWS_TYPOGRAPHY_SIZE_STEPS = [-3, -2, -1, 0, 1, 2, 3] as const;
export const NEWS_TYPOGRAPHY_STYLES = ['default', 'normal', 'bold', 'italic'] as const;

export type NewsTypographySize = (typeof NEWS_TYPOGRAPHY_SIZE_STEPS)[number];
export type NewsTypographyStyle = (typeof NEWS_TYPOGRAPHY_STYLES)[number];

export interface NewsTypographySetting {
  style?: NewsTypographyStyle;
  size?: NewsTypographySize;
}

export type NewsTypographyMap = Record<string, NewsTypographySetting>;
export type NewsTypographyScale = Partial<Record<NewsTypographySize, string>>;

function isTypographySetting(value: unknown): value is NewsTypographySetting {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NewsTypographySetting>;
  const validStyle = !candidate.style || NEWS_TYPOGRAPHY_STYLES.includes(candidate.style);
  const validSize = typeof candidate.size === 'undefined' || NEWS_TYPOGRAPHY_SIZE_STEPS.includes(candidate.size);
  return validStyle && validSize;
}

export function getNewsTypography(templateData: Record<string, unknown> | null | undefined): NewsTypographyMap {
  const value = templateData?.[NEWS_TYPOGRAPHY_KEY];
  if (!value || typeof value !== 'object') return {};
  return Object.entries(value as Record<string, unknown>).reduce<NewsTypographyMap>((acc, [key, setting]) => {
    if (isTypographySetting(setting)) acc[key] = setting;
    return acc;
  }, {});
}

export function setNewsTypographySetting(
  templateData: Record<string, unknown>,
  fieldPath: string,
  setting: NewsTypographySetting | null,
): Record<string, unknown> {
  const current = getNewsTypography(templateData);
  const next = { ...current };
  const normalized: NewsTypographySetting | null = setting
    ? {
        style: setting.style && setting.style !== 'default' ? setting.style : undefined,
        size: setting.size ? setting.size : undefined,
      }
    : null;

  if (!normalized || (!normalized.style && !normalized.size)) {
    delete next[fieldPath];
  } else {
    next[fieldPath] = normalized;
  }

  if (Object.keys(next).length === 0) {
    const { [NEWS_TYPOGRAPHY_KEY]: _removed, ...rest } = templateData;
    return rest;
  }

  return {
    ...templateData,
    [NEWS_TYPOGRAPHY_KEY]: next,
  };
}

export function newsTypographyStyle(
  templateData: Record<string, unknown> | null | undefined,
  fieldPath: string,
  scale: NewsTypographyScale = {},
): CSSProperties | undefined {
  const setting = getNewsTypography(templateData)[fieldPath];
  if (!setting) return undefined;

  const style: CSSProperties = {};
  if (setting.style === 'normal') {
    style.fontWeight = 400;
    style.fontStyle = 'normal';
  }
  if (setting.style === 'bold') {
    style.fontWeight = 700;
    style.fontStyle = 'normal';
  }
  if (setting.style === 'italic') {
    style.fontWeight = 400;
    style.fontStyle = 'italic';
  }

  if (setting.size && scale[setting.size]) {
    style.fontSize = scale[setting.size];
  }

  return Object.keys(style).length > 0 ? style : undefined;
}
