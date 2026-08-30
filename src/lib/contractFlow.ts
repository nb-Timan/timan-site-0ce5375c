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
  confirmationId?: ContractConfirmationId;
}> = [
  {
    id: 'parties',
    title: 'Parterne',
    shortTitle: 'Parter',
    intro: 'Start med at kontrollere, at Timan-oplysninger og forhandleroplysninger er korrekte. Det er de data, der bruges videre i aftalen og PDF’en.',
  },
  {
    id: 'collaboration',
    title: 'Samarbejdet',
    shortTitle: 'Samarbejde',
    intro: 'Her gennemgår sælger og forhandler rammen for samarbejdet. Afsnittet bruges som samtalepunkt, mens den juridiske kontrakttekst fortsat er den gældende tekst.',
    confirmationId: 'collaboration',
  },
  {
    id: 'timan_responsibility',
    title: 'Timans ansvar',
    shortTitle: 'Timan ansvar',
    intro: 'Dette trin handler om Timans rolle, support og de bilag, der beskriver service, leverancer og salgsbetingelser.',
    confirmationId: 'responsibilities',
  },
  {
    id: 'dealer_responsibility',
    title: 'Forhandlerens ansvar',
    shortTitle: 'Forhandler ansvar',
    intro: 'Her gennemgås forhandlerens ansvar i samarbejdet. Brug trinnet til at sikre fælles forståelse før underskrift.',
  },
  {
    id: 'commercial_terms',
    title: 'Rabat struktur',
    shortTitle: 'Rabat struktur',
    intro: 'Dette trin samler de økonomiske og kommercielle bilag, fx rabat, salgsområde og salgs-/leveringsbetingelser.',
    confirmationId: 'commercial_terms',
  },
  {
    id: 'full_contract',
    title: 'Hele kontrakten',
    shortTitle: 'Gennemlæs',
    intro: 'Læs hele aftalepakken samlet i samme rækkefølge, som den dokumenteres i PDF’en. Først derefter kan aftalen gøres klar til underskrift.',
    confirmationId: 'full_contract',
  },
  {
    id: 'signature',
    title: 'Underskrift & PDF',
    shortTitle: 'Underskrift',
    intro: 'Når alle obligatoriske trin er gennemgået, kan forhandlerens digitale signatur tilføjes og den endelige PDF genereres.',
  },
];

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
