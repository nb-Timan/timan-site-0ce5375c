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

export interface DealerAccount {
  id: string;
  account_number: string;
  company_name: string;
  customer_type: string | null;
  customer_type_label: string | null;
  country: string | null;
  postal_code: string | null;
  city: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
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
  created_at: string;
  updated_at: string;
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
    country: (row.country as string | null) ?? null,
    postal_code: (row.postal_code as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
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
    created_at: (row.created_at as string) || new Date().toISOString(),
    updated_at: (row.updated_at as string) || new Date().toISOString(),
  };
}

export async function fetchDealerAccounts(): Promise<DealerAccountsResult> {
  try {
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

    const { data, error } = await supabase
      .from("dealer_accounts")
      .select("*")
      .order("company_name", { ascending: true });
    if (error) throw error;
    return { source: "supabase", rows: (data ?? []).map(rowToDealer) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { source: "fallback", rows: [], error: `Supabase fejl ved hentning af dealer_accounts: ${msg}` };
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
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
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
    user_count: Number(row.user_count ?? 0),
    activity_count: Number(row.activity_count ?? 0),
    quote_count: Number(row.quote_count ?? 0),
    order_count: Number(row.order_count ?? 0),
    last_activity_at: lastClean,
    user_ids: userIds,
  };
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
    return { source: "supabase", rows: view.data.map(rowToStats) };
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
    const ri = r.assigned_seller_initials?.trim().toUpperCase() || null;
    const re = r.assigned_seller_email?.trim().toLowerCase() || null;
    return (initials && ri === initials) || (email && re === email);
  });
  return { rows: filtered };
}

// ============================================================
// Pending user count — for the notification bell
// ============================================================

export async function fetchPendingUserCount(): Promise<number> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return 0;
    // Try the SECURITY DEFINER RPC first (phase 11)
    const rpc = await supabase.rpc("pending_user_count");
    if (!rpc.error && typeof rpc.data === "number") return rpc.data;
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

