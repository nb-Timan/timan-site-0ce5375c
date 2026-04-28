/**
 * Resolve the current portal user's app_users.id (used as the seller id
 * for CRM scoping). Cached in sessionStorage so subsequent CRM pages don't
 * re-query Supabase.
 */
import { supabase } from "@/lib/supabase";

const SS_KEY_PREFIX = "timan.crm.sellerId.";

export async function resolveSellerId(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const key = SS_KEY_PREFIX + email.toLowerCase();
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return cached === "null" ? null : cached;
  } catch { /* */ }

  try {
    const { data, error } = await supabase
      .from("app_users")
      .select("id")
      .eq("email", email.toLowerCase())
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
