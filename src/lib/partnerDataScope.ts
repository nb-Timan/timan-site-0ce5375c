import type { SessionUser } from "@/context/AppUserContext";
import {
  fetchDealerAccounts,
  fetchDealerAccountsByNumbers,
  fetchDealerAccountsForSeller,
  type DealerAccount,
} from "@/lib/dealerAccountsService";
import { buildJournalScope } from "@/lib/machineJournalScope";
import type { PortalRole } from "@/lib/portalAccess";
import { supabase } from "@/lib/supabase";

const INTERNAL_ROLES = new Set<PortalRole>(["timan_backend", "timan_service"]);
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

async function listCanonicalRelatedAccountNumbers(sourceAccountIds: string[]): Promise<string[]> {
  if (sourceAccountIds.length === 0) return [];
  // RLS controls both the relationship read and the nested target account.
  // This is additive to the established parent/child and service-link scope.
  const { data, error } = await supabase
    .from("partner_account_relations")
    .select("target_account:dealer_accounts!partner_account_relations_target_account_id_fkey(account_number)")
    .in("source_account_id", sourceAccountIds)
    .eq("active", true);
  if (error) return [];

  return (data ?? []).flatMap((row) => {
    const target = row.target_account;
    const item = Array.isArray(target) ? target[0] : target;
    return item?.account_number ? [item.account_number] : [];
  });
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

  if (INTERNAL_ROLES.has(role)) {
    const result = await fetchDealerAccounts();
    return { rows: result.rows, source: "global", error: result.error };
  }

  if (role === "timan_seller") {
    const result = await fetchDealerAccountsForSeller({
      initials: user.initials,
      email: user.email,
    });
    const related = await listCanonicalRelatedAccountNumbers(result.dealers.map((dealer) => dealer.id));
    const relatedRows = await fetchDealerAccountsByNumbers(related);
    const rowsById = new Map(result.dealers.map((dealer) => [dealer.id, dealer]));
    for (const dealer of relatedRows.rows) rowsById.set(dealer.id, dealer);
    return {
      rows: Array.from(rowsById.values()).sort((a, b) => a.company_name.localeCompare(b.company_name, "da")),
      source: "seller",
      error: result.error ?? relatedRows.error,
    };
  }

  if (EXTERNAL_ROLES.has(role)) {
    // Reuse the portal's canonical own-account, child-account and service-link
    // expansion, then add explicit partner-account relations. The final targeted
    // read remains subject to dealer_accounts RLS.
    const scope = await buildJournalScope(user, role);
    const own = user.dealer_number
      ? await fetchDealerAccountsByNumbers([user.dealer_number])
      : { rows: [] };
    const related = await listCanonicalRelatedAccountNumbers(own.rows.map((dealer) => dealer.id));
    const result = await fetchDealerAccountsByNumbers([
      ...scope.dealerNumbers,
      ...related,
    ]);
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
  if (INTERNAL_ROLES.has(role) || role === "timan_seller") return true;
  return EXTERNAL_ROLES.has(role) && user.dealer_number === accountNumber;
}
