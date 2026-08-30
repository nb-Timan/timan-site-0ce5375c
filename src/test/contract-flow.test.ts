import { describe, expect, it } from 'vitest';
import {
  canLeaveContractStep,
  canPrepareContractForSignature,
  buildContractSnapshot,
  EMPTY_CONTRACT_CONFIRMATIONS,
  getCompletedContractStepIds,
  getContractStatus,
  hasRequiredPartyData,
  TIMAN_COMPANY_INFO,
  type ContractConfirmations,
  type ContractFormData,
} from '@/lib/contractFlow';
import { buildDealerContractDraftKey, getCurrentStepId } from '@/lib/dealerContractsService';

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

  it('builds completed steps for server-side persistence', () => {
    expect(getCurrentStepId(0)).toBe('parties');
    expect(getCurrentStepId(99)).toBe('signature');
    expect(getCompletedContractStepIds(4, confirmed)).toEqual([
      'parties',
      'collaboration',
      'timan_responsibility',
      'dealer_responsibility',
    ]);
  });

  it('stores the contract snapshot with Timan data and signature state', () => {
    const signedForm = { ...completeForm, signatureDataUrl: 'data:image/png;base64,test' };
    const snapshot = buildContractSnapshot(signedForm, confirmed);
    expect(snapshot.status).toBe('Signed');
    expect(snapshot.timan.company).toBe(TIMAN_COMPANY_INFO.company);
    expect(snapshot.timan.sellerEmail).toBe('bp@timan.dk');
    expect(snapshot.dealer.name).toBe('Metec Metal Technology Inc');
    expect(snapshot.signatureDataUrl).toBe('data:image/png;base64,test');
  });

  it('uses a stable draft key per seller and dealer account', () => {
    expect(buildDealerContractDraftKey('BP@Timan.dk', ' 11913 ')).toBe('bp@timan.dk:11913');
    expect(buildDealerContractDraftKey('em@timan.dk', '')).toBe('em@timan.dk:manual');
  });
});
