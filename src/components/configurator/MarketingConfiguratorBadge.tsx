import { BadgeCheck, CircleAlert, CircleDollarSign, Megaphone, Tag, type LucideIcon } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type MarketingBadgePreset = 'Ny' | 'God pris' | 'Vigtigt' | 'Kampagne';

export const MARKETING_BADGE_PRESETS: { value: MarketingBadgePreset; label: string; Icon: LucideIcon }[] = [
  { value: 'Ny', label: 'Nyhed', Icon: BadgeCheck },
  { value: 'God pris', label: 'God pris', Icon: CircleDollarSign },
  { value: 'Vigtigt', label: 'Vigtigt', Icon: CircleAlert },
  { value: 'Kampagne', label: 'Kampagne', Icon: Megaphone },
];

type BadgeKind = 'new' | 'offer' | 'campaign' | 'important' | 'custom';

const BADGE_CONFIG: Record<Exclude<BadgeKind, 'custom'>, { Icon: LucideIcon; translationKey: string; className: string }> = {
  new: { Icon: BadgeCheck, translationKey: 'marketingBadgeNew', className: 'border-teal-700 bg-teal-700 text-white' },
  offer: { Icon: CircleDollarSign, translationKey: 'marketingBadgeGoodPrice', className: 'border-amber-500 bg-amber-50 text-amber-950' },
  campaign: { Icon: Megaphone, translationKey: 'marketingBadgeCampaign', className: 'border-emerald-700 bg-emerald-700 text-white' },
  important: { Icon: CircleAlert, translationKey: 'marketingBadgeImportant', className: 'border-rose-700 bg-rose-700 text-white' },
};

export function resolveMarketingBadge(badge: string | null | undefined): { kind: BadgeKind; label: string; Icon: LucideIcon } | null {
  if (!badge) return null;
  const normalized = badge.trim().toLocaleLowerCase();
  if (['ny', 'new'].includes(normalized)) return { kind: 'new', label: '', Icon: BADGE_CONFIG.new.Icon };
  if (['god pris', 'godt køb', 'godt kob', 'tilbud', 'offer'].includes(normalized)) return { kind: 'offer', label: '', Icon: BADGE_CONFIG.offer.Icon };
  if (['kampagne', 'campaign'].includes(normalized)) return { kind: 'campaign', label: '', Icon: BADGE_CONFIG.campaign.Icon };
  if (['vigtigt', 'important'].includes(normalized)) return { kind: 'important', label: '', Icon: BADGE_CONFIG.important.Icon };
  return { kind: 'custom', label: badge, Icon: Tag };
}

function optionFor(badge: string, language: PortalUiLanguage = 'da') {
  const resolved = resolveMarketingBadge(badge);
  if (!resolved) return { label: t('marketingBadgeNone', language), Icon: Tag, className: '' };
  if (resolved.kind === 'custom') return { ...resolved, className: 'border-slate-500 bg-slate-50 text-slate-900' };
  const config = BADGE_CONFIG[resolved.kind];
  return { ...resolved, label: t(config.translationKey, language), className: config.className };
}

export function MarketingConfiguratorBadge({
  badge,
  language = 'da',
  variant = 'main',
  className = '',
}: {
  badge?: string | null;
  language?: PortalUiLanguage;
  variant?: 'main' | 'compact';
  className?: string;
}) {
  if (!badge) return null;
  const { label, Icon, className: tone } = optionFor(badge, language);
  const isCompact = variant === 'compact';
  return (
    <span className={`inline-flex w-fit max-w-full items-center font-bold ${tone} ${isCompact
      ? 'gap-1.5 rounded-full px-2 py-1 text-[11px] leading-none shadow-sm'
      : 'gap-2 rounded-full border-2 px-3 py-2 text-xs tracking-wide shadow-[0_9px_20px_rgba(15,23,42,0.18)] ring-4 ring-white/75'
    } ${className}`}>
      <span className={`inline-flex shrink-0 items-center justify-center rounded-full ${isCompact ? 'h-4 w-4' : 'h-7 w-7 bg-white/20 ring-1 ring-white/45'}`}>
        <Icon className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}

export function MarketingConfiguratorBadgeOption({ badge, language = 'da' }: { badge: string; language?: PortalUiLanguage }) {
  if (!badge) return <span>Ingen</span>;
  const { label, Icon } = optionFor(badge, language);
  return <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" aria-hidden="true" />{label}</span>;
}
