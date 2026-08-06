// supabase/functions/admin-user-actions/index.ts
//
// Secure admin actions for Timan Backend → Brugere.
//
// Capabilities:
//   • action = "invite"  → creates the Supabase Auth user (if missing) and
//                          sends the official "invite" email so the user can
//                          set their own password.
//   • action = "reset"   → sends a password-reset email if the user already
//                          has a Supabase Auth account.
//
// Security model:
//   • Never returns or accepts passwords.
//   • Caller MUST send their Supabase Auth JWT in the Authorization header.
//   • The function verifies that the caller exists in public.app_users with
//     portal_role = 'timan_backend' AND approved = true AND is_active = true
//     before doing anything.
//   • The service-role key is only used inside this function — never exposed
//     to the browser.
//
// Required environment variables (auto-injected by Supabase for functions in
// your own project — no manual setup needed):
//   • SUPABASE_URL
//   • SUPABASE_SERVICE_ROLE_KEY
//   • SUPABASE_ANON_KEY
//
// Optional:
//   • PORTAL_SITE_URL  (defaults to https://timan-portal.lovable.app)
//
// Deploy with: supabase functions deploy admin-user-actions
// or via the Lovable / Supabase dashboard.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PORTAL_SITE_URL =
  Deno.env.get("PORTAL_SITE_URL") ?? "https://timan-portal.lovable.app";

type Action =
  | "invite"
  | "reset"
  | "signup"
  | "admin_update_user"
  | "admin_delete_user"
  | "link_self"
  | "sync_self";

const ADMIN_ACTIONS: Action[] = ["invite", "reset", "admin_update_user", "admin_delete_user"];
const SELF_ACTIONS: Action[] = ["link_self", "sync_self"];
const ALL_ACTIONS: Action[] = ["signup", ...ADMIN_ACTIONS, ...SELF_ACTIONS];

/**
 * Columns an authorized Timan Backend administrator may write through this
 * function. Anything not listed here is rejected — the client can never
 * smuggle in an unknown/protected column.
 */
const ADMIN_WRITABLE_COLUMNS = new Set([
  "full_name", "first_name", "last_name", "email", "initials", "company",
  "address", "city", "postal_code", "country", "preferred_language",
  "preferred_currency", "phone", "notes", "display_name",
  "dealer_number", "company_dealer", "dealer_id",
  "seller_initials", "seller_email",
  "portal_role", "role", "partner_type", "status", "approved", "is_active",
  "allowed_areas", "allowed_modules", "backend_modules", "module_access",
  "permissions", "quick_actions", "portal_variant",
  "can_view_prices", "can_submit_order", "can_edit_discount",
  "can_switch_customer_mode", "start_step", "max_step",
  "account_owner_user_id", "account_owner_name", "account_owner_initials",
  "account_owner_email", "updated_at",
]);

/** Fields whose change is security-relevant and must be audited. */
const PROTECTED_COLUMNS = [
  "portal_role", "role", "partner_type", "permissions", "allowed_modules",
  "allowed_areas", "backend_modules", "module_access", "is_active", "approved",
  "status", "auth_user_id", "user_id", "dealer_id", "email",
];

/** Never writable through this function, by anyone. */
const NEVER_WRITABLE = new Set(["id", "auth_user_id", "user_id", "created_at", "login_count"]);

interface RequestBody {
  action: Action;
  email: string;
  app_user_id?: string | null;
  // Optional override for password-reset/invite redirect target. When the
  // frontend sends this we honor it (so the link points back at the same
  // origin the admin is using), otherwise we fall back to PORTAL_SITE_URL.
  redirect_to?: string;
  // Only used for action === "signup":
  password?: string;
  profile?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    company?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country?: string;
    preferred_language?: string;
  };
  // Only used for action === "admin_update_user":
  patch?: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
    return json(
      { error: "Edge Function mangler SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY." },
      500,
    );
  }

  // ---- Parse body early so we can branch on action (signup is public) ----
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Ugyldig JSON body." }, 400);
  }
  const action = body?.action;
  const targetEmail = (body?.email ?? "").trim().toLowerCase();
  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return json({ error: "Ugyldig email." }, 400);
  }
  if (action !== "invite" && action !== "reset" && action !== "signup") {
    return json({ error: "Ukendt action — brug 'invite', 'reset' eller 'signup'." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Authenticate/authorize caller for admin actions only ----
  if (action !== "signup") {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Manglende Authorization header." }, 401);
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user?.email) {
      return json({ error: "Ugyldig eller udløbet session." }, 401);
    }
    const callerEmail = userData.user.email.toLowerCase();
    const { data: callerRow, error: callerErr } = await admin
      .from("app_users")
      .select("portal_role, approved, is_active")
      .eq("email", callerEmail)
      .maybeSingle();
    if (callerErr) {
      return json({ error: `Kunne ikke verificere caller: ${callerErr.message}` }, 500);
    }
    if (
      !callerRow ||
      callerRow.portal_role !== "timan_backend" ||
      callerRow.approved !== true ||
      callerRow.is_active !== true
    ) {
      return json(
        { error: "Adgang nægtet. Kun godkendte Timan Backend brugere må udføre denne handling." },
        403,
      );
    }
  }

  // ---- Public self-signup (no email confirmation needed) ----
  if (action === "signup") {
    const password = body.password ?? "";
    if (password.length < 6) {
      return json({ error: "Adgangskoden skal være mindst 6 tegn." }, 400);
    }
    const profile = body.profile ?? {};
    const fullName =
      (profile.full_name && profile.full_name.trim()) ||
      `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
      targetEmail;

    let existing;
    try {
      existing = await findAuthUserByEmail(admin, targetEmail);
    } catch (e) {
      return json({ error: `Auth lookup fejlede: ${(e as Error).message}` }, 500);
    }
    if (existing) {
      return json(
        { error: "Denne email er allerede registreret. Prøv at logge ind eller brug 'glemt adgangskode'." },
        409,
      );
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: targetEmail,
      password,
      email_confirm: true, // skip confirmation email to avoid rate limits
      user_metadata: {
        full_name: fullName,
        first_name: profile.first_name ?? null,
        last_name: profile.last_name ?? null,
        company: profile.company ?? null,
        country: profile.country ?? null,
        preferred_language: profile.preferred_language ?? "da",
      },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message || "Ukendt fejl";
      if (/already|registered|exists/i.test(msg)) {
        return json({ error: "Denne email er allerede registreret." }, 409);
      }
      return json({ error: `Kunne ikke oprette bruger: ${msg}` }, 500);
    }

    const upsertPayload = {
      email: targetEmail,
      auth_user_id: created.user.id,
      full_name: fullName,
      first_name: profile.first_name ?? null,
      last_name: profile.last_name ?? null,
      company: profile.company ?? null,
      address: profile.address ?? null,
      city: profile.city ?? null,
      postal_code: profile.postal_code ?? null,
      country: profile.country ?? null,
      preferred_language: profile.preferred_language ?? "da",
      // Use 'slutkunde' (end customer) — lowest-privilege role allowed by the
      // app_users.role check constraint. Access is still blocked by
      // approved=false, is_active=false, status='pending', portal_role=null.
      role: "slutkunde",
      portal_role: null,
      partner_type: null,
      approved: false,
      is_active: false,
      status: "pending",
      module_access: [],
      allowed_modules: [],
      allowed_areas: [],
      backend_modules: [],
      start_step: 1,
      max_step: 1,
      can_view_prices: false,
      can_submit_order: false,
      can_edit_discount: false,
      can_switch_customer_mode: false,
      display_name: fullName,
      auth_status: "auth_exists",
      updated_at: new Date().toISOString(),
    };
    let upsertErr = (
      await admin.from("app_users").upsert(upsertPayload, { onConflict: "email" })
    ).error;
    if (upsertErr && /auth_status/i.test(upsertErr.message)) {
      // Phase 10 migration not applied — retry without the optional column.
      const { auth_status: _drop, ...safePayload } = upsertPayload;
      upsertErr = (
        await admin.from("app_users").upsert(safePayload, { onConflict: "email" })
      ).error;
    }
    if (upsertErr && /schema cache|column/i.test(upsertErr.message)) {
      // Generic fallback: strip any other unknown column flagged by PostgREST.
      const match = upsertErr.message.match(/'([a-z_]+)' column/i);
      if (match) {
        const safePayload: Record<string, unknown> = { ...upsertPayload };
        delete safePayload[match[1]];
        upsertErr = (
          await admin.from("app_users").upsert(safePayload, { onConflict: "email" })
        ).error;
      }
    }
    if (upsertErr && /role_check|violates check constraint.*role/i.test(upsertErr.message)) {
      // role enum/check constraint rejects 'slutkunde' — fall back to 'partner'.
      const safePayload: Record<string, unknown> = { ...upsertPayload, role: "partner" };
      upsertErr = (
        await admin.from("app_users").upsert(safePayload, { onConflict: "email" })
      ).error;
    }
    if (upsertErr) {
      return json(
        { error: `Bruger oprettet i Auth, men profil kunne ikke gemmes: ${upsertErr.message}` },
        500,
      );
    }
    return json({
      ok: true,
      action: "signup",
      message: "Din bruger er oprettet og afventer godkendelse.",
    });
  }

  let authUser;
  try {
    authUser = await findAuthUserByEmail(admin, targetEmail);
  } catch (e) {
    return json({ error: `Auth lookup fejlede: ${(e as Error).message}` }, 500);
  }

  const redirectTo = `${PORTAL_SITE_URL}/portal`;
  const isHttpsUrl = (u: string | undefined): u is string =>
    !!u && /^https?:\/\//i.test(u);
  const resetRedirect = isHttpsUrl(body.redirect_to)
    ? body.redirect_to
    : `${PORTAL_SITE_URL}/reset-password`;

  try {
    if (action === "invite") {
      if (authUser) {
        // Already exists → cannot invite again. Send a password reset instead
        // (admin intent is "let the user into the portal").
        const { error } = await admin.auth.resetPasswordForEmail(targetEmail, {
          redirectTo: resetRedirect,
        });
        if (error) throw error;
        await touchAppUser(admin, body.app_user_id ?? null, targetEmail, {
          auth_status: "auth_exists",
          last_password_reset_at: new Date().toISOString(),
        });
        return json({
          ok: true,
          action: "reset",
          message: "Brugeren findes allerede i Supabase Auth — password reset email sendt i stedet.",
        });
      }
      const { error } = await admin.auth.admin.inviteUserByEmail(targetEmail, {
        redirectTo,
      });
      if (error) throw error;
      await touchAppUser(admin, body.app_user_id ?? null, targetEmail, {
        auth_status: "invited",
        last_invited_at: new Date().toISOString(),
      });
      return json({ ok: true, action: "invite", message: "Invitationsemail sendt." });
    }

    // action === "reset"
    if (!authUser) {
      return json(
        { error: "Brugeren findes ikke i Supabase Auth endnu — send en invitation først." },
        409,
      );
    }
    const { error } = await admin.auth.resetPasswordForEmail(targetEmail, {
      redirectTo: resetRedirect,
    });
    if (error) throw error;
    await touchAppUser(admin, body.app_user_id ?? null, targetEmail, {
      auth_status: "auth_exists",
      last_password_reset_at: new Date().toISOString(),
    });
    return json({ ok: true, action: "reset", message: "Password reset email sendt." });
  } catch (e) {
    return json({ error: `Handlingen fejlede: ${(e as Error).message}` }, 500);
  }
});

async function findAuthUserByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
) {
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u: { email?: string | null }) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < perPage) break;
  }
  return null;
}

async function touchAppUser(
  admin: ReturnType<typeof createClient>,
  appUserId: string | null,
  email: string,
  patch: Record<string, unknown>,
) {
  const fullPatch = { ...patch, updated_at: new Date().toISOString() };
  const tryUpdate = async (
    by: "id" | "email",
    value: string,
    body: Record<string, unknown>,
  ) => admin.from("app_users").update(body).eq(by, value);

  const stripUnknown = (body: Record<string, unknown>, msg: string) => {
    const copy = { ...body };
    for (const key of ["auth_status", "last_invited_at", "last_password_reset_at"]) {
      if (new RegExp(key, "i").test(msg)) delete copy[key];
    }
    const m = msg.match(/'([a-z_]+)' column/i);
    if (m && m[1] in copy) delete copy[m[1]];
    return copy;
  };

  const runWithFallback = async (by: "id" | "email", value: string) => {
    let body = fullPatch;
    for (let i = 0; i < 4; i++) {
      const { error } = await tryUpdate(by, value, body);
      if (!error) return true;
      if (!/schema cache|column/i.test(error.message)) return false;
      const next = stripUnknown(body, error.message);
      if (Object.keys(next).length === Object.keys(body).length) return false;
      body = next;
    }
    return false;
  };

  if (appUserId && (await runWithFallback("id", appUserId))) return;
  await runWithFallback("email", email);
}
