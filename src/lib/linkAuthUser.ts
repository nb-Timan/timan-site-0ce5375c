/**
 * Link the currently authenticated Supabase Auth user to its matching
 * row in public.app_users by email.
 *
 * SECURITY: `auth_user_id` is a protected column — the browser can no longer
 * write it (see docs/sql/phase63_app_users_rls_hardening.sql). The linking is
 * performed by the `admin-user-actions` Edge Function (`link_self`), which
 * derives the identity from the verified JWT, only ever links the caller's own
 * row, and refuses to re-link a row that already belongs to another account.
 *
 * Safe to call on every login / session rehydrate. Never blocks login.
 */

import { supabase } from "@/lib/supabase";
import { linkSelfAppUser } from "@/lib/adminUserActions";

export async function linkAuthUserIdIfNeeded(): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user?.id) return;

    const res = await linkSelfAppUser();
    if (!res.ok) {
      console.warn("[linkAuthUserId] could not link (continuing):", res.error);
    }
  } catch (err) {
    console.warn("[linkAuthUserId] unexpected error:", err);
  }
}
