import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_TERMS,
  getPaymentTermsOptionLabel,
  PAYMENT_TERMS_OPTIONS,
  resolvePaymentTerms,
} from '@/lib/paymentTerms';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';

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

  it('carries the selected term into the shared mail summary without a fallback', () => {
    expect(buildQuoteContentSummary({ ...createEmptyConfiguratorState(), paymentTerms: 'Net 14 days' }).payment_terms).toBe('Net 14 days');
    expect(buildQuoteContentSummary({ ...createEmptyConfiguratorState(), paymentTerms: 'Net 30 days' }).payment_terms).toBe('Net 30 days');
  });

  it('does not let an asynchronously loaded dealer default overwrite an explicit or restored term', () => {
    const page = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    expect(page).toContain('const paymentTermsExplicitRef = useRef(false);');
    expect(page).toContain('terms.paymentTerms !== null && !paymentTermsExplicitRef.current');
    expect(page).toContain('paymentTermsExplicitRef.current = true;');
    expect(page).toContain('paymentTermsExplicitRef.current = Boolean(saved.state_json.paymentTerms?.trim());');
  });
});
