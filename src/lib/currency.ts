/**
 * Central currency helper for CRM/dashboard displays.
 *
 * Configurator orders/quotes are stored in their original currency
 * (DKK for Danish, EUR for en/de/it/hu) — see calcConfiguration.ts and
 * isEurLanguage(). To present consistent numbers on dashboards we convert
 * EUR → DKK using the constant below. Keep ALL conversion logic here.
 */
import type { Language } from '@/types/configurator';

export type Currency = 'DKK' | 'EUR';

/** Default exchange rate. Adjust here if you ever need a different rate. */
export const EUR_TO_DKK = 7.46;

export function currencyFromLanguage(lang?: Language | null): Currency {
  if (!lang) return 'DKK';
  return lang === 'da' ? 'DKK' : 'EUR';
}

/** Convert a value in `currency` into DKK using EUR_TO_DKK. */
export function toDkk(value: number, currency: Currency): number {
  if (!Number.isFinite(value)) return 0;
  if (currency === 'EUR') return value * EUR_TO_DKK;
  return value;
}

export function formatDkk(value: number): string {
  return `${Math.round(value).toLocaleString('da-DK')} kr.`;
}

export function formatEur(value: number): string {
  return `${Math.round(value).toLocaleString('da-DK')} EUR`;
}

export function formatMoney(value: number, currency: Currency): string {
  return currency === 'EUR' ? formatEur(value) : formatDkk(value);
}
