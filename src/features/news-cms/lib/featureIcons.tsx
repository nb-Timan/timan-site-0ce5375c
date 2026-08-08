import {
  Cog,
  Wrench,
  Hammer,
  Fuel,
  Gauge,
  Zap,
  Tractor,
  Droplets,
  CircleDot,
  Armchair,
  Snowflake,
  Sun,
  Container,
  Leaf,
  ShieldCheck,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { NewsFeatureBlock, NewsFeatureIconColor } from '@/features/news-cms/templates/types';

export interface NewsFeatureIconOption {
  id: string;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
}

export const NEWS_FEATURE_ICONS: NewsFeatureIconOption[] = [
  { id: 'gear', labelKey: 'newsCmsIconGear', Icon: Cog },
  { id: 'wrench', labelKey: 'newsCmsIconWrench', Icon: Wrench },
  { id: 'tools', labelKey: 'newsCmsIconTools', Icon: Hammer },
  { id: 'engine', labelKey: 'newsCmsIconEngine', Icon: Zap },
  { id: 'machine', labelKey: 'newsCmsIconMachine', Icon: Tractor },
  { id: 'hydraulics', labelKey: 'newsCmsIconHydraulics', Icon: Droplets },
  { id: 'wheel', labelKey: 'newsCmsIconWheel', Icon: CircleDot },
  { id: 'fuel', labelKey: 'newsCmsIconFuel', Icon: Fuel },
  { id: 'speed', labelKey: 'newsCmsIconSpeed', Icon: Gauge },
  { id: 'comfort', labelKey: 'newsCmsIconComfort', Icon: Armchair },
  { id: 'winter', labelKey: 'newsCmsIconWinter', Icon: Snowflake },
  { id: 'season', labelKey: 'newsCmsIconSeason', Icon: Sun },
  { id: 'attachment', labelKey: 'newsCmsIconAttachment', Icon: Container },
  { id: 'environment', labelKey: 'newsCmsIconEnvironment', Icon: Leaf },
  { id: 'safety', labelKey: 'newsCmsIconSafety', Icon: ShieldCheck },
];

export const NEWS_FEATURE_ICON_COLORS: Array<{ id: NewsFeatureIconColor; labelKey: string; text: string; swatch: string }> = [
  { id: 'green', labelKey: 'newsCmsIconColorGreen', text: 'text-emerald-700', swatch: 'bg-emerald-600' },
  { id: 'black', labelKey: 'newsCmsIconColorBlack', text: 'text-slate-950', swatch: 'bg-slate-950' },
  { id: 'grey', labelKey: 'newsCmsIconColorGrey', text: 'text-slate-500', swatch: 'bg-slate-400' },
  { id: 'red', labelKey: 'newsCmsIconColorRed', text: 'text-rose-600', swatch: 'bg-rose-500' },
  { id: 'blue', labelKey: 'newsCmsIconColorBlue', text: 'text-sky-700', swatch: 'bg-sky-600' },
  { id: 'orange', labelKey: 'newsCmsIconColorOrange', text: 'text-orange-600', swatch: 'bg-orange-500' },
];

export function iconColorClass(color: NewsFeatureIconColor | undefined): string {
  return NEWS_FEATURE_ICON_COLORS.find((item) => item.id === color)?.text || NEWS_FEATURE_ICON_COLORS[0].text;
}

export function getFeatureIcon(id: string | undefined): NewsFeatureIconOption {
  return NEWS_FEATURE_ICONS.find((item) => item.id === id) || NEWS_FEATURE_ICONS[0];
}

export const FEATURE_BLOCK_COUNT = 3;

export function emptyFeatureBlock(index: number): NewsFeatureBlock {
  return {
    icon: NEWS_FEATURE_ICONS[index % NEWS_FEATURE_ICONS.length].id,
    iconColor: 'green',
    customIconUrl: null,
    heading: '',
    description: '',
  };
}

export function normalizeFeatureBlocks(value: unknown): NewsFeatureBlock[] {
  const list = Array.isArray(value) ? value : [];
  return Array.from({ length: FEATURE_BLOCK_COUNT }, (_, index) => {
    const raw = (list[index] || {}) as Partial<NewsFeatureBlock>;
    const fallback = emptyFeatureBlock(index);
    return {
      icon: typeof raw.icon === 'string' && raw.icon ? raw.icon : fallback.icon,
      iconColor: (NEWS_FEATURE_ICON_COLORS.some((c) => c.id === raw.iconColor) ? raw.iconColor : 'green') as NewsFeatureIconColor,
      customIconUrl: typeof raw.customIconUrl === 'string' && raw.customIconUrl ? raw.customIconUrl : null,
      heading: typeof raw.heading === 'string' ? raw.heading : '',
      description: typeof raw.description === 'string' ? raw.description : '',
    };
  });
}

/** Fixed-size icon renderer shared by editor, preview and published output. */
export function FeatureIconMark({ block, size = 'md' }: { block: NewsFeatureBlock; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  const glyph = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  if (block.customIconUrl) {
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center overflow-hidden`}>
        <img src={block.customIconUrl} alt="" className="max-h-full max-w-full object-contain" />
      </span>
    );
  }
  const { Icon } = getFeatureIcon(block.icon);
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center`}>
      <Icon className={`${glyph} ${iconColorClass(block.iconColor)}`} />
    </span>
  );
}
