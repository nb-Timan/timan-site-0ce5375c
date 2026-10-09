import { describe, expect, it } from 'vitest';
import {
  CONTRACT_STEPS,
  EMPTY_CONTRACT_CONFIRMATIONS,
  SERVICE_PARTNER_CONTRACT_STEPS,
  buildContractSnapshot,
  canPrepareContractForSignature,
  getContractStepLabel,
  getContractSteps,
  getRequiredContractConfirmationIds,
  getSnapshotContractSteps,
  type ContractConfirmations,
  type ContractFormData,
} from '@/lib/contractFlow';
import { getSnapshotLegalSections } from '@/lib/contractPdfDocument';
import { renderGuidedContractSections } from '@/lib/contractSections';

const servicePartnerForm: ContractFormData = {
  partnerType: 'service_partner',
  dealerName: 'QA Servicepartner ApS',
  dealerAddress: 'Testvej 1',
  dealerPostalCode: '6980',
  dealerCity: 'Tim',
  dealerCountry: 'DK',
  dealerCvr: '12345678',
  contactPerson: 'QA Kontakt',
  contactTitle: 'Servicetekniker',
  timanSellerName: 'QA Seller',
  timanSellerEmail: 'qa@timan.dk',
  timanSellerPhone: '',
  contractDate: '2026-09-24',
  primaryTerritory: {
    country: 'DK',
    wholeCountry: true,
    selectedRegions: [],
    municipalities: [],
    postalCodes: [],
    postalEntries: [],
    postalRanges: [],
  },
  secondaryTerritory: {
    country: 'DK',
    wholeCountry: false,
    selectedRegions: [],
    municipalities: [],
    postalCodes: [],
    postalEntries: [],
    postalRanges: [],
    enabled: false,
  },
  associatedPartners: [],
  serviceHourlyRateDkk: 360,
  paymentTerm: 'net_21',
  sparePartsDiscountPct: 25,
  signatureDataUrl: null,
};

function confirmedServicePartnerSections(): ContractConfirmations {
  const confirmations = structuredClone(EMPTY_CONTRACT_CONFIRMATIONS);
  getRequiredContractConfirmationIds('service_partner').forEach((id) => {
    confirmations[id] = { confirmed: true, confirmedAt: '2026-09-24T10:00:00.000Z', confirmedBy: 'QA Seller' };
  });
  return confirmations;
}

const servicePartnerContext = {
  companyName: servicePartnerForm.dealerName,
  partnerType: servicePartnerForm.partnerType,
  primaryTerritory: servicePartnerForm.primaryTerritory,
  secondaryTerritory: servicePartnerForm.secondaryTerritory,
  serviceHourlyRateDkk: servicePartnerForm.serviceHourlyRateDkk,
  paymentTerm: servicePartnerForm.paymentTerm,
  sparePartsDiscountPct: servicePartnerForm.sparePartsDiscountPct,
};

describe('Servicepartner contract variant', () => {
  it('keeps Dealer and Importer on the existing flow', () => {
    expect(getContractSteps('dealer')).toBe(CONTRACT_STEPS);
    expect(getContractSteps('importer')).toBe(CONTRACT_STEPS);
    expect(CONTRACT_STEPS.map((step) => step.id)).toEqual([
      'parties',
      'purpose_prices_orders_portal',
      'territory',
      'discount_structure',
      'demo_machines',
      'spare_parts_service',
      'marketing',
      'payment_delivery',
      'termination',
      'full_contract',
      'signature',
    ]);
  });

  it('uses the canonical 11-step Servicepartner map', () => {
    expect(SERVICE_PARTNER_CONTRACT_STEPS).toHaveLength(11);
    expect(getContractSteps('service_partner').map((step) => step.id)).toEqual([
      'parties',
      'purpose_prices_orders_portal',
      'territory',
      'machine_sales_referral',
      'spare_parts_service',
      'marketing',
      'sales_service_days',
      'payment_delivery',
      'termination',
      'full_contract',
      'signature',
    ]);
    expect(getContractStepLabel('purpose_prices_orders_portal', 'da', 'service_partner').title).toBe('Samarbejde, priser & portal');
    expect(getContractStepLabel('machine_sales_referral', 'de', 'service_partner').title).toBe('Maschinenverkauf & Vermittlung');
    for (const language of ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const) {
      for (const step of SERVICE_PARTNER_CONTRACT_STEPS) {
        expect(getContractStepLabel(step.id, language, 'service_partner').title).toBeTruthy();
      }
    }
  });

  it('renders only applicable Servicepartner legal sections', () => {
    const sections = renderGuidedContractSections(servicePartnerContext);
    const ids = sections.map((section) => section.stepId);
    const text = JSON.stringify(sections);

    expect(ids).toEqual([
      'purpose_prices_orders_portal',
      'territory',
      'machine_sales_referral',
      'spare_parts_service',
      'marketing',
      'sales_service_days',
      'payment_delivery',
      'termination',
    ]);
    expect(ids).not.toContain('discount_structure');
    expect(ids).not.toContain('demo_machines');
    expect(text).toContain('nærmeste autoriserede Timan-forhandler');
    expect(text).toContain('Servicepartnerens reservedelsrabat er 25%.');
    expect(text).toContain('mindst én servicetekniker');
    expect(text).toContain('Maskiner og udstyr leveres EXW fra fabrikken.');
    expect(text).toContain('netto 21 dage fra fakturadato');
    expect(text).not.toContain('Demonstrationsmaskinerabat');
    expect(text).not.toContain('Rabatstruktur og Bilag 2');
  });

  it('requires only confirmations belonging to the active variant', () => {
    const confirmations = confirmedServicePartnerSections();
    expect(confirmations.discount_structure.confirmed).toBe(false);
    expect(confirmations.demo_machines.confirmed).toBe(false);
    expect(canPrepareContractForSignature(servicePartnerForm, confirmations)).toBe(true);
    confirmations.machine_sales_referral = { confirmed: false };
    expect(canPrepareContractForSignature(servicePartnerForm, confirmations)).toBe(false);
  });

  it('freezes the variant and applicable step ids in new snapshots', () => {
    const confirmations = confirmedServicePartnerSections();
    const legalSections = renderGuidedContractSections(servicePartnerContext);
    const snapshot = buildContractSnapshot(servicePartnerForm, confirmations, { legalSections });

    expect(snapshot.contractVariant).toBe('service_partner');
    expect(snapshot.applicableStepIds).toEqual(SERVICE_PARTNER_CONTRACT_STEPS.map((step) => step.id));
    expect(JSON.stringify(snapshot.legalSections)).toContain('Servicepartnerens reservedelsrabat er 25%.');
    expect(JSON.stringify(snapshot.legalSections)).not.toContain('Demo-maskiner');
    expect(getSnapshotLegalSections(snapshot, 'da')).toEqual(legalSections);
    const englishPdfSections = JSON.stringify(getSnapshotLegalSections(snapshot, 'en'));
    expect(englishPdfSections).toContain('The Service Partner’s spare-parts discount is 25%.');
    expect(englishPdfSections).not.toContain('Demonstration machines');
    expect(englishPdfSections).not.toContain('Discount structure');
  });

  it('keeps pre-variant historical snapshots on the original flow', () => {
    expect(getSnapshotContractSteps('service_partner', {})).toBe(CONTRACT_STEPS);
    const frozenSections = [{
      stepId: 'discount_structure' as const,
      title: 'Historisk rabatstruktur',
      source: 'Historisk kilde',
      blocks: [{ paragraphs: ['Frossen historisk tekst'] }],
    }];
    const snapshot = {
      ...buildContractSnapshot(servicePartnerForm, confirmedServicePartnerSections()),
      applicableStepIds: undefined,
      legalSections: frozenSections,
    };
    expect(getSnapshotLegalSections(snapshot, 'en')).toEqual(frozenSections);
  });

  it('renders Servicepartner draft copy in English and German without Danish leakage', () => {
    const english = JSON.stringify(renderGuidedContractSections(servicePartnerContext, 'en'));
    const german = JSON.stringify(renderGuidedContractSections(servicePartnerContext, 'de'));

    expect(english).toContain('The Service Partner’s spare-parts discount is 25%.');
    expect(english).toContain('Machines and equipment are delivered EXW from the factory.');
    expect(german).toContain('Der Ersatzteilrabatt des Servicepartners beträgt 25%.');
    expect(german).toContain('Maschinen und Ausrüstung werden EXW ab Werk geliefert.');
    expect(english).not.toContain('Servicepartnerens reservedelsrabat');
    expect(german).not.toContain('Maskiner og udstyr leveres');
  });
});
