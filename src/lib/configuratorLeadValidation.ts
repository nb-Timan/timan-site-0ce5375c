import { getMissingOrdinaryCrmLeadFields, type OrdinaryCrmLeadRequiredField } from '@/lib/crmLeadValidation';
import type { ConfiguratorState } from '@/types/configurator';

export type ConfiguratorLeadField =
  | 'machineConfigs'
  | 'firmanavn'
  | 'kontaktperson'
  | 'telefon'
  | 'email'
  | 'postalCode'
  | 'city'
  | 'country';

const UI_FIELD_BY_CRM_FIELD: Record<OrdinaryCrmLeadRequiredField, ConfiguratorLeadField> = {
  machineTypes: 'machineConfigs',
  contactCompany: 'firmanavn',
  contactPersonName: 'kontaktperson',
  contactPhone: 'telefon',
  contactEmail: 'email',
  contactPostalCode: 'postalCode',
  contactCity: 'city',
  country: 'country',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ConfiguratorLeadValidationResult = {
  valid: boolean;
  missingCrmFields: OrdinaryCrmLeadRequiredField[];
  invalidFields: ConfiguratorLeadField[];
  invalidEmail: boolean;
};

/** Maps Configurator state onto the canonical required fields for a new ordinary CRM lead. */
export function validateConfiguratorLead(state: ConfiguratorState): ConfiguratorLeadValidationResult {
  const missingCrmFields = getMissingOrdinaryCrmLeadFields({
    machineTypes: state.machineConfigs.filter((machine) => machine.qty > 0).map((machine) => machine.type),
    contactCompany: state.firmanavn,
    contactPersonName: state.kontaktperson,
    contactPhone: state.telefon,
    contactEmail: state.email,
    contactPostalCode: state.postalCode,
    contactCity: state.city,
    country: state.country,
  });
  const invalidEmail = state.email.trim().length > 0 && !EMAIL_PATTERN.test(state.email.trim());
  const invalidFields = missingCrmFields.map((field) => UI_FIELD_BY_CRM_FIELD[field]);
  if (invalidEmail && !invalidFields.includes('email')) invalidFields.push('email');

  return { valid: invalidFields.length === 0, missingCrmFields, invalidFields, invalidEmail };
}
