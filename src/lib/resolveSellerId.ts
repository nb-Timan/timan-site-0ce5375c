/**
 * Resolve the current portal user's app_users.id (used as the seller id
 * for CRM scoping). Cached in sessionStorage so subsequent CRM pages don't
 * re-query Supabase.
 *
 * IMPORTANT: When a Timan Backend user has selected a "view as <seller>"
 * mode in the header, this resolver returns the SELECTED seller's
 * app_users.id instead of the logged-in user's id. That single hook makes
 * every CRM page (dashboard, leads, accounts, activities, calendar,
 * budget, my-dealers) automatically scope to the chosen seller, without
 * needing per-page changes.
 *
 * The real Supabase Auth session, RLS and portal_role are unaffected —
 * this is presentation/scope-context only.
 */
import { supabase } from "@/lib/supabase";
import { getActiveSellerView, getEffectiveSellerEmail } from "@/lib/activeMode";

const SS_KEY_PREFIX = "timan.crm.sellerId.";

export interface EffectiveCrmSellerScope {
  ownerUserId: string | null;
  ownerEmail: string | null;
}

export interface CrmLeadSellerIdentity {
  id?: string | null;
  email?: string | null;
}

const CANONICAL_APP_USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve a CRM lead owner to a canonical app_users UUID.
 * Preview fallback users intentionally use ids such as `u-jtn`; those ids
 * must never be submitted to production CRM tables.
 */
export async function resolveCanonicalCrmLeadSellerId(
  selectedSeller: CrmLeadSellerIdentity | null | undefined,
  sessionEmail: string | null | undefined,
  resolver: typeof resolveSellerId = resolveSellerId,
): Promise<string | null> {
  if (selectedSeller?.id && CANONICAL_APP_USER_ID.test(selectedSeller.id)) {
    return selectedSeller.id;
  }

  const emails = [selectedSeller?.email, sessionEmail]
    .map((email) => email?.trim().toLowerCase())
    .filter((email, index, all): email is string => Boolean(email) && all.indexOf(email) === index);

  for (const email of emails) {
    const id = await resolver(email);
    if (id && CANONICAL_APP_USER_ID.test(id)) return id;
  }
  return null;
}

/**
 * Bust the sellerId session cache. Call after editing app_users so that the
 * next CRM page re-resolves from Supabase instead of returning a stale id.
 *
 * - clearSellerIdCache(email) clears the entry for one email.
 * - clearSellerIdCache() clears every cached entry.
 */
export function clearSellerIdCache(email?: string | null): void {
  try {
    if (email) {
      sessionStorage.removeItem(SS_KEY_PREFIX + email.toLowerCase());
      return;
    }
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SS_KEY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch { /* */ }
}

export async function resolveSellerId(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  // Apply the "view as seller" override for backend users.
  const view = getActiveSellerView(email);
  const lookupEmail = (view ? view.email : email).toLowerCase();

  const key = SS_KEY_PREFIX + lookupEmail;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return cached === "null" ? null : cached;
  } catch { /* */ }

  try {
    const { data, error } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", lookupEmail)
      .maybeSingle();
    if (error || !data?.id) {
      try { sessionStorage.setItem(key, "null"); } catch { /* */ }
      return null;
    }
    try { sessionStorage.setItem(key, String(data.id)); } catch { /* */ }
    return String(data.id);
  } catch {
    return null;
  }
}

/**
 * Canonical CRM seller scope for pages that filter leads, demos and shared
 * records. Backend "view as seller" and a real seller login must resolve to
 * the same owner id + owner email pair before query/RPC filters are applied.
 */
export async function resolveEffectiveCrmSellerScope(
  user: { email?: string | null } | null | undefined,
): Promise<EffectiveCrmSellerScope> {
  const ownerEmail = getEffectiveSellerEmail(user)?.toLowerCase() ?? null;
  const ownerUserId = await resolveSellerId(ownerEmail);
  return { ownerUserId, ownerEmail };
}
