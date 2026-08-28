/**
 * Dealer accounts service — public.dealer_accounts.
 *
 * Used by:
 *   • Backend → Forhandlere (admin page)
 *   • Backend → Brugere (dealer picker when approving users)
 *
 * Does NOT touch configurator pricing, product data or quote/order logic.
 */

import { supabase } from "@/lib/supabase";
import { sellerInitialsMatch } from "@/lib/sellerInitials";
import { listScopedOrdersWithValue } from "@/lib/crmConfigurationsService";
import { dealerKeyOf } from "@/lib/crmRelationsService";

export interface DealerAccount {
  id: string;
  account_number: string;
  company_name: string;
  customer_type: string | null;
  customer_type_label: string | null;
  dealer_type: string | null;
  country: string | null;
  postal_code: string | null;
  city: string | null;
  address: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  zip_city_raw: string | null;
  email: string | null;
  phone: string | null;
  vat_number: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  assigned_seller_initials: string | null;
  assigned_seller_name: string | null;
  assigned_seller_email: string | null;
  source_created_at: string | null;
  source_changed_at: string | null;
  is_blocked: boolean;
  blocked_at: string | null;
  blocked_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  parent_account_number: string | null;
  is_main_account: boolean;
  branch_name: string | null;
  director_name: string | null;
  invoice_email: string | null;
  payment_terms: string | null;
  currency_code: string | null;
  finance_contact_name: string | null;
  finance_contact_phone: string | null;
  finance_contact_email: string | null;
  website: string | null;
  social_facebook: string | null;
  social_linkedin: string | null;
  social_tiktok: string | null;
  social_youtube: string | null;
  social_instagram: string | null;
  sales_contact_name: string | null;
  sales_contact_phone: string | null;
  sales_contact_email: string | null;
  sales_has_multiple: boolean;
  workshop_contact_name: string | null;
  workshop_contact_phone: string | null;
  workshop_contact_email: string | null;
  workshop_has_multiple: boolean;
  marketing_contact_name: string | null;
  marketing_contact_phone: string | null;
  marketing_contact_email: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  geocoding_status: string | null;
  geocoding_error: string | null;
  google_place_id: string | null;
  // Phase 60 — successor / efterfølger-forhandler (portalstyret, ikke SharePoint).
  successor_dealer_id: string | null;
  successor_dealer_account_number: string | null;
  closed_reason: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DealerLifecycleStatus = "active" | "blocked" | "closed";

/** Status afledt af is_deleted / is_blocked. */
export function dealerLifecycleStatus(d: Pick<DealerAccount, "is_deleted" | "is_blocked">): DealerLifecycleStatus {
  if (d.is_deleted) return "closed";
  if (d.is_blocked) return "blocked";
  return "active";
}

export function isDealerInactive(d: Pick<DealerAccount, "is_deleted" | "is_blocked">): boolean {
  return d.is_deleted || d.is_blocked;
}

export function isDealerCustomerAccount(
  d: Pick<DealerAccount, "customer_type" | "customer_type_label" | "dealer_type">,
): boolean {
  return [d.customer_type, d.customer_type_label, d.dealer_type].some((value) => {
    const normalized = (value ?? "").toLowerCase().replace(/[\s_-]+/g, "");
    return normalized === "forhandlerkunde" || normalized === "dealercustomer";
  });
}




export type DealerAccountsSource = "supabase" | "fallback";

export interface DealerAccountsResult {
  source: DealerAccountsSource;
  rows: DealerAccount[];
  error?: string;
}

function rowToDealer(row: Record<string, unknown>): DealerAccount {
  return {
    id: String(row.id),
    account_number: (row.account_number as string) || "",
    company_name: (row.company_name as string) || "",
    customer_type: (row.customer_type as string | null) ?? null,
    customer_type_label: (row.customer_type_label as string | null) ?? null,
    dealer_type: (row.dealer_type as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    postal_code: (row.postal_code as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    address_line_1: (row.address_line_1 as string | null) ?? null,
    address_line_2: (row.address_line_2 as string | null) ?? null,
    zip_city_raw: (row.zip_city_raw as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    vat_number: (row.vat_number as string | null) ?? null,
    primary_contact_name: (row.primary_contact_name as string | null) ?? null,
    primary_contact_email: (row.primary_contact_email as string | null) ?? null,
    primary_contact_phone: (row.primary_contact_phone as string | null) ?? null,
    assigned_seller_initials: (row.assigned_seller_initials as string | null) ?? null,
    assigned_seller_name: (row.assigned_seller_name as string | null) ?? null,
    assigned_seller_email: (row.assigned_seller_email as string | null) ?? null,
    source_created_at: (row.source_created_at as string | null) ?? null,
    source_changed_at: (row.source_changed_at as string | null) ?? null,
    is_blocked: Boolean(row.is_blocked ?? false),
    blocked_at: (row.blocked_at as string | null) ?? null,
    blocked_by: (row.blocked_by as string | null) ?? null,
    is_deleted: Boolean(row.is_deleted ?? false),
    deleted_at: (row.deleted_at as string | null) ?? null,
    deleted_by: (row.deleted_by as string | null) ?? null,
    parent_account_number: (row.parent_account_number as string | null) ?? null,
    is_main_account: Boolean(row.is_main_account ?? false),
    branch_name: (row.branch_name as string | null) ?? null,
    director_name: (row.director_name as string | null) ?? null,
    invoice_email: (row.invoice_email as string | null) ?? null,
    payment_terms: (row.payment_terms as string | null) ?? null,
    currency_code: (row.currency_code as string | null) ?? null,
    finance_contact_name: (row.finance_contact_name as string | null) ?? null,
    finance_contact_phone: (row.finance_contact_phone as string | null) ?? null,
    finance_contact_email: (row.finance_contact_email as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    social_facebook: (row.social_facebook as string | null) ?? null,
    social_linkedin: (row.social_linkedin as string | null) ?? null,
    social_tiktok: (row.social_tiktok as string | null) ?? null,
    social_youtube: (row.social_youtube as string | null) ?? null,
    social_instagram: (row.social_instagram as string | null) ?? null,
    sales_contact_name: (row.sales_contact_name as string | null) ?? null,
    sales_contact_phone: (row.sales_contact_phone as string | null) ?? null,
    sales_contact_email: (row.sales_contact_email as string | null) ?? null,
    sales_has_multiple: Boolean(row.sales_has_multiple ?? false),
    workshop_contact_name: (row.workshop_contact_name as string | null) ?? null,
    workshop_contact_phone: (row.workshop_contact_phone as string | null) ?? null,
    workshop_contact_email: (row.workshop_contact_email as string | null) ?? null,
    workshop_has_multiple: Boolean(row.workshop_has_multiple ?? false),
    marketing_contact_name: (row.marketing_contact_name as string | null) ?? null,
    marketing_contact_phone: (row.marketing_contact_phone as string | null) ?? null,
    marketing_contact_email: (row.marketing_contact_email as string | null) ?? null,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    geocoded_at: (row.geocoded_at as string | null) ?? null,
    geocoding_status: (row.geocoding_status as string | null) ?? null,
    geocoding_error: (row.geocoding_error as string | null) ?? null,
    google_place_id: (row.google_place_id as string | null) ?? null,
    successor_dealer_id: (row.successor_dealer_id as string | null) ?? null,
    successor_dealer_account_number: (row.successor_dealer_account_number as string | null) ?? null,
    closed_reason: (row.closed_reason as string | null) ?? null,
    closed_at: (row.closed_at as string | null) ?? null,
    created_at: (row.created_at as string) || new Date().toISOString(),
    updated_at: (row.updated_at as string) || new Date().toISOString(),
  };
}

/**
 * Format a Supabase / PostgrestError-like object into a useful, human-readable string.
 * Logs the full object so it can be inspected in the browser console.
 */
function describeSupabaseError(label: string, err: unknown): string {
  // eslint-disable-next-line no-console
  console.error(`[dealerAccountsService] ${label}:`, err);
  if (!err) return `${label}: ukendt fejl`;
  if (typeof err === "string") return `${label}: ${err}`;
  const e = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
  const parts: string[] = [];
  if (typeof e.message === "string" && e.message) parts.push(e.message);
  if (e.code != null) parts.push(`code=${String(e.code)}`);
  if (typeof e.details === "string" && e.details) parts.push(`details=${e.details}`);
  if (typeof e.hint === "string" && e.hint) parts.push(`hint=${e.hint}`);
  if (parts.length === 0) {
    try { return `${label}: ${JSON.stringify(err)}`; } catch { return `${label}: [unserialiserbar fejl]`; }
  }
  return `${label}: ${parts.join(" · ")}`;
}

export async function fetchDealerAccounts(opts: { includeDeleted?: boolean } = {}): Promise<DealerAccountsResult> {
  // Require an active Supabase Auth session — dealer_accounts RLS is
  // restricted to authenticated Timan Backend users.
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return {
      source: "fallback",
      rows: [],
      error:
        "Du er ikke logget ind med Supabase Auth. Forhandler-data kræver, at " +
        "du logger ind med email og adgangskode som godkendt Timan Backend bruger.",
    };
  }

  // Try direct SELECT first (relies on the dealer_accounts_select_backend RLS policy).
  try {
    let query = supabase
      .from("dealer_accounts")
      .select("*")
      .order("company_name", { ascending: true });
    if (!opts.includeDeleted) {
      query = query.or("is_deleted.is.null,is_deleted.eq.false");
    }
    const { data, error } = await query;
    if (error) throw error;
    if (data && data.length > 0) {
      return { source: "supabase", rows: data.map(rowToDealer) };
    }
    // 0 rows could mean "no data" OR "RLS hid them" — try the RPC fallback.
  } catch (e) {
    // Direct select failed — log and fall through to RPC.
    describeSupabaseError("Direct SELECT på dealer_accounts fejlede", e);
  }

  // Fallback: SECURITY DEFINER RPC that authorizes inside the function.
  // Phase 13 SQL: public.list_dealer_accounts_for_backend().
  try {
    const { data, error } = await supabase.rpc("list_dealer_accounts_for_backend");
    if (error) throw error;
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    const mapped = rows
      .map(rowToDealer)
      .filter((r) => opts.includeDeleted || !r.is_deleted);
    return { source: "supabase", rows: mapped };
  } catch (e) {
    return {
      source: "fallback",
      rows: [],
      error: describeSupabaseError("Supabase fejl ved hentning af dealer_accounts", e),
    };
  }
}

/**
 * Diagnostic helper — calls the SECURITY DEFINER RPC public.backend_auth_check()
 * which returns what the database thinks of the current session: jwt email,
 * uid, matched app_user, role, is_backend. Used by the Forhandlere page to
 * show a clear explanation when access is denied.
 */
export interface BackendAuthCheck {
  has_session: boolean;
  jwt_email: string | null;
  jwt_uid: string | null;
  matched_app_user: boolean;
  app_user_email: string | null;
  app_user_role: string | null;
  is_active: boolean | null;
  approved: boolean | null;
  is_backend: boolean;
}

export async function fetchBackendAuthCheck(): Promise<{ check: BackendAuthCheck | null; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("backend_auth_check");
    if (error) throw error;
    const row = Array.isArray(data) ? (data[0] as BackendAuthCheck | undefined) : (data as BackendAuthCheck | null);
    return { check: row ?? null };
  } catch (e) {
    return { check: null, error: describeSupabaseError("backend_auth_check fejlede", e) };
  }
}

export interface UpdateSellerPatch {
  assigned_seller_initials: string | null;
  assigned_seller_name: string | null;
  assigned_seller_email: string | null;
}

export async function updateDealerSeller(
  id: string,
  patch: UpdateSellerPatch,
): Promise<{ ok: boolean; error?: string; row?: DealerAccount }> {
  try {
    const { data, error } = await supabase
      .from("dealer_accounts")
      .update({
        assigned_seller_initials: patch.assigned_seller_initials,
        assigned_seller_name: patch.assigned_seller_name,
        assigned_seller_email: patch.assigned_seller_email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return { ok: true, row: data ? rowToDealer(data) : undefined };
  } catch (e) {
    return { ok: false, error: describeSupabaseError("Kunne ikke gemme sælger", e) };
  }
}

export interface UpdateDealerAccountPatch {
  company_name?: string | null;
  account_number?: string | null;
  country?: string | null;
  address?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  zip_city_raw?: string | null;
  postal_code?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  vat_number?: string | null;
  primary_contact_name?: string | null;
  primary_contact_email?: string | null;
  primary_contact_phone?: string | null;
  assigned_seller_initials?: string | null;
  assigned_seller_name?: string | null;
  assigned_seller_email?: string | null;
  dealer_type?: string | null;
  customer_type?: string | null;
  customer_type_label?: string | null;
  // Phase 52 — self-service profile.
  director_name?: string | null;
  invoice_email?: string | null;
  payment_terms?: string | null;
  currency_code?: string | null;
  finance_contact_name?: string | null;
  finance_contact_phone?: string | null;
  finance_contact_email?: string | null;
  website?: string | null;
  social_facebook?: string | null;
  social_linkedin?: string | null;
  social_tiktok?: string | null;
  social_youtube?: string | null;
  social_instagram?: string | null;
  sales_contact_name?: string | null;
  sales_contact_phone?: string | null;
  sales_contact_email?: string | null;
  sales_has_multiple?: boolean | null;
  workshop_contact_name?: string | null;
  workshop_contact_phone?: string | null;
  workshop_contact_email?: string | null;
  workshop_has_multiple?: boolean | null;
  marketing_contact_name?: string | null;
  marketing_contact_phone?: string | null;
  marketing_contact_email?: string | null;
  // Geocoding (set by GoogleAddressAutocomplete on dealer create/edit).
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
  geocoded_at?: string | null;
  geocoding_status?: string | null;
  geocoding_error?: string | null;
}

/**
 * Update editable dealer_accounts fields. Backend/Admin only — RLS on
 * dealer_accounts will reject non-backend callers and the error is
 * surfaced as a Danish permission message.
 *
 * Does NOT touch orders, quotes, activities, budget, users, prices or
 * configurator data.
 */
export async function updateDealerAccount(
  id: string,
  patch: UpdateDealerAccountPatch,
): Promise<{ ok: boolean; error?: string; row?: DealerAccount }> {
  try {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) update[k] = v;
    }
    const { data, error } = await supabase
      .from("dealer_accounts")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) {
      const code = (error as { code?: string }).code;
      const msg = (error as { message?: string }).message || "";
      if (code === "42501" || /row-level security|permission/i.test(msg)) {
        return { ok: false, error: "Kun backend kan rette forhandleroplysninger." };
      }
      throw error;
    }
    return { ok: true, row: data ? rowToDealer(data) : undefined };
  } catch (e) {
    return { ok: false, error: describeSupabaseError("Kunne ikke gemme forhandler", e) };
  }
}

// ============================================================
// Dealer-level aggregated statistics
// ------------------------------------------------------------
// Source: public.dealer_account_stats (view created in phase11).
// Falls back to a local aggregation across dealer_accounts + app_users
// + configurations if the view is not yet present.
// ============================================================

export interface DealerAccountStats {
  id: string;
  account_number: string;
  company_name: string;
  customer_type: string | null;
  customer_type_label: string | null;
  country: string | null;
  assigned_seller_initials: string | null;
  assigned_seller_name: string | null;
  assigned_seller_email: string | null;
  is_blocked: boolean;
  is_deleted: boolean;
  user_count: number;
  activity_count: number;
  quote_count: number;
  order_count: number;
  last_activity_at: string | null;
  user_ids: string[];
}

function rowToStats(row: Record<string, unknown>): DealerAccountStats {
  const userIds = Array.isArray(row.user_ids)
    ? (row.user_ids as unknown[]).filter((x) => typeof x === "string") as string[]
    : [];
  const last = row.last_activity_at as string | null | undefined;
  // The view uses 'epoch' as a coalesce baseline — treat it as "never".
  const lastClean = last && !last.startsWith("1970-") ? last : null;
  return {
    id: String(row.id),
    account_number: (row.account_number as string) || "",
    company_name: (row.company_name as string) || "",
    customer_type: (row.customer_type as string | null) ?? null,
    customer_type_label: (row.customer_type_label as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    assigned_seller_initials: (row.assigned_seller_initials as string | null) ?? null,
    assigned_seller_name: (row.assigned_seller_name as string | null) ?? null,
    assigned_seller_email: (row.assigned_seller_email as string | null) ?? null,
    is_blocked: Boolean(row.is_blocked ?? false),
    is_deleted: Boolean(row.is_deleted ?? false),
    user_count: Number(row.user_count ?? 0),
    activity_count: Number(row.activity_count ?? 0),
    quote_count: Number(row.quote_count ?? 0),
    order_count: Number(row.order_count ?? 0),
    last_activity_at: lastClean,
    user_ids: userIds,
  };
}

interface DealerActivityAgg { quote: number; order: number; last: string | null }
interface DealerActivityOverlay {
  byDealerId: Map<string, DealerActivityAgg>;
}

function normalizeDealerName(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function lookupSellerIdForOrderScope(email: string | null): Promise<string | null> {
  if (!email) return null;
  try {
    const { data, error } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (error) throw error;
    return (data?.id as string | null) ?? null;
  } catch {
    return null;
  }
}

function dealerKeysForStatsRow(row: Pick<DealerAccountStats, "id" | "account_number" | "company_name">): Set<string> {
  return new Set([
    dealerKeyOf({ dealer_account_id: row.id, dealer_number: null, dealer_account_number: null, dealer_company_name: null, dealer_name: null }),
    dealerKeyOf({ dealer_account_id: null, dealer_number: row.account_number, dealer_account_number: null, dealer_company_name: null, dealer_name: null }),
    dealerKeyOf({ dealer_account_id: null, dealer_number: null, dealer_account_number: null, dealer_company_name: row.company_name, dealer_name: null }),
  ].filter((x): x is string => Boolean(x)));
}

/**
 * Phase 31 — Build per-dealer quote/order counts and last_activity_at from
 * configurator documents (crm_configurations_view, fallback configurations).
 *
 * Why: dealer_account_stats joins configurations via app_users.dealer_number,
 * which misses configurations created by Timan sellers on behalf of a dealer.
 * Configurations carry dealer_account_id / dealer_number / dealer_name
 * directly (phase 23 ownership), so we count from there instead.
 *
 * Matching priority per row:
 *   1. dealer_account_id  → dealer_accounts.id
 *   2. dealer_number      → dealer_accounts.account_number
 *   3. normalized dealer_name → dealer_accounts.company_name
 */
async function loadDealerActivityOverlay(
  dealers: DealerAccountStats[],
): Promise<DealerActivityOverlay> {
  const byDealerId = new Map<string, DealerActivityAgg>();
  const byAccountNo = new Map<string, string>();
  const byNameLc = new Map<string, string>();
  for (const d of dealers) {
    if (d.account_number) byAccountNo.set(d.account_number, d.id);
    const n = normalizeDealerName(d.company_name);
    if (n) byNameLc.set(n, d.id);
  }

  // crm_configurations_view does NOT expose case_type (it folds into
  // document_type). Query the view without case_type, fall back to the
  // base configurations table (which has case_type) on error.
  const VIEW_COLS = [
    "id", "document_type", "case_status",
    "dealer_account_id", "dealer_number", "dealer_name",
    "order_sent_at", "quote_sent_at", "submitted_at", "last_saved_at", "created_at",
  ].join(", ");
  const TABLE_COLS = [
    "id", "document_type", "case_type", "case_status",
    "dealer_account_id", "dealer_number", "dealer_name",
    "order_sent_at", "quote_sent_at", "submitted_at", "last_saved_at", "created_at",
  ].join(", ");

  let rows: Array<Record<string, unknown>> = [];
  const v = await supabase
    .from("crm_configurations_view")
    .select(VIEW_COLS)
    .neq("case_status", "deleted")
    .limit(2000);
  if (!v.error && v.data) {
    rows = v.data as unknown as Array<Record<string, unknown>>;
  } else {
    const f = await supabase
      .from("configurations")
      .select(TABLE_COLS)
      .neq("case_status", "deleted")
      .limit(2000);
    if (f.error) throw f.error;
    rows = (f.data ?? []) as unknown as Array<Record<string, unknown>>;
  }


  for (const r of rows) {
    // Mirror crmConfigurationsService.rowToConfig: a row is an order when
    // document_type='order' OR case_type='order' OR case_status='ordre_afgivet'.
    // Otherwise it's a quote (only if document_type/case_type say quote).
    const rawDocType = (r.document_type as string | null) ?? null;
    const rawCaseType = (r.case_type as string | null) ?? null;
    const caseStatus = (r.case_status as string | null) ?? null;
    const isOrder = rawDocType === "order" || rawCaseType === "order" || caseStatus === "ordre_afgivet";
    const isQuote = !isOrder && (rawDocType === "quote" || rawCaseType === "quote");
    if (!isOrder && !isQuote) continue;

    let dealerId: string | undefined;
    const accId = r.dealer_account_id as string | null;
    if (accId && dealers.some((d) => d.id === accId)) dealerId = accId;
    if (!dealerId) {
      const dn = r.dealer_number as string | null;
      if (dn) dealerId = byAccountNo.get(dn);
    }
    if (!dealerId) {
      const nm = normalizeDealerName(r.dealer_name as string | null);
      if (nm) dealerId = byNameLc.get(nm);
    }
    if (!dealerId) continue;

    const agg = byDealerId.get(dealerId) ?? { quote: 0, order: 0, last: null };
    if (isOrder) agg.order += 1;
    else agg.quote += 1;
    const candidates = [
      r.order_sent_at, r.quote_sent_at, r.submitted_at, r.last_saved_at, r.created_at,
    ].filter((x): x is string => typeof x === "string" && !!x);
    for (const c of candidates) {
      if (!agg.last || c > agg.last) agg.last = c;
    }
    byDealerId.set(dealerId, agg);
  }

  return { byDealerId };
}

export async function fetchDealerAccountStats(): Promise<{
  source: DealerAccountsSource;
  rows: DealerAccountStats[];
  error?: string;
}> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return { source: "fallback", rows: [], error: "Supabase Auth session påkrævet." };
  }

  // Try the view first
  const view = await supabase
    .from("dealer_account_stats")
    .select("*")
    .order("company_name", { ascending: true });

  if (!view.error && view.data) {
    const rows = view.data.map(rowToStats);
    // Phase 31 fix: dealer_account_stats only counts configurations created
    // by users belonging to the dealer (via app_users.dealer_number). It
    // misses orders/quotes created by Timan sellers on behalf of a dealer.
    // Override quote_count / order_count / last_activity_at from the
    // configurations view, matching by dealer_account_id, dealer_number, or
    // normalized dealer name. Keep user_count from the original view.
    try {
      const overlay = await loadDealerActivityOverlay(rows);
      for (const r of rows) {
        const o = overlay.byDealerId.get(r.id);
        if (!o) continue;
        r.quote_count = o.quote;
        r.order_count = o.order;
        r.activity_count = o.quote + o.order;
        if (o.last && (!r.last_activity_at || o.last > r.last_activity_at)) {
          r.last_activity_at = o.last;
        }
      }
    } catch (e) {
      console.warn("[dealerAccountsService] overlay failed", e);
    }
    return { source: "supabase", rows };
  }

  // Fallback: build stats client-side from dealer_accounts + app_users +
  // configurations. Slower and chatty, but keeps the UI alive while the
  // phase11 SQL hasn't been applied yet.
  const [dealersRes, usersRes, configsRes] = await Promise.all([
    supabase.from("dealer_accounts").select("*"),
    supabase.from("app_users").select("id, dealer_number, last_login"),
    supabase.from("configurations").select("created_by_user_id, case_type, last_saved_at"),
  ]);

  if (dealersRes.error) {
    return { source: "fallback", rows: [], error: dealersRes.error.message };
  }

  const users = (usersRes.data ?? []) as Array<{ id: string; dealer_number: string | null; last_login: string | null }>;
  const configs = (configsRes.data ?? []) as Array<{ created_by_user_id: string | null; case_type: string | null; last_saved_at: string | null }>;

  const usersByDealer = new Map<string, typeof users>();
  for (const u of users) {
    if (!u.dealer_number) continue;
    const arr = usersByDealer.get(u.dealer_number) ?? [];
    arr.push(u); usersByDealer.set(u.dealer_number, arr);
  }
  const userIdToDealer = new Map<string, string>();
  for (const u of users) if (u.dealer_number) userIdToDealer.set(u.id, u.dealer_number);

  const acts: Record<string, { quote: number; order: number; total: number; last: string | null }> = {};
  for (const c of configs) {
    if (!c.created_by_user_id) continue;
    const dn = userIdToDealer.get(c.created_by_user_id);
    if (!dn) continue;
    const a = acts[dn] ?? (acts[dn] = { quote: 0, order: 0, total: 0, last: null });
    a.total += 1;
    if (c.case_type === "quote") a.quote += 1;
    if (c.case_type === "order") a.order += 1;
    if (c.last_saved_at && (!a.last || c.last_saved_at > a.last)) a.last = c.last_saved_at;
  }

  const rows: DealerAccountStats[] = (dealersRes.data ?? []).map((d) => {
    const dealer = rowToDealer(d);
    const linked = usersByDealer.get(dealer.account_number) ?? [];
    const lastLogin = linked.reduce<string | null>((acc, u) => (u.last_login && (!acc || u.last_login > acc) ? u.last_login : acc), null);
    const a = acts[dealer.account_number];
    const lastActivity = [a?.last, lastLogin].filter(Boolean).sort().pop() ?? null;
    return {
      id: dealer.id,
      account_number: dealer.account_number,
      company_name: dealer.company_name,
      customer_type: dealer.customer_type,
      customer_type_label: dealer.customer_type_label,
      country: dealer.country,
      assigned_seller_initials: dealer.assigned_seller_initials,
      assigned_seller_name: dealer.assigned_seller_name,
      assigned_seller_email: dealer.assigned_seller_email,
      is_blocked: dealer.is_blocked,
      is_deleted: dealer.is_deleted,
      user_count: linked.length,
      activity_count: a?.total ?? 0,
      quote_count: a?.quote ?? 0,
      order_count: a?.order ?? 0,
      last_activity_at: lastActivity,
      user_ids: linked.map((u) => u.id),
    };
  });

  return { source: "supabase", rows };
}

export async function fetchDealerAccountStatsByNumbers(
  accountNumbers: string[],
): Promise<{ rows: DealerAccountStats[]; error?: string }> {
  const numbers = Array.from(new Set(accountNumbers.map((n) => n.trim()).filter(Boolean)));
  if (numbers.length === 0) return { rows: [] };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { rows: [], error: "Supabase Auth session påkrævet." };

    const { data, error } = await supabase
      .from("dealer_account_stats")
      .select("*")
      .in("account_number", numbers)
      .order("company_name", { ascending: true });
    if (error) throw error;

    const rows = (data ?? []).map(rowToStats);
    try {
      const overlay = await loadDealerActivityOverlay(rows);
      for (const r of rows) {
        const o = overlay.byDealerId.get(r.id);
        if (!o) continue;
        r.quote_count = o.quote;
        r.order_count = o.order;
        r.activity_count = o.quote + o.order;
        if (o.last && (!r.last_activity_at || o.last > r.last_activity_at)) {
          r.last_activity_at = o.last;
        }
      }
    } catch (e) {
      console.warn("[dealerAccountsService] scoped overlay failed", e);
    }
    return { rows };
  } catch (e) {
    const all = await fetchDealerAccountStats();
    if (all.error) return { rows: [], error: all.error };
    return { rows: all.rows.filter((row) => numbers.includes(row.account_number)) };
  }
}

/**
 * Fetch dealer stats filtered to a specific seller (by initials and/or email).
 * Used by the seller-facing "Mine forhandlere" page so only assigned dealers
 * are returned — both in the UI and the underlying query.
 */
export async function fetchDealerAccountStatsForSeller(opts: {
  initials?: string | null;
  email?: string | null;
}): Promise<{ rows: DealerAccountStats[]; error?: string }> {
  const all = await fetchDealerAccountStats();
  if (all.error) return { rows: [], error: all.error };
  const initials = opts.initials?.trim().toUpperCase() || null;
  const email = opts.email?.trim().toLowerCase() || null;
  const filtered = all.rows.filter((r) => {
    const re = r.assigned_seller_email?.trim().toLowerCase() || null;
    return (initials && sellerInitialsMatch(r.assigned_seller_initials, initials)) || (email && re === email);
  });
  return { rows: filtered };
}

/**
 * Fetch dealer rows + stats scoped to a seller, including parent main rows
 * needed for parent/child grouping. A dealer is considered "for this seller"
 * if its own assigned seller matches, OR (it's a branch and) its parent's
 * assigned seller matches (seller inheritance). When a branch matches, its
 * parent main row is included as an anchor even if the main itself is
 * unassigned. Used by "Mine forhandlere" so backend users in seller-view
 * see the same grouped structure as Timan Backend → Forhandlere.
 */
export async function fetchDealerAccountsForSeller(opts: {
  initials?: string | null;
  email?: string | null;
}): Promise<{ dealers: DealerAccount[]; stats: Record<string, DealerAccountStats>; error?: string }> {
  const initials = opts.initials?.trim().toUpperCase() || null;
  const email = opts.email?.trim().toLowerCase() || null;
  if (!initials && !email) return { dealers: [], stats: {} };

  const [dRes, sRes] = await Promise.all([
    fetchDealerAccounts({ includeDeleted: true }),
    fetchDealerAccountStats(),
  ]);
  if (dRes.error) return { dealers: [], stats: {}, error: dRes.error };

  const matches = (d: DealerAccount): boolean => {
    const re = d.assigned_seller_email?.trim().toLowerCase() || null;
    return (initials != null && sellerInitialsMatch(d.assigned_seller_initials, initials))
      || (email != null && re === email);
  };

  const byAcct = new Map<string, DealerAccount>();
  const byId = new Map<string, DealerAccount>();
  for (const d of dRes.rows) { byAcct.set(d.account_number, d); byId.set(d.id, d); }

  // Direct matches + inherited matches (branches whose parent matches).
  const keep = new Set<string>();
  for (const d of dRes.rows) {
    if (matches(d)) { keep.add(d.id); continue; }
    if (d.parent_account_number) {
      const parent = byAcct.get(d.parent_account_number);
      if (parent && matches(parent)) keep.add(d.id);
    }
  }
  // Add anchor mains for any kept branch whose parent isn't already kept.
  for (const d of dRes.rows) {
    if (!keep.has(d.id)) continue;
    if (!d.parent_account_number) continue;
    const parent = byAcct.get(d.parent_account_number);
    if (parent) keep.add(parent.id);
  }
  // Keep inactive predecessors whose active successor is already kept,
  // so they can be rendered as sub-rows under the active main.
  for (const d of dRes.rows) {
    if (keep.has(d.id)) continue;
    if (!isDealerInactive(d)) continue;
    let succId: string | null = d.successor_dealer_id;
    if (!succId && d.successor_dealer_account_number) {
      succId = byAcct.get(d.successor_dealer_account_number)?.id ?? null;
    }
    if (!succId) continue;
    const active = resolveActiveDealer(succId, byId);
    if (active && keep.has(active.id)) keep.add(d.id);
  }

  const dealers = dRes.rows.filter((d) => keep.has(d.id));
  const statsMap: Record<string, DealerAccountStats> = {};
  for (const s of sRes.rows) if (keep.has(s.id)) statsMap[s.id] = s;
  try {
    const sellerId = await lookupSellerIdForOrderScope(email);
    const ordersRes = await listScopedOrdersWithValue({
      role: "timan_seller",
      sellerId,
      sellerInitials: initials,
      sellerEmail: email,
      dealerNumber: null,
    });
    if (!ordersRes.error) {
      const orderCountByDealerId = new Map<string, number>();
      const keyToDealerId = new Map<string, string>();
      for (const d of dealers) {
        const s = statsMap[d.id];
        const base = s ?? {
          id: d.id,
          account_number: d.account_number,
          company_name: d.company_name,
          customer_type: d.customer_type,
          customer_type_label: d.customer_type_label,
          country: d.country,
          assigned_seller_initials: d.assigned_seller_initials,
          assigned_seller_name: d.assigned_seller_name,
          assigned_seller_email: d.assigned_seller_email,
          is_blocked: d.is_blocked,
          is_deleted: d.is_deleted,
          user_count: 0,
          activity_count: 0,
          quote_count: 0,
          order_count: 0,
          last_activity_at: null,
          user_ids: [],
        } satisfies DealerAccountStats;
        statsMap[d.id] = base;
        base.order_count = 0;
        for (const key of dealerKeysForStatsRow(base)) keyToDealerId.set(key, d.id);
      }
      for (const order of ordersRes.rows) {
        const key = dealerKeyOf(order);
        const dealerId = key ? keyToDealerId.get(key) : undefined;
        if (!dealerId) continue;
        orderCountByDealerId.set(dealerId, (orderCountByDealerId.get(dealerId) ?? 0) + 1);
      }
      for (const [dealerId, count] of orderCountByDealerId.entries()) {
        const s = statsMap[dealerId];
        if (s) s.order_count = count;
      }
    }
  } catch (e) {
    console.warn("[dealerAccountsService] scoped order overlay failed", e);
  }
  return { dealers, stats: statsMap, error: sRes.error };
}

// ============================================================
// Pending user count — for the notification bell
// ============================================================

let pendingUserCountRpcMissing = false;

export async function fetchPendingUserCount(): Promise<number> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return 0;
    // Try the SECURITY DEFINER RPC first (phase 11) — skip if previously missing
    if (!pendingUserCountRpcMissing) {
      const rpc = await supabase.rpc("pending_user_count");
      if (!rpc.error && typeof rpc.data === "number") return rpc.data;
      // PGRST202 = function not found in schema cache (404). Stop retrying.
      const code = (rpc.error as { code?: string } | null)?.code;
      if (code === "PGRST202" || code === "404") {
        pendingUserCountRpcMissing = true;
        console.warn("[dealerAccountsService] pending_user_count RPC missing — using fallback. Apply docs/sql/phase11_dealer_user_relationship.sql.");
      }
    }
    // Fallback: count via SELECT (requires RLS to allow it)
    const { count } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .or("approved.eq.false,status.eq.pending");
    return count ?? 0;
  } catch {
    return 0;
  }
}



// ============================================================
// Block / unblock / soft-delete / restore — Phase 12
// ------------------------------------------------------------
// These helpers never touch user data, quotes, orders or pricing.
// They flip flags on dealer_accounts only. Access is restricted by
// RLS to portal_role = 'timan_backend'.
// ============================================================

export async function setDealerBlocked(
  id: string,
  blocked: boolean,
  adminEmail: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const patch: Record<string, unknown> = blocked
      ? { is_blocked: true, blocked_at: new Date().toISOString(), blocked_by: adminEmail ?? null }
      : { is_blocked: false, blocked_at: null, blocked_by: null };
    patch.updated_at = new Date().toISOString();
    const { error } = await supabase.from("dealer_accounts").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function softDeleteDealer(
  id: string,
  adminEmail: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("dealer_accounts")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: adminEmail ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function restoreDealer(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("dealer_accounts")
      .update({
        is_deleted: false,
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============================================================
// Phase 60 — Successor / efterfølger-forhandler
// ------------------------------------------------------------
// Portalstyret pegepind fra en lukket/spærret forhandler til
// den aktive forhandler der har overtaget service/warranty/CRM-ansvar.
//
// Ingen automatisk historikflytning. Ingen sletning. SharePoint-sync
// rører IKKE disse felter.
// ============================================================

export interface SetSuccessorPatch {
  successorDealerId: string | null;
  successorDealerAccountNumber: string | null;
  closedReason: string | null;
}

export async function setDealerSuccessor(
  id: string,
  patch: SetSuccessorPatch,
): Promise<{ ok: boolean; error?: string; row?: DealerAccount }> {
  try {
    if (patch.successorDealerId && patch.successorDealerId === id) {
      return { ok: false, error: "En forhandler kan ikke være sin egen efterfølger." };
    }
    // Hent eksisterende række for at vide om closed_at allerede er sat.
    const existing = await supabase
      .from("dealer_accounts")
      .select("closed_at")
      .eq("id", id)
      .maybeSingle();
    const update: Record<string, unknown> = {
      successor_dealer_id: patch.successorDealerId,
      successor_dealer_account_number: patch.successorDealerAccountNumber,
      closed_reason: patch.closedReason,
      updated_at: new Date().toISOString(),
    };
    // Sæt closed_at første gang en successor sættes (og der ikke allerede er en).
    if (patch.successorDealerId && !(existing.data as { closed_at?: string | null } | null)?.closed_at) {
      update.closed_at = new Date().toISOString();
    }
    // Hvis successor fjernes helt — bevar closed_at (forhandleren er stadig lukket/spærret hvis is_blocked/is_deleted).
    const { data, error } = await supabase
      .from("dealer_accounts")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return { ok: true, row: data ? rowToDealer(data) : undefined };
  } catch (e) {
    return { ok: false, error: describeSupabaseError("setDealerSuccessor fejlede", e) };
  }
}

export async function clearDealerSuccessor(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  return setDealerSuccessor(id, {
    successorDealerId: null,
    successorDealerAccountNumber: null,
    closedReason: null,
  }).then((r) => ({ ok: r.ok, error: r.error }));
}

/**
 * Følg successor-kæden (max 5 hop) og returner den aktive ansvarlige
 * forhandler. Hvis input-dealeren selv er aktiv, returneres den uændret.
 * Hvis kæden ender i en lukket forhandler uden successor, returneres
 * den sidste i kæden alligevel (caller kan afgøre hvad der skal ske).
 */
export function resolveActiveDealer(
  startId: string | null | undefined,
  byId: Map<string, DealerAccount>,
): DealerAccount | null {
  if (!startId) return null;
  let current = byId.get(startId) ?? null;
  const seen = new Set<string>();
  for (let i = 0; i < 5 && current; i++) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    if (!isDealerInactive(current)) return current;
    if (!current.successor_dealer_id) return current;
    current = byId.get(current.successor_dealer_id) ?? null;
  }
  return current;
}

/**
 * Build a successor index for UI grouping.
 *
 *   • predecessorsByActiveId — for every dealer that is the *active* successor
 *     of one or more inactive (blocked/closed) dealers, list those predecessors.
 *     Used to render predecessors as sub-rows under the active main, similar
 *     to how branches are rendered.
 *   • absorbedIds — ids of inactive dealers that already appear under an active
 *     successor. Those should NOT be rendered as their own top-level groups.
 *
 * NOTE: never moves any data. Pure UI grouping.
 */
export function buildSuccessorIndex(rows: DealerAccount[]): {
  predecessorsByActiveId: Map<string, DealerAccount[]>;
  absorbedIds: Set<string>;
} {
  const byId = new Map<string, DealerAccount>();
  const byAcct = new Map<string, DealerAccount>();
  for (const r of rows) { byId.set(r.id, r); byAcct.set(r.account_number, r); }

  const predecessorsByActiveId = new Map<string, DealerAccount[]>();
  const absorbedIds = new Set<string>();

  for (const r of rows) {
    if (!isDealerInactive(r)) continue;
    let succId: string | null = r.successor_dealer_id;
    if (!succId && r.successor_dealer_account_number) {
      succId = byAcct.get(r.successor_dealer_account_number)?.id ?? null;
    }
    if (!succId) continue;
    const active = resolveActiveDealer(succId, byId);
    if (!active || isDealerInactive(active)) continue;
    const arr = predecessorsByActiveId.get(active.id) ?? [];
    arr.push(r);
    predecessorsByActiveId.set(active.id, arr);
    absorbedIds.add(r.id);
  }
  for (const arr of predecessorsByActiveId.values()) {
    arr.sort((a, b) => a.company_name.localeCompare(b.company_name, "da"));
  }
  return { predecessorsByActiveId, absorbedIds };
}





/**
 * Look up the block/delete status of the dealer linked to a given user
 * (by app_users.dealer_number → dealer_accounts.account_number).
 *
 * Returns { linked: false } when the user has no dealer link — in that
 * case access is NOT denied here (admins / Timan staff have no dealer).
 */
export async function fetchDealerStatusForUser(
  dealerNumber: string | null | undefined,
): Promise<{
  linked: boolean;
  isBlocked: boolean;
  isDeleted: boolean;
  companyName: string | null;
  error?: string;
}> {
  const dn = (dealerNumber ?? "").trim();
  if (!dn) return { linked: false, isBlocked: false, isDeleted: false, companyName: null };
  try {
    const { data, error } = await supabase
      .from("dealer_accounts")
      .select("company_name, is_blocked, is_deleted")
      .eq("account_number", dn)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { linked: false, isBlocked: false, isDeleted: false, companyName: null };
    return {
      linked: true,
      isBlocked: Boolean((data as Record<string, unknown>).is_blocked ?? false),
      isDeleted: Boolean((data as Record<string, unknown>).is_deleted ?? false),
      companyName: ((data as Record<string, unknown>).company_name as string | null) ?? null,
    };
  } catch (e) {
    return {
      linked: false,
      isBlocked: false,
      isDeleted: false,
      companyName: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Fetch a single dealer_accounts row by its account_number.
 * Used by the external "Forhandlerdata" module so the logged-in
 * dealer/importer/service-partner can view (and edit a small set of)
 * their own dealer record. RLS limits non-backend users to their own row.
 */
export async function fetchDealerAccountByNumber(
  accountNumber: string | null | undefined,
): Promise<{ row: DealerAccount | null; error?: string }> {
  const an = (accountNumber ?? "").trim();
  if (!an) return { row: null };
  try {
    const { data, error } = await supabase
      .from("dealer_accounts")
      .select("*")
      .eq("account_number", an)
      .maybeSingle();
    if (error) throw error;
    return { row: data ? rowToDealer(data as Record<string, unknown>) : null };
  } catch (e) {
    return { row: null, error: describeSupabaseError("fetchDealerAccountByNumber", e) };
  }
}

export async function fetchDealerAccountFamilyByNumber(
  accountNumber: string | null | undefined,
  opts: { includeDeleted?: boolean } = {},
): Promise<{ rows: DealerAccount[]; error?: string }> {
  const an = (accountNumber ?? "").trim();
  if (!an) return { rows: [] };
  try {
    const selected = await fetchDealerAccountByNumber(an);
    if (selected.error) return { rows: [], error: selected.error };
    if (!selected.row) return { rows: [] };

    const rootAccountNumber = selected.row.parent_account_number || selected.row.account_number;
    let rootQuery = supabase
      .from("dealer_accounts")
      .select("*")
      .eq("account_number", rootAccountNumber)
      .order("company_name", { ascending: true });
    let childrenQuery = supabase
      .from("dealer_accounts")
      .select("*")
      .eq("parent_account_number", rootAccountNumber)
      .order("company_name", { ascending: true });
    if (!opts.includeDeleted) {
      rootQuery = rootQuery.eq("is_deleted", false);
      childrenQuery = childrenQuery.eq("is_deleted", false);
    }

    const [rootRes, childrenRes] = await Promise.all([rootQuery, childrenQuery]);
    if (rootRes.error) throw rootRes.error;
    if (childrenRes.error) throw childrenRes.error;
    const rowsById = new Map<string, DealerAccount>();
    for (const row of [...(rootRes.data ?? []), ...(childrenRes.data ?? [])]) {
      const dealer = rowToDealer(row as Record<string, unknown>);
      rowsById.set(dealer.id, dealer);
    }
    const rows = Array.from(rowsById.values()).sort((a, b) => a.company_name.localeCompare(b.company_name));
    if (rows.some((row) => row.id === selected.row?.id)) return { rows };
    if (!opts.includeDeleted && selected.row.is_deleted) return { rows };
    return { rows: [selected.row, ...rows] };
  } catch (e) {
    return { rows: [], error: describeSupabaseError("fetchDealerAccountFamilyByNumber", e) };
  }
}

// ============================================================
// Phase 14 — Create dealer + CSV import
// ------------------------------------------------------------
// Both helpers call SECURITY DEFINER RPCs added in
// docs/sql/phase14_dealer_create_import.sql. Authorization
// (timan_backend only) is enforced inside the database.
// ============================================================

export const TIMAN_SELLERS = [
  { initials: "BP",  name: "Birger Pedersen",   email: "bp@timan.dk"  },
  { initials: "JTN", name: "Jens Thorsen",      email: "jtn@timan.dk" },
  { initials: "EM",  name: "Esben Madsen",      email: "em@timan.dk"  },
  { initials: "AKR", name: "Alexander Kirschner", email: "akr@timan.dk" },
  { initials: "NB",  name: "NB Sælger",         email: "nb@timan.dk"  },
] as const;

export type TimanSeller = (typeof TIMAN_SELLERS)[number];

export const DEALER_TYPE_OPTIONS = [
  { value: "Diverse", label: "Diverse" },
  { value: "Forhandler", label: "Forhandler" },
  { value: "Service Partner", label: "Service Partner" },
  { value: "Importør", label: "Importør" },
  { value: "Reservedele", label: "Reservedele" },
  { value: "Forhandlerkunde", label: "Forhandlerkunde" },
  { value: "Slutkunde", label: "Slutkunde" },
  { value: "Leverandør mv.", label: "Leverandør mv." },
  { value: "Lukket kunde", label: "Lukket kunde" },
  { value: "Ansat person enkel", label: "Ansat person enkel" },
] as const;

export function dealerTypeFromCustomerType(label: string | null | undefined): string | null {
  if (label === "Service Partner") return "service_partner";
  if (label === "Importør") return "importer";
  if (!label) return null;
  return "dealer";
}

/** Map SharePoint/CSV A_B_KUNDE value to the visible customer type label. */
export function mapDealerTypeFromCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  const normalized = v.toUpperCase();
  if (normalized === "0" || normalized === "X") return "Diverse";
  if (normalized === "1" || normalized === "A") return "Forhandler";
  if (normalized === "2" || normalized === "B") return "Service Partner";
  if (normalized === "3" || normalized === "C") return "Importør";
  if (normalized === "D") return "Reservedele";
  if (normalized === "E") return "Forhandlerkunde";
  if (normalized === "F") return "Slutkunde";
  if (normalized === "G") return "Leverandør mv.";
  if (normalized === "H") return "Lukket kunde";
  if (normalized === "I") return "Ansat person enkel";
  // Allow text passthrough if already a label
  if (/diverse/i.test(v)) return "Diverse";
  if (/forhandler\s*kunde|forhandlerkunde/i.test(v)) return "Forhandlerkunde";
  if (/lukket/i.test(v)) return "Lukket kunde";
  if (/forhandler/i.test(v)) return "Forhandler";
  if (/service/i.test(v))   return "Service Partner";
  if (/import/i.test(v))    return "Importør";
  if (/reserve/i.test(v))   return "Reservedele";
  if (/slutkunde|kunde/i.test(v)) return "Slutkunde";
  if (/leverand/i.test(v)) return "Leverandør mv.";
  if (/ansat/i.test(v)) return "Ansat person enkel";
  return null;
}

/** Map CSV country to a Timan seller per business rules. */
export function mapSellerFromCountry(country: string | null | undefined): TimanSeller {
  const c = (country ?? "").trim().toLowerCase();
  const dk = ["dk", "denmark", "danmark"];
  const akr = [
    "de", "germany", "tyskland",
    "ch", "switzerland", "schweiz",
    "hu", "hungary", "ungarn",
    "it", "italy", "italien",
    "at", "austria", "østrig", "oestrig",
  ];
  if (dk.includes(c))  return TIMAN_SELLERS.find((s) => s.initials === "EM")!;
  if (akr.includes(c)) return TIMAN_SELLERS.find((s) => s.initials === "AKR")!;
  return TIMAN_SELLERS.find((s) => s.initials === "BP")!;
}

export interface CreateDealerInput {
  account_number: string;
  company_name: string;
  customer_type: string | null;          // "Forhandler" | "Service partner" | "Importør"
  country: string | null;
  postal_code?: string | null;
  city?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  assigned_seller_initials: string | null;
  assigned_seller_name: string | null;
  assigned_seller_email: string | null;
}

export async function createDealerAccount(
  input: CreateDealerInput,
): Promise<{ ok: boolean; error?: string; row?: DealerAccount }> {
  try {
    const payload = {
      ...input,
      customer_type_label: input.customer_type,
    };
    const { data, error } = await supabase.rpc("create_dealer_account", { payload });
    if (error) throw error;
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown>) : (data as Record<string, unknown> | null);
    return { ok: true, row: row ? rowToDealer(row) : undefined };
  } catch (e) {
    return { ok: false, error: describeSupabaseError("Kunne ikke oprette forhandler", e) };
  }
}

export interface CsvParsedRow {
  account_number: string;
  company_name: string;
  customer_type: string | null;
  country: string | null;
  assigned_seller_initials: string;
  assigned_seller_name: string;
  assigned_seller_email: string;
  // For preview only:
  willUpdate: boolean;
  existing?: DealerAccount;
}

export interface CsvImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { account_number: string | null; error: string }[];
}

/**
 * Parse CSV text into raw rows. Handles quoted fields (commas inside quotes)
 * and detects ; or , as delimiter automatically.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^\uFEFF/, ""); // strip BOM
  const lines: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '"' ) {
      if (inQ && clean[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
      cur += ch;
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQ) {
      if (cur.length > 0) { lines.push(cur); cur = ""; }
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) lines.push(cur);
  if (lines.length === 0) return { headers: [], rows: [] };

  const sample = lines[0];
  const semis = (sample.match(/;/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  const delim = semis > commas ? ";" : ",";

  function splitLine(line: string): string[] {
    const out: string[] = [];
    let buf = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { buf += '"'; i++; }
        else q = !q;
        continue;
      }
      if (ch === delim && !q) { out.push(buf); buf = ""; continue; }
      buf += ch;
    }
    out.push(buf);
    return out.map((s) => s.trim());
  }

  const headers = splitLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    if (cols.every((c) => c === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = cols[idx] ?? ""; });
    rows.push(obj);
  }
  return { headers, rows };
}

/** Find a header value case-insensitively from a list of candidates. */
function pick(row: Record<string, string>, keys: string[]): string {
  const lc: Record<string, string> = {};
  for (const k of Object.keys(row)) lc[k.toLowerCase()] = row[k];
  for (const k of keys) {
    const v = lc[k.toLowerCase()];
    if (v != null && v.trim() !== "") return v.trim();
  }
  return "";
}

/**
 * Map raw CSV rows into normalized dealer rows + preview metadata.
 * Requires the existing dealer list to determine create vs update.
 */
export function buildCsvPreview(
  rawRows: Record<string, string>[],
  existing: DealerAccount[],
): CsvParsedRow[] {
  const byAcct = new Map<string, DealerAccount>();
  for (const d of existing) byAcct.set(d.account_number.trim(), d);

  const out: CsvParsedRow[] = [];
  for (const r of rawRows) {
    const account_number = pick(r, ["account", "Account", "account_number", "AccountNumber", "Kontonr"]);
    if (!account_number) continue;
    const company_name   = pick(r, ["title", "Titel", "Title", "company_name", "CompanyName", "Firmanavn"]);
    const country        = pick(r, ["Country", "COUNTRY", "country", "Land"]) || null;
    const typeRaw        = pick(r, ["A_B_Kunde", "A_B_KUNDE", "a_b_kunde", "Kundetype", "customer_type"]);
    const customer_type  = mapDealerTypeFromCode(typeRaw);
    const seller         = mapSellerFromCountry(country);
    const existingRow    = byAcct.get(account_number.trim());
    out.push({
      account_number: account_number.trim(),
      company_name,
      customer_type,
      country,
      assigned_seller_initials: seller.initials,
      assigned_seller_name:     seller.name,
      assigned_seller_email:    seller.email,
      willUpdate: !!existingRow,
      existing:   existingRow,
    });
  }
  return out;
}

export async function upsertDealerAccountsBulk(
  rows: CsvParsedRow[],
): Promise<{ ok: boolean; result?: CsvImportResult; error?: string }> {
  try {
    const payload = {
      rows: rows.map((r) => ({
        account_number: r.account_number,
        company_name: r.company_name,
        customer_type: r.customer_type,
        customer_type_label: r.customer_type,
        country: r.country,
        assigned_seller_initials: r.assigned_seller_initials,
        assigned_seller_name: r.assigned_seller_name,
        assigned_seller_email: r.assigned_seller_email,
      })),
    };
    const { data, error } = await supabase.rpc("upsert_dealer_accounts", { payload });
    if (error) throw error;
    const d = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      result: {
        created: Number(d.created ?? 0),
        updated: Number(d.updated ?? 0),
        skipped: Number(d.skipped ?? 0),
        errors:  Array.isArray(d.errors) ? (d.errors as CsvImportResult["errors"]) : [],
      },
    };
  } catch (e) {
    return { ok: false, error: describeSupabaseError("CSV import fejlede", e) };
  }
}

// ============================================================
// Phase 15 — Parent / child dealer relationships
// ------------------------------------------------------------
// Both helpers call SECURITY DEFINER RPCs added in
// docs/sql/phase15_dealer_parent_child.sql. Authorization
// (timan_backend only) is enforced inside the database.
// ============================================================

/** Set or clear a dealer's parent account. Pass parent=null to detach. */
export async function setDealerParent(
  childAccountNumber: string,
  parentAccountNumber: string | null,
  markParentAsMain: boolean = true,
): Promise<{ ok: boolean; error?: string; row?: DealerAccount }> {
  try {
    const { data, error } = await supabase.rpc("set_dealer_parent", {
      child_account_number: childAccountNumber,
      parent_account_number: parentAccountNumber ?? null,
      mark_parent_as_main: markParentAsMain,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown>) : (data as Record<string, unknown> | null);
    return { ok: true, row: row ? rowToDealer(row) : undefined };
  } catch (e) {
    return { ok: false, error: describeSupabaseError("Kunne ikke opdatere forhandler-relation", e) };
  }
}

/** Toggle the is_main_account flag. */
export async function setDealerMain(
  accountNumber: string,
  isMain: boolean,
): Promise<{ ok: boolean; error?: string; row?: DealerAccount }> {
  try {
    const { data, error } = await supabase.rpc("set_dealer_main", {
      p_account_number: accountNumber,
      p_is_main: isMain,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown>) : (data as Record<string, unknown> | null);
    return { ok: true, row: row ? rowToDealer(row) : undefined };
  } catch (e) {
    return { ok: false, error: describeSupabaseError("Kunne ikke opdatere hovedstatus", e) };
  }
}

/** Update the branch_name label on a dealer (e.g. "Nordjylland", "Hovedkontor"). */
export async function updateDealerBranchName(
  id: string,
  branchName: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("dealer_accounts")
      .update({ branch_name: branchName, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeSupabaseError("Kunne ikke opdatere branch_name", e) };
  }
}

// ----------------------------------------------------------------
// Grouping helpers (UI-side aggregation, no DB roundtrip needed)
// ----------------------------------------------------------------

export interface DealerGroup {
  /** The "anchor" account: explicit main, or self if standalone. */
  main: DealerAccount;
  /** Branches whose parent_account_number === main.account_number. */
  branches: DealerAccount[];
}

/**
 * Group dealers into main + branches.
 *   • Branch rows (parent_account_number set) attach to their parent.
 *   • Orphan branches (parent points to missing/deleted dealer) are
 *     surfaced as standalone groups so they remain visible.
 *   • Dealers with is_main_account=true but no children still appear.
 */
export function groupDealersByParent(rows: DealerAccount[]): DealerGroup[] {
  const byAcct = new Map<string, DealerAccount>();
  for (const r of rows) byAcct.set(r.account_number, r);

  const groups = new Map<string, DealerGroup>();
  // First pass: create a group for every potential main account.
  for (const r of rows) {
    if (!r.parent_account_number) {
      groups.set(r.account_number, { main: r, branches: [] });
    }
  }
  // Second pass: attach branches to parents.
  for (const r of rows) {
    if (!r.parent_account_number) continue;
    const parent = byAcct.get(r.parent_account_number);
    if (parent && groups.has(parent.account_number)) {
      groups.get(parent.account_number)!.branches.push(r);
    } else {
      // Orphan branch — show on its own.
      groups.set(r.account_number, { main: r, branches: [] });
    }
  }
  // Sort branches alphabetically.
  for (const g of groups.values()) {
    g.branches.sort((a, b) =>
      (a.branch_name || a.company_name).localeCompare(b.branch_name || b.company_name, "da"),
    );
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.main.company_name.localeCompare(b.main.company_name, "da"),
  );
}

/** Aggregate stats across a main dealer + its branches. */
export function aggregateGroupStats(
  group: DealerGroup,
  statsById: Record<string, DealerAccountStats>,
): { user_count: number; quote_count: number; order_count: number; activity_count: number; last_activity_at: string | null } {
  const all = [group.main, ...group.branches];
  let user_count = 0, quote_count = 0, order_count = 0, activity_count = 0;
  let last: string | null = null;
  for (const d of all) {
    const s = statsById[d.id];
    if (!s) continue;
    user_count     += s.user_count;
    quote_count    += s.quote_count;
    order_count    += s.order_count;
    activity_count += s.activity_count;
    if (s.last_activity_at && (!last || s.last_activity_at > last)) last = s.last_activity_at;
  }
  return { user_count, quote_count, order_count, activity_count, last_activity_at: last };
}

/** Resolve effective seller (with inheritance from parent). */
export function resolveEffectiveSeller(
  dealer: DealerAccount,
  byAcct: Map<string, DealerAccount>,
): { initials: string | null; name: string | null; email: string | null; inherited: boolean } {
  if (dealer.assigned_seller_initials || dealer.assigned_seller_email) {
    return {
      initials: dealer.assigned_seller_initials,
      name: dealer.assigned_seller_name,
      email: dealer.assigned_seller_email,
      inherited: false,
    };
  }
  if (dealer.parent_account_number) {
    const parent = byAcct.get(dealer.parent_account_number);
    if (parent && (parent.assigned_seller_initials || parent.assigned_seller_email)) {
      return {
        initials: parent.assigned_seller_initials,
        name: parent.assigned_seller_name,
        email: parent.assigned_seller_email,
        inherited: true,
      };
    }
  }
  return { initials: null, name: null, email: null, inherited: false };
}
