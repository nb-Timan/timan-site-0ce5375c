export type OrdinaryCrmLeadRequiredField =
  | 'machineTypes'
  | 'contactCompany'
  | 'contactPersonName'
  | 'contactPhone'
  | 'contactEmail'
  | 'contactPostalCode'
  | 'contactCity'
  | 'country';

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
