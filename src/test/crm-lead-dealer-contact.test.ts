import { describe, expect, it } from 'vitest';
import {
  activeCrmLeadCustomerDraft,
  buildCrmLeadDealerContactSnapshot,
  EMPTY_CRM_LEAD_CUSTOMER_DRAFT,
  enterManualCrmLeadCustomerMode,
  formatCrmLeadDealerContact,
  replaceCrmLeadDealerCustomerData,
  selectCrmLeadCustomerMode,
  sortCrmLeadDealerContacts,
  updateActiveCrmLeadCustomerDraft,
} from '@/lib/crmLeadDealerContact';
import type { DealerAccount } from '@/lib/dealerAccountsService';
import type { DealerContact } from '@/lib/dealerContactsService';

const dealer = {
  id: 'dealer-1',
  company_name: 'Partner ApS',
  vat_number: 'DK12345678',
  address_line_1: 'Partnervej 1',
  address: 'Older address',
  postal_code: '8000',
  city: 'Aarhus C',
  country: 'Danmark',
} as DealerAccount;

function contact(id: string, area: DealerContact['contact_area'], name: string, roleTitle = ''): DealerContact {
  return {
    id,
    dealer_account_id: dealer.id,
    contact_area: area,
    role_title: roleTitle || null,
    name,
    email: `${id}@example.test`,
    phone: '+45 12 34 56 78',
    is_primary: false,
    created_at: `2026-09-0${id}T00:00:00.000Z`,
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

describe('CRM lead dealer contact autofill', () => {
  it('sorts director, sales and purchasing contacts before other areas', () => {
    const contacts = [
      contact('5', 'marketing', 'Marketing'),
      contact('4', 'workshop', 'Workshop'),
      contact('3', 'parts', 'Purchasing'),
      contact('2', 'sales', 'Sales'),
      contact('1', 'director', 'Director'),
    ];

    expect(sortCrmLeadDealerContacts(contacts).map((item) => item.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('uses canonical dealer and contact data as a lead snapshot', () => {
    const selected = contact('1', 'director', 'Nina Nielsen', 'Direktør');

    expect(buildCrmLeadDealerContactSnapshot(dealer, selected)).toEqual({
      company: 'Partner ApS / DK12345678',
      contactPerson: 'Nina Nielsen',
      phone: '+45 12 34 56 78',
      email: '1@example.test',
      address: 'Partnervej 1',
      postalCode: '8000',
      city: 'Aarhus C',
      country: 'Danmark',
    });
    expect(formatCrmLeadDealerContact(selected)).toBe('Nina Nielsen · Direktør');
  });

  it('keeps missing contact phone and email empty instead of inventing values', () => {
    const selected = { ...contact('1', 'sales', 'Sales contact'), phone: null, email: null };

    expect(buildCrmLeadDealerContactSnapshot(dealer, selected)).toMatchObject({
      contactPerson: 'Sales contact',
      phone: '',
      email: '',
    });
  });

  it('keeps the linked dealer when switching to a manual end customer', () => {
    expect(enterManualCrmLeadCustomerMode({
      linkedDealerId: dealer.id,
      selectedDealerContactId: 'contact-1',
      mode: 'dealer',
    })).toEqual({
      linkedDealerId: dealer.id,
      selectedDealerContactId: '',
      mode: 'manual',
    });
  });

  it('restores the exact manual draft after displaying dealer data', () => {
    const manualCustomerDraft = {
      company: 'Test Kunde ApS',
      contactPerson: 'Peter Jensen',
      phone: '12345678',
      email: 'peter@example.dk',
      address: 'Testvej 1',
      postalCode: '1234',
      city: 'Testby',
      country: 'Danmark',
    };
    const dealerCustomerData = buildCrmLeadDealerContactSnapshot(dealer, contact('1', 'sales', 'Dealer Contact'));

    const dealerMode = replaceCrmLeadDealerCustomerData({
      mode: 'manual',
      manualCustomerDraft,
      dealerCustomerData: EMPTY_CRM_LEAD_CUSTOMER_DRAFT,
    }, dealerCustomerData);
    expect(activeCrmLeadCustomerDraft(dealerMode)).toEqual(dealerCustomerData);

    expect(activeCrmLeadCustomerDraft(selectCrmLeadCustomerMode(dealerMode, 'manual'))).toEqual(manualCustomerDraft);
  });

  it('keeps dealer mode and unrelated prefilled fields when phone is completed locally', () => {
    const manualCustomerDraft = {
      ...EMPTY_CRM_LEAD_CUSTOMER_DRAFT,
      company: 'Original manual customer',
      country: 'Danmark',
    };
    const dealerCustomerData = buildCrmLeadDealerContactSnapshot(dealer, contact('1', 'sales', 'Dealer Contact'));
    const edited = updateActiveCrmLeadCustomerDraft({
      mode: 'dealer',
      manualCustomerDraft,
      dealerCustomerData,
    }, { phone: '+45 87 65 43 21' });

    expect(edited.mode).toBe('dealer');
    expect(activeCrmLeadCustomerDraft(edited)).toEqual({
      ...dealerCustomerData,
      phone: '+45 87 65 43 21',
    });
    expect(edited.manualCustomerDraft).toEqual(manualCustomerDraft);
  });

  it('keeps dealer mode for every editable lead-local customer field', () => {
    const manualCustomerDraft = { ...EMPTY_CRM_LEAD_CUSTOMER_DRAFT, company: 'Preserved manual customer' };
    const dealerCustomerData = buildCrmLeadDealerContactSnapshot(dealer, contact('1', 'sales', 'Dealer Contact'));
    const patch = {
      company: 'Local company override',
      contactPerson: 'Local contact override',
      phone: '+45 11 22 33 44',
      email: 'local@example.test',
      address: 'Local Street 2',
      postalCode: '9000',
      city: 'Aalborg',
      country: 'Danmark',
    };

    const edited = updateActiveCrmLeadCustomerDraft({
      mode: 'dealer',
      manualCustomerDraft,
      dealerCustomerData,
    }, patch);

    expect(edited.mode).toBe('dealer');
    expect(edited.dealerCustomerData).toEqual(patch);
    expect(edited.manualCustomerDraft).toEqual(manualCustomerDraft);
  });

  it('updates the manual draft without changing mode when manual mode was explicitly selected', () => {
    const dealerCustomerData = buildCrmLeadDealerContactSnapshot(dealer, contact('1', 'sales', 'Dealer Contact'));
    const edited = updateActiveCrmLeadCustomerDraft({
      mode: 'manual',
      manualCustomerDraft: { ...EMPTY_CRM_LEAD_CUSTOMER_DRAFT, company: 'Manual customer' },
      dealerCustomerData,
    }, { email: 'manual@example.dk' });

    expect(edited.mode).toBe('manual');
    expect(edited.manualCustomerDraft.email).toBe('manual@example.dk');
    expect(edited.dealerCustomerData).toEqual(dealerCustomerData);
  });

  it('keeps the manual draft intact through dealer A to dealer B changes', () => {
    const manualCustomerDraft = {
      ...EMPTY_CRM_LEAD_CUSTOMER_DRAFT,
      company: 'Manual customer',
      contactPerson: 'Manual contact',
      country: 'Danmark',
    };
    const dealerA = buildCrmLeadDealerContactSnapshot(dealer, contact('1', 'sales', 'Dealer A contact'));
    const dealerB = {
      ...dealerA,
      company: 'Other dealer',
      contactPerson: 'Dealer B contact',
      country: 'Tyskland',
    };

    const afterDealerB = replaceCrmLeadDealerCustomerData({
      mode: 'dealer',
      manualCustomerDraft,
      dealerCustomerData: dealerA,
    }, dealerB);

    expect(activeCrmLeadCustomerDraft(afterDealerB)).toEqual(dealerB);
    expect(activeCrmLeadCustomerDraft(selectCrmLeadCustomerMode(afterDealerB, 'manual'))).toEqual(manualCustomerDraft);
  });
});
