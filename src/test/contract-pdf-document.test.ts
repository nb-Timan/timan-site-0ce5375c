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
  getContractPdfLanguageReadiness,
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
});
