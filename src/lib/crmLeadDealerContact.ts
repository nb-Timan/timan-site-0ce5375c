import type { DealerAccount } from '@/lib/dealerAccountsService';
import type { DealerContact } from '@/lib/dealerContactsService';

export type CrmLeadDealerContactSnapshot = {
  company: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
};

const CONTACT_AREA_PRIORITY: Record<DealerContact['contact_area'], number> = {
  director: 0,
  sales: 1,
  parts: 2,
  finance: 3,
  workshop: 4,
  marketing: 5,
};

export function sortCrmLeadDealerContacts(contacts: DealerContact[]): DealerContact[] {
  return contacts
    .filter((contact) => Boolean(contact.name?.trim()))
    .slice()
    .sort((left, right) =>
      CONTACT_AREA_PRIORITY[left.contact_area] - CONTACT_AREA_PRIORITY[right.contact_area]
      || Number(right.is_primary) - Number(left.is_primary)
      || left.created_at.localeCompare(right.created_at),
    );
}

export function formatCrmLeadDealerContact(contact: DealerContact): string {
  const role = contact.role_title?.trim() || contact.contact_area;
  return [contact.name?.trim(), role].filter(Boolean).join(' · ');
}

export function buildCrmLeadDealerContactSnapshot(
  dealer: DealerAccount,
  contact: DealerContact | null,
): CrmLeadDealerContactSnapshot {
  return {
    company: [dealer.company_name, dealer.vat_number].filter(Boolean).join(' / '),
    contactPerson: contact?.name?.trim() || '',
    phone: contact?.phone?.trim() || '',
    email: contact?.email?.trim() || '',
    address: dealer.address_line_1 || dealer.address || '',
    postalCode: dealer.postal_code || '',
    city: dealer.city || '',
    country: dealer.country || '',
  };
}
