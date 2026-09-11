/**
 * Central currency helper for CRM/dashboard displays.
 *
 * Configurator orders/quotes are stored in their original currency
 * (DKK for Danish, EUR for en/de/it/hu) — see calcConfiguration.ts and
 * isEurLanguage(). To present consistent numbers on dashboards we convert
 * EUR → DKK using the constant below. Keep ALL conversion logic here.
 */
import { normalizePortalLanguageCode } from '@/lib/portalLanguages';

export type Currency = 'DKK' | 'EUR' | 'SEK';

/** Partner default currencies. This never converts historical commercial data. */
export const PARTNER_CURRENCY_CODES = ['DKK', 'EUR', 'SEK'] as const;
export type PartnerCurrencyCode = (typeof PARTNER_CURRENCY_CODES)[number];

/** Default exchange rate. Adjust here if you ever need a different rate. */
export const EUR_TO_DKK = 7.46;
/**
 * The published price-list workbook uses 66.5 DKK per 100 SEK. Keep display
 * conversion aligned with that existing price-list exchange-rate model.
 */
export const SEK_TO_DKK = 0.665;

export interface DisplayCurrencyInput {
  activeLanguage?: string | null;
  preferredLanguage?: string | null;
  fallbackCurrency?: Currency;
}

/**
 * Resolve the portal display currency without changing source values.
 * The active portal language always wins over the user's saved preference.
 */
export function resolveDisplayCurrency({
  activeLanguage,
  preferredLanguage,
  fallbackCurrency = 'DKK',
}: DisplayCurrencyInput = {}): Currency {
  const language = normalizePortalLanguageCode(activeLanguage)
    ?? normalizePortalLanguageCode(preferredLanguage);

  if (language === 'da') return 'DKK';
  if (language === 'sv') return 'SEK';
  return language ? 'EUR' : fallbackCurrency;
}

/** Backwards-compatible shorthand for code that only has one language value. */
export function currencyFromLanguage(lang?: string | null): Currency {
  return resolveDisplayCurrency({ activeLanguage: lang });
}

/** Convert a value in `currency` into DKK using EUR_TO_DKK. */
export function toDkk(value: number, currency: Currency): number {
  if (!Number.isFinite(value)) return 0;
  if (currency === 'EUR') return value * EUR_TO_DKK;
  if (currency === 'SEK') return value * SEK_TO_DKK;
  return value;
}

/** Convert display values without changing the stored commercial currency. */
export function convertCurrency(value: number, source: Currency, target: Currency): number {
  if (!Number.isFinite(value) || source === target) return Number.isFinite(value) ? value : 0;
  const valueDkk = toDkk(value, source);
  if (target === 'DKK') return valueDkk;
  if (target === 'EUR') return valueDkk / EUR_TO_DKK;
  return valueDkk / SEK_TO_DKK;
}

export function formatDkk(value: number): string {
  return `${Math.round(value).toLocaleString('da-DK')} kr.`;
}

export function formatEur(value: number): string {
  return `${Math.round(value).toLocaleString('da-DK')} EUR`;
}

export function formatSek(value: number): string {
  return `${Math.round(value).toLocaleString('sv-SE')} SEK`;
}

export function formatMoney(value: number, currency: Currency): string {
  if (currency === 'EUR') return formatEur(value);
  if (currency === 'SEK') return formatSek(value);
  return formatDkk(value);
}

export function formatConvertedMoney(value: number, source: Currency, target: Currency): string {
  return formatMoney(convertCurrency(value, source, target), target);
}

export function formatCompactConvertedMoney(value: number, source: Currency, target: Currency): string {
  const converted = convertCurrency(value, source, target);
  const suffix = target === 'DKK' ? 'kr.' : target;
  if (Math.abs(converted) >= 1_000_000) return `${(converted / 1_000_000).toFixed(1)} mio. ${suffix}`;
  if (Math.abs(converted) >= 1_000) return `${Math.round(converted / 1_000)}k ${suffix}`;
  return formatMoney(converted, target);
}
