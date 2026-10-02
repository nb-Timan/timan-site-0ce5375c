import type { SessionUser } from "@/context/AppUserContext";
import {
  fetchDealerAccounts,
  fetchDealerAccountsByNumbers,
  type DealerAccount,
} from "@/lib/dealerAccountsService";
import { buildJournalScope } from "@/lib/machineJournalScope";
import {
  hasAreaAccess,
  isInternalTimanPortalRole,
  type PortalRole,
} from "@/lib/portalAccess";

const EXTERNAL_ROLES = new Set<PortalRole>([
  "timan_dealer",
  "timan_importer",
  "timan_service_partner",
  "dealer_customer",
  "dealer_user",
]);

export type PartnerDataScopeSource = "global" | "seller" | "partner" | "none";

export interface PartnerDataScopeResult {
  rows: DealerAccount[];
  source: PartnerDataScopeSource;
  error?: string;
}

/**
 * Normal Partnerdata maintenance is an employee capability, not an account
 * ownership capability. The area check preserves per-user access overrides.
 */
export function canMaintainPartnerdata(
  user: SessionUser | null,
  role: PortalRole | null,
): boolean {
  if (!user || !role || !isInternalTimanPortalRole(role)) return false;
  if (user.approved === false || user.is_active === false) return false;
  return hasAreaAccess({ ...user, portal_role: role }, "dealer_data");
}

/**
 * The list-first Partnerdata scope. The same resolver is used before opening
 * a detail so a deep link cannot reveal an account outside the visible list.
 */
export async function listPartnerDataDealers(
  user: SessionUser | null,
  role: PortalRole | null,
): Promise<PartnerDataScopeResult> {
  if (!user || !role) return { rows: [], source: "none" };

  if (isInternalTimanPortalRole(role)) {
    if (!canMaintainPartnerdata(user, role)) return { rows: [], source: "none" };
    const result = await fetchDealerAccounts();
    return { rows: result.rows, source: "global", error: result.error };
  }

  if (EXTERNAL_ROLES.has(role)) {
    // The scope builder calls the collaboration-manager resolver when relevant.
    // Keep the account read targeted; this page must never fetch every partner
    // and trim the result in the browser.
    const scope = await buildJournalScope(user, role);
    const result = await fetchDealerAccountsByNumbers(Array.from(scope.dealerNumbers));
    return { rows: result.rows, source: "partner", error: result.error };
  }

  return { rows: [], source: "none" };
}

export function canEditPartnerDataAccount(
  user: SessionUser | null,
  role: PortalRole | null,
  accountNumber: string | null | undefined,
): boolean {
  if (!user || !role || !accountNumber) return false;
  if (canMaintainPartnerdata(user, role)) return true;
  return EXTERNAL_ROLES.has(role) && user.dealer_number === accountNumber;
}
