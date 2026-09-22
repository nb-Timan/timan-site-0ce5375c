import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYMENT_TERMS,
  getPaymentTermsDocumentValue,
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

  it('maps every supported NET term to the canonical confirmation value', () => {
    expect(getPaymentTermsDocumentValue('Standard NET21')).toBe('NET21');
    expect(getPaymentTermsDocumentValue('Net 14 days')).toBe('NET14');
    expect(getPaymentTermsDocumentValue('Net 7 days')).toBe('NET7');
    expect(getPaymentTermsDocumentValue('Net 30 days')).toBe('NET30');
    expect(getPaymentTermsDocumentValue('Net 40 days')).toBe('NET40');
    expect(getPaymentTermsDocumentValue('CBS - Cash before shipment')).toBe('CBS');
    expect(getPaymentTermsDocumentValue('5 days -2%')).toBe('5 days -2%');
  });

  it('carries the selected term into the shared offer and order mail summary', () => {
    expect(buildQuoteContentSummary({ ...createEmptyConfiguratorState(), paymentTerms: 'Net 14 days' }).payment_terms).toBe('NET14');
    expect(buildQuoteContentSummary({ ...createEmptyConfiguratorState(), paymentTerms: 'Standard NET21' }).payment_terms).toBe('NET21');
    expect(buildQuoteContentSummary({ ...createEmptyConfiguratorState(), paymentTerms: 'Net 30 days' }).payment_terms).toBe('NET30');
  });

  it('does not let an asynchronously loaded dealer default overwrite an explicit or restored term', () => {
    const page = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    expect(page).toContain('const paymentTermsExplicitRef = useRef(false);');
    expect(page).toContain('terms.paymentTerms !== null && !paymentTermsExplicitRef.current');
    expect(page).toContain('paymentTermsExplicitRef.current = true;');
    expect(page).toContain('paymentTermsExplicitRef.current = Boolean(saved.state_json.paymentTerms?.trim());');
  });

  it('persists an existing draft before the submitted snapshot is frozen', () => {
    const page = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    const submitFlow = page.slice(page.indexOf('const downloadPdfInner = async'));
    const lockCheck = submitFlow.indexOf('const lockCheck = await fetchIsOrderSubmitted(activeCaseId);');
    const save = submitFlow.indexOf('const preSubmissionSave = await updateConfiguration(activeCaseId, state');
    const flowUpdate = submitFlow.indexOf("updateConfigurationFlowType(activeCaseId, 'order'");
    const submit = submitFlow.indexOf('await markAsOrderSubmitted(activeCaseId');

    expect(lockCheck).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(lockCheck);
    expect(flowUpdate).toBeGreaterThan(save);
    expect(submit).toBeGreaterThan(flowUpdate);
  });
});
