export interface DealerInvoiceAcceptCompany {
  id: string;
  accountNumber: string;
  name: string;
}

export interface DealerInvoiceAcceptPerson {
  key: string;
  id: string;
  name: string;
  email: string | null;
  source: 'app_user' | 'dealer_contact' | 'academy_user';
}

export function preferredInvoiceAcceptCompany(
  companies: DealerInvoiceAcceptCompany[],
  currentDealerNumber: string | null | undefined,
): string {
  const current = (currentDealerNumber ?? '').trim().toLowerCase();
  return companies.find((company) => company.accountNumber.trim().toLowerCase() === current)?.accountNumber
    ?? (companies.length === 1 ? companies[0].accountNumber : '');
}

export function preferredInvoiceAcceptPerson(
  people: DealerInvoiceAcceptPerson[],
  currentUserId: string | null | undefined,
): string {
  const current = (currentUserId ?? '').trim();
  return people.find((person) => person.source === 'app_user' && person.id === current)?.key
    ?? (people.length === 1 ? people[0].key : '');
}

export function personForInvoiceAccept(
  people: DealerInvoiceAcceptPerson[],
  key: string | null | undefined,
): DealerInvoiceAcceptPerson | null {
  return people.find((person) => person.key === key) ?? null;
}
