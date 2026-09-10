export type CrmLeadOwnerFilter =
  | ''
  | `seller:${string}`
  | 'other_timan_sellers'
  | 'partner_created'
  | 'unassigned_timan_seller';

export interface CrmLeadOwnerOption {
  id: string;
  initials: string | null;
}

export interface CrmLeadOwnerFilterOptions {
  primary: CrmLeadOwnerOption[];
  primarySellerIds: string[];
  hasOtherSellers: boolean;
}

const PRIMARY_SELLER_INITIALS = new Set(['BP', 'EM', 'JTN', 'AKR']);

/**
 * Owner choices are derived from canonical app_users ids and initials. Display
 * initials never become the filter key.
 */
export function buildCrmLeadOwnerFilterOptions(
  owners: CrmLeadOwnerOption[],
): CrmLeadOwnerFilterOptions {
  const uniqueOwners = Array.from(new Map(
    owners
      .filter((owner) => owner.id)
      .map((owner) => [owner.id, { ...owner, initials: owner.initials?.trim().toUpperCase() || null }]),
  ).values());

  const primary = uniqueOwners
    .filter((owner) => owner.initials && PRIMARY_SELLER_INITIALS.has(owner.initials))
    .sort((a, b) => a.initials!.localeCompare(b.initials!, 'da'));
  const primaryIds = new Set(primary.map((owner) => owner.id));

  return {
    primary,
    primarySellerIds: primary.map((owner) => owner.id),
    hasOtherSellers: uniqueOwners.some((owner) => !primaryIds.has(owner.id)),
  };
}

export function crmLeadOwnerFilterSellerId(filter: CrmLeadOwnerFilter): string | null {
  return filter.startsWith('seller:') ? filter.slice('seller:'.length) || null : null;
}
