import { BadgeCheck, CircleAlert, CircleDollarSign, Megaphone, Tag, type LucideIcon } from 'lucide-react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type MarketingBadgePreset = 'Ny' | 'Godt køb' | 'Vigtigt' | 'Kampagne';

export const MARKETING_BADGE_PRESETS: { value: MarketingBadgePreset; label: string; Icon: LucideIcon }[] = [
  { value: 'Ny', label: 'Nyhed', Icon: BadgeCheck },
  { value: 'Godt køb', label: 'Tilbud', Icon: CircleDollarSign },
  { value: 'Vigtigt', label: 'Vigtigt', Icon: CircleAlert },
  { value: 'Kampagne', label: 'Kampagne', Icon: Megaphone },
];

type BadgeKind = 'new' | 'offer' | 'campaign' | 'important' | 'custom';

const BADGE_CONFIG: Record<Exclude<BadgeKind, 'custom'>, { Icon: LucideIcon; translationKey: string; className: string }> = {
  new: { Icon: BadgeCheck, translationKey: 'marketingBadgeNew', className: 'border-teal-700 bg-teal-700 text-white' },
  offer: { Icon: CircleDollarSign, translationKey: 'marketingBadgeOffer', className: 'border-amber-500 bg-amber-50 text-amber-950' },
  campaign: { Icon: Megaphone, translationKey: 'marketingBadgeCampaign', className: 'border-emerald-700 bg-emerald-700 text-white' },
  important: { Icon: CircleAlert, translationKey: 'marketingBadgeImportant', className: 'border-rose-700 bg-rose-700 text-white' },
};

export function resolveMarketingBadge(badge: string | null | undefined): { kind: BadgeKind; label: string; Icon: LucideIcon } | null {
  if (!badge) return null;
  const normalized = badge.trim().toLocaleLowerCase();
  if (['ny', 'new'].includes(normalized)) return { kind: 'new', label: '', Icon: BADGE_CONFIG.new.Icon };
  if (['godt køb', 'godt kob', 'tilbud', 'offer'].includes(normalized)) return { kind: 'offer', label: '', Icon: BADGE_CONFIG.offer.Icon };
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

export function MarketingConfiguratorBadge({ badge, language = 'da', className = '' }: { badge?: string | null; language?: PortalUiLanguage; className?: string }) {
  if (!badge) return null;
  const { label, Icon, className: tone } = optionFor(badge, language);
  return (
    <span className={`inline-flex w-fit max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-bold tracking-wide shadow-sm ${tone} ${className}`}>
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

export function MarketingConfiguratorBadgeOption({ badge, language = 'da' }: { badge: string; language?: PortalUiLanguage }) {
  if (!badge) return <span>Ingen</span>;
  const { label, Icon } = optionFor(badge, language);
  return <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4" aria-hidden="true" />{label}</span>;
}
