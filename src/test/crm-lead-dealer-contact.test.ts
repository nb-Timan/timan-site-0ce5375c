import { describe, expect, it } from 'vitest';
import {
  buildCrmLeadDealerContactSnapshot,
  enterManualCrmLeadCustomerMode,
  formatCrmLeadDealerContact,
  sortCrmLeadDealerContacts,
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
});
