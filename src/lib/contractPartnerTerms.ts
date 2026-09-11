import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type ContractPartnerType = 'dealer' | 'importer' | 'service_partner';

export type ContractPartnerTerms = {
  label: string;
  singular: string;
  definite: string;
  plural: string;
  possessive: string;
  portal: string;
  annualMeeting: string;
  signatureLabel: string;
};

export const CONTRACT_PARTNER_TYPES: ContractPartnerType[] = ['dealer', 'importer', 'service_partner'];

export const CONTRACT_PARTNER_TYPE_LABELS: Record<ContractPartnerType, Record<PortalUiLanguage, string>> = {
  dealer: {
    da: 'Forhandler',
    en: 'Dealer',
    de: 'Händler',
    it: 'Rivenditore',
    hu: 'Kereskedő',
    sv: 'Återförsäljare',
    fr: 'Revendeur',
    pl: 'Dealer',
    cs: 'Prodejce',
    tr: 'Prodejce',
  },
  importer: {
    da: 'Importør',
    en: 'Importer',
    de: 'Importeur',
    it: 'Importatore',
    hu: 'Importőr',
    sv: 'Importör',
    fr: 'Importateur',
    pl: 'Importer',
    cs: 'Importér',
    tr: 'Importér',
  },
  service_partner: {
    da: 'Servicepartner',
    en: 'Service partner',
    de: 'Servicepartner',
    it: 'Partner di assistenza',
    hu: 'Szervizpartner',
    sv: 'Servicepartner',
    fr: 'Partenaire service',
    pl: 'Partner serwisowy',
    cs: 'Servisní partner',
    tr: 'Servisní partner',
  },
};

const PARTNER_TERMS: Record<PortalUiLanguage, Record<ContractPartnerType, ContractPartnerTerms>> = {
  da: {
  dealer: {
    label: 'Forhandler',
    singular: 'forhandler',
    definite: 'forhandleren',
    plural: 'forhandlere',
    possessive: 'forhandlerens',
    portal: 'forhandlerportalen',
    annualMeeting: 'forhandlermøde',
    signatureLabel: 'Forhandler underskrift',
  },
  importer: {
    label: 'Importør',
    singular: 'importør',
    definite: 'importøren',
    plural: 'importører',
    possessive: 'importørens',
    portal: 'importørportalen',
    annualMeeting: 'importørmøde',
    signatureLabel: 'Importør underskrift',
  },
  service_partner: {
    label: 'Servicepartner',
    singular: 'servicepartner',
    definite: 'servicepartneren',
    plural: 'servicepartnere',
    possessive: 'servicepartnerens',
    portal: 'servicepartnerportalen',
    annualMeeting: 'servicepartnermøde',
    signatureLabel: 'Servicepartner underskrift',
  },
  },
  en: {
    dealer: { label: 'Dealer', singular: 'dealer', definite: 'the dealer', plural: 'dealers', possessive: "dealer's", portal: 'dealer portal', annualMeeting: 'dealer meeting', signatureLabel: 'Dealer signature' },
    importer: { label: 'Importer', singular: 'importer', definite: 'the importer', plural: 'importers', possessive: "importer's", portal: 'importer portal', annualMeeting: 'importer meeting', signatureLabel: 'Importer signature' },
    service_partner: { label: 'Service partner', singular: 'service partner', definite: 'the service partner', plural: 'service partners', possessive: "service partner's", portal: 'service partner portal', annualMeeting: 'service partner meeting', signatureLabel: 'Service partner signature' },
  },
  de: {
    dealer: { label: 'Händler', singular: 'Händler', definite: 'der Händler', plural: 'Händler', possessive: 'Händlers', portal: 'Händlerportal', annualMeeting: 'Händlertreffen', signatureLabel: 'Unterschrift des Händlers' },
    importer: { label: 'Importeur', singular: 'Importeur', definite: 'der Importeur', plural: 'Importeure', possessive: 'Importeurs', portal: 'Importeurportal', annualMeeting: 'Importeurtreffen', signatureLabel: 'Unterschrift des Importeurs' },
    service_partner: { label: 'Servicepartner', singular: 'Servicepartner', definite: 'der Servicepartner', plural: 'Servicepartner', possessive: 'Servicepartners', portal: 'Servicepartnerportal', annualMeeting: 'Servicepartnertreffen', signatureLabel: 'Unterschrift des Servicepartners' },
  },
  it: {
    dealer: { label: 'Rivenditore', singular: 'rivenditore', definite: 'il rivenditore', plural: 'rivenditori', possessive: 'del rivenditore', portal: 'portale rivenditori', annualMeeting: 'riunione annuale dei rivenditori', signatureLabel: 'Firma del rivenditore' },
    importer: { label: 'Importatore', singular: 'importatore', definite: "l'importatore", plural: 'importatori', possessive: "dell'importatore", portal: 'portale importatori', annualMeeting: 'riunione annuale degli importatori', signatureLabel: "Firma dell'importatore" },
    service_partner: { label: 'Partner di assistenza', singular: 'partner di assistenza', definite: 'il partner di assistenza', plural: 'partner di assistenza', possessive: 'del partner di assistenza', portal: 'portale partner di assistenza', annualMeeting: 'riunione annuale dei partner di assistenza', signatureLabel: 'Firma del partner di assistenza' },
  },
  hu: {} as Record<ContractPartnerType, ContractPartnerTerms>, sv: {} as Record<ContractPartnerType, ContractPartnerTerms>, fr: {} as Record<ContractPartnerType, ContractPartnerTerms>, pl: {} as Record<ContractPartnerType, ContractPartnerTerms>, cs: {} as Record<ContractPartnerType, ContractPartnerTerms>,
};

for (const language of ['hu', 'sv', 'fr', 'pl', 'cs'] as const) {
  PARTNER_TERMS[language] = PARTNER_TERMS.en;
}

export function getContractPartnerTypeLabel(
  partnerType: ContractPartnerType,
  language: PortalUiLanguage | string | null | undefined = 'da',
) {
  return CONTRACT_PARTNER_TYPE_LABELS[partnerType][language as PortalUiLanguage]
    ?? CONTRACT_PARTNER_TYPE_LABELS[partnerType].en
    ?? CONTRACT_PARTNER_TYPE_LABELS[partnerType].da;
}

export function getContractPartnerTerms(
  partnerType: ContractPartnerType | '' | null | undefined,
  language: PortalUiLanguage | string | null | undefined = 'da',
): ContractPartnerTerms | null {
  if (!partnerType || !CONTRACT_PARTNER_TYPES.includes(partnerType)) return null;
  const localizedTerms = PARTNER_TERMS[language as PortalUiLanguage] ?? PARTNER_TERMS.en;
  return localizedTerms[partnerType] ?? PARTNER_TERMS.en[partnerType];
}

export function normalizeContractPartnerType(value: string | null | undefined): ContractPartnerType | null {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');

  if (!normalized) return null;
  if (normalized === 'dealer' || normalized === 'forhandler') return 'dealer';
  if (normalized === 'importer' || normalized === 'importor' || normalized === 'importoer' || normalized === 'importør') return 'importer';
  if (normalized === 'servicepartner' || normalized === 'servicepartnere') return 'service_partner';
  if (normalized === 'service') return 'service_partner';
  if (normalized === 'forhandlerkunde' || normalized === 'dealercustomer') return null;
  return null;
}

export function inferContractPartnerTypeFromDealerAccount(input: {
  customer_type?: string | null;
  customer_type_label?: string | null;
  dealer_type?: string | null;
}): ContractPartnerType | null {
  return normalizeContractPartnerType(input.customer_type)
    ?? normalizeContractPartnerType(input.customer_type_label)
    ?? normalizeContractPartnerType(input.dealer_type);
}
