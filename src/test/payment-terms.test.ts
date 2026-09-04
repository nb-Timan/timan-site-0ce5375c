import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_TERMS,
  getPaymentTermsOptionLabel,
  PAYMENT_TERMS_OPTIONS,
  resolvePaymentTerms,
} from '@/lib/paymentTerms';

describe('payment terms', () => {
  it('uses the existing NET21 value as the canonical default', () => {
    expect(DEFAULT_PAYMENT_TERMS).toBe('Standard NET21');
    expect(resolvePaymentTerms(null)).toBe(DEFAULT_PAYMENT_TERMS);
  });

  it('renders the canonical default as 21 days for every portal language', () => {
    expect(getPaymentTermsOptionLabel(DEFAULT_PAYMENT_TERMS, 'da')).toBe('21 dage');
    expect(getPaymentTermsOptionLabel(DEFAULT_PAYMENT_TERMS, 'en')).toBe('21 days');
    expect(getPaymentTermsOptionLabel(DEFAULT_PAYMENT_TERMS, 'de')).toBe('21 Tage');
    expect(getPaymentTermsOptionLabel(DEFAULT_PAYMENT_TERMS, 'it')).toBe('21 giorni');
    expect(getPaymentTermsOptionLabel(DEFAULT_PAYMENT_TERMS, 'hu')).toBe('21 nap');
    expect(getPaymentTermsOptionLabel(DEFAULT_PAYMENT_TERMS, 'sv')).toBe('21 dagar');
    expect(getPaymentTermsOptionLabel(DEFAULT_PAYMENT_TERMS, 'fr')).toBe('21 jours');
    expect(getPaymentTermsOptionLabel(DEFAULT_PAYMENT_TERMS, 'pl')).toBe('21 dni');
    expect(getPaymentTermsOptionLabel(DEFAULT_PAYMENT_TERMS, 'cs')).toBe('21 dnů');
  });

  it('keeps the shared configurator options as the single source of truth', () => {
    expect(PAYMENT_TERMS_OPTIONS).toContain(DEFAULT_PAYMENT_TERMS);
    expect(PAYMENT_TERMS_OPTIONS).toContain('Net 14 days');
    expect(PAYMENT_TERMS_OPTIONS).toContain('Net 30 days');
  });
});
