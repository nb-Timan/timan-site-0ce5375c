import type { NewsFeatureBlock, NewsSpecRow } from '@/features/news-cms/templates/types';
import { NEWS_FEATURE_ICONS, NEWS_FEATURE_ICON_COLORS } from '@/features/news-cms/lib/featureIcons';
import type { NewsFeatureIconColor } from '@/features/news-cms/templates/types';

/** Template 04 uses four fixed technical highlight boxes. */
export const TECH_BLOCK_COUNT = 4;
export const TECH_HEADING_MAX = 25;
export const TECH_VALUE_MAX = 50;

const DEFAULT_TECH_ICONS = ['engine', 'speed', 'comfort', 'attachment'];

export function emptyTechBlock(index: number): NewsFeatureBlock {
  const fallbackId = DEFAULT_TECH_ICONS[index] || NEWS_FEATURE_ICONS[index % NEWS_FEATURE_ICONS.length].id;
  return {
    icon: NEWS_FEATURE_ICONS.some((icon) => icon.id === fallbackId) ? fallbackId : NEWS_FEATURE_ICONS[0].id,
    iconColor: 'green',
    customIconUrl: null,
    heading: '',
    description: '',
  };
}

export function normalizeTechBlocks(value: unknown): NewsFeatureBlock[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: TECH_BLOCK_COUNT }, (_, index) => {
    const raw = (list[index] || {}) as Partial<NewsFeatureBlock>;
    const fallback = emptyTechBlock(index);
    return {
      icon: typeof raw.icon === 'string' && raw.icon ? raw.icon : fallback.icon,
      iconColor: (NEWS_FEATURE_ICON_COLORS.some((c) => c.id === raw.iconColor) ? raw.iconColor : 'green') as NewsFeatureIconColor,
      customIconUrl: typeof raw.customIconUrl === 'string' && raw.customIconUrl ? raw.customIconUrl : null,
      heading: typeof raw.heading === 'string' ? raw.heading.slice(0, TECH_HEADING_MAX) : '',
      description: typeof raw.description === 'string' ? raw.description.slice(0, TECH_VALUE_MAX) : '',
    };
  });
}

export const SPEC_LABEL_MAX = 40;
export const SPEC_VALUE_MAX = 60;

export function normalizeSpecRows(value: unknown): NewsSpecRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const row = (raw || {}) as Partial<NewsSpecRow>;
      return {
        label: typeof row.label === 'string' ? row.label.slice(0, SPEC_LABEL_MAX) : '',
        value: typeof row.value === 'string' ? row.value.slice(0, SPEC_VALUE_MAX) : '',
      };
    })
    .slice(0, 12);
}

/** Rows with at least one filled cell — used by the renderer. */
export function filledSpecRows(value: unknown): NewsSpecRow[] {
  return normalizeSpecRows(value).filter((row) => row.label.trim() || row.value.trim());
}
