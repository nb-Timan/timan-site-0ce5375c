import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  canLeaveContractStep,
  canPrepareContractForSignature,
  buildContractSnapshot,
  canTransitionContractStatus,
  EMPTY_CONTRACT_CONFIRMATIONS,
  CONTRACT_STATUS_LABELS_DA,
  CONTRACT_STEPS,
  CONTRACT_APPENDIX_LABELS,
  getContractWorkflowStatusLabel,
  getCompletedContractStepIds,
  getContractStepLabel,
  getContractStatus,
  hasReachedContractStatus,
  hasRequiredPartyData,
  normalizeContractConfirmations,
  TIMAN_COMPANY_INFO,
  type ContractConfirmations,
  type ContractFormData,
} from '@/lib/contractFlow';
import {
  GUIDED_CONTRACT_SECTIONS,
  getGuidedContractDisplayHeading,
  renderGuidedContractSections,
  shouldHideGuidedContractUiText,
  type GuidedContractSection,
} from '@/lib/contractSections';
import { APPENDIX_2_EXAMPLE_LINES, APPENDIX_2_PARAGRAPHS, renderAppendix2Paragraphs } from '@/lib/contractAppendix2';
import { buildDealerContractDraftKey, getCurrentStepId } from '@/lib/dealerContractsService';
import {
  CONTRACT_PARTNER_TYPE_LABELS,
  CONTRACT_PARTNER_TYPES,
  inferContractPartnerTypeFromDealerAccount,
} from '@/lib/contractPartnerTerms';

const completeForm: ContractFormData = {
  partnerType: 'dealer',
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

function getVisibleGuidedUiText(section: GuidedContractSection) {
  const sectionContext = `${section.title} ${section.source}`;
  return section.blocks.flatMap((block) => {
    const heading = block.heading ? getGuidedContractDisplayHeading(block.heading) : '';
    return [
      heading && !shouldHideGuidedContractUiText(heading, sectionContext) ? heading : null,
      ...(block.paragraphs ?? []).filter((paragraph) => !shouldHideGuidedContractUiText(paragraph, sectionContext)),
      ...(block.bullets ?? []).filter((bullet) => !shouldHideGuidedContractUiText(bullet, sectionContext)),
    ].filter(Boolean);
  }).join('\n');
}

describe('contract flow', () => {
  it('requires Timan seller and dealer party data before signature', () => {
    expect(hasRequiredPartyData(completeForm)).toBe(true);
    expect(hasRequiredPartyData({ ...completeForm, partnerType: '' })).toBe(false);
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

  it('defines the allowed contract partner labels for every portal language without dealer customers', () => {
    const languages = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'] as const;
    expect(CONTRACT_PARTNER_TYPES).toEqual(['dealer', 'importer', 'service_partner']);
    for (const partnerType of CONTRACT_PARTNER_TYPES) {
      for (const language of languages) {
        expect(CONTRACT_PARTNER_TYPE_LABELS[partnerType][language]).toBeTruthy();
      }
    }
    expect(JSON.stringify(CONTRACT_PARTNER_TYPE_LABELS).toLowerCase()).not.toContain('forhandlerkunde');
    expect(JSON.stringify(CONTRACT_PARTNER_TYPE_LABELS).toLowerCase()).not.toContain('dealer customer');
  });

  it('infers contract partner type from existing dealer account type fields only when safe', () => {
    expect(inferContractPartnerTypeFromDealerAccount({ customer_type: 'Forhandler' })).toBe('dealer');
    expect(inferContractPartnerTypeFromDealerAccount({ customer_type_label: 'Importør' })).toBe('importer');
    expect(inferContractPartnerTypeFromDealerAccount({ dealer_type: 'Service Partner' })).toBe('service_partner');
    expect(inferContractPartnerTypeFromDealerAccount({ customer_type: 'Forhandlerkunde' })).toBeNull();
    expect(inferContractPartnerTypeFromDealerAccount({ customer_type: 'Slutkunde' })).toBeNull();
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

  it('uses neutral guided contract source references without changing official document titles', () => {
    expect(GUIDED_CONTRACT_SECTIONS.map((section) => section.source)).toEqual([
      'Kontrakt, punkt 1, 2 og 10',
      'Kontrakt, punkt 3 + Bilag 3',
      'Kontrakt, punkt 4 + Bilag 2',
      'Kontrakt, punkt 5',
      'Kontrakt, punkt 6',
      'Kontrakt, punkt 7 og 7.1',
      'Kontrakt, punkt 8 + Bilag 1',
      'Kontrakt, punkt 9 + Bilag 4',
      'Kontrakt, punkt 11',
    ]);
    expect(JSON.stringify(GUIDED_CONTRACT_SECTIONS)).not.toContain('Forhandlerkontrakt Timan, punkt');

    const source = readFileSync('src/pages/contracts/ContractsPage.tsx', 'utf8');
    expect(source).toContain("'Forhandlerkontrakt Timan'");
    expect(source).toContain('FORHANDLERKONTRAKT - GENNEMGANG OG UNDERSKRIFT');
    expect(source).toContain('Timan_Forhandlerkontrakt_');
  });

  it('removes the redundant demo discount helper from complete rendered contracts', () => {
    for (const partnerType of CONTRACT_PARTNER_TYPES) {
      const legalSections = renderGuidedContractSections({
        companyName: partnerType === 'importer' ? 'ABC Maschinen GmbH' : partnerType === 'service_partner' ? 'Service Pro ApS' : 'Dealer House A/S',
        partnerType,
      });
      const bodyText = JSON.stringify(legalSections);

      expect(bodyText).not.toContain('Demo-rabat: Rabat på demo-maskiner. Bilag 2.');
      expect(bodyText).toContain('Demo-maskiner må ikke videresælges før 9 måneder efter levering fra Timan A/S.');
    }
  });

  it('removes the redundant territory intro and starts directly at Appendix 3 content', () => {
    const territory = GUIDED_CONTRACT_SECTIONS.find((section) => section.stepId === 'territory');
    expect(territory?.blocks[0].heading).toBe('Bilag 3: Området');
    expect(shouldHideGuidedContractUiText('Bilag 3: Området', territory!.title)).toBe(true);
    expect(JSON.stringify(territory)).not.toContain('3. Område');
    expect(JSON.stringify(territory)).not.toContain('Se bilag 3.');
  });

  it('hides redundant appendix labels in the guided UI without changing legal source text', () => {
    const sections = renderGuidedContractSections({
      companyName: completeForm.dealerName,
      partnerType: completeForm.partnerType,
    });
    const byStep = Object.fromEntries(sections.map((section) => [section.stepId, section]));

    expect(JSON.stringify(byStep.discount_structure)).toContain('Se bilag 2.');
    expect(getVisibleGuidedUiText(byStep.discount_structure)).not.toContain('Se bilag 2.');

    expect(JSON.stringify(byStep.sales_service_days)).toContain('Bilag 1: Service og garanti betingelser');
    expect(getVisibleGuidedUiText(byStep.sales_service_days)).not.toContain('Bilag 1: Service og garanti betingelser');
    expect(JSON.stringify(byStep.spare_parts_service)).toContain('Service betingelser: se Bilag 1.');
    expect(getVisibleGuidedUiText(byStep.spare_parts_service)).toContain('Service betingelser: se Bilag 1.');

    expect(JSON.stringify(byStep.territory)).toContain('Bilag 3: Området');
    expect(getVisibleGuidedUiText(byStep.territory)).not.toContain('Bilag 3: Området');

    expect(JSON.stringify(byStep.payment_delivery)).toContain('Bilag 4: Salgs- og leveringsbetingelser');
    expect(JSON.stringify(byStep.payment_delivery)).toContain('Se mere om leveringsbetingelser: bilag 4.');
    expect(getVisibleGuidedUiText(byStep.payment_delivery)).not.toContain('Bilag 4: Salgs- og leveringsbetingelser');
    expect(getVisibleGuidedUiText(byStep.payment_delivery)).not.toContain('Se mere om leveringsbetingelser: bilag 4.');

    const appendix2SourceParagraphs = renderAppendix2Paragraphs('dealer');
    const appendix2UiParagraphs = appendix2SourceParagraphs.filter(
      (paragraph) => !shouldHideGuidedContractUiText(paragraph, 'Rabatstruktur og Bilag 2'),
    );
    expect(appendix2SourceParagraphs[0]).toBe('Bilag 2: Rabat.');
    expect(appendix2UiParagraphs).not.toContain('Bilag 2: Rabat.');
  });

  it('hides legal point numbers in guided UI headings without changing source headings', () => {
    const rendered = renderGuidedContractSections({
      companyName: completeForm.dealerName,
      partnerType: completeForm.partnerType,
    });
    const sourceHeadings = rendered.flatMap((section) => section.blocks.map((block) => block.heading).filter(Boolean));
    const displayHeadings = sourceHeadings.map((heading) => getGuidedContractDisplayHeading(heading!));

    expect(sourceHeadings).toContain('1. Formål');
    expect(sourceHeadings).toContain('2. Priser, ordre og forhandlerportal');
    expect(sourceHeadings).toContain('10. Årligt forhandlermøde');
    expect(sourceHeadings).toContain('7.1 Marketingforpligtelser Timan');
    expect(displayHeadings).toContain('Formål');
    expect(displayHeadings).toContain('Priser, ordre og forhandlerportal');
    expect(displayHeadings).toContain('Årligt forhandlermøde');
    expect(displayHeadings).toContain('Marketingforpligtelser Timan');
    expect(displayHeadings).toContain('Bilag 3: Området');
    expect(displayHeadings).not.toContain('1. Formål');
    expect(displayHeadings).not.toContain('10. Årligt forhandlermøde');
    expect(displayHeadings).not.toContain('7.1 Marketingforpligtelser Timan');
  });

  it.each([
    ['dealer', 'forhandler', 'forhandleren', 'forhandlere', 'forhandlerportalen'],
    ['importer', 'importør', 'importøren', 'importører', 'importørportalen'],
    ['service_partner', 'servicepartner', 'servicepartneren', 'servicepartnere', 'servicepartnerportalen'],
  ] as const)('renders contract party text dynamically for %s', (partnerType, singular, definite, plural, portal) => {
    const companyName = partnerType === 'importer' ? 'ABC Maschinen GmbH' : partnerType === 'service_partner' ? 'Service Pro ApS' : 'Dealer House A/S';
    const legalSections = renderGuidedContractSections({ companyName, partnerType });
    const appendix2Paragraphs = renderAppendix2Paragraphs(partnerType);
    const text = `${JSON.stringify(legalSections)} ${appendix2Paragraphs.join(' ')}`;

    expect(text).toContain(`Timan A/S og ${companyName}, herefter nævnt som ${singular}`);
    expect(text).toContain(definite);
    expect(text).toContain(plural);
    expect(text).toContain(portal);
    expect(text).not.toContain('xxxx');
    expect(text).not.toContain('xxx');
    expect(text).not.toContain('{{');
    expect(text).not.toContain('}}');
  });

  it.each([
    ['importer', 'ABC Maschinen GmbH', ['forhandleren', 'forhandlerens', 'forhandler portalen', 'forhandlerportalen']],
    ['service_partner', 'Service Pro ApS', ['forhandleren', 'forhandlerens', 'importøren', 'importørens', 'forhandler portalen', 'forhandlerportalen']],
    ['dealer', 'Dealer House A/S', ['importøren', 'importørens', 'servicepartneren', 'servicepartnerens', 'importørportalen', 'servicepartnerportalen']],
  ] as const)('does not render the contract party as another partner type for %s', (partnerType, companyName, forbiddenTerms) => {
    const legalSections = renderGuidedContractSections({ companyName, partnerType });
    const appendix2Paragraphs = renderAppendix2Paragraphs(partnerType);
    const bodyText = [
      ...legalSections.flatMap((section) => section.blocks.flatMap((block) => [
        block.heading,
        ...(block.paragraphs ?? []),
        ...(block.bullets ?? []),
      ])),
      ...appendix2Paragraphs,
    ].filter(Boolean).join('\n').toLowerCase();

    for (const forbidden of forbiddenTerms) {
      expect(bodyText).not.toContain(forbidden);
    }
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

  it('uses stable workflow status ids with Danish labels', () => {
    expect(Object.keys(CONTRACT_STATUS_LABELS_DA)).toEqual([
      'draft',
      'guided_review',
      'ready_for_signature',
      'awaiting_signed_upload',
      'submitted_for_approval',
      'changes_requested',
      'approved',
      'archived',
    ]);
    expect(getContractWorkflowStatusLabel('submitted_for_approval')).toBe('Sendt til Timan-godkendelse');
    expect(getContractWorkflowStatusLabel('unknown')).toBe('Kladde');
  });

  it('allows only the intended contract status transitions', () => {
    expect(canTransitionContractStatus('draft', 'ready_for_signature')).toBe(true);
    expect(canTransitionContractStatus('ready_for_signature', 'awaiting_signed_upload')).toBe(true);
    expect(canTransitionContractStatus('submitted_for_approval', 'changes_requested')).toBe(true);
    expect(canTransitionContractStatus('submitted_for_approval', 'approved')).toBe(true);
    expect(canTransitionContractStatus('approved', 'awaiting_signed_upload')).toBe(false);
    expect(canTransitionContractStatus('archived', 'draft')).toBe(false);
    expect(hasReachedContractStatus('approved', 'awaiting_signed_upload')).toBe(true);
  });

  it('freezes legal text and review actor details into the locked snapshot', () => {
    const snapshot = buildContractSnapshot(completeForm, confirmed, {
      contractId: 'contract-1',
      contractNumber: 'DC-2026-1000',
      workflowStatus: 'ready_for_signature',
      legalSections: renderGuidedContractSections({ companyName: completeForm.dealerName, partnerType: completeForm.partnerType }),
      appendices: { appendix2Paragraphs: renderAppendix2Paragraphs(completeForm.partnerType) },
      completedGuidedReviewAt: '2026-08-30T08:00:00.000Z',
      completedGuidedReviewBy: 'Birger Pedersen',
      completedGuidedReviewByEmail: 'bp@timan.dk',
      expectedSignedPages: 5,
    });

    expect(snapshot.contractId).toBe('contract-1');
    expect(snapshot.contractNumber).toBe('DC-2026-1000');
    expect(snapshot.workflowStatus).toBe('ready_for_signature');
    expect(JSON.stringify(snapshot.legalSections)).toContain('Timan A/S og Metec Metal Technology Inc');
    expect(snapshot.appendices).toEqual({ appendix2Paragraphs: renderAppendix2Paragraphs(completeForm.partnerType) });
    expect(snapshot.completedGuidedReviewByEmail).toBe('bp@timan.dk');
    expect(snapshot.expectedSignedPages).toBe(5);
  });

  it('defines database workflow primitives for uploads, approval, RLS and private storage', () => {
    const migration = readFileSync('supabase/migrations/20260830081914_dealer_contract_approval_workflow.sql', 'utf8');

    expect(migration).toContain("'dealer-contracts'");
    expect(migration).toContain('public.dealer_contract_upload_versions');
    expect(migration).toContain('public.dealer_contract_upload_files');
    expect(migration).toContain('complete_dealer_contract_guided_review');
    expect(migration).toContain('submit_dealer_contract_upload');
    expect(migration).toContain('request_dealer_contract_new_upload');
    expect(migration).toContain('approve_dealer_contract_upload');
    expect(migration).toContain('public.can_approve_dealer_contract');
    expect(migration).toContain('public.can_access_dealer_contract_storage');
    expect(migration).toContain("public.audit_dealer_contract_event");
    expect(migration).toContain("uv.status = 'draft'");
    expect(migration).toContain("contract_status = 'approved'");
  });

  it('uses a stable draft key per seller and dealer account', () => {
    expect(buildDealerContractDraftKey('BP@Timan.dk', ' 11913 ')).toBe('bp@timan.dk:11913');
    expect(buildDealerContractDraftKey('em@timan.dk', '')).toBe('em@timan.dk:manual');
  });

  it('keeps appendix 2 discount text verbatim', () => {
    expect(APPENDIX_2_PARAGRAPHS).toEqual([
      'Bilag 2: Rabat.',
      '1. Målet med rabattstrukturen.',
      'Vores mål med rabattstrukturen er at sikre en ensartet og fair behandling af alle {{partnerPlural}} med gensidig respekt, men samtidig belønne de {{partnerPlural}} der yder en ekstra instans.',
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
      'Opnår {{partnerDefinite}} et salg uden Timan har været involveret i en demonstration, til skønnes dette.',
      'Demorabatten ydes på grundmaskinen eksklusivt udstyr.',
      'Demonstrationsrabatten gives som en kreditnota, der modregnes ved fremtidige køb hos Timan.',
      '6. Udregning af rabat.',
      'Rabatten udregnes ud fra kombinerede rabatter eller efterfølgende rabatter. Og udregnes altid som kæderabat: Grundrabatten + Rabat 1 + Rabat 2 + Rabat 3 (Grund rabatten + Flere stk. + Leveringstid + Demonstrations rabat)',
    ]);
    expect(APPENDIX_2_EXAMPLE_LINES[0]).toBe('Den maximale rabat, som kan opnåes på en maskine og redskaber er: 25% + 4% + 2% = 29,44 %');
    expect(APPENDIX_2_EXAMPLE_LINES[0]).not.toContain('31');
    expect(APPENDIX_2_EXAMPLE_LINES[1]).toBe('Når garantiregistreringen er gennemført, vil beløbet på 3.100 kr. blive udstedt som en kreditnota, der kan anvendes ved fremtidige køb hos Timan.');
    expect(renderAppendix2Paragraphs('importer')[2]).toContain('alle importører');
    expect(renderAppendix2Paragraphs('importer')[13]).toBe('Opnår importøren et salg uden Timan har været involveret i en demonstration, til skønnes dette.');
  });
});
