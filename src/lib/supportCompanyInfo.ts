import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { TIMAN_COMPANY_PROFILE } from '../../supabase/functions/_shared/timanCompanyProfile';

export type SupportCompanyInfoTopic = 'address' | 'cvr' | 'location' | 'identity';

export interface SupportCompanyInfoContext {
  domain: 'TIMAN_COMPANY_INFO';
  source: 'canonical_company_profile';
  topics: SupportCompanyInfoTopic[];
  language: PortalUiLanguage;
  company_profile: typeof TIMAN_COMPANY_PROFILE;
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ADDRESS_TERMS = [
  'adresse', 'address', 'anschrift', 'indirizzo', 'cim', 'adress', 'adres', 'adresa',
];
const LOCATION_TERMS = [
  'hvor ligger', 'where is', 'where is located', 'wo liegt', 'wo befindet', 'dove si trova',
  'hol talalhato', 'var ligger', 'ou se trouve', 'gdzie znajduje', 'kde se nachazi',
];
const CVR_TERMS = [
  'cvr', 'vat', 'registration number', 'company number', 'ust-id', 'umsatzsteuer', 'partita iva',
  'adoszam', 'organisationsnummer', 'siret', 'nip', 'ico',
];
const IDENTITY_TERMS = [
  'firmaoplysninger', 'company information', 'firmendaten', 'informazioni aziendali', 'cegadatok',
  'foretagsinformation', 'informations entreprise', 'informacje o firmie', 'informace o spolecnosti',
];

function containsAny(question: string, terms: readonly string[]): boolean {
  return terms.some((term) => question.includes(term));
}

export function buildSupportCompanyInfoContext(
  question: string,
  language: PortalUiLanguage,
): SupportCompanyInfoContext | null {
  const value = normalized(question);
  if (!/(^|\s)timan(?:s|\s+a\s+s)?(\s|$)/.test(value)) return null;
  const topics: SupportCompanyInfoTopic[] = [];
  if (containsAny(value, ADDRESS_TERMS)) topics.push('address');
  if (containsAny(value, LOCATION_TERMS)) topics.push('location');
  if (containsAny(value, CVR_TERMS)) topics.push('cvr');
  if (containsAny(value, IDENTITY_TERMS)) topics.push('identity');
  if (!topics.length) return null;
  return {
    domain: 'TIMAN_COMPANY_INFO',
    source: 'canonical_company_profile',
    topics: [...new Set(topics)],
    language,
    company_profile: TIMAN_COMPANY_PROFILE,
  };
}
