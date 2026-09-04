import { describe, expect, it } from 'vitest';
import { getMissingOrdinaryCrmLeadFields, type OrdinaryCrmLeadRequiredInput } from '@/lib/crmLeadValidation';

const validLead: OrdinaryCrmLeadRequiredInput = {
  machineTypes: ['RC-1000s'],
  contactCompany: 'Test Firma',
  contactPersonName: 'Test Person',
  contactPhone: '12 34 56 78',
  contactEmail: 'test@example.dk',
  contactPostalCode: '6950',
  contactCity: 'Ringkobing',
  country: 'Danmark',
};

describe('ordinary CRM lead required fields', () => {
  it.each([
    ['machineTypes', { machineTypes: [] }],
    ['contactCompany', { contactCompany: '   ' }],
    ['contactPersonName', { contactPersonName: '' }],
    ['contactPhone', { contactPhone: '' }],
    ['contactEmail', { contactEmail: '' }],
    ['contactPostalCode', { contactPostalCode: '' }],
    ['contactCity', { contactCity: '' }],
    ['country', { country: '' }],
  ] as const)('rejects missing %s', (field, patch) => {
    expect(getMissingOrdinaryCrmLeadFields({ ...validLead, ...patch } as OrdinaryCrmLeadRequiredInput)).toContain(field);
  });

  it('accepts a complete ordinary CRM lead input', () => {
    expect(getMissingOrdinaryCrmLeadFields(validLead)).toEqual([]);
  });

  it('accepts Loader line / traktor-redskaber as a machine interest', () => {
    expect(getMissingOrdinaryCrmLeadFields({
      ...validLead,
      machineTypes: ['Loader line / traktor-redskaber'],
    })).toEqual([]);
  });
});
