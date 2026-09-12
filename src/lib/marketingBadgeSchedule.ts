import { useSyncExternalStore } from 'react';
import { t } from '@/lib/i18n/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type MarketingBadgeSchedule = {
  badge_starts_at?: string | null;
  badge_ends_at?: string | null;
  badge_show_countdown?: boolean;
};

export type MarketingBadgeScheduleState = 'active' | 'scheduled' | 'expired';
export type MarketingBadgeDurationUnit = 'hours' | 'days' | 'weeks' | 'months' | 'years';

const listeners = new Set<() => void>();
let clock = Date.now();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function updateClock() {
  clock = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (clockTimer === null) clockTimer = setInterval(updateClock, 1_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && clockTimer !== null) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

export function useMarketingBadgeClock() {
  return useSyncExternalStore(subscribe, () => clock, () => clock);
}

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

export function marketingBadgeScheduleState(schedule: MarketingBadgeSchedule | null | undefined, now = Date.now()): MarketingBadgeScheduleState {
  const startsAt = timestamp(schedule?.badge_starts_at);
  const endsAt = timestamp(schedule?.badge_ends_at);
  if (startsAt !== null && now < startsAt) return 'scheduled';
  if (endsAt !== null && now >= endsAt) return 'expired';
  return 'active';
}

export function isMarketingBadgeActive(schedule: MarketingBadgeSchedule | null | undefined, now = Date.now()) {
  return marketingBadgeScheduleState(schedule, now) === 'active';
}

export function addMarketingBadgeDuration(start: Date, amount: number, unit: MarketingBadgeDurationUnit) {
  const result = new Date(start);
  const safeAmount = Math.max(1, Math.floor(amount) || 1);
  if (unit === 'hours') result.setHours(result.getHours() + safeAmount);
  if (unit === 'days') result.setDate(result.getDate() + safeAmount);
  if (unit === 'weeks') result.setDate(result.getDate() + safeAmount * 7);
  if (unit === 'months' || unit === 'years') {
    const day = result.getDate();
    result.setDate(1);
    if (unit === 'months') result.setMonth(result.getMonth() + safeAmount);
    if (unit === 'years') result.setFullYear(result.getFullYear() + safeAmount);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
  }
  return result;
}

export function formatMarketingBadgeDateTime(value: string | null | undefined, language: PortalUiLanguage) {
  const time = timestamp(value);
  if (time === null) return '';
  const locale = { da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU', sv: 'sv-SE', fr: 'fr-FR', pl: 'pl-PL', cs: 'cs-CZ' }[language];
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(time));
}

export function formatMarketingBadgeCountdown(endsAt: string | null | undefined, language: PortalUiLanguage, now = Date.now()) {
  const end = timestamp(endsAt);
  if (end === null || end <= now) return '';
  const minutes = Math.max(1, Math.ceil((end - now) / 60_000));
  if (minutes < 60) return `${minutes} ${t('marketingBadgeCountdownMinutes', language)}`;
  const hours = Math.ceil(minutes / 60);
  if (hours <= 48) return `${hours} ${t('marketingBadgeCountdownHours', language)}`;
  return `${Math.ceil(hours / 24)} ${t('marketingBadgeCountdownDays', language)}`;
}
