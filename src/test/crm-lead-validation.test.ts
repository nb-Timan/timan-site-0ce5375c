import { describe, expect, it } from 'vitest';
import {
  getMissingOrdinaryCrmLeadFields,
  isLegacyWorkingBudgetOnlySave,
  type OrdinaryCrmLeadRequiredInput,
} from '@/lib/crmLeadValidation';

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

describe('legacy lead working-budget-only save', () => {
  it('permits only a changed working-budget quantity on an incomplete existing lead', () => {
    expect(isLegacyWorkingBudgetOnlySave({
      isEditingExistingLead: true,
      isLeadFormReady: false,
      initialWorkingBudgetQuantity: 0,
      currentWorkingBudgetQuantity: '1',
    })).toBe(true);
  });

  it('does not bypass required validation for a new lead or an unchanged legacy lead', () => {
    expect(isLegacyWorkingBudgetOnlySave({
      isEditingExistingLead: false,
      isLeadFormReady: false,
      initialWorkingBudgetQuantity: 0,
      currentWorkingBudgetQuantity: '1',
    })).toBe(false);
    expect(isLegacyWorkingBudgetOnlySave({
      isEditingExistingLead: true,
      isLeadFormReady: false,
      initialWorkingBudgetQuantity: 1,
      currentWorkingBudgetQuantity: '1',
    })).toBe(false);
  });

  it('uses the regular full-save path once all required lead fields are present', () => {
    expect(isLegacyWorkingBudgetOnlySave({
      isEditingExistingLead: true,
      isLeadFormReady: true,
      initialWorkingBudgetQuantity: 0,
      currentWorkingBudgetQuantity: '1',
    })).toBe(false);
  });
});
