/**
 * CRM accounts — read-side aggregator.
 *
 * Returns the dealer / importer / service-partner / dealer-user rows from
 * public.app_users that should be visible in the CRM, scoped by seller.
 *
 * - Timan Backend / Timan Service: see all
 * - Timan Sælger: see only rows where account_owner_user_id = own id
 * - Other roles: empty (UI also blocks them)
 */
import { supabase } from "@/lib/supabase";
import { PortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isDealerNumberAllowed, isExternalCrmRole, isScopedSeller } from "@/lib/crmScope";
import { AKR_SEED_ACCOUNTS } from "@/lib/akrTestSeed";

export interface CrmAccount {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  country: string | null;
  preferred_language: string | null;
  role: string | null;
  partner_type: string | null;
  portal_role: string | null;
  dealer_number: string | null;
  status: string | null;
  account_owner_user_id: string | null;
  account_owner_name: string | null;
  account_owner_initials: string | null;
  account_owner_email: string | null;
  created_at: string | null;
  notes: string | null;
}

const ACCOUNT_PORTAL_ROLES = new Set(["timan_dealer", "timan_importer", "timan_service_partner", "dealer_customer", "dealer_user"]);

export interface ListAccountsOpts {
  role: PortalRole | null;
  sellerId: string | null;
  dealerNumbers?: string[] | null;
}

export interface ListAccountsResult {
  accounts: CrmAccount[];
  source: "supabase" | "fallback";
  error?: string;
}

export async function listCrmAccounts(opts: ListAccountsOpts): Promise<ListAccountsResult> {
  if (!opts.role) return { accounts: [], source: "fallback" };
  if (!isCrmAdmin(opts.role) && !isScopedSeller(opts.role) && !isExternalCrmRole(opts.role)) {
    return { accounts: [], source: "fallback" };
  }

  // Always fold in the AKR demo accounts (test data; harmless if Supabase has rows too — id collision avoided by `akr-acc-*` prefix).
  const akrSeedAccounts = AKR_SEED_ACCOUNTS as unknown as CrmAccount[];

  try {
    const { data, error } = await supabase
      .from("app_users")
      .select("*")
      .order("company", { ascending: true });
    if (error) throw error;

    const filtered = (data ?? []).filter((r: Record<string, unknown>) => {
      const portalRole = (r.portal_role as string | null) ?? null;
      const role = (r.role as string | null) ?? null;
      const partnerType = (r.partner_type as string | null) ?? null;
      if (portalRole && ACCOUNT_PORTAL_ROLES.has(portalRole)) return true;
      if (role === "partner") return true;
      // Skip backend/seller/internal accounts.
      return partnerType !== null && partnerType !== "";
    });

    const mapped = [...filtered.map(rowToAccount), ...akrSeedAccounts];
    if (isScopedSeller(opts.role) && opts.sellerId) {
      return {
        accounts: mapped.filter(
          (a) => a.account_owner_user_id === opts.sellerId
              || (a.account_owner_email || "").toLowerCase() === "akr@timan.dk",
        ),
        source: "supabase",
      };
    }
    if (isExternalCrmRole(opts.role)) {
      return {
        accounts: mapped.filter((a) => isDealerNumberAllowed(a.dealer_number, opts.dealerNumbers)),
        source: "supabase",
      };
    }
    return { accounts: mapped, source: "supabase" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fallback: still expose AKR demo accounts so the CRM is usable in preview.
    if (isExternalCrmRole(opts.role)) {
      return { accounts: [], source: "fallback", error: msg };
    }
    if (isScopedSeller(opts.role)) {
      return { accounts: akrSeedAccounts, source: "fallback", error: msg };
    }
    return { accounts: akrSeedAccounts, source: "fallback", error: msg };
  }
}

function rowToAccount(r: Record<string, unknown>): CrmAccount {
  return {
    id: String(r.id),
    email: (r.email as string) ?? "",
    full_name: (r.full_name as string | null) ?? null,
    company: (r.company as string | null) ?? null,
    country: (r.country as string | null) ?? null,
    preferred_language: (r.preferred_language as string | null) ?? null,
    role: (r.role as string | null) ?? null,
    partner_type: (r.partner_type as string | null) ?? null,
    portal_role: (r.portal_role as string | null) ?? null,
    dealer_number: (r.dealer_number as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    account_owner_user_id: (r.account_owner_user_id as string | null) ?? null,
    account_owner_name: (r.account_owner_name as string | null) ?? null,
    account_owner_initials: (r.account_owner_initials as string | null) ?? null,
    account_owner_email: (r.account_owner_email as string | null) ?? null,
    created_at: (r.created_at as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

export function accountDisplayName(a: Pick<CrmAccount, "company" | "full_name" | "email">): string {
  return a.company || a.full_name || a.email;
}
