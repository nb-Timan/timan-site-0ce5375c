import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type ContractStepId =
  | 'parties'
  | 'collaboration'
  | 'timan_responsibility'
  | 'dealer_responsibility'
  | 'commercial_terms'
  | 'full_contract'
  | 'signature';

export type ContractConfirmationId =
  | 'collaboration'
  | 'responsibilities'
  | 'commercial_terms'
  | 'full_contract';

export type ContractStatus = 'Draft' | 'In review' | 'Ready for signature' | 'Signed' | 'Archived';

export type ContractFormData = {
  dealerName: string;
  dealerAddress: string;
  dealerPostalCode: string;
  dealerCity: string;
  dealerCvr: string;
  contactPerson: string;
  contactTitle: string;
  timanSellerName: string;
  timanSellerEmail: string;
  timanSellerPhone: string;
  contractDate: string;
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

export const CONTRACT_VERSION = 'forhandlerkontrakt-timan-2026-08';

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
    intro: 'Start med at kontrollere, at Timan-oplysninger og forhandleroplysninger er korrekte. Det er de data, der bruges videre i aftalen og PDF’en.',
  },
  {
    id: 'collaboration',
    title: 'Salgsområder og samarbejde',
    shortTitle: 'Salgsområder og samarbejde',
    intro: 'Her gennemgår sælger og forhandler samarbejdsmodel, salgsområder og de eksisterende samarbejdsvilkår.',
    confirmationId: 'collaboration',
  },
  {
    id: 'commercial_terms',
    title: 'Rabatstruktur (Bilag)',
    shortTitle: 'Rabatstruktur (Bilag)',
    intro: 'Dette bilag samler den eksisterende rabatstruktur og den visuelle rabatmodel.',
    appendix: true,
    confirmationId: 'commercial_terms',
  },
  {
    id: 'dealer_responsibility',
    title: 'Salgs- og leveringsbetingelser',
    shortTitle: 'Salgs- og leveringsbetingelser',
    intro: 'Her gennemgås de eksisterende afsnit om salg, ordre, levering, betaling og øvrige kommercielle vilkår.',
  },
  {
    id: 'timan_responsibility',
    title: 'Service (Bilag)',
    shortTitle: 'Service (Bilag)',
    intro: 'Dette bilag samler det eksisterende service-relaterede indhold fra kontraktpakken.',
    appendix: true,
    confirmationId: 'responsibilities',
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
    intro: 'Når alle obligatoriske trin er gennemgået, kan forhandlerens digitale signatur tilføjes og den endelige PDF genereres.',
  },
];

type ContractStepLabel = Pick<(typeof CONTRACT_STEPS)[number], 'title' | 'shortTitle'>;

const CONTRACT_STEP_LABELS: Record<ContractStepId, Record<PortalUiLanguage, ContractStepLabel>> = {
  parties: {
    da: { title: 'Oplysninger', shortTitle: 'Oplysninger' },
    en: { title: 'Details', shortTitle: 'Details' },
    de: { title: 'Informationen', shortTitle: 'Informationen' },
    it: { title: 'Informazioni', shortTitle: 'Informazioni' },
    hu: { title: 'Információk', shortTitle: 'Információk' },
    sv: { title: 'Uppgifter', shortTitle: 'Uppgifter' },
    fr: { title: 'Informations', shortTitle: 'Informations' },
    pl: { title: 'Informacje', shortTitle: 'Informacje' },
    cs: { title: 'Informace', shortTitle: 'Informace' },
  },
  collaboration: {
    da: { title: 'Salgsområder og samarbejde', shortTitle: 'Salgsområder og samarbejde' },
    en: { title: 'Sales areas and collaboration', shortTitle: 'Sales areas and collaboration' },
    de: { title: 'Verkaufsgebiete und Zusammenarbeit', shortTitle: 'Verkaufsgebiete und Zusammenarbeit' },
    it: { title: 'Aree di vendita e collaborazione', shortTitle: 'Aree di vendita e collaborazione' },
    hu: { title: 'Értékesítési területek és együttműködés', shortTitle: 'Értékesítési területek' },
    sv: { title: 'Försäljningsområden och samarbete', shortTitle: 'Försäljningsområden' },
    fr: { title: 'Zones de vente et collaboration', shortTitle: 'Zones de vente' },
    pl: { title: 'Obszary sprzedaży i współpraca', shortTitle: 'Obszary sprzedaży' },
    cs: { title: 'Prodejní oblasti a spolupráce', shortTitle: 'Prodejní oblasti' },
  },
  commercial_terms: {
    da: { title: 'Rabatstruktur (Bilag)', shortTitle: 'Rabatstruktur (Bilag)' },
    en: { title: 'Discount structure (Appendix)', shortTitle: 'Discount structure' },
    de: { title: 'Rabattstruktur (Anhang)', shortTitle: 'Rabattstruktur' },
    it: { title: 'Struttura sconti (Allegato)', shortTitle: 'Struttura sconti' },
    hu: { title: 'Kedvezménystruktúra (Melléklet)', shortTitle: 'Kedvezménystruktúra' },
    sv: { title: 'Rabattstruktur (Bilaga)', shortTitle: 'Rabattstruktur' },
    fr: { title: 'Structure de remise (Annexe)', shortTitle: 'Structure de remise' },
    pl: { title: 'Struktura rabatów (Załącznik)', shortTitle: 'Struktura rabatów' },
    cs: { title: 'Struktura slev (Příloha)', shortTitle: 'Struktura slev' },
  },
  dealer_responsibility: {
    da: { title: 'Salgs- og leveringsbetingelser', shortTitle: 'Salgs- og leveringsbetingelser' },
    en: { title: 'Sales and delivery terms', shortTitle: 'Sales and delivery terms' },
    de: { title: 'Verkaufs- und Lieferbedingungen', shortTitle: 'Verkaufs- und Lieferbedingungen' },
    it: { title: 'Condizioni di vendita e consegna', shortTitle: 'Vendita e consegna' },
    hu: { title: 'Értékesítési és szállítási feltételek', shortTitle: 'Értékesítési feltételek' },
    sv: { title: 'Försäljnings- och leveransvillkor', shortTitle: 'Försäljning och leverans' },
    fr: { title: 'Conditions de vente et de livraison', shortTitle: 'Vente et livraison' },
    pl: { title: 'Warunki sprzedaży i dostawy', shortTitle: 'Sprzedaż i dostawa' },
    cs: { title: 'Prodejní a dodací podmínky', shortTitle: 'Prodej a dodání' },
  },
  timan_responsibility: {
    da: { title: 'Service (Bilag)', shortTitle: 'Service (Bilag)' },
    en: { title: 'Service (Appendix)', shortTitle: 'Service' },
    de: { title: 'Service (Anhang)', shortTitle: 'Service' },
    it: { title: 'Service (Allegato)', shortTitle: 'Service' },
    hu: { title: 'Szerviz (Melléklet)', shortTitle: 'Szerviz' },
    sv: { title: 'Service (Bilaga)', shortTitle: 'Service' },
    fr: { title: 'Service (Annexe)', shortTitle: 'Service' },
    pl: { title: 'Serwis (Załącznik)', shortTitle: 'Serwis' },
    cs: { title: 'Servis (Příloha)', shortTitle: 'Servis' },
  },
  full_contract: {
    da: { title: 'Gennemlæs', shortTitle: 'Gennemlæs' },
    en: { title: 'Review', shortTitle: 'Review' },
    de: { title: 'Durchlesen', shortTitle: 'Durchlesen' },
    it: { title: 'Revisione', shortTitle: 'Revisione' },
    hu: { title: 'Áttekintés', shortTitle: 'Áttekintés' },
    sv: { title: 'Granska', shortTitle: 'Granska' },
    fr: { title: 'Relecture', shortTitle: 'Relecture' },
    pl: { title: 'Przegląd', shortTitle: 'Przegląd' },
    cs: { title: 'Kontrola', shortTitle: 'Kontrola' },
  },
  signature: {
    da: { title: 'Underskrift', shortTitle: 'Underskrift' },
    en: { title: 'Signature', shortTitle: 'Signature' },
    de: { title: 'Unterschrift', shortTitle: 'Unterschrift' },
    it: { title: 'Firma', shortTitle: 'Firma' },
    hu: { title: 'Aláírás', shortTitle: 'Aláírás' },
    sv: { title: 'Underskrift', shortTitle: 'Underskrift' },
    fr: { title: 'Signature', shortTitle: 'Signature' },
    pl: { title: 'Podpis', shortTitle: 'Podpis' },
    cs: { title: 'Podpis', shortTitle: 'Podpis' },
  },
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

export const EMPTY_CONTRACT_CONFIRMATIONS: ContractConfirmations = {
  collaboration: { confirmed: false },
  responsibilities: { confirmed: false },
  commercial_terms: { confirmed: false },
  full_contract: { confirmed: false },
};

export function getRequiredConfirmationForStep(stepId: ContractStepId) {
  return CONTRACT_STEPS.find((step) => step.id === stepId)?.confirmationId;
}

export function canLeaveContractStep(stepId: ContractStepId, confirmations: ContractConfirmations) {
  const confirmationId = getRequiredConfirmationForStep(stepId);
  return !confirmationId || Boolean(confirmations[confirmationId]?.confirmed);
}

export function hasRequiredPartyData(form: ContractFormData) {
  return Boolean(
    form.dealerName.trim()
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

export function buildContractSnapshot(form: ContractFormData, confirmations: ContractConfirmations) {
  return {
    version: CONTRACT_VERSION,
    createdAt: new Date().toISOString(),
    status: getContractStatus(form, confirmations),
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
      name: form.dealerName,
      cvr: form.dealerCvr,
      address: form.dealerAddress,
      postalCode: form.dealerPostalCode,
      city: form.dealerCity,
      contactPerson: form.contactPerson,
      contactTitle: form.contactTitle,
    },
    contractDate: form.contractDate,
    confirmations,
    signatureDataUrl: form.signatureDataUrl,
  };
}
