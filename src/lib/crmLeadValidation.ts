export type OrdinaryCrmLeadRequiredField =
  | 'machineTypes'
  | 'contactCompany'
  | 'contactPersonName'
  | 'contactPhone'
  | 'contactEmail'
  | 'contactPostalCode'
  | 'contactCity'
  | 'country';

export type CrmLeadRequiredField = OrdinaryCrmLeadRequiredField
  | 'title' | 'responsibleSellerId' | 'linkedDealer' | 'firstContact'
  | 'expectedClose' | 'nextFollowup' | 'nextActivity' | 'contactType'
  | 'customerType' | 'tradeFair' | 'tradeFairYear';

export type CrmLeadCompletenessInput = OrdinaryCrmLeadRequiredInput & {
  title: string;
  responsibleSellerId: string;
  linkedDealer: string;
  firstContact: string;
  expectedClose: string;
  nextFollowup: string;
  nextActivity: string;
  contactType: string;
  customerType: string;
  tradeFair: string;
  tradeFairYear: string;
};

export type OrdinaryCrmLeadRequiredInput = {
  machineTypes: string[];
  contactCompany: string;
  contactPersonName: string;
  contactPhone: string;
  contactEmail: string;
  contactPostalCode: string;
  contactCity: string;
  country: string;
};

const isFilled = (value: string) => value.trim().length > 0;

export function getMissingOrdinaryCrmLeadFields(input: OrdinaryCrmLeadRequiredInput): OrdinaryCrmLeadRequiredField[] {
  const missing: OrdinaryCrmLeadRequiredField[] = [];

  if (input.machineTypes.length === 0) missing.push('machineTypes');
  if (!isFilled(input.contactCompany)) missing.push('contactCompany');
  if (!isFilled(input.contactPersonName)) missing.push('contactPersonName');
  if (!isFilled(input.contactPhone)) missing.push('contactPhone');
  if (!isFilled(input.contactEmail)) missing.push('contactEmail');
  if (!isFilled(input.contactPostalCode)) missing.push('contactPostalCode');
  if (!isFilled(input.contactCity)) missing.push('contactCity');
  if (!isFilled(input.country)) missing.push('country');

  return missing;
}

export function getMissingCrmLeadFields(input: CrmLeadCompletenessInput): CrmLeadRequiredField[] {
  const missing: CrmLeadRequiredField[] = getMissingOrdinaryCrmLeadFields(input);
  const fields = [
    'title', 'responsibleSellerId', 'linkedDealer', 'firstContact', 'expectedClose',
    'nextFollowup', 'nextActivity', 'contactType', 'customerType',
  ] as const;
  for (const field of fields) if (!isFilled(input[field])) missing.push(field);
  if (input.contactType === 'Trade fair') {
    if (!isFilled(input.tradeFair)) missing.push('tradeFair');
    if (!/^\d{4}$/.test(input.tradeFairYear)) missing.push('tradeFairYear');
  }
  return missing;
}

export type StructuredContactInfo = {
  company: string; contactPerson: string; address: string; postalCode: string;
  city: string; zipCity: string; phone: string; email: string; country: string;
};

function splitPostalCodeAndCity(value: string): { postalCode: string; city: string } {
  const match = value.trim().match(/^([A-Z]{0,3}[-\s]?\d{3,6})\s+(.+)$/i);
  return match
    ? { postalCode: match[1].trim(), city: match[2].trim() }
    : { postalCode: '', city: '' };
}

function postalCityLines(info: StructuredContactInfo): string[] {
  const postalCode = info.postalCode.trim();
  const city = info.city.trim();
  if (postalCode && city) {
    const combined = `${postalCode} ${city}`;
    const parsed = splitPostalCodeAndCity(combined);
    if (parsed.postalCode === postalCode && parsed.city === city) {
      return [`Postnr. og by: ${combined}`];
    }
    return [`Postnr.: ${postalCode}`, `By: ${city}`];
  }
  if (postalCode) return [`Postnr.: ${postalCode}`];
  if (city) return [`By: ${city}`];
  return info.zipCity.trim() ? [`Postnr. og by: ${info.zipCity.trim()}`] : [];
}

export function buildStructuredContactInformation(info: StructuredContactInfo): string {
  return [
    info.company.trim() ? `Firma/CVR: ${info.company.trim()}` : null,
    info.contactPerson.trim() ? `Kontaktperson: ${info.contactPerson.trim()}` : null,
    info.address.trim() ? `Adresse: ${info.address.trim()}` : null,
    ...postalCityLines(info),
    info.phone.trim() ? `Telefon: ${info.phone.trim()}` : null,
    info.email.trim() ? `E-mail: ${info.email.trim()}` : null,
    info.country.trim() ? `Land: ${info.country.trim()}` : null,
  ].filter(Boolean).join('\n');
}

export function parseStructuredContactInformation(
  value: string | null | undefined,
  fallbackCountry: string | null | undefined,
): StructuredContactInfo {
  const contactInformation = String(value ?? '');
  const info: StructuredContactInfo = {
    company: '', contactPerson: '', address: '', postalCode: '', city: '',
    zipCity: '', phone: '', email: '', country: '',
  };
  let originalImportText = false;
  contactInformation.split(/\r?\n/).forEach((line) => {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) return;
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const normalizedKey = key.replace(/\.$/, '');
    if (key.startsWith('oprindelig kontaktinfo')) { originalImportText = true; return; }
    if (originalImportText) return;
    const fieldValue = line.slice(separatorIndex + 1).trim();
    if (!fieldValue) return;
    if (key.startsWith('firma')) info.company = fieldValue;
    else if (key.startsWith('kontaktperson')) info.contactPerson = fieldValue;
    else if (key.startsWith('adresse')) info.address = fieldValue;
    else if (normalizedKey === 'postnr' || normalizedKey === 'postal code'
      || normalizedKey === 'zip code' || normalizedKey === 'plz') {
      info.postalCode = fieldValue;
    } else if (key.startsWith('postnr') || key.includes('zip') || key.includes('plz')) {
      info.zipCity = fieldValue;
      const parsed = splitPostalCodeAndCity(fieldValue);
      if (parsed.postalCode) {
        info.postalCode = parsed.postalCode;
        info.city = parsed.city;
      }
    } else if (key === 'by' || key === 'city' || key === 'ort') info.city = fieldValue;
    else if (key.startsWith('telefon') || key.startsWith('phone')) info.phone = fieldValue;
    else if (key.startsWith('e-mail') || key === 'email') info.email = fieldValue;
    else if (key.startsWith('land') || key === 'country') info.country = fieldValue;
  });
  if (!info.country && contactInformation.trim() && fallbackCountry) info.country = fallbackCountry;
  return info;
}

export function splitTradeFairYear(value: string): { name: string; year: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)\s+(?:\((\d{4})\)|(\d{4}))$/);
  return match ? { name: match[1].trim(), year: match[2] || match[3] } : { name: trimmed, year: '' };
}

export function importedChoiceValue(value: string | null | undefined, notes: string | null | undefined): string {
  return value === 'Other' && notes?.includes('Historisk import fra LeadsData_') ? '' : value || '';
}

export type StoredCrmLeadCompleteness = {
  title?: string | null; owner_user_id?: string | null; linked_dealer_id?: string | null;
  first_contact_date?: string | null; expected_close_date?: string | null;
  next_followup_date?: string | null; next_activity?: string | null;
  contact_type?: string | null; customer_type?: string | null;
  machine_types?: string[] | null; contact_information?: string | null;
  country?: string | null; trade_fair?: string | null; notes?: string | null;
};

export function getMissingStoredCrmLeadFields(lead: StoredCrmLeadCompleteness): CrmLeadRequiredField[] {
  const country = importedChoiceValue(lead.country, lead.notes);
  const tradeFair = importedChoiceValue(lead.trade_fair, lead.notes);
  const contact = parseStructuredContactInformation(lead.contact_information || '', country);
  const parsedFair = splitTradeFairYear(tradeFair);
  return getMissingCrmLeadFields({
    title: lead.title || '', responsibleSellerId: lead.owner_user_id || '',
    linkedDealer: lead.linked_dealer_id || '', firstContact: lead.first_contact_date || '',
    expectedClose: lead.expected_close_date || '', nextFollowup: lead.next_followup_date || '',
    nextActivity: lead.next_activity || '', contactType: lead.contact_type || '',
    customerType: lead.customer_type || '', machineTypes: lead.machine_types || [],
    contactCompany: contact.company, contactPersonName: contact.contactPerson,
    contactPhone: contact.phone, contactEmail: contact.email,
    contactPostalCode: contact.postalCode, contactCity: contact.city,
    country: country || importedChoiceValue(contact.country, lead.notes),
    tradeFair: parsedFair.name, tradeFairYear: parsedFair.year,
  });
}

export function normalizeWorkingBudgetQuantity(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

/**
 * Legacy leads can lack fields that became mandatory after their creation.
 * They may still update the isolated working-budget flag, but no other
 * incomplete lead edit may bypass normal validation.
 */
export function isLegacyWorkingBudgetOnlySave(input: {
  isEditingExistingLead: boolean;
  isLeadFormReady: boolean;
  initialWorkingBudgetQuantity: unknown;
  currentWorkingBudgetQuantity: unknown;
}): boolean {
  return input.isEditingExistingLead
    && !input.isLeadFormReady
    && normalizeWorkingBudgetQuantity(input.initialWorkingBudgetQuantity)
      !== normalizeWorkingBudgetQuantity(input.currentWorkingBudgetQuantity);
}
