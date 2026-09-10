import { CircleAlert, DollarSign, Megaphone, Star, Tag, type LucideIcon } from 'lucide-react';

export type MarketingBadgePreset = 'Ny' | 'Godt køb' | 'Vigtigt' | 'Kampagne';

export const MARKETING_BADGE_PRESETS: { value: MarketingBadgePreset; label: string; Icon: LucideIcon }[] = [
  { value: 'Ny', label: 'NY', Icon: Star },
  { value: 'Godt køb', label: 'Godt køb', Icon: DollarSign },
  { value: 'Vigtigt', label: 'Vigtigt', Icon: CircleAlert },
  { value: 'Kampagne', label: 'Kampagne', Icon: Megaphone },
];

function optionFor(badge: string) {
  return MARKETING_BADGE_PRESETS.find((option) => option.value === badge) || {
    label: badge,
    Icon: Tag,
  };
}

export function MarketingConfiguratorBadge({ badge, className = '' }: { badge?: string | null; className?: string }) {
  if (!badge) return null;
  const { label, Icon } = optionFor(badge);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 whitespace-nowrap ${className}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

export function MarketingConfiguratorBadgeOption({ badge }: { badge: string }) {
  if (!badge) return <span>Ingen</span>;
  const { label, Icon } = optionFor(badge);
  return <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" aria-hidden="true" />{label}</span>;
}
