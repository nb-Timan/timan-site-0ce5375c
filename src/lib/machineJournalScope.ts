/**
 * Build a JournalScope for the current portal user.
 *
 * Access matrix (Phase 2.1 — "current owner" = current dealer):
 *
 *  - timan_backend / timan_service  → unrestricted (see all machines).
 *
 *  - timan_seller                   → all dealers assigned to the seller
 *                                     via CRM ownership, expanded with
 *                                     every child dealer under any of
 *                                     those importer accounts (via
 *                                     dealer_accounts.parent_account_number).
 *
 *  - timan_dealer / dealer_user     → own dealer_number / name only.
 *
 *  - timan_importer                 → own dealer + every dealer with
 *                                     parent_account_number = own
 *                                     account_number.
 *
 *  - timan_service_partner          → own dealer + every dealer linked
 *                                     to this service partner via
 *                                     public.service_partner_dealer_links
 *                                     (active = true).
 *                                     TODO: also include machines they
 *                                     have personally serviced once
 *                                     service_registrations carries a
 *                                     service_partner_account_id column.
 *
 *  - others                         → no access (empty scope).
 *
 * Internal Timan users get `unrestricted = true`. Every other role gets
 * explicit dealer_number + dealer_name allow-lists; records that don't
 * match are filtered out BEFORE rendering so external users can't
 * discover serials belonging to other dealers.
 */
import type { SessionUser } from "@/context/AppUserContext";
import { PortalRole } from "@/lib/portalAccess";
import { resolveSellerId } from "@/lib/resolveSellerId";
import { listCrmAccounts } from "@/lib/crmAccountsService";
import { supabase } from "@/lib/supabase";
import type { JournalScope } from "@/lib/machineJournalService";

const INTERNAL: ReadonlySet<string> = new Set(["timan_backend", "timan_service"]);
const SELLER: ReadonlySet<string> = new Set(["timan_seller"]);
const DEALER_ONLY: ReadonlySet<string> = new Set(["timan_dealer", "dealer_user"]);
const IMPORTER: ReadonlySet<string> = new Set(["timan_importer"]);
const SERVICE_PARTNER: ReadonlySet<string> = new Set(["timan_service_partner"]);

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

/**
 * Look up the dealer_accounts row for the logged-in user. Returns just
 * the bits the scope builder needs.
 */
async function fetchOwnDealerAccount(
  accountNumber: string,
): Promise<{ id: string; account_number: string; company_name: string | null; customer_type: string | null } | null> {
  const { data, error } = await supabase
    .from("dealer_accounts")
    .select("id, account_number, company_name, customer_type")
    .eq("account_number", accountNumber)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; account_number: string; company_name: string | null; customer_type: string | null };
}

/** Add a dealer_accounts row to the scope (number + name). */
function addAccountToScope(
  scope: JournalScope,
  row: { account_number?: string | null; company_name?: string | null; dealer_number?: string | null; company?: string | null; full_name?: string | null; email?: string | null },
): void {
  const num = norm(row.account_number ?? row.dealer_number);
  if (num) scope.dealerNumbers.add(num);
  const nm = norm(row.company_name ?? row.company ?? row.full_name ?? row.email);
  if (nm) scope.dealerNames.add(nm);
}

/** Fetch dealer_accounts rows whose parent_account_number = parentAccountNumber. */
async function fetchChildDealers(parentAccountNumber: string): Promise<Array<{ account_number: string; company_name: string | null }>> {
  const { data, error } = await supabase
    .from("dealer_accounts")
    .select("account_number, company_name")
    .eq("parent_account_number", parentAccountNumber);
  if (error || !data) return [];
  return data as Array<{ account_number: string; company_name: string | null }>;
}

/** Fetch dealer_accounts rows linked to this service partner via the link table. */
async function fetchServicePartnerLinkedDealers(servicePartnerAccountId: string): Promise<Array<{ account_number: string; company_name: string | null }>> {
  const { data, error } = await supabase
    .from("service_partner_dealer_links")
    .select("active, dealer_account:dealer_accounts!service_partner_dealer_links_dealer_account_id_fkey(account_number, company_name)")
    .eq("service_partner_account_id", servicePartnerAccountId)
    .eq("active", true);
  if (error || !data) return [];
  const out: Array<{ account_number: string; company_name: string | null }> = [];
  for (const r of data as Array<{ active: boolean; dealer_account: { account_number: string; company_name: string | null } | null }>) {
    if (r.dealer_account?.account_number) out.push(r.dealer_account);
  }
  return out;
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

  // Seller: CRM-assigned accounts + child dealers under any importer in that list.
  if (SELLER.has(role)) {
    const sellerId = await resolveSellerId(appUser.email);
    const scope = emptyScope(role, dealerLabel);
    if (!sellerId) return scope;
    try {
      const res = await listCrmAccounts({ role, sellerId });
      const importerAccountNumbers: string[] = [];
      for (const a of res.accounts) {
        addAccountToScope(scope, a);
        if ((a.portal_role || "").toLowerCase() === "timan_importer" && a.dealer_number) {
          importerAccountNumbers.push(a.dealer_number);
        }
      }
      // Expand child dealers under every importer in the seller's book.
      if (importerAccountNumbers.length > 0) {
        await Promise.all(
          importerAccountNumbers.map(async (acct) => {
            const kids = await fetchChildDealers(acct);
            for (const k of kids) addAccountToScope(scope, k);
          }),
        );
      }
    } catch (e) {
      console.warn("[machineJournalScope] seller scope expansion failed (tolerated)", e);
    }
    return scope;
  }

  // Dealer-side users always include their own dealer first.
  const scope = emptyScope(role, dealerLabel);
  const ownNumber = norm(appUser.dealer_number);
  if (ownNumber) scope.dealerNumbers.add(ownNumber);
  const ownName = norm(appUser.company_dealer || appUser.display_name);
  if (ownName) scope.dealerNames.add(ownName);

  // Dealer / dealer_user → own dealer only.
  if (DEALER_ONLY.has(role)) return scope;

  // Importer → own dealer + every child via parent_account_number.
  if (IMPORTER.has(role) && appUser.dealer_number) {
    try {
      const kids = await fetchChildDealers(appUser.dealer_number);
      for (const k of kids) addAccountToScope(scope, k);
    } catch (e) {
      console.warn("[machineJournalScope] importer child fetch failed (tolerated)", e);
    }
    return scope;
  }

  // Service partner → own dealer + dealers via service_partner_dealer_links.
  if (SERVICE_PARTNER.has(role) && appUser.dealer_number) {
    try {
      const own = await fetchOwnDealerAccount(appUser.dealer_number);
      if (own) {
        const linked = await fetchServicePartnerLinkedDealers(own.id);
        for (const d of linked) addAccountToScope(scope, d);
      }
    } catch (e) {
      console.warn("[machineJournalScope] service partner link fetch failed (tolerated)", e);
    }
    return scope;
  }

  return scope;
}
