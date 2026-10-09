import type { SessionUser } from "@/context/AppUserContext";
import {
  fetchPartnerDataAccountsForEffectiveUser,
  type DealerAccount,
} from "@/lib/dealerAccountsService";
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
 * Partnerdata maintenance capability. Account scope is deliberately resolved
 * separately by the canonical server-side account resolver.
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
    const result = await fetchPartnerDataAccountsForEffectiveUser(user.id, { includeDeleted: false });
    return {
      rows: result.rows,
      source: role === "timan_seller" ? "seller" : "global",
      error: result.error,
    };
  }

  if (EXTERNAL_ROLES.has(role)) {
    if (!user.dealer_number?.trim()) return { rows: [], source: "none" };
    const result = await fetchPartnerDataAccountsForEffectiveUser(user.id, { includeDeleted: false });
    return { rows: result.rows, source: "partner", error: result.error };
  }

  return { rows: [], source: "none" };
}

export function canEditPartnerDataAccount(
  user: SessionUser | null,
  role: PortalRole | null,
  accountNumber: string | null | undefined,
  accountInResolvedScope = false,
): boolean {
  if (!user || !role || !accountNumber) return false;
  if (role === "timan_backend" || role === "timan_service") {
    return canMaintainPartnerdata(user, role);
  }
  if (role === "timan_seller") {
    return canMaintainPartnerdata(user, role) && accountInResolvedScope;
  }
  return EXTERNAL_ROLES.has(role) && user.dealer_number === accountNumber;
}
