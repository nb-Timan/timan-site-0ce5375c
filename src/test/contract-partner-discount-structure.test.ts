import { describe, expect, it } from 'vitest';
import {
  getContractDiscountStructure,
  getNewContractDiscountDefaults,
  getPartnerTypeDiscountFormPatch,
} from '@/lib/contractCommercialTerms';
import { renderAppendix2Paragraphs } from '@/lib/contractAppendix2';
import { renderGuidedContractSections } from '@/lib/contractSections';
import { buildContractSnapshot, type ContractFormData } from '@/lib/contractFlow';

describe('contract partner discount structure', () => {
  it('uses the agreed defaults for new contracts by partner type', () => {
    expect(getNewContractDiscountDefaults('dealer')).toEqual({
      machineDiscountPct: 25,
      equipmentDiscountPct: 25,
    });
    expect(getNewContractDiscountDefaults('importer')).toEqual({
      machineDiscountPct: 30,
      equipmentDiscountPct: 30,
    });
    expect(getNewContractDiscountDefaults('service_partner')).toEqual({
      sparePartsDiscountPct: 25,
    });
  });

  it('uses fixed dealer and importer terms even when a draft contains stale values', () => {
    expect(getContractDiscountStructure('dealer', {
      machineDiscountPct: 27,
      sparePartsDiscountPct: 24,
      importerDiscountPct: 99,
    })).toEqual({ machineDiscountPct: 25, equipmentDiscountPct: 25 });
    expect(getContractDiscountStructure('importer', {
      machineDiscountPct: 31,
      equipmentDiscountPct: 29,
      sparePartsDiscountPct: 99,
    })).toEqual({ machineDiscountPct: 30, equipmentDiscountPct: 30 });
    expect(getContractDiscountStructure('importer', {
      machineDiscountPct: 31,
      equipmentDiscountPct: 29,
    }, { preserveStoredDiscounts: true })).toEqual({ machineDiscountPct: 31, equipmentDiscountPct: 29 });
    expect(getContractDiscountStructure('service_partner', {
      machineDiscountPct: 99,
      equipmentDiscountPct: 99,
      sparePartsDiscountPct: 23,
    })).toEqual({ sparePartsDiscountPct: 23 });
  });

  it('clears irrelevant draft fields when the partner type changes', () => {
    expect(getPartnerTypeDiscountFormPatch('importer')).toEqual({
      standardMachineDiscountPct: undefined,
      importerDiscountPct: undefined,
      machineDiscountPct: 30,
      equipmentDiscountPct: 30,
      sparePartsDiscountPct: undefined,
    });
    expect(getPartnerTypeDiscountFormPatch('service_partner')).toEqual({
      standardMachineDiscountPct: undefined,
      importerDiscountPct: undefined,
      machineDiscountPct: undefined,
      equipmentDiscountPct: undefined,
      sparePartsDiscountPct: 25,
    });
  });

  it('uses the same type-aware terms in legal text and appendix 2', () => {
    const serviceTerms = getContractDiscountStructure('service_partner', { sparePartsDiscountPct: 25 });
    const discountSection = renderGuidedContractSections({
      companyName: 'Servicepartner A/S',
      partnerType: 'service_partner',
      ...serviceTerms,
    }).find((section) => section.stepId === 'discount_structure');

    expect(discountSection?.blocks[0]?.paragraphs).toContain('Reservedelsrabat: 25%.');
    expect(discountSection?.blocks[0]?.paragraphs?.join(' ')).toContain('autoriserede Timan-forhandler');
    expect(renderAppendix2Paragraphs('importer', {
      machineDiscountPct: 30,
      equipmentDiscountPct: 30,
    })).toEqual(expect.arrayContaining(['Grund rabat: 30%.']));
  });

  it('renders fixed discounts once and keeps the full historical appendix without a summary block', () => {
    const appendix = renderAppendix2Paragraphs('importer', getContractDiscountStructure('importer', {}));
    expect(appendix).toContain('Grund rabat: 30%.');
    expect(appendix).not.toContain('Aftalte rabatter.');
    expect(appendix).not.toContain('Maskinrabat: 30%.');
    expect(appendix).toEqual(expect.arrayContaining([
      '3. Rabat 1. køb flere få flere procenter.',
      '4. Rabat 2. Leveringstid flere procenter.',
      '5. Rabat 3. Egen demonstration - egen salg.',
      '6. Udregning af rabat.',
    ]));
  });

  it('stores semantic terms in new snapshots while retaining legacy fields', () => {
    const form: ContractFormData = {
      partnerType: 'dealer',
      dealerName: 'Forhandler A/S',
      dealerAddress: 'Timanvej 1',
      dealerPostalCode: '9000',
      dealerCity: 'Aalborg',
      dealerCvr: '12345678',
      contactPerson: 'Kontaktperson',
      timanSellerName: 'Timan Salg',
      timanSellerEmail: 'salg@timan.dk',
      contractDate: '2026-09-08',
      machineDiscountPct: 25,
      sparePartsDiscountPct: 25,
    };
    const snapshot = buildContractSnapshot(form, {});

    expect(snapshot.commercialTerms).toMatchObject({
      machineDiscountPct: 25,
      sparePartsDiscountPct: 25,
      standardMachineDiscountPct: 25,
    });
  });
});
