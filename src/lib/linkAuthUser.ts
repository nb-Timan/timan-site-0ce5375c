/**
 * Link the currently authenticated Supabase Auth user to its matching
 * row in public.app_users by email.
 *
 * - Safe to call on every login / session rehydrate.
 * - Only writes when app_users.auth_user_id is NULL and the email matches.
 * - Never overwrites an existing auth_user_id, never changes id or email.
 * - Silent no-op when there is no session, when the column doesn't exist,
 *   or when RLS denies the update — login must keep working regardless.
 */

import { supabase } from "@/lib/supabase";

export async function linkAuthUserIdIfNeeded(): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session?.user?.email || !session.user.id) return;

    const email = session.user.email.toLowerCase();
    const authUid = session.user.id;

    const { data: row, error } = await supabase
      .from("app_users")
      .select("id, auth_user_id")
      .eq("email", email)
      .maybeSingle();

    if (error || !row) return;
    if (row.auth_user_id) return; // already linked

    const { error: updErr } = await supabase
      .from("app_users")
      .update({ auth_user_id: authUid })
      .eq("id", row.id)
      .is("auth_user_id", null); // race-safe: only when still null

    if (updErr) {
      // Most common: missing column on older DB, or RLS denied. Either is fine.
      console.warn("[linkAuthUserId] could not link (continuing):", updErr.message);
    } else {
      console.log("[linkAuthUserId] linked", email, "→", authUid);
    }
  } catch (err) {
    console.warn("[linkAuthUserId] unexpected error:", err);
  }
}
