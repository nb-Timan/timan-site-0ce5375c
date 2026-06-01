/**
 * Frontend wrapper around the `admin-user-actions` Edge Function.
 *
 * Used by Timan Backend → Brugere to invite users or send password resets.
 * The frontend NEVER touches passwords or the service-role key — it just
 * calls the function with the caller's Supabase Auth JWT.
 */

import { supabase } from "@/lib/supabase";

export type AdminUserAction = "invite" | "reset";

export interface AdminUserActionResult {
  ok: boolean;
  action?: AdminUserAction;
  message?: string;
  error?: string;
}

export async function callAdminUserAction(
  action: AdminUserAction,
  email: string,
  appUserId?: string | null,
): Promise<AdminUserActionResult> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) {
    return {
      ok: false,
      error:
        "Du er ikke logget ind med Supabase Auth. Log ind igen som godkendt Timan Backend bruger.",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("admin-user-actions", {
      body: {
        action,
        email,
        app_user_id: appUserId ?? null,
        redirect_to: `${window.location.origin}/reset-password`,
      },
    });
    if (error) {
      // FunctionsHttpError exposes the response body in `context`.
      let serverMsg: string | null = null;
      try {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json();
          serverMsg = body?.error ?? null;
        }
      } catch {
        /* ignore */
      }
      return { ok: false, error: serverMsg ?? error.message };
    }
    if (!data?.ok) {
      return { ok: false, error: data?.error ?? "Handlingen fejlede." };
    }
    return { ok: true, action: data.action, message: data.message };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
