/**
 * Frontend wrapper around the `admin-user-actions` Edge Function.
 *
 * Used by Timan Backend → Brugere to invite users, send password resets and
 * perform ALL privileged app_users writes (role, permissions, module access,
 * approval, activation, auth linking).
 *
 * The frontend NEVER touches passwords or the service-role key — it just
 * calls the function with the caller's Supabase Auth JWT. RLS on
 * public.app_users blocks these writes from the browser (see
 * docs/sql/phase63_app_users_rls_hardening.sql).
 */

import { supabase } from "@/lib/supabase";

export type AdminUserAction =
  | "invite"
  | "reset"
  | "signup"
  | "admin_update_user"
  | "admin_delete_user"
  | "link_self"
  | "sync_self";

export interface AdminUserActionResult {
  ok: boolean;
  action?: AdminUserAction;
  message?: string;
  error?: string;
  user?: Record<string, unknown> | null;
  dropped_columns?: string[];
  changed_protected?: string[];
}

interface InvokeOptions {
  email?: string;
  appUserId?: string | null;
  patch?: Record<string, unknown>;
  requireSession?: boolean;
}

async function invokeAdminAction(
  action: AdminUserAction,
  opts: InvokeOptions = {},
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
        email: opts.email ?? sess.session.user.email ?? "",
        app_user_id: opts.appUserId ?? null,
        patch: opts.patch,
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
    return {
      ok: true,
      action: data.action,
      message: data.message,
      user: data.user ?? null,
      dropped_columns: data.dropped_columns ?? [],
      changed_protected: data.changed_protected ?? [],
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function callAdminUserAction(
  action: "invite" | "reset",
  email: string,
  appUserId?: string | null,
): Promise<AdminUserActionResult> {
  return invokeAdminAction(action, { email, appUserId });
}

/** Privileged update of an app_users row (server-validated + audited). */
export async function adminUpdateAppUser(
  appUserId: string,
  patch: Record<string, unknown>,
  email?: string,
): Promise<AdminUserActionResult> {
  return invokeAdminAction("admin_update_user", { appUserId, patch, email });
}

/** Privileged delete of an app_users row. */
export async function adminDeleteAppUser(
  appUserId: string,
  email?: string,
): Promise<AdminUserActionResult> {
  return invokeAdminAction("admin_delete_user", { appUserId, email });
}

/** Link the signed-in user's auth uid to their own app_users row. */
export async function linkSelfAppUser(): Promise<AdminUserActionResult> {
  return invokeAdminAction("link_self");
}

/** Touch/create the signed-in user's own app_users row with safe defaults. */
export async function syncSelfAppUser(): Promise<AdminUserActionResult> {
  return invokeAdminAction("sync_self");
}
