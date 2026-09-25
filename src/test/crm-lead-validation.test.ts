import { describe, expect, it } from 'vitest';
import {
  buildStructuredContactInformation,
  getMissingOrdinaryCrmLeadFields,
  getMissingCrmLeadFields,
  getMissingStoredCrmLeadFields,
  importedChoiceValue,
  parseStructuredContactInformation,
  splitTradeFairYear,
  isLegacyWorkingBudgetOnlySave,
  type CrmLeadCompletenessInput,
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

const completeFair: CrmLeadCompletenessInput = {
  ...validLead,
  title: 'Test lead', responsibleSellerId: 'seller-1', linkedDealer: 'dealer-1',
  firstContact: '2026-09-01', expectedClose: '2026-11-01', nextFollowup: '2026-10-01',
  nextActivity: 'Follow-up on leads', contactType: 'Trade fair', customerType: 'End customer',
  tradeFair: 'GaLaBau', tradeFairYear: '2026',
};

const completeStored = {
  title: completeFair.title, owner_user_id: completeFair.responsibleSellerId,
  linked_dealer_id: completeFair.linkedDealer, first_contact_date: completeFair.firstContact,
  expected_close_date: completeFair.expectedClose, next_followup_date: completeFair.nextFollowup,
  next_activity: completeFair.nextActivity, contact_type: completeFair.contactType,
  customer_type: completeFair.customerType, machine_types: completeFair.machineTypes,
  contact_information: 'Firma/CVR: Test Firma\nKontaktperson: Test Person\nTelefon: 12 34 56 78\nE-mail: test@example.dk\nPostnr. og by: 6950 Ringkobing\nLand: Danmark',
  country: 'Danmark', trade_fair: 'GaLaBau (2026)', notes: null,
};

describe('canonical CRM lead completeness', () => {
  it('uses the same required fields for editable and stored leads', () => {
    expect(getMissingCrmLeadFields(completeFair)).toEqual([]);
    expect(getMissingStoredCrmLeadFields(completeStored)).toEqual([]);
    expect(getMissingCrmLeadFields({ ...completeFair, contactEmail: '' })).toContain('contactEmail');
    expect(getMissingStoredCrmLeadFields({ ...completeStored, contact_information: completeStored.contact_information.replace('E-mail: test@example.dk', '') })).toContain('contactEmail');
    expect(getMissingStoredCrmLeadFields({ ...completeStored, contact_information: completeStored.contact_information.replace('6950 Ringkobing', 'Ringkobing') })).toContain('contactPostalCode');
    expect(getMissingStoredCrmLeadFields({
      ...completeStored,
      contact_information: completeStored.contact_information.replace('E-mail: test@example.dk', '')
        + '\nOprindelig kontaktinfo:\nE-mail: legacy@example.dk',
    })).toContain('contactEmail');
  });

  it('round-trips every editable legacy G-lead customer field through the canonical model', () => {
    const input = {
      company: 'Legacy Company / CVR 123',
      contactPerson: 'Legacy Contact',
      address: 'Legacy Street 7',
      postalCode: 'QA POSTAL',
      city: 'QA CITY',
      zipCity: '',
      phone: '+45 12 34 56 78',
      email: 'legacy@example.test',
      country: 'Danmark',
    };

    const stored = buildStructuredContactInformation(input);
    expect(stored).toContain('Postnr.: QA POSTAL');
    expect(stored).toContain('By: QA CITY');
    expect(parseStructuredContactInformation(stored, '')).toEqual(input);
    expect(buildStructuredContactInformation(parseStructuredContactInformation(stored, ''))).toBe(stored);
  });

  it('preserves the existing compact postal/city line for normal current lead data', () => {
    const stored = buildStructuredContactInformation({
      company: 'Current Company', contactPerson: 'Current Contact', address: 'Current Street 1',
      postalCode: '6950', city: 'Ringkobing', zipCity: '', phone: '12345678',
      email: 'current@example.test', country: 'Danmark',
    });

    expect(stored).toContain('Postnr. og by: 6950 Ringkobing');
    expect(stored).not.toContain('\nPostnr.:');
    expect(getMissingStoredCrmLeadFields({ ...completeStored, contact_information: stored })).toEqual([]);
  });

  it('keeps an ambiguous imported combined location incomplete without duplicating it', () => {
    const parsed = parseStructuredContactInformation(
      'Firma/CVR: Legacy\nPostnr. og by: Unknown legacy location\nLand: Danmark',
      'Danmark',
    );

    expect(parsed).toMatchObject({ postalCode: '', city: '', zipCity: 'Unknown legacy location' });
    expect(buildStructuredContactInformation(parsed)).toContain('Postnr. og by: Unknown legacy location');
  });

  it('requires a real trade fair and year for trade-fair leads only', () => {
    expect(getMissingCrmLeadFields({ ...completeFair, tradeFair: '', tradeFairYear: '' })).toEqual(expect.arrayContaining(['tradeFair', 'tradeFairYear']));
    expect(getMissingCrmLeadFields({ ...completeFair, contactType: 'Phone', tradeFair: '', tradeFairYear: '' })).toEqual([]);
    expect(splitTradeFairYear('Gala-Bau 2022')).toEqual({ name: 'Gala-Bau', year: '2022' });
    expect(splitTradeFairYear('GaLaBau (2026)')).toEqual({ name: 'GaLaBau', year: '2026' });
  });

  it('treats only provenance-marked imported Other as unknown', () => {
    const imported = {
      ...completeStored, country: 'Other', trade_fair: 'Other',
      contact_information: completeStored.contact_information.replace('\nLand: Danmark', ''),
      notes: 'Historisk import fra LeadsData_renset_26-08-26.xlsx.',
    };
    expect(getMissingStoredCrmLeadFields(imported)).toEqual(expect.arrayContaining(['country', 'tradeFair', 'tradeFairYear']));
    expect(importedChoiceValue('Other', imported.notes)).toBe('');
    expect(importedChoiceValue('Other', null)).toBe('Other');
    expect(getMissingStoredCrmLeadFields({ ...completeStored, country: 'Other' })).not.toContain('country');
  });
});

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
