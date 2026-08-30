import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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
  normalizeContractConfirmations,
  TIMAN_COMPANY_INFO,
  type ContractConfirmations,
  type ContractFormData,
} from '@/lib/contractFlow';
import { GUIDED_CONTRACT_SECTIONS } from '@/lib/contractSections';
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
  purpose_prices_orders_portal: { confirmed: true, confirmedAt: '2026-08-29T10:00:00.000Z', confirmedBy: 'Birger Pedersen' },
  territory: { confirmed: true, confirmedAt: '2026-08-29T10:02:00.000Z', confirmedBy: 'Birger Pedersen' },
  discount_structure: { confirmed: true, confirmedAt: '2026-08-29T10:04:00.000Z', confirmedBy: 'Birger Pedersen' },
  demo_machines: { confirmed: true, confirmedAt: '2026-08-29T10:06:00.000Z', confirmedBy: 'Birger Pedersen' },
  spare_parts_service: { confirmed: true, confirmedAt: '2026-08-29T10:08:00.000Z', confirmedBy: 'Birger Pedersen' },
  marketing: { confirmed: true, confirmedAt: '2026-08-29T10:10:00.000Z', confirmedBy: 'Birger Pedersen' },
  sales_service_days: { confirmed: true, confirmedAt: '2026-08-29T10:12:00.000Z', confirmedBy: 'Birger Pedersen' },
  payment_delivery: { confirmed: true, confirmedAt: '2026-08-29T10:14:00.000Z', confirmedBy: 'Birger Pedersen' },
  termination: { confirmed: true, confirmedAt: '2026-08-29T10:16:00.000Z', confirmedBy: 'Birger Pedersen' },
  full_contract: { confirmed: true, confirmedAt: '2026-08-29T10:15:00.000Z', confirmedBy: 'Birger Pedersen' },
};

describe('contract flow', () => {
  it('requires Timan seller and dealer party data before signature', () => {
    expect(hasRequiredPartyData(completeForm)).toBe(true);
    expect(hasRequiredPartyData({ ...completeForm, timanSellerEmail: '' })).toBe(false);
    expect(hasRequiredPartyData({ ...completeForm, dealerCity: '' })).toBe(false);
  });

  it('blocks leaving steps that need confirmation until confirmed', () => {
    expect(canLeaveContractStep('territory', EMPTY_CONTRACT_CONFIRMATIONS)).toBe(false);
    expect(canLeaveContractStep('territory', confirmed)).toBe(true);
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
      'purpose_prices_orders_portal',
      'territory',
      'discount_structure',
    ]);
  });

  it('uses the new guided contract step order and Danish labels', () => {
    expect(CONTRACT_STEPS.map((step) => step.id)).toEqual([
      'parties',
      'purpose_prices_orders_portal',
      'territory',
      'discount_structure',
      'demo_machines',
      'spare_parts_service',
      'marketing',
      'sales_service_days',
      'payment_delivery',
      'termination',
      'full_contract',
      'signature',
    ]);
    expect(CONTRACT_STEPS.map((step) => getContractStepLabel(step.id, 'da').title)).toEqual([
      'Oplysninger',
      'Formål, priser, ordre og forhandlerportal',
      'Område og Bilag 3',
      'Rabatstruktur og Bilag 2',
      'Demo-maskiner',
      'Reservedele og service',
      'Marketing',
      'Salgs- og servicedage og Bilag 1',
      'Betaling og levering',
      'Opsigelse og afsluttende vilkår',
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
    expect(CONTRACT_STEPS.find((step) => step.id === 'discount_structure')?.appendix).toBe(true);
    expect(CONTRACT_STEPS.find((step) => step.id === 'sales_service_days')?.appendix).toBe(true);
    expect(CONTRACT_STEPS.find((step) => step.id === 'territory')?.appendix).toBe(true);
    expect(CONTRACT_STEPS.find((step) => step.id === 'payment_delivery')?.appendix).toBe(true);
  });

  it('keeps the appendix 2 web diagram constrained to the contract width', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    const start = source.indexOf('function Appendix2DiscountSection');
    const end = source.indexOf('function ProgressSteps');
    const appendixSection = source.slice(start, end);

    expect(appendixSection).toContain('max-w-full');
    expect(appendixSection).toContain('min-w-0');
    expect(appendixSection).toContain('overflow-hidden');
    expect(appendixSection).not.toContain('overflow-x-auto');
    expect(appendixSection).not.toContain('min-w-[980px]');
  });

  it('does not duplicate the legal document box on the full appendix 2 step', () => {
    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');

    expect(source).not.toContain('Læs hele afsnittet');
    expect(source).toContain("const fullContract = stepId === 'full_contract';");
  });

  it('maps old draft confirmations into the new section ids', () => {
    const legacy = normalizeContractConfirmations({
      collaboration: { confirmed: true, confirmedAt: '2026-08-29T10:00:00.000Z', confirmedBy: 'Birger Pedersen' },
      responsibilities: { confirmed: true, confirmedAt: '2026-08-29T10:05:00.000Z', confirmedBy: 'Birger Pedersen' },
      commercial_terms: { confirmed: true, confirmedAt: '2026-08-29T10:10:00.000Z', confirmedBy: 'Birger Pedersen' },
      full_contract: { confirmed: true, confirmedAt: '2026-08-29T10:15:00.000Z', confirmedBy: 'Birger Pedersen' },
    });

    expect(legacy.purpose_prices_orders_portal.confirmed).toBe(true);
    expect(legacy.territory.confirmed).toBe(true);
    expect(legacy.discount_structure.confirmed).toBe(true);
    expect(legacy.demo_machines.confirmed).toBe(true);
    expect(legacy.sales_service_days.confirmed).toBe(true);
    expect(legacy.payment_delivery.confirmed).toBe(true);
  });

  it('places appendices in the requested guided steps', () => {
    expect(GUIDED_CONTRACT_SECTIONS.map((section) => section.stepId)).toEqual([
      'purpose_prices_orders_portal',
      'territory',
      'discount_structure',
      'demo_machines',
      'spare_parts_service',
      'marketing',
      'sales_service_days',
      'payment_delivery',
      'termination',
    ]);
    expect(GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'territory')?.source).toContain('Bilag 3');
    expect(GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'discount_structure')?.source).toContain('Bilag 2');
    expect(GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'sales_service_days')?.source).toContain('Bilag 1');
    expect(GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'payment_delivery')?.source).toContain('Bilag 4');
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
