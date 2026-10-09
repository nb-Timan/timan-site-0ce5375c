import { describe, expect, it } from 'vitest';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { validateConfiguratorLead } from '@/lib/configuratorLeadValidation';
import { buildStructuredContactInformation, parseStructuredContactInformation } from '@/lib/crmLeadValidation';

function validLeadState() {
  return {
    ...createEmptyConfiguratorState(),
    machineConfigs: [{ id: 'm0', type: 'RC-1000S', qty: 1, configMode: 'individual' as const, acc: [] }],
    firmanavn: 'Academy QA',
    kontaktperson: 'Test User',
    telefon: '+45 12345678',
    email: 'qa@example.invalid',
    postalCode: '9620',
    city: 'Aalestrup',
    country: 'DK',
  };
}

describe('Configurator new-lead validation', () => {
  it('reuses every canonical ordinary CRM lead requirement', () => {
    const result = validateConfiguratorLead(createEmptyConfiguratorState());
    expect(result.valid).toBe(false);
    expect(result.missingCrmFields).toEqual([
      'machineTypes', 'contactCompany', 'contactPersonName', 'contactPhone',
      'contactEmail', 'contactPostalCode', 'contactCity', 'country',
    ]);
    expect(result.invalidFields).toContain('machineConfigs');
    expect(result.invalidFields).toContain('telefon');
    expect(result.invalidFields).toContain('country');
  });

  it('accepts a complete new lead and rejects malformed email', () => {
    expect(validateConfiguratorLead(validLeadState()).valid).toBe(true);
    const invalid = validateConfiguratorLead({ ...validLeadState(), email: 'not-an-email' });
    expect(invalid.valid).toBe(false);
    expect(invalid.invalidEmail).toBe(true);
    expect(invalid.invalidFields).toContain('email');
  });

  it('does not mutate Configurator state while validating', () => {
    const state = validLeadState();
    const before = JSON.stringify(state);
    validateConfiguratorLead(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('persists required customer data in the CRM structured contact format', () => {
    const contact = buildStructuredContactInformation({
      company: 'Academy QA', contactPerson: 'Test User', address: 'Testvej 1',
      postalCode: '9620', city: 'Aalestrup', zipCity: '', phone: '+45 12345678',
      email: 'qa@example.invalid', country: 'DK',
    });
    expect(parseStructuredContactInformation(contact, '')).toMatchObject({
      company: 'Academy QA', contactPerson: 'Test User', postalCode: '9620',
      city: 'Aalestrup', phone: '+45 12345678', email: 'qa@example.invalid', country: 'DK',
    });
  });
});
