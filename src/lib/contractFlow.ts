import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { ContractPartnerType } from '@/lib/contractPartnerTerms';
import {
  buildContractTerritorySnapshot,
  hasValidContractTerritory,
  type ContractSecondaryTerritoryArea,
  type ContractTerritoryArea,
} from '@/lib/contractTerritory';
import {
  buildContractServiceTermsSnapshot,
  isValidContractServiceHourlyRateDkk,
} from '@/lib/contractServiceTerms';
import {
  buildContractPaymentTermsSnapshot,
  type ContractPaymentTermId,
} from '@/lib/contractPaymentTerms';
import {
  normalizeContractAssociatedPartners,
  type ContractAssociatedPartner,
} from '@/lib/contractAssociatedPartners';

export type ContractStepId =
  | 'parties'
  | 'purpose_prices_orders_portal'
  | 'territory'
  | 'discount_structure'
  | 'demo_machines'
  | 'spare_parts_service'
  | 'marketing'
  | 'payment_delivery'
  | 'termination'
  | 'full_contract'
  | 'signature';

export type ContractConfirmationId =
  | 'purpose_prices_orders_portal'
  | 'territory'
  | 'discount_structure'
  | 'demo_machines'
  | 'spare_parts_service'
  | 'marketing'
  | 'payment_delivery'
  | 'termination'
  | 'full_contract';

export type LegacyContractStatus = 'Draft' | 'In review' | 'Ready for signature' | 'Signed' | 'Archived';

export type ContractWorkflowStatus =
  | 'pending_decision'
  | 'draft'
  | 'guided_review'
  | 'ready_for_signature'
  | 'awaiting_signed_upload'
  | 'submitted_for_approval'
  | 'changes_requested'
  | 'approved'
  | 'archived';

export type ContractStatus = LegacyContractStatus;

export type ContractFormData = {
  partnerType: ContractPartnerType | '';
  dealerName: string;
  dealerAddress: string;
  dealerPostalCode: string;
  dealerCity: string;
  dealerCountry?: string;
  dealerCvr: string;
  contactPerson: string;
  contactTitle: string;
  timanSellerName: string;
  timanSellerEmail: string;
  timanSellerPhone: string;
  contractDate: string;
  primaryTerritory: ContractTerritoryArea;
  secondaryTerritory: ContractSecondaryTerritoryArea;
  associatedPartners?: ContractAssociatedPartner[];
  serviceHourlyRateDkk: number;
  paymentTerm: ContractPaymentTermId;
  signatureDataUrl: string | null;
};

export type TimanCompanyInfo = {
  company: string;
  cvr: string;
  address: string;
  postalCity: string;
};

export type ContractConfirmation = {
  confirmed: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
};

export type ContractConfirmations = Record<ContractConfirmationId, ContractConfirmation>;

export const CONTRACT_VERSION = 'forhandlerkontrakt-timan-2026-08-partner-type';

export const CONTRACT_STATUS_LABELS_DA: Record<ContractWorkflowStatus, string> = {
  pending_decision: 'Afventer',
  draft: 'Kladde',
  guided_review: 'Under gennemgang',
  ready_for_signature: 'Klar til underskrift',
  awaiting_signed_upload: 'Afventer underskrevet kontrakt',
  submitted_for_approval: 'Sendt til Timan-godkendelse',
  changes_requested: 'Kræver ny upload',
  approved: 'Godkendt',
  archived: 'Arkiveret',
};

export const CONTRACT_PROGRESS_STEPS: Array<{
  id: ContractWorkflowStatus;
  label: string;
}> = [
  { id: 'ready_for_signature', label: 'Gennemgået' },
  { id: 'awaiting_signed_upload', label: 'Klar til underskrift' },
  { id: 'changes_requested', label: 'Upload' },
  { id: 'submitted_for_approval', label: 'Timan-godkendelse' },
  { id: 'approved', label: 'Godkendt' },
];

const CONTRACT_STATUS_ORDER: Record<ContractWorkflowStatus, number> = {
  pending_decision: 0,
  draft: 0,
  guided_review: 1,
  ready_for_signature: 2,
  awaiting_signed_upload: 3,
  changes_requested: 3,
  submitted_for_approval: 4,
  approved: 5,
  archived: 6,
};

export const ALLOWED_CONTRACT_STATUS_TRANSITIONS: Record<ContractWorkflowStatus, ContractWorkflowStatus[]> = {
  pending_decision: ['draft', 'guided_review', 'ready_for_signature', 'awaiting_signed_upload'],
  draft: ['guided_review', 'ready_for_signature'],
  guided_review: ['ready_for_signature'],
  ready_for_signature: ['awaiting_signed_upload'],
  awaiting_signed_upload: ['submitted_for_approval'],
  submitted_for_approval: ['changes_requested', 'approved'],
  changes_requested: ['submitted_for_approval'],
  approved: ['archived'],
  archived: [],
};

export const TIMAN_COMPANY_INFO: TimanCompanyInfo = {
  company: 'Timan A/S',
  cvr: '27609627',
  address: 'Osvald Pedersens Vej 2A-D',
  postalCity: '6980 Tim',
};

export const CONTRACT_STEPS: Array<{
  id: ContractStepId;
  title: string;
  shortTitle: string;
  intro: string;
  appendix?: boolean;
  confirmationId?: ContractConfirmationId;
}> = [
  {
    id: 'parties',
    title: 'Oplysninger',
    shortTitle: 'Oplysninger',
    intro: 'Start med at vælge partnertype og kontrollere, at Timan-oplysninger og virksomhedsoplysninger er korrekte. Det er de data, der bruges videre i aftalen og PDF’en.',
  },
  {
    id: 'purpose_prices_orders_portal',
    title: 'Formål, priser, ordre og forhandlerportal',
    shortTitle: 'Formål',
    intro: 'Gennemgå formål, priser, ordre, forhandlerportal og årligt forhandlermøde.',
    confirmationId: 'purpose_prices_orders_portal',
  },
  {
    id: 'territory',
    title: 'Område og Bilag 3',
    shortTitle: 'Område',
    intro: 'Gennemgå kontraktens områdebestemmelser sammen med Bilag 3 om salgsområdet.',
    appendix: true,
    confirmationId: 'territory',
  },
  {
    id: 'discount_structure',
    title: 'Rabatstruktur og Bilag 2',
    shortTitle: 'Rabat',
    intro: 'Gennemgå den eksisterende rabatstruktur, beregningsregler og visualisering fra Bilag 2.',
    appendix: true,
    confirmationId: 'discount_structure',
  },
  {
    id: 'demo_machines',
    title: 'Demo-maskiner',
    shortTitle: 'Demo',
    intro: 'Gennemgå de eksisterende bestemmelser om demo-maskiner, demo-rabat og videresalg.',
    confirmationId: 'demo_machines',
  },
  {
    id: 'spare_parts_service',
    title: 'Reservedele og service',
    shortTitle: 'Reservedele',
    intro: 'Gennemgå hovedkontraktens almindelige bestemmelser om reservedele, service, salgs- og servicedage.',
    appendix: true,
    confirmationId: 'spare_parts_service',
  },
  {
    id: 'marketing',
    title: 'Marketing',
    shortTitle: 'Marketing',
    intro: 'Gennemgå de eksisterende marketingforpligtelser for samarbejdspartneren og Timan.',
    confirmationId: 'marketing',
  },
  {
    id: 'payment_delivery',
    title: 'Betaling og levering',
    shortTitle: 'Betaling',
    intro: 'Gennemgå betaling, levering og Bilag 4 med salgs- og leveringsbetingelser.',
    appendix: true,
    confirmationId: 'payment_delivery',
  },
  {
    id: 'termination',
    title: 'Opsigelse og afsluttende vilkår',
    shortTitle: 'Opsigelse',
    intro: 'Gennemgå varighed, opsigelse og de afsluttende vilkår før samlet gennemlæsning.',
    confirmationId: 'termination',
  },
  {
    id: 'full_contract',
    title: 'Gennemlæs',
    shortTitle: 'Gennemlæs',
    intro: 'Læs hele aftalepakken samlet i samme rækkefølge, som den dokumenteres i PDF’en. Først derefter kan aftalen gøres klar til underskrift.',
    confirmationId: 'full_contract',
  },
  {
    id: 'signature',
    title: 'Underskrift',
    shortTitle: 'Underskrift',
    intro: 'Når alle obligatoriske trin er gennemgået, kan partnerens digitale signatur tilføjes og den endelige PDF genereres.',
  },
];

type ContractStepLabel = Pick<(typeof CONTRACT_STEPS)[number], 'title' | 'shortTitle' | 'intro'>;

const allLanguageLabels = (
  da: ContractStepLabel,
  en: ContractStepLabel = da,
  overrides: Partial<Record<Exclude<PortalUiLanguage, 'da' | 'en'>, ContractStepLabel>> = {},
): Record<PortalUiLanguage, ContractStepLabel> => ({
  da,
  en,
  de: overrides.de ?? en,
  it: overrides.it ?? en,
  hu: overrides.hu ?? en,
  sv: overrides.sv ?? en,
  fr: overrides.fr ?? en,
  pl: overrides.pl ?? en,
  cs: overrides.cs ?? en,
});

const CONTRACT_STEP_LABELS: Record<ContractStepId, Record<PortalUiLanguage, ContractStepLabel>> = {
  parties: allLanguageLabels(
    {
      title: 'Oplysninger',
      shortTitle: 'Oplysninger',
      intro: 'Start med at vælge partnertype og kontrollere, at Timan-oplysninger og virksomhedsoplysninger er korrekte. Det er de data, der bruges videre i aftalen og PDF’en.',
    },
    {
      title: 'Details',
      shortTitle: 'Details',
      intro: 'Start by choosing the partner type and checking that Timan details and company details are correct. These are the data used later in the agreement and PDF.',
    },
    {
      de: {
        title: 'Angaben',
        shortTitle: 'Angaben',
        intro: 'Wählen Sie zuerst den Partnertyp und prüfen Sie, dass Timan-Angaben und Unternehmensangaben korrekt sind. Diese Daten werden später im Vertrag und in der PDF verwendet.',
      },
    },
  ),
  purpose_prices_orders_portal: allLanguageLabels(
    {
      title: 'Formål, priser, ordre og forhandlerportal',
      shortTitle: 'Formål',
      intro: 'Gennemgå formål, priser, ordre, forhandlerportal og årligt forhandlermøde.',
    },
    {
      title: 'Purpose, prices, orders and dealer portal',
      shortTitle: 'Purpose and portal',
      intro: 'Review purpose, prices, orders, dealer portal and the annual dealer meeting.',
    },
    {
      de: {
        title: 'Zweck, Preise, Bestellungen und Händlerportal',
        shortTitle: 'Zweck',
        intro: 'Prüfen Sie Zweck, Preise, Bestellungen, Händlerportal und das jährliche Händlertreffen.',
      },
    },
  ),
  territory: allLanguageLabels(
    { title: 'Område', shortTitle: 'Område', intro: 'Gennemgå kontraktens områdebestemmelser og salgsområdet.' },
    { title: 'Territory', shortTitle: 'Territory', intro: 'Review the contract territory provisions and the sales territory.' },
    { de: { title: 'Gebiet', shortTitle: 'Gebiet', intro: 'Prüfen Sie die Gebietsbestimmungen des Vertrags und das Vertriebsgebiet.' } },
  ),
  discount_structure: allLanguageLabels(
    { title: 'Rabatstruktur', shortTitle: 'Rabat', intro: 'Gennemgå den eksisterende rabatstruktur, beregningsregler og visualisering.' },
    { title: 'Discount structure', shortTitle: 'Discount', intro: 'Review the existing discount structure, calculation rules and visualization.' },
    { de: { title: 'Rabattstruktur', shortTitle: 'Rabatt', intro: 'Prüfen Sie die bestehende Rabattstruktur, Berechnungsregeln und Visualisierung.' } },
  ),
  demo_machines: allLanguageLabels(
    { title: 'Demo-maskiner', shortTitle: 'Demo', intro: 'Gennemgå de eksisterende bestemmelser om demo-maskiner, demo-rabat og videresalg.' },
    { title: 'Demo machines', shortTitle: 'Demo', intro: 'Review the existing provisions about demo machines, demo discount and resale.' },
    { de: { title: 'Demo-Maschinen', shortTitle: 'Demo', intro: 'Prüfen Sie die bestehenden Bestimmungen zu Demo-Maschinen, Demo-Rabatt und Weiterverkauf.' } },
  ),
  spare_parts_service: allLanguageLabels(
    { title: 'Reservedele og service', shortTitle: 'Reservedele', intro: 'Gennemgå hovedkontraktens almindelige bestemmelser om reservedele, service, salgs- og servicedage.' },
    { title: 'Spare parts and service', shortTitle: 'Spare parts', intro: 'Review the main contract provisions about spare parts, service, sales days and service days.' },
    { de: { title: 'Ersatzteile und Service', shortTitle: 'Ersatzteile', intro: 'Prüfen Sie die Bestimmungen des Hauptvertrags zu Ersatzteilen, Service sowie Verkaufs- und Servicetagen.' } },
  ),
  marketing: allLanguageLabels(
    { title: 'Marketing', shortTitle: 'Marketing', intro: 'Gennemgå de eksisterende marketingforpligtelser for samarbejdspartneren og Timan.' },
    { title: 'Marketing', shortTitle: 'Marketing', intro: 'Review the existing marketing obligations for the partner and Timan.' },
    { de: { title: 'Marketing', shortTitle: 'Marketing', intro: 'Prüfen Sie die bestehenden Marketingpflichten des Partners und von Timan.' } },
  ),
  payment_delivery: allLanguageLabels(
    { title: 'Betaling og levering', shortTitle: 'Betaling', intro: 'Gennemgå betaling, levering og Bilag 4 med salgs- og leveringsbetingelser.' },
    { title: 'Payment and delivery', shortTitle: 'Payment', intro: 'Review payment, delivery and Appendix 4 with terms and conditions of sale and delivery.' },
    { de: { title: 'Zahlung und Lieferung', shortTitle: 'Zahlung', intro: 'Prüfen Sie Zahlung, Lieferung und Anhang 4 mit Verkaufs- und Lieferbedingungen.' } },
  ),
  termination: allLanguageLabels(
    { title: 'Opsigelse og afsluttende vilkår', shortTitle: 'Opsigelse', intro: 'Gennemgå varighed, opsigelse og de afsluttende vilkår før samlet gennemlæsning.' },
    { title: 'Termination and final terms', shortTitle: 'Termination', intro: 'Review duration, termination and the final terms before the full review.' },
    { de: { title: 'Kündigung und Schlussbestimmungen', shortTitle: 'Kündigung', intro: 'Prüfen Sie Laufzeit, Kündigung und Schlussbestimmungen vor der vollständigen Durchsicht.' } },
  ),
  full_contract: allLanguageLabels(
    { title: 'Gennemlæs', shortTitle: 'Gennemlæs', intro: 'Læs hele aftalepakken samlet i samme rækkefølge, som den dokumenteres i PDF’en. Først derefter kan aftalen gøres klar til underskrift.' },
    { title: 'Review', shortTitle: 'Review', intro: 'Read the full agreement package in the same order as documented in the PDF. Only then can the agreement be prepared for signature.' },
    { de: { title: 'Durchsicht', shortTitle: 'Durchsicht', intro: 'Lesen Sie das gesamte Vertragspaket in derselben Reihenfolge, wie es in der PDF dokumentiert wird. Erst danach kann der Vertrag zur Unterschrift vorbereitet werden.' } },
  ),
  signature: allLanguageLabels(
    { title: 'Underskrift', shortTitle: 'Underskrift', intro: 'Når alle obligatoriske trin er gennemgået, kan partnerens digitale signatur tilføjes og den endelige PDF genereres.' },
    { title: 'Signature', shortTitle: 'Signature', intro: 'When all mandatory steps have been reviewed, the partner’s digital signature can be added and the final PDF generated.' },
    { de: { title: 'Unterschrift', shortTitle: 'Unterschrift', intro: 'Wenn alle Pflichtschritte geprüft wurden, kann die digitale Signatur des Partners hinzugefügt und die finale PDF erstellt werden.' } },
  ),
};

export const CONTRACT_APPENDIX_LABELS: Record<PortalUiLanguage, string> = {
  da: 'Bilag',
  en: 'Appendix',
  de: 'Anhang',
  it: 'Allegato',
  hu: 'Melléklet',
  sv: 'Bilaga',
  fr: 'Annexe',
  pl: 'Załącznik',
  cs: 'Příloha',
};

export function getContractStepLabel(
  stepId: ContractStepId,
  language: PortalUiLanguage | string | null | undefined = 'da',
): ContractStepLabel {
  const lang = (language && CONTRACT_STEP_LABELS[stepId]?.[language as PortalUiLanguage])
    ? language as PortalUiLanguage
    : 'da';
  return CONTRACT_STEP_LABELS[stepId][lang];
}

export function getContractAppendixLabel(language: PortalUiLanguage | string | null | undefined = 'da') {
  return CONTRACT_APPENDIX_LABELS[language as PortalUiLanguage] ?? CONTRACT_APPENDIX_LABELS.da;
}

export function getContractWorkflowStatusLabel(status: ContractWorkflowStatus | string | null | undefined) {
  return CONTRACT_STATUS_LABELS_DA[(status || 'draft') as ContractWorkflowStatus] ?? CONTRACT_STATUS_LABELS_DA.draft;
}

export function getLegacyContractStatus(status: ContractWorkflowStatus): LegacyContractStatus {
  if (status === 'approved') return 'Signed';
  if (status === 'archived') return 'Archived';
  if (status === 'ready_for_signature' || status === 'awaiting_signed_upload') return 'Ready for signature';
  if (status === 'guided_review' || status === 'submitted_for_approval' || status === 'changes_requested') return 'In review';
  return 'Draft';
}

export function getWorkflowStatusFromLegacy(status: LegacyContractStatus | string | null | undefined): ContractWorkflowStatus {
  if (status === 'Signed') return 'approved';
  if (status === 'Archived') return 'archived';
  if (status === 'Ready for signature') return 'ready_for_signature';
  if (status === 'In review') return 'guided_review';
  return 'draft';
}

export function canTransitionContractStatus(from: ContractWorkflowStatus, to: ContractWorkflowStatus) {
  if (from === to) return true;
  return ALLOWED_CONTRACT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function hasReachedContractStatus(current: ContractWorkflowStatus, target: ContractWorkflowStatus) {
  return CONTRACT_STATUS_ORDER[current] >= CONTRACT_STATUS_ORDER[target];
}

export const EMPTY_CONTRACT_CONFIRMATIONS: ContractConfirmations = {
  purpose_prices_orders_portal: { confirmed: false },
  territory: { confirmed: false },
  discount_structure: { confirmed: false },
  demo_machines: { confirmed: false },
  spare_parts_service: { confirmed: false },
  marketing: { confirmed: false },
  payment_delivery: { confirmed: false },
  termination: { confirmed: false },
  full_contract: { confirmed: false },
};

export function normalizeContractConfirmations(
  confirmations: Partial<Record<string, ContractConfirmation>> | null | undefined,
): ContractConfirmations {
  const source = confirmations ?? {};
  const normalized: ContractConfirmations = { ...EMPTY_CONTRACT_CONFIRMATIONS };

  (Object.keys(EMPTY_CONTRACT_CONFIRMATIONS) as ContractConfirmationId[]).forEach((id) => {
    normalized[id] = source[id] ?? EMPTY_CONTRACT_CONFIRMATIONS[id];
  });

  if (source.collaboration?.confirmed) {
    normalized.purpose_prices_orders_portal = source.collaboration;
    normalized.territory = source.collaboration;
  }
  if (source.commercial_terms?.confirmed) {
    normalized.discount_structure = source.commercial_terms;
    normalized.payment_delivery = source.commercial_terms;
  }
  if (source.responsibilities?.confirmed) {
    normalized.demo_machines = source.responsibilities;
    normalized.spare_parts_service = source.responsibilities;
    normalized.marketing = source.responsibilities;
  }
  if (source.sales_service_days?.confirmed && !normalized.spare_parts_service.confirmed) {
    normalized.spare_parts_service = source.sales_service_days;
  }

  return normalized;
}

export function normalizeContractStepId(stepId: string | null | undefined): ContractStepId {
  if (stepId === 'sales_service_days') return 'spare_parts_service';
  if (CONTRACT_STEPS.some((step) => step.id === stepId)) return stepId as ContractStepId;
  return 'parties';
}

export function getRequiredConfirmationForStep(stepId: ContractStepId) {
  return CONTRACT_STEPS.find((step) => step.id === stepId)?.confirmationId;
}

export function canLeaveContractStep(stepId: ContractStepId, confirmations: ContractConfirmations) {
  const confirmationId = getRequiredConfirmationForStep(stepId);
  return !confirmationId || Boolean(confirmations[confirmationId]?.confirmed);
}

export function hasRequiredPartyData(form: ContractFormData) {
  return Boolean(
    form.partnerType
    && form.dealerName.trim()
    && form.dealerAddress.trim()
    && form.dealerPostalCode.trim()
    && form.dealerCity.trim()
    && form.dealerCvr.trim()
    && form.contactPerson.trim()
    && form.timanSellerName.trim()
    && form.timanSellerEmail.trim()
    && form.contractDate,
  );
}

export function canPrepareContractForSignature(form: ContractFormData, confirmations: ContractConfirmations) {
  return hasRequiredPartyData(form)
    && hasValidContractTerritory(form)
    && isValidContractServiceHourlyRateDkk(form.serviceHourlyRateDkk)
    && Object.values(confirmations).every((confirmation) => confirmation.confirmed);
}

export function getContractStatus(form: ContractFormData, confirmations: ContractConfirmations): ContractStatus {
  if (form.signatureDataUrl && canPrepareContractForSignature(form, confirmations)) return 'Signed';
  if (canPrepareContractForSignature(form, confirmations)) return 'Ready for signature';
  if (Object.values(confirmations).some((confirmation) => confirmation.confirmed)) return 'In review';
  return 'Draft';
}

export function getCompletedContractStepIds(
  activeStepIndex: number,
  confirmations: ContractConfirmations,
): ContractStepId[] {
  return CONTRACT_STEPS
    .filter((step, index) => {
      const confirmationId = step.confirmationId;
      const confirmed = !confirmationId || Boolean(confirmations[confirmationId]?.confirmed);
      return index < activeStepIndex && confirmed;
    })
    .map((step) => step.id);
}

export type ContractSnapshot = ReturnType<typeof buildContractSnapshot>;

export function buildContractSnapshot(
  form: ContractFormData,
  confirmations: ContractConfirmations,
  options: {
    contractId?: string | null;
    contractNumber?: string | null;
    workflowStatus?: ContractWorkflowStatus;
    legalSections?: unknown;
    appendices?: unknown;
    completedGuidedReviewAt?: string;
    completedGuidedReviewBy?: string | null;
    completedGuidedReviewByEmail?: string | null;
    expectedSignedPages?: number | null;
  } = {},
) {
  return {
    contractId: options.contractId ?? null,
    contractNumber: options.contractNumber ?? null,
    version: CONTRACT_VERSION,
    createdAt: new Date().toISOString(),
    status: getLegacyContractStatus(options.workflowStatus ?? getWorkflowStatusFromLegacy(getContractStatus(form, confirmations))),
    workflowStatus: options.workflowStatus ?? getWorkflowStatusFromLegacy(getContractStatus(form, confirmations)),
    lockedAt: options.completedGuidedReviewAt ?? null,
    timan: {
      company: TIMAN_COMPANY_INFO.company,
      cvr: TIMAN_COMPANY_INFO.cvr,
      address: TIMAN_COMPANY_INFO.address,
      postalCity: TIMAN_COMPANY_INFO.postalCity,
      sellerName: form.timanSellerName,
      sellerEmail: form.timanSellerEmail,
      sellerPhone: form.timanSellerPhone,
    },
    dealer: {
      partnerType: form.partnerType,
      name: form.dealerName,
      cvr: form.dealerCvr,
      address: form.dealerAddress,
      postalCode: form.dealerPostalCode,
      city: form.dealerCity,
      country: form.dealerCountry ?? '',
      contactPerson: form.contactPerson,
      contactTitle: form.contactTitle,
    },
    territory: buildContractTerritorySnapshot(form),
    associatedPartners: normalizeContractAssociatedPartners(form.associatedPartners),
    serviceTerms: buildContractServiceTermsSnapshot(form),
    paymentTerms: buildContractPaymentTermsSnapshot(form),
    contractDate: form.contractDate,
    legalSections: options.legalSections ?? null,
    appendices: options.appendices ?? null,
    confirmations,
    signatureDataUrl: form.signatureDataUrl,
    completedGuidedReviewAt: options.completedGuidedReviewAt ?? null,
    completedGuidedReviewBy: options.completedGuidedReviewBy ?? null,
    completedGuidedReviewByEmail: options.completedGuidedReviewByEmail ?? null,
    expectedSignedPages: options.expectedSignedPages ?? null,
  };
}
