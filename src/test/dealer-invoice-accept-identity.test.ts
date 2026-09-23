import { describe, expect, it } from 'vitest';
import {
  personForInvoiceAccept,
  preferredInvoiceAcceptCompany,
  preferredInvoiceAcceptPerson,
  type DealerInvoiceAcceptCompany,
  type DealerInvoiceAcceptPerson,
} from '@/lib/dealerInvoiceAcceptIdentity';

const companies: DealerInvoiceAcceptCompany[] = [
  { id: 'dealer-a', accountNumber: '10001', name: 'Allowed Dealer A' },
  { id: 'dealer-b', accountNumber: '10002', name: 'Allowed Dealer B' },
];

const people: DealerInvoiceAcceptPerson[] = [
  { key: 'app_user:user-a', id: 'user-a', name: 'Anna Allowed', email: 'anna@example.test', source: 'app_user' },
  { key: 'dealer_contact:contact-a', id: 'contact-a', name: 'Contact A', email: null, source: 'dealer_contact' },
];

describe('dealer invoice acceptance identity selection', () => {
  it('preselects only the current user company and never invents another account', () => {
    expect(preferredInvoiceAcceptCompany(companies, '10002')).toBe('10002');
    expect(preferredInvoiceAcceptCompany(companies, '99999')).toBe('');
    expect(preferredInvoiceAcceptCompany([companies[0]], '99999')).toBe('10001');
  });

  it('preselects the current active app user and clears invalid people after a company change', () => {
    expect(preferredInvoiceAcceptPerson(people, 'user-a')).toBe('app_user:user-a');
    expect(personForInvoiceAccept(people, 'app_user:user-a')?.name).toBe('Anna Allowed');
    expect(personForInvoiceAccept([], 'app_user:user-a')).toBeNull();
  });

  it('keeps Academy identities explicitly local', () => {
    const academyPeople: DealerInvoiceAcceptPerson[] = [
      { key: 'academy_user:academy-local-sales-user', id: 'academy-local-sales-user', name: 'Academy Sales', email: 'academy.sales@localhost', source: 'academy_user' },
    ];
    expect(preferredInvoiceAcceptPerson(academyPeople, 'academy-local-sales-user')).toBe('academy_user:academy-local-sales-user');
  });
});
