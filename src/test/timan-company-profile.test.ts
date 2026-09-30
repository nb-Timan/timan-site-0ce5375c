import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { t } from '@/data/translations';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { buildQuoteContentSummary } from '@/lib/quoteContentSummary';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { configuratorPricingSignature, createConfiguratorPricingSnapshot } from '@/lib/configuratorPricing';
import { buildSupportCompanyInfoContext } from '@/lib/supportCompanyInfo';
import { TIMAN_COMPANY_INFO } from '@/lib/contractFlow';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { CalcResult } from '@/types/configurator';
import {
  TIMAN_COMPANY_PROFILE,
  timanCompanyAddress,
  timanCompanyLegalLine,
  timanCompanyPostalCity,
} from '../../supabase/functions/_shared/timanCompanyProfile';

const expected = {
  companyName: 'Timan A/S',
  street: 'Osvald Pedersens Vej 2A-D',
  postalCode: '6980',
  city: 'Tim',
  country: 'Danmark',
  cvr: '27609627',
};

describe('canonical Timan company profile', () => {
  it('owns the one canonical legal identity and keeps the contract adapter in parity', () => {
    expect(TIMAN_COMPANY_PROFILE).toEqual(expected);
    expect(timanCompanyPostalCity()).toBe('6980 Tim');
    expect(timanCompanyAddress()).toBe('Osvald Pedersens Vej 2A-D, 6980 Tim');
    expect(timanCompanyLegalLine()).toBe('Timan A/S · Osvald Pedersens Vej 2A-D · 6980 Tim · Danmark · CVR 27609627');
    expect(TIMAN_COMPANY_INFO).toEqual({
      company: expected.companyName,
      cvr: expected.cvr,
      address: expected.street,
      postalCity: `${expected.postalCode} ${expected.city}`,
      country: expected.country,
    });
  });

  it('keeps customer identity separate in quote and order document data', () => {
    const customerAddress = 'Kundevej 99';
    const baseState = {
      ...createEmptyConfiguratorState(),
      firmanavn: 'Kunde A/S',
      address: customerAddress,
      postalCode: '9000',
      city: 'Aalborg',
      country: 'Danmark',
    };
    const pricingSnapshot = createConfiguratorPricingSnapshot(baseState);
    pricingSnapshot.signature = configuratorPricingSignature(baseState);
    pricingSnapshot.totals = { subtotal: 0, totalDiscount: 0, finalPrice: 0 };
    const state = { ...baseState, pricingSnapshot };
    expect(buildQuoteContentSummary(state).issuer).toEqual(expected);
    expect(buildSubmittedOrderDocument(state).issuer).toEqual(expected);
    expect(state.address).toBe(customerAddress);
  });

  it('renders the canonical identity in quote and order PDFs without the obsolete address', () => {
    const state = { ...createEmptyConfiguratorState(), firmanavn: 'Kunde A/S', address: 'Kundevej 99' };
    const calcResult: CalcResult = {
      lineItems: [], subtotal: 0, totalDiscount: 0, currentPrice: 0, totalPct: 0, qtyPct: 0, discountDetails: [],
    };
    for (const flowType of ['quote', 'order'] as const) {
      const pdf = buildConfiguratorPdf({
        jsPDF, state: { ...state, flowType }, calcResult, flowType,
        quoteNumber: flowType === 'quote' ? 'T-QA' : null,
        orderNumber: flowType === 'order' ? 'O-QA' : null,
        showPrices: true, uiLanguage: 'da', contentLanguage: 'da',
        T: key => t(key, 'da'), TC: key => t(key, 'da'),
      });
      const output = pdf.output();
      expect(output).toContain(expected.street);
      expect(output).toContain(expected.cvr);
      expect(output).not.toContain('Fabriksvej 13');
    }
  });

  it.each([
    ['da', 'Hvad er Timans adresse?'],
    ['en', "What is Timan's address?"],
    ['de', 'Wie lautet die Adresse von Timan?'],
    ['it', "Qual è l'indirizzo di Timan?"],
    ['hu', 'Mi a Timan címe?'],
    ['sv', 'Vad är Timans adress?'],
    ['fr', "Quelle est l'adresse de Timan ?"],
    ['pl', 'Jaki jest adres Timan?'],
    ['cs', 'Jaká je adresa Timan?'],
  ] as Array<[PortalUiLanguage, string]>)('provides the same legal values to Support in %s', (language, question) => {
    const context = buildSupportCompanyInfoContext(question, language);
    expect(context?.source).toBe('canonical_company_profile');
    expect(context?.company_profile).toEqual(expected);
    expect(context?.topics).toContain('address');
  });

  it('grounds Timan CVR questions in the same canonical profile', () => {
    const context = buildSupportCompanyInfoContext("Hvad er Timan A/S' CVR-nummer?", 'da');
    expect(context?.topics).toContain('cvr');
    expect(context?.company_profile.cvr).toBe('27609627');
  });

  it('wires Portal, mail payloads, and server-side Support to the shared profile', () => {
    const portal = readFileSync('src/pages/PortalAreaPage.tsx', 'utf8');
    const configurator = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    const assistant = readFileSync('src/lib/assistantCanonicalActions.ts', 'utf8');
    const support = readFileSync('supabase/functions/support-chat/index.ts', 'utf8');
    expect(portal).toContain('TIMAN_COMPANY_PROFILE.companyName');
    expect(portal).toContain("t('labelCvr', uiLanguage)");
    expect(configurator.match(/sender_company: contentSummary\.issuer/g)).toHaveLength(2);
    expect(assistant).toContain('sender_company: summary.issuer');
    expect(support).toContain("from '../_shared/timanCompanyProfile.ts'");
    expect(support).toContain("structuredConfidence('CANONICAL_COMPANY_PROFILE')");
    expect(support).toContain('company_profile: TIMAN_COMPANY_PROFILE');
  });
});
