import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type ContractPaymentTermId = 'net_21' | 'net_30' | 'cbs';

export const DEFAULT_CONTRACT_PAYMENT_TERM: ContractPaymentTermId = 'net_21';

export const CONTRACT_PAYMENT_TERM_OPTIONS: readonly ContractPaymentTermId[] = [
  'net_21',
  'net_30',
  'cbs',
];

export type ContractPaymentTermsSnapshot = {
  paymentTerm: ContractPaymentTermId;
  label: string;
  legalText: string;
  cbsLegalTextMissing: boolean;
};

const CONTRACT_PAYMENT_TERM_LABELS: Record<ContractPaymentTermId, Record<PortalUiLanguage, string>> = {
  net_21: {
    da: 'Netto 21 dage',
    en: 'Net 21 days',
    de: 'Netto 21 Tage',
    it: 'Netto 21 giorni',
    hu: 'Nettó 21 nap',
    sv: 'Netto 21 dagar',
    fr: 'Net 21 jours',
    pl: 'Netto 21 dni',
    cs: 'Netto 21 dní',
  },
  net_30: {
    da: 'Netto 30 dage',
    en: 'Net 30 days',
    de: 'Netto 30 Tage',
    it: 'Netto 30 giorni',
    hu: 'Nettó 30 nap',
    sv: 'Netto 30 dagar',
    fr: 'Net 30 jours',
    pl: 'Netto 30 dni',
    cs: 'Netto 30 dní',
  },
  cbs: {
    da: 'CBS',
    en: 'CBS',
    de: 'CBS',
    it: 'CBS',
    hu: 'CBS',
    sv: 'CBS',
    fr: 'CBS',
    pl: 'CBS',
    cs: 'CBS',
  },
};

export function normalizeContractPaymentTerm(value: unknown): ContractPaymentTermId {
  return CONTRACT_PAYMENT_TERM_OPTIONS.includes(value as ContractPaymentTermId)
    ? value as ContractPaymentTermId
    : DEFAULT_CONTRACT_PAYMENT_TERM;
}

export function getContractPaymentTermLabel(
  value: unknown,
  language: PortalUiLanguage | string | null | undefined = 'da',
): string {
  const term = normalizeContractPaymentTerm(value);
  const lang = language as PortalUiLanguage;
  return CONTRACT_PAYMENT_TERM_LABELS[term][lang] ?? CONTRACT_PAYMENT_TERM_LABELS[term].en;
}

export function renderContractPaymentTermLegalText(value: unknown): string {
  const term = normalizeContractPaymentTerm(value);
  if (term === 'net_30') return 'Betalingsbetingelser: Betaling forfalder netto 30 dage fra fakturadato.';
  if (term === 'cbs') return 'Betalingsbetingelser: CBS.';
  return 'Betalingsbetingelser: Betaling forfalder netto 21 dage fra fakturadato.';
}

export function contractPaymentTermHasMissingLegalText(value: unknown): boolean {
  return normalizeContractPaymentTerm(value) === 'cbs';
}

export function buildContractPaymentTermsSnapshot(form: { paymentTerm?: unknown }): ContractPaymentTermsSnapshot {
  const paymentTerm = normalizeContractPaymentTerm(form.paymentTerm);
  return {
    paymentTerm,
    label: getContractPaymentTermLabel(paymentTerm, 'da'),
    legalText: renderContractPaymentTermLegalText(paymentTerm),
    cbsLegalTextMissing: contractPaymentTermHasMissingLegalText(paymentTerm),
  };
}

export function shouldResetContractPaymentConfirmation(
  previousTerm: unknown,
  nextTerm: unknown,
  confirmed: boolean,
) {
  if (!confirmed) return false;
  return normalizeContractPaymentTerm(previousTerm) !== normalizeContractPaymentTerm(nextTerm);
}
