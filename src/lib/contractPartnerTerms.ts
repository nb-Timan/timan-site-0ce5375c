import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type ContractPartnerType = 'dealer' | 'importer' | 'service_partner';

export type ContractPartnerTerms = {
  label: string;
  singular: string;
  definite: string;
  possessive: string;
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
  },
};

const DA_TERMS: Record<ContractPartnerType, ContractPartnerTerms> = {
  dealer: {
    label: 'Forhandler',
    singular: 'forhandler',
    definite: 'forhandleren',
    possessive: 'forhandlerens',
    signatureLabel: 'Forhandler underskrift',
  },
  importer: {
    label: 'Importør',
    singular: 'importør',
    definite: 'importøren',
    possessive: 'importørens',
    signatureLabel: 'Importør underskrift',
  },
  service_partner: {
    label: 'Servicepartner',
    singular: 'servicepartner',
    definite: 'servicepartneren',
    possessive: 'servicepartnerens',
    signatureLabel: 'Servicepartner underskrift',
  },
};

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
): ContractPartnerTerms | null {
  if (!partnerType || !CONTRACT_PARTNER_TYPES.includes(partnerType)) return null;
  return DA_TERMS[partnerType];
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
