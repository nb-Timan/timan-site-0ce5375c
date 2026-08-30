import { describe, expect, it } from 'vitest';
import {
  canLeaveContractStep,
  canPrepareContractForSignature,
  buildContractSnapshot,
  EMPTY_CONTRACT_CONFIRMATIONS,
  CONTRACT_STEPS,
  CONTRACT_APPENDIX_LABELS,
  getCompletedContractStepIds,
  getContractStepLabel,
  getContractStatus,
  hasRequiredPartyData,
  TIMAN_COMPANY_INFO,
  type ContractConfirmations,
  type ContractFormData,
} from '@/lib/contractFlow';
import { APPENDIX_2_EXAMPLE_LINES, APPENDIX_2_PARAGRAPHS } from '@/lib/contractAppendix2';
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
      'commercial_terms',
      'dealer_responsibility',
    ]);
  });

  it('uses the new guided contract step order and Danish labels', () => {
    expect(CONTRACT_STEPS.map((step) => step.id)).toEqual([
      'parties',
      'collaboration',
      'commercial_terms',
      'dealer_responsibility',
      'timan_responsibility',
      'full_contract',
      'signature',
    ]);
    expect(CONTRACT_STEPS.map((step) => getContractStepLabel(step.id, 'da').title)).toEqual([
      'Oplysninger',
      'Salgsområder og samarbejde',
      'Rabatstruktur (Bilag)',
      'Salgs- og leveringsbetingelser',
      'Service (Bilag)',
      'Gennemlæs',
      'Underskrift',
    ]);
  });

  it('defines guided contract step labels for every portal language', () => {
    const languages = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;
    for (const language of languages) {
      expect(CONTRACT_APPENDIX_LABELS[language]).toBeTruthy();
      for (const step of CONTRACT_STEPS) {
        expect(getContractStepLabel(step.id, language).title).toBeTruthy();
        expect(getContractStepLabel(step.id, language).shortTitle).toBeTruthy();
      }
    }
  });

  it('marks the discount and service steps as appendices', () => {
    expect(CONTRACT_STEPS.find((step) => step.id === 'commercial_terms')?.appendix).toBe(true);
    expect(CONTRACT_STEPS.find((step) => step.id === 'timan_responsibility')?.appendix).toBe(true);
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

  it('keeps appendix 2 discount text verbatim', () => {
    expect(APPENDIX_2_PARAGRAPHS).toEqual([
      'Bilag 2: Rabat.',
      '1. Målet med rabattstrukturen.',
      'Vores mål med rabattstrukturen er at sikre en ensartet og fair behandling af alle forhandlere med gensidig respekt, men samtidig belønne de forhandler der yder en ekstra instans.',
      '2. Grund rabatten.',
      'Grund rabat: 25%.',
      'Demonstrationsmaskine rabat: 25%-10%',
      '3. Rabat 1. køb flere få flere procenter.',
      'Timan giver mulighed for at få ekstra rabat som skemaet herunder viser, hvis man køber flere maskiner pr. ordre.',
      'Hvis flere af samme slags redskab ønskes på samme ordre, giver redskabsrabaten standartrabat 25%.',
      '4. Rabat 2. Leveringstid flere procenter.',
      'Er leveringstiden over 3mdr. fra ordren bliver afgivet, vil man kunne opnå ekstra rabat.',
      'Der ydes ikke bestillingsrabat på demomaskiner.',
      '5. Rabat 3. Egen demonstration - egen salg.',
      'Opnår forhandleren et salg uden Timan har været involveret i en demonstration, til skønnes dette.',
      'Demorabatten ydes på grundmaskinen eksklusivt udstyr.',
      'Demonstrationsrabatten gives som en kreditnota, der modregnes ved fremtidige køb hos Timan.',
      '6. Udregning af rabat.',
      'Rabatten udregnes ud fra kombinerede rabatter eller efterfølgende rabatter. Og udregnes altid som kæderabat: Grundrabatten + Rabat 1 + Rabat 2 + Rabat 3 (Grund rabatten + Flere stk. + Leveringstid + Demonstrations rabat)',
    ]);
    expect(APPENDIX_2_EXAMPLE_LINES[0]).toBe('Den maximale rabat, som kan opnåes på en maskine og redskaber er: 25% + 4% + 2% = 29,44 %');
    expect(APPENDIX_2_EXAMPLE_LINES[0]).not.toContain('31');
    expect(APPENDIX_2_EXAMPLE_LINES[1]).toBe('Når garantiregistreringen er gennemført, vil beløbet på 3.100 kr. blive udstedt som en kreditnota, der kan anvendes ved fremtidige køb hos Timan.');
  });
});
