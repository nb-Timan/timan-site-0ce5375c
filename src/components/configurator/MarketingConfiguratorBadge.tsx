import { BadgeCheck, CircleAlert, CircleDollarSign, Megaphone, Tag, type LucideIcon } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { formatMarketingBadgeCountdown, isMarketingBadgeActive, type MarketingBadgeSchedule, useMarketingBadgeClock } from '@/lib/marketingBadgeSchedule';

export type MarketingBadgePreset = 'Ny' | 'God pris' | 'Vigtigt' | 'Kampagne';

export const MARKETING_BADGE_PRESETS: { value: MarketingBadgePreset; label: string; Icon: LucideIcon }[] = [
  { value: 'Ny', label: 'Nyhed', Icon: BadgeCheck },
  { value: 'God pris', label: 'God pris', Icon: CircleDollarSign },
  { value: 'Vigtigt', label: 'Vigtigt', Icon: CircleAlert },
  { value: 'Kampagne', label: 'Kampagne', Icon: Megaphone },
];

type BadgeKind = 'new' | 'offer' | 'campaign' | 'important' | 'custom';

const BADGE_CONFIG: Record<Exclude<BadgeKind, 'custom'>, { Icon: LucideIcon; translationKey: string; className: string }> = {
  new: { Icon: BadgeCheck, translationKey: 'marketingBadgeNew', className: 'border-emerald-600 bg-emerald-600 text-white' },
  offer: { Icon: CircleDollarSign, translationKey: 'marketingBadgeGoodPrice', className: 'border-emerald-300 bg-white text-emerald-800' },
  campaign: { Icon: Megaphone, translationKey: 'marketingBadgeCampaign', className: 'border-emerald-700 bg-emerald-700 text-white' },
  important: { Icon: CircleAlert, translationKey: 'marketingBadgeImportant', className: 'border-rose-600 bg-rose-600 text-white' },
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
  schedule,
  className = '',
}: {
  badge?: string | null;
  language?: PortalUiLanguage;
  variant?: 'main' | 'compact';
  schedule?: MarketingBadgeSchedule | null;
  className?: string;
}) {
  const now = useMarketingBadgeClock();
  if (!badge || !isMarketingBadgeActive(schedule, now)) return null;
  const { label, Icon, className: tone } = optionFor(badge, language);
  const countdown = schedule?.badge_show_countdown ? formatMarketingBadgeCountdown(schedule.badge_ends_at, language, now) : '';
  const isCompact = variant === 'compact';
  return (
    <span className={`inline-flex w-fit max-w-full items-center border font-bold ${tone} ${isCompact
      ? 'h-6 gap-1 rounded-full px-2 text-[10px] leading-none shadow-sm'
      : 'h-7 gap-1.5 rounded-full px-2.5 text-[11px] leading-none shadow-sm'
    } ${className}`}>
      <Icon className={isCompact ? 'h-3 w-3 shrink-0' : 'h-3.5 w-3.5 shrink-0'} aria-hidden="true" />
      <span className="whitespace-nowrap">{countdown ? `${label} · ${countdown}` : label}</span>
    </span>
  );
}

export function MarketingConfiguratorBadgeOption({ badge, language = 'da' }: { badge: string; language?: PortalUiLanguage }) {
  if (!badge) return <span>Ingen</span>;
  const { label, Icon } = optionFor(badge, language);
  return <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" aria-hidden="true" />{label}</span>;
}
