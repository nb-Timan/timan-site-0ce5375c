/**
 * Phase 27 — Payment terms (information only, never affects totals).
 *
 * Single source of truth for the dropdown options, the default value
 * and the localized field label.
 */

import type { Language } from '@/types/configurator';

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

/** Returns a safe, non-empty payment-terms string. Falls back to default when null/empty. */
export function resolvePaymentTerms(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_PAYMENT_TERMS;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_PAYMENT_TERMS;
  return trimmed;
}

export const PAYMENT_TERMS_PERMISSION_KEY = 'can_manage_payment_terms' as const;
