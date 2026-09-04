/**
 * Phase 27 — Payment terms (information only, never affects totals).
 *
 * Single source of truth for the dropdown options, the default value
 * and the localized field label.
 */

import type { Language } from '@/types/configurator';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

export const DEFAULT_PAYMENT_TERMS = 'Standard NET21';

export const PAYMENT_TERMS_OPTIONS: string[] = [
  'Standard NET21',
  'CBS - Cash before shipment',
  '5 days -2%',
  '8 days -2%',
  '8 days -3%',
  'Net 7 days',
  'Net 14 days',
  'Net 30 days',
  'Net 40 days',
];

const OPTION_LABELS: Record<string, Record<PortalUiLanguage, string>> = {
  'Standard NET21': {
    da: '21 dage', en: '21 days', de: '21 Tage', it: '21 giorni', hu: '21 nap',
    sv: '21 dagar', fr: '21 jours', pl: '21 dni', cs: '21 dnů',
  },
  'CBS - Cash before shipment': {
    da: 'Kontant før levering', en: 'Cash before shipment', de: 'Vorkasse vor Versand', it: 'Pagamento prima della spedizione', hu: 'Fizetés szállítás előtt',
    sv: 'Betalning före leverans', fr: 'Paiement avant expédition', pl: 'Płatność przed wysyłką', cs: 'Platba před odesláním',
  },
  '5 days -2%': {
    da: '5 dage -2 %', en: '5 days -2%', de: '5 Tage -2 %', it: '5 giorni -2%', hu: '5 nap -2%',
    sv: '5 dagar -2 %', fr: '5 jours -2 %', pl: '5 dni -2%', cs: '5 dní -2 %',
  },
  '8 days -2%': {
    da: '8 dage -2 %', en: '8 days -2%', de: '8 Tage -2 %', it: '8 giorni -2%', hu: '8 nap -2%',
    sv: '8 dagar -2 %', fr: '8 jours -2 %', pl: '8 dni -2%', cs: '8 dní -2 %',
  },
  '8 days -3%': {
    da: '8 dage -3 %', en: '8 days -3%', de: '8 Tage -3 %', it: '8 giorni -3%', hu: '8 nap -3%',
    sv: '8 dagar -3 %', fr: '8 jours -3 %', pl: '8 dni -3%', cs: '8 dní -3 %',
  },
  'Net 7 days': {
    da: '7 dage', en: '7 days', de: '7 Tage', it: '7 giorni', hu: '7 nap',
    sv: '7 dagar', fr: '7 jours', pl: '7 dni', cs: '7 dnů',
  },
  'Net 14 days': {
    da: '14 dage', en: '14 days', de: '14 Tage', it: '14 giorni', hu: '14 nap',
    sv: '14 dagar', fr: '14 jours', pl: '14 dni', cs: '14 dnů',
  },
  'Net 30 days': {
    da: '30 dage', en: '30 days', de: '30 Tage', it: '30 giorni', hu: '30 nap',
    sv: '30 dagar', fr: '30 jours', pl: '30 dni', cs: '30 dnů',
  },
  'Net 40 days': {
    da: '40 dage', en: '40 days', de: '40 Tage', it: '40 giorni', hu: '40 nap',
    sv: '40 dagar', fr: '40 jours', pl: '40 dni', cs: '40 dnů',
  },
};

const LABEL: Partial<Record<Language, string>> = {
  da: 'Betalingsbetingelser',
  en: 'Payment terms',
  de: 'Zahlungsbedingungen',
  it: 'Termini di pagamento',
  hu: 'Fizetési feltételek',
};

export function getPaymentTermsLabel(lang: Language): string {
  return LABEL[lang] ?? LABEL.en!;
}

/** Localized display text while preserving canonical stored option values. */
export function getPaymentTermsOptionLabel(value: string, lang: PortalUiLanguage): string {
  return OPTION_LABELS[value]?.[lang] ?? value;
}

/** Returns a safe, non-empty payment-terms string. Falls back to default when null/empty. */
export function resolvePaymentTerms(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_PAYMENT_TERMS;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_PAYMENT_TERMS;
  return trimmed;
}

export const PAYMENT_TERMS_PERMISSION_KEY = 'can_manage_payment_terms' as const;
