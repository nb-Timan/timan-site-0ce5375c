import { describe, expect, it } from 'vitest';
import {
  buildContractSnapshot,
  EMPTY_CONTRACT_CONFIRMATIONS,
  type ContractFormData,
} from '@/lib/contractFlow';
import {
  createEmptyContractTerritoryArea,
  createEmptySecondaryContractTerritoryArea,
} from '@/lib/contractTerritory';
import {
  buildContractPdfFileName,
  formatContractPdfPreflightIssues,
  getContractPdfLanguageReadiness,
  getContractPdfPreflightIssues,
  getSnapshotLegalSections,
} from '@/lib/contractPdfDocument';

const form: ContractFormData = {
  contractLanguage: 'da',
  partnerType: 'dealer',
  dealerName: 'WJ Maskinservice A/S',
  dealerAddress: 'Bøgildsmindevej 9',
  dealerPostalCode: '9400',
  dealerCity: 'Nørresundby',
  dealerCountry: 'Danmark',
  dealerCvr: '28849478',
  contactPerson: 'Morten Juel Jensen',
  contactTitle: 'Direktør',
  timanSellerName: 'Esben Madsen',
  timanSellerEmail: 'em@timan.dk',
  timanSellerPhone: '',
  contractDate: '2026-09-08',
  primaryTerritory: createEmptyContractTerritoryArea(),
  secondaryTerritory: createEmptySecondaryContractTerritoryArea(),
  serviceHourlyRateDkk: 360,
  paymentTerm: 'net_21',
  signatureDataUrl: null,
};

describe('contract PDF document model', () => {
  it('uses the canonical legal section source for the locked snapshot', () => {
    const snapshot = buildContractSnapshot(form, EMPTY_CONTRACT_CONFIRMATIONS, { contractNumber: 'DC-0809-2026' });
    const sections = getSnapshotLegalSections(snapshot);

    expect(sections.some((section) => section.stepId === 'spare_parts_service')).toBe(true);
    expect(sections.some((section) => section.blocks.some((block) => block.heading === 'Redskaber fra tredjepartsproducenter'))).toBe(true);
    expect(snapshot.contractLanguage).toBe('da');
  });

  it('uses a portable professional contract filename', () => {
    expect(buildContractPdfFileName('WJ Maskinservice A/S', 'DC-0809-2026'))
      .toBe('Timan-Partneraftale-WJ-Maskinservice-A-S-DC-0809-2026.pdf');
  });

  it('allows final legal generation only for a reviewed language template', () => {
    expect(getContractPdfLanguageReadiness('da').productionReady).toBe(true);
    expect(getContractPdfLanguageReadiness('en').productionReady).toBe(true);
    expect(getContractPdfLanguageReadiness('de').productionReady).toBe(true);
  });

  it('renders approved English and German legal sections from the same locked business snapshot', () => {
    const snapshot = buildContractSnapshot(form, EMPTY_CONTRACT_CONFIRMATIONS, { contractNumber: 'DC-0809-2026' });
    const english = JSON.stringify(getSnapshotLegalSections(snapshot, 'en'));
    const german = JSON.stringify(getSnapshotLegalSections(snapshot, 'de'));

    expect(english).toContain('1. Purpose');
    expect(german).toContain('1. Zweck');
    expect(english).not.toContain('Juridisk oversættelse af denne kontraktskabelon afventer godkendelse.');
    expect(german).not.toContain('Juridisk oversættelse af denne kontraktskabelon afventer godkendelse.');
  });

  it('keeps approved appendix wording localized for English and German PDFs', async () => {
    const { renderAppendix2Paragraphs } = await import('@/lib/contractAppendix2');

    expect(renderAppendix2Paragraphs('dealer', undefined, 'en')[0]).toBe('Appendix 2: Discount.');
    expect(renderAppendix2Paragraphs('dealer', undefined, 'de')[0]).toBe('Anhang 2: Rabatt.');
  });

  it('uses the existing legal block headings as the single source for PDF headings', () => {
    const snapshot = buildContractSnapshot(form, EMPTY_CONTRACT_CONFIRMATIONS, { contractNumber: 'DC-0809-2026' });
    const headings = getSnapshotLegalSections(snapshot, 'da')
      .flatMap((section) => section.blocks.map((block) => block.heading))
      .filter((heading): heading is string => Boolean(heading));

    expect(headings).toContain('Bilag 3: Området');
    expect(headings).not.toContain('Bilag 3 -');
    expect(new Set(headings).size).toBe(headings.length);
  });

  it('blocks PDF generation with clear localized preflight feedback when canonical data is missing', () => {
    const snapshot = buildContractSnapshot({
      ...form,
      dealerName: '',
      contactPerson: '',
      timanSellerEmail: '',
      paymentTerm: '',
    }, EMPTY_CONTRACT_CONFIRMATIONS);
    const issues = getContractPdfPreflightIssues({
      snapshot: {
        ...snapshot,
        paymentTerms: { ...snapshot.paymentTerms, paymentTerm: '' },
      },
      contractNumber: '',
      dealerAccountNumber: '',
    });

    expect(issues).toEqual(expect.arrayContaining([
      'contract_number',
      'dealer_account_number',
      'partner_name',
      'partner_contact',
      'timan_contact',
      'payment_terms',
    ]));
    expect(formatContractPdfPreflightIssues(['partner_name', 'payment_terms'], 'da'))
      .toBe('PDF kan ikke genereres. Mangler: partnernavn, betalingsbetingelser.');
    expect(formatContractPdfPreflightIssues(['partner_name'], 'de'))
      .toBe('PDF kann nicht erstellt werden. Fehlend: Partnername.');
  });
});
