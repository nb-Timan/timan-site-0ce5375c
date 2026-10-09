export interface TimanSalesContactRecord {
  id: string;
  contact_area: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface TimanSalesUserRecord {
  id: string;
  email: string;
  display_name: string | null;
  initials: string | null;
  portal_role: string | null;
  status: string | null;
  approved: boolean | null;
}

export interface TimanQuoteSeller {
  id: string;
  contact_id: string;
  name: string;
  email: string;
  phone: string | null;
  initials: string;
}

export interface DealerSalesAssignment {
  country?: string | null;
  assigned_seller_id?: string | null;
  assigned_seller_email?: string | null;
  assigned_seller_initials?: string | null;
}

export type TimanSellerResolutionReason = 'ASSIGNED_SELLER' | 'DENMARK' | 'GERMANY_AMBIGUOUS' | 'MANUAL_SELECTION';

export interface TimanSellerResolution {
  seller: TimanQuoteSeller | null;
  choices: TimanQuoteSeller[];
  reason: TimanSellerResolutionReason;
}

const ROUTING_SELLER_INITIALS = ['EM', 'JTN', 'AKR'] as const;

function normalizedEmail(value: string | null | undefined): string {
  const match = String(value || '').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  return match?.[0].toLowerCase() || '';
}

function normalizedCountry(value: string | null | undefined): 'denmark' | 'germany' | 'other' {
  const country = String(value || '').trim().toLocaleLowerCase();
  if (['denmark', 'danmark', 'dk'].includes(country)) return 'denmark';
  if (['germany', 'deutschland', 'tyskland', 'de'].includes(country)) return 'germany';
  return 'other';
}

export function buildCanonicalTimanSalesContacts(
  contacts: TimanSalesContactRecord[],
  users: TimanSalesUserRecord[],
): TimanQuoteSeller[] {
  const eligibleUsers = users.filter((user) => (
    user.approved === true
    && String(user.status || '').toLowerCase() === 'active'
    && ['timan_seller', 'timan_backend'].includes(String(user.portal_role || ''))
  ));
  const byEmail = new Map(eligibleUsers.map((user) => [normalizedEmail(user.email), user]));

  const matched = contacts
    .filter((contact) => contact.contact_area === 'sales')
    .map((contact) => {
      const user = byEmail.get(normalizedEmail(contact.email));
      const initials = String(user?.initials || '').trim().toUpperCase();
      if (!user || !initials) return null;
      return {
        id: user.id,
        contact_id: contact.id,
        name: String(contact.name || user.display_name || '').trim(),
        email: normalizedEmail(user.email),
        phone: contact.phone || null,
        initials,
      } satisfies TimanQuoteSeller;
    })
    .filter((seller): seller is TimanQuoteSeller => Boolean(seller?.id && seller.name && seller.email));
  const unique = new Map<string, TimanQuoteSeller>();
  for (const seller of matched) {
    if (!unique.has(seller.id)) unique.set(seller.id, seller);
  }
  return [...unique.values()];
}

export function resolveCanonicalTimanQuoteSeller(
  dealer: DealerSalesAssignment,
  sellers: TimanQuoteSeller[],
): TimanSellerResolution {
  const assignedId = String(dealer.assigned_seller_id || '').trim();
  const assignedEmail = normalizedEmail(dealer.assigned_seller_email);
  const assignedInitials = String(dealer.assigned_seller_initials || '').trim().toUpperCase();
  const assigned = sellers.find((seller) => (
    (assignedId && seller.id === assignedId)
    || (assignedEmail && seller.email === assignedEmail)
    || (assignedInitials && seller.initials === assignedInitials)
  ));
  if (assigned) return { seller: assigned, choices: [assigned], reason: 'ASSIGNED_SELLER' };

  const routingSellers = ROUTING_SELLER_INITIALS
    .map((initials) => sellers.find((seller) => seller.initials === initials))
    .filter((seller): seller is TimanQuoteSeller => Boolean(seller));
  const country = normalizedCountry(dealer.country);
  if (country === 'denmark') {
    const seller = routingSellers.find((candidate) => candidate.initials === 'EM') || null;
    return { seller, choices: seller ? [seller] : [], reason: 'DENMARK' };
  }
  if (country === 'germany') {
    const choices = routingSellers.filter((candidate) => ['JTN', 'AKR'].includes(candidate.initials));
    return { seller: null, choices, reason: 'GERMANY_AMBIGUOUS' };
  }
  return { seller: null, choices: routingSellers, reason: 'MANUAL_SELECTION' };
}
