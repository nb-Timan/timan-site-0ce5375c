/**
 * Build a JournalScope for the current portal user.
 *
 * Access matrix:
 *  - timan_backend / timan_service        → unrestricted (see all machines).
 *  - timan_seller                         → only machines linked to dealers
 *                                            assigned to the seller (via
 *                                            app_users.account_owner_user_id
 *                                            = sellerId). Reuses the same
 *                                            assignment used in CRM /
 *                                            "Mine forhandlere".
 *  - timan_dealer / dealer_user           → only own dealer_number.
 *  - timan_importer                       → own dealer_number only for now.
 *                                            TODO: expand to dealers under
 *                                            the importer when a hierarchy
 *                                            table is available.
 *  - timan_service_partner                → own dealer_number only for now.
 *                                            TODO: expand to dealers
 *                                            connected through the service
 *                                            partner relationship when
 *                                            available.
 *  - others                               → no access (empty scope).
 *
 * Internal Timan users get `unrestricted = true` and a permissive predicate.
 * Every other role gets explicit dealer_number + dealer_name allow-lists;
 * records that don't match are filtered out client-side BEFORE rendering
 * so external users can't discover serials belonging to other dealers.
 */
import type { SessionUser } from "@/context/AppUserContext";
import { PortalRole } from "@/lib/portalAccess";
import { resolveSellerId } from "@/lib/resolveSellerId";
import { listCrmAccounts } from "@/lib/crmAccountsService";
import type { JournalScope } from "@/lib/machineJournalService";

const INTERNAL: ReadonlySet<string> = new Set(["timan_backend", "timan_service"]);
const SELLER: ReadonlySet<string> = new Set(["timan_seller"]);
const DEALER_SIDE: ReadonlySet<string> = new Set([
  "timan_dealer", "dealer_user", "timan_importer", "timan_service_partner",
]);

function norm(s: string | null | undefined): string {
  return (s ?? "").toString().trim().toLowerCase();
}

function emptyScope(role: PortalRole | null, dealerLabel: string | null): JournalScope {
  return {
    role,
    dealerLabel,
    dealerNumbers: new Set<string>(),
    dealerNames: new Set<string>(),
    unrestricted: false,
  };
}

export async function buildJournalScope(
  appUser: SessionUser | null,
  role: PortalRole | null,
): Promise<JournalScope> {
  const dealerLabel = appUser?.display_name ?? null;

  if (!appUser || !role) return emptyScope(role, dealerLabel);

  // Internal Timan
  if (INTERNAL.has(role)) {
    return {
      role, dealerLabel,
      dealerNumbers: new Set(),
      dealerNames: new Set(),
      unrestricted: true,
    };
  }

  // Seller: pull assigned dealer accounts via CRM scope
  if (SELLER.has(role)) {
    const sellerId = await resolveSellerId(appUser.email);
    const scope = emptyScope(role, dealerLabel);
    if (!sellerId) return scope;
    try {
      const res = await listCrmAccounts({ role, sellerId });
      for (const a of res.accounts) {
        const num = norm(a.dealer_number);
        if (num) scope.dealerNumbers.add(num);
        const nm = norm(a.company || a.full_name || a.email);
        if (nm) scope.dealerNames.add(nm);
      }
    } catch (e) {
      console.warn("[machineJournalScope] seller CRM accounts failed (tolerated)", e);
    }
    return scope;
  }

  // Dealer-side users: own dealer only
  if (DEALER_SIDE.has(role)) {
    const scope = emptyScope(role, dealerLabel);
    const num = norm(appUser.dealer_number);
    if (num) scope.dealerNumbers.add(num);
    const nm = norm(appUser.company_dealer || appUser.display_name);
    if (nm) scope.dealerNames.add(nm);
    return scope;
  }

  return emptyScope(role, dealerLabel);
}
