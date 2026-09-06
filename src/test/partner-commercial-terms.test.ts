import { describe, expect, it } from 'vitest';
import {
  contractPaymentTermToConfiguratorValue,
  resolveConfiguratorContractTerms,
  resolveContractCommercialTerms,
} from '@/lib/contractCommercialTerms';
import { buildContractSnapshot, EMPTY_CONTRACT_CONFIRMATIONS, type ContractFormData } from '@/lib/contractFlow';
import { createEmptyContractTerritoryArea, createEmptySecondaryContractTerritoryArea } from '@/lib/contractTerritory';

describe('partner commercial terms', () => {
  it('normalizes approved contract discounts to safe percentages', () => {
    expect(resolveContractCommercialTerms({
      standardMachineDiscountPct: 25,
      importerDiscountPct: 30,
      sparePartsDiscountPct: 30,
    })).toEqual({
      standardMachineDiscountPct: 25,
      importerDiscountPct: 30,
      sparePartsDiscountPct: 30,
    });
    expect(resolveContractCommercialTerms({ standardMachineDiscountPct: 120 })).toMatchObject({
      standardMachineDiscountPct: 100,
    });
  });

  it('maps a dealer to its machine baseline and the existing configurator payment value', () => {
    expect(resolveConfiguratorContractTerms({
      customer_type: 'Forhandler',
      standard_machine_discount_pct: 25,
      payment_terms: 'Standard NET21',
    })).toEqual({ partnerType: 'dealer', baseDiscountPct: 25, paymentTerms: 'Standard NET21' });
    expect(contractPaymentTermToConfiguratorValue('net_21')).toBe('Standard NET21');
  });

  it('maps an importer to its importer baseline without using labels as the rule', () => {
    expect(resolveConfiguratorContractTerms({
      customer_type: 'importer',
      customer_type_label: 'Dealer',
      importer_discount_pct: 30,
      standard_machine_discount_pct: 25,
      payment_terms: 'Net 30 days',
    })).toEqual({ partnerType: 'importer', baseDiscountPct: 30, paymentTerms: 'Net 30 days' });
  });

  it('keeps the approved commercial terms in the contract snapshot', () => {
    const form: ContractFormData = {
      partnerType: 'dealer', dealerName: 'Example Dealer', dealerAddress: '', dealerPostalCode: '', dealerCity: '', dealerCvr: '',
      contactPerson: '', contactTitle: '', timanSellerName: '', timanSellerEmail: '', timanSellerPhone: '', contractDate: '2026-09-06',
      primaryTerritory: createEmptyContractTerritoryArea(), secondaryTerritory: createEmptySecondaryContractTerritoryArea(),
      serviceHourlyRateDkk: 0, paymentTerm: 'net_21', standardMachineDiscountPct: 25, importerDiscountPct: 30,
      sparePartsDiscountPct: 30, signatureDataUrl: null,
    };
    expect(buildContractSnapshot(form, EMPTY_CONTRACT_CONFIRMATIONS).commercialTerms).toEqual({
      standardMachineDiscountPct: 25,
      importerDiscountPct: 30,
      sparePartsDiscountPct: 30,
    });
  });
});
