import { describe, expect, it } from 'vitest';
import {
  canLeaveContractStep,
  canPrepareContractForSignature,
  EMPTY_CONTRACT_CONFIRMATIONS,
  getContractStatus,
  hasRequiredPartyData,
  type ContractConfirmations,
  type ContractFormData,
} from '@/lib/contractFlow';

const completeForm: ContractFormData = {
  dealerName: 'Metec Metal Technology Inc',
  dealerAddress: '20 Terry Fox Dr.',
  dealerPostalCode: 'K0B 1R0',
  dealerCity: 'Vankleek Hill',
  dealerCvr: '12058',
  contactPerson: 'Marc',
  contactTitle: 'Dealer principal',
  timanSellerName: 'Birger Pedersen',
  timanSellerEmail: 'bp@timan.dk',
  timanSellerPhone: '',
  contractDate: '2026-08-29',
  signatureDataUrl: null,
};

const confirmed: ContractConfirmations = {
  collaboration: { confirmed: true, confirmedAt: '2026-08-29T10:00:00.000Z', confirmedBy: 'Birger Pedersen' },
  responsibilities: { confirmed: true, confirmedAt: '2026-08-29T10:05:00.000Z', confirmedBy: 'Birger Pedersen' },
  commercial_terms: { confirmed: true, confirmedAt: '2026-08-29T10:10:00.000Z', confirmedBy: 'Birger Pedersen' },
  full_contract: { confirmed: true, confirmedAt: '2026-08-29T10:15:00.000Z', confirmedBy: 'Birger Pedersen' },
};

describe('contract flow', () => {
  it('requires Timan seller and dealer party data before signature', () => {
    expect(hasRequiredPartyData(completeForm)).toBe(true);
    expect(hasRequiredPartyData({ ...completeForm, timanSellerEmail: '' })).toBe(false);
    expect(hasRequiredPartyData({ ...completeForm, dealerCity: '' })).toBe(false);
  });

  it('blocks leaving steps that need confirmation until confirmed', () => {
    expect(canLeaveContractStep('collaboration', EMPTY_CONTRACT_CONFIRMATIONS)).toBe(false);
    expect(canLeaveContractStep('collaboration', confirmed)).toBe(true);
    expect(canLeaveContractStep('parties', EMPTY_CONTRACT_CONFIRMATIONS)).toBe(true);
  });

  it('only prepares contract for signature after all confirmations are complete', () => {
    expect(canPrepareContractForSignature(completeForm, EMPTY_CONTRACT_CONFIRMATIONS)).toBe(false);
    expect(canPrepareContractForSignature(completeForm, confirmed)).toBe(true);
  });

  it('marks signed only after signature exists on a fully confirmed contract', () => {
    expect(getContractStatus(completeForm, EMPTY_CONTRACT_CONFIRMATIONS)).toBe('Draft');
    expect(getContractStatus(completeForm, confirmed)).toBe('Ready for signature');
    expect(getContractStatus({ ...completeForm, signatureDataUrl: 'data:image/png;base64,test' }, confirmed)).toBe('Signed');
  });
});
