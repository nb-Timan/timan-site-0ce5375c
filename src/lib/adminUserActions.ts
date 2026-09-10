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

const SESSION_REFRESH_SKEW_MS = 30_000;
const SESSION_EXPIRED_MESSAGE = "Din session er udløbet. Log ind igen for at fortsætte.";

export type AdminUserAction =
  | "invite"
  | "invite_contract_partner"
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
  contractId?: string;
  dealerAccountNumber?: string;
  partnerName?: string;
}

type AuthSession = {
  access_token: string;
  expires_at?: number | null;
  user: { email?: string | null };
};

type FunctionError = {
  message?: string;
  context?: Response;
};

function sessionNeedsRefresh(session: AuthSession): boolean {
  return !!session.expires_at && session.expires_at * 1000 <= Date.now() + SESSION_REFRESH_SKEW_MS;
}

async function currentSession(forceRefresh = false): Promise<AuthSession | null> {
  const result = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();
  const session = result.data.session as AuthSession | null;
  if (result.error || !session) return null;

  if (!forceRefresh && sessionNeedsRefresh(session)) {
    const refreshed = await supabase.auth.refreshSession();
    return refreshed.error ? null : (refreshed.data.session as AuthSession | null);
  }

  return session;
}

async function functionErrorDetails(error: FunctionError): Promise<{ message: string; unauthorized: boolean }> {
  const response = error.context;
  let message = error.message ?? "Handlingen fejlede.";
  try {
    const body = response && typeof response.json === "function" ? await response.json() : null;
    if (typeof body?.error === "string") message = body.error;
  } catch {
    // A malformed error response must not hide the original error message.
  }
  return { message, unauthorized: response?.status === 401 };
}

async function invokeAdminAction(
  action: AdminUserAction,
  opts: InvokeOptions = {},
): Promise<AdminUserActionResult> {
  let session = await currentSession();
  if (!session) {
    return {
      ok: false,
      error: SESSION_EXPIRED_MESSAGE,
    };
  }

  const body = {
    action,
    email: opts.email ?? session.user.email ?? "",
    app_user_id: opts.appUserId ?? null,
    contract_id: opts.contractId ?? null,
    dealer_account_number: opts.dealerAccountNumber ?? null,
    partner_name: opts.partnerName ?? null,
    patch: opts.patch,
    redirect_to: `${window.location.origin}/reset-password`,
  };

  try {
    const invoke = (activeSession: AuthSession) => supabase.functions.invoke("admin-user-actions", {
      body,
      // Always use the underlying authenticated user's current JWT. View-as
      // only changes presentation and must never influence this header.
      headers: { Authorization: `Bearer ${activeSession.access_token}` },
    });

    let { data, error } = await invoke(session);
    if (error) {
      const details = await functionErrorDetails(error as FunctionError);
      if (!details.unauthorized) return { ok: false, error: details.message };

      // A stale JWT can survive a preview reload. Refresh once and retry with
      // the new token; never retry indefinitely or substitute a view-as user.
      session = await currentSession(true);
      if (!session) return { ok: false, error: SESSION_EXPIRED_MESSAGE };

      ({ data, error } = await invoke(session));
      if (error) {
        const retryDetails = await functionErrorDetails(error as FunctionError);
        return {
          ok: false,
          error: retryDetails.unauthorized ? SESSION_EXPIRED_MESSAGE : retryDetails.message,
        };
      }
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

export async function inviteContractPartnerUser(input: {
  email: string;
  name: string;
  contractId: string;
  dealerAccountNumber: string;
}): Promise<AdminUserActionResult> {
  return invokeAdminAction("invite_contract_partner", {
    email: input.email,
    partnerName: input.name,
    contractId: input.contractId,
    dealerAccountNumber: input.dealerAccountNumber,
  });
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
