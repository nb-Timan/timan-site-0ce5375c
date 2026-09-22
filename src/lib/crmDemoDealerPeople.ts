import { supabase } from '@/lib/supabase';
import { listDealerContacts, type DealerContact } from '@/lib/dealerContactsService';

export type DemoDealerPersonSource = 'app_user' | 'dealer_contact';

export interface DemoDealerPerson {
  key: string;
  source: DemoDealerPersonSource;
  id: string;
  name: string;
  email: string | null;
  initials: string | null;
  role: string | null;
  searchText: string;
}

interface DealerPortalUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  initials: string | null;
  portal_role: string | null;
  role: string | null;
  dealer_number: string | null;
  approved: boolean | null;
  is_active: boolean | null;
}

function normalizedEmail(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function personSearchText(person: Omit<DemoDealerPerson, 'searchText'>): string {
  return [person.name, person.email, person.initials, person.role].filter(Boolean).join(' ').toLowerCase();
}

/** Merge the two canonical partner-person sources without creating a new directory. */
export function buildDemoDealerPeople(
  dealerNumber: string,
  dealerAccountId: string,
  portalUsers: DealerPortalUserRow[],
  contacts: DealerContact[],
): DemoDealerPerson[] {
  const people: DemoDealerPerson[] = [];
  const seenEmails = new Set<string>();

  for (const user of portalUsers) {
    if (user.dealer_number !== dealerNumber || user.approved !== true || user.is_active !== true) continue;
    const name = (user.display_name || user.full_name || user.email || '').trim();
    if (!name) continue;
    const email = normalizedEmail(user.email) || null;
    const base = {
      key: `app_user:${user.id}`,
      source: 'app_user' as const,
      id: user.id,
      name,
      email,
      initials: user.initials?.trim() || null,
      role: user.portal_role || user.role || null,
    };
    people.push({ ...base, searchText: personSearchText(base) });
    if (email) seenEmails.add(email);
  }

  for (const contact of contacts) {
    if (contact.dealer_account_id !== dealerAccountId) continue;
    const name = (contact.name || contact.email || '').trim();
    if (!name) continue;
    const email = normalizedEmail(contact.email) || null;
    if (email && seenEmails.has(email)) continue;
    const base = {
      key: `dealer_contact:${contact.id}`,
      source: 'dealer_contact' as const,
      id: contact.id,
      name,
      email,
      initials: null,
      role: contact.role_title || contact.contact_area || null,
    };
    people.push({ ...base, searchText: personSearchText(base) });
    if (email) seenEmails.add(email);
  }

  return people.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listDemoDealerPeople(
  dealerNumber: string,
  dealerAccountId: string,
): Promise<DemoDealerPerson[]> {
  if (!dealerNumber || !dealerAccountId) return [];
  const [usersResult, contacts] = await Promise.all([
    supabase
      .from('app_users')
      .select('id,email,display_name,full_name,initials,portal_role,role,dealer_number,approved,is_active')
      .eq('dealer_number', dealerNumber)
      .eq('approved', true)
      .eq('is_active', true)
      .order('email', { ascending: true }),
    listDealerContacts(dealerAccountId),
  ]);

  if (usersResult.error) {
    console.warn('[crmDemoDealerPeople] dealer users query failed', usersResult.error);
  }
  return buildDemoDealerPeople(
    dealerNumber,
    dealerAccountId,
    (usersResult.data ?? []) as DealerPortalUserRow[],
    contacts,
  );
}
