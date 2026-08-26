/**
 * Timan Backend → Brugere — Supabase-backed service.
 *
 * Source of truth: public.app_users.
 * Fallback: src/lib/backend-users-store.ts (localStorage seed) when Supabase
 * is unreachable in preview, so the UI never crashes with HTTP 500.
 *
 * The Supabase columns are added by docs/sql/phase2_backend_users.sql. If a
 * column is missing on an older project, we degrade gracefully (the row is
 * mapped with safe defaults).
 */

import { supabase } from "@/lib/supabase";
import { adminUpdateAppUser } from "@/lib/adminUserActions";
import {
  PortalRole,
  PORTAL_ROLES,
  ModuleAccessKey,
  DEFAULT_MODULE_ACCESS,
} from "@/lib/portalAccess";
import {
  AreaKey,
  ALL_AREAS,
  BACKEND_META_MODULES,
  BackendMetaModule,
  BackendUser,
  UserStatus,
  QUICK_ACTION_KEYS,
  QuickActionKey,
  DEFAULT_QUICK_ACTIONS,
  listBackendUsers as listFallbackUsers,
  updateBackendUser as updateFallbackUser,
} from "@/lib/backend-users-store";
import { defaultCanSubmitOrder, defaultCanViewPrices } from "@/lib/sessionPermissionDefaults";

export type BackendUsersSource = "supabase" | "fallback";

export interface BackendUsersResult {
  source: BackendUsersSource;
  users: BackendUser[];
  error?: string;
}

// ---------- helpers ----------

function deriveRole(row: Record<string, unknown>): PortalRole {
  const portalRole = row.portal_role as string | null | undefined;
  if (portalRole && (PORTAL_ROLES as string[]).includes(portalRole)) {
    return portalRole as PortalRole;
  }
  const role = row.role as string | null | undefined;
  const partnerType = row.partner_type as string | null | undefined;
  if (role === "timan_saelger") return "timan_seller";
  if (role === "partner") {
    if (partnerType === "forhandler") return "timan_dealer";
    if (partnerType === "service_partner") return "timan_service_partner";
    if (partnerType === "importoer") return "timan_importer";
    return "dealer_user";
  }
  if (row.approved === false || row.status === "pending" || row.status === "inactive") return "pending";
  return "dealer_user";
}

function deriveStatus(row: Record<string, unknown>): UserStatus {
  const status = row.status as string | null | undefined;
  if (status === "blocked" || status === "suspended") return "blocked";
  if (status === "pending" || status === "inactive") return "pending";
  if (row.approved === false) return "pending";
  if (row.is_active === false) return "blocked";
  return "active";
}

function deriveInitials(row: Record<string, unknown>): string {
  const explicit = (row.initials as string | null | undefined)?.trim();
  if (explicit) return explicit.toUpperCase().slice(0, 4);
  const name = (row.full_name as string | null | undefined) || (row.email as string)?.split("@")[0] || "";
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 3)
    .join("")
    .toUpperCase() || (name.slice(0, 2).toUpperCase());
}

function asArray<T extends string>(v: unknown): T[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as T[];
  return [];
}

function rowToBackendUser(row: Record<string, unknown>): BackendUser {
  const role = deriveRole(row);
  const hasAreasCol = Object.prototype.hasOwnProperty.call(row, "allowed_areas") && row.allowed_areas != null;
  const hasModulesCol = Object.prototype.hasOwnProperty.call(row, "allowed_modules") && row.allowed_modules != null;
  const hasBackendModulesCol = Object.prototype.hasOwnProperty.call(row, "backend_modules") && row.backend_modules != null;
  const allowedAreasRaw = asArray<string>(row.allowed_areas);
  const allowedModulesRaw = asArray<string>(row.allowed_modules);
  const backendModulesRaw = asArray<string>(row.backend_modules);

  // Derive defaults from role ONLY when the DB column is NULL (never set).
  // An explicitly-saved empty array [] is a valid, intentional choice and
  // must NOT be replaced with role defaults.
  const defaults = DEFAULT_MODULE_ACCESS[role] || [];
  const defaultAreas = defaults.filter((m): m is AreaKey => (ALL_AREAS as string[]).includes(m));
  const defaultModules = defaults.filter((m) => !(ALL_AREAS as string[]).includes(m));

  const allowed_areas: AreaKey[] = hasAreasCol
    ? (allowedAreasRaw.filter((a) => (ALL_AREAS as string[]).includes(a)) as AreaKey[])
    : defaultAreas;
  const allowed_modules: ModuleAccessKey[] = hasModulesCol
    ? (allowedModulesRaw as ModuleAccessKey[])
    : defaultModules;
  const backend_modules: BackendMetaModule[] = hasBackendModulesCol
    ? (backendModulesRaw.filter((m) => (BACKEND_META_MODULES as readonly string[]).includes(m)) as BackendMetaModule[])
    : (role === "timan_backend" ? [...BACKEND_META_MODULES] : []);


  const perms = (row.permissions as Record<string, boolean> | null) || {};
  const isBackend = role === "timan_backend";
  const isInternal = isBackend || role === "timan_seller" || role === "timan_service";

  // Quick actions: NULL in DB = not set yet → fall back to role defaults.
  const rawQa = row.quick_actions;
  let quick_actions: QuickActionKey[] | null;
  if (Array.isArray(rawQa)) {
    quick_actions = (rawQa.filter(
      (k): k is QuickActionKey => typeof k === "string" && (QUICK_ACTION_KEYS as readonly string[]).includes(k),
    ));
  } else if (rawQa == null) {
    quick_actions = null;
  } else {
    quick_actions = null;
  }

  return {
    id: String(row.id),
    initials: deriveInitials(row),
    name: (row.full_name as string) || (row.email as string),
    email: (row.email as string) || "",
    company: (row.company as string) || ((row.email as string)?.endsWith("@timan.dk") ? "Timan" : ""),
    country: ((row.country as string) || "DK").toUpperCase().slice(0, 2),
    postal_code: (row.postal_code as string | null) ?? null,
    language: ((row.preferred_language as BackendUser["language"]) || "da"),
    dealer_number: (row.dealer_number as string | null) ?? null,
    company_dealer: (row.company_dealer as string | null) ?? null,
    seller_initials: (row.seller_initials as string | null) ?? null,
    seller_email: (row.seller_email as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    role,
    status: deriveStatus(row),
    approved: row.approved !== false,
    is_active: row.is_active !== false,
    allowed_areas,
    allowed_modules,
    backend_modules,
    perms: {
      can_view_prices: defaultCanViewPrices(row.can_view_prices, row.portal_role, row.role, row.partner_type),
      can_submit_order: defaultCanSubmitOrder(row.can_submit_order, row.portal_role, row.role, row.partner_type),
      can_create_claims: perms.can_create_claims ?? !isBackend,
      can_approve_claims: perms.can_approve_claims ?? isInternal,
      can_create_tsb: perms.can_create_tsb ?? isBackend,
      can_manage_users: perms.can_manage_users ?? isBackend,
      can_manage_payment_terms: perms.can_manage_payment_terms ?? (isBackend || role === "timan_seller"),
      can_apply_extra_dealer_discount: perms.can_apply_extra_dealer_discount ?? isBackend,
      can_save_configurator_as_lead: perms.can_save_configurator_as_lead ?? (isBackend || role === "timan_seller"),
      news_manage: perms.news_manage ?? isBackend,
    },

    account_owner_user_id: (row.account_owner_user_id as string | null) ?? null,
    account_owner_name:    (row.account_owner_name    as string | null) ?? null,
    account_owner_initials:(row.account_owner_initials as string | null) ?? null,
    account_owner_email:   (row.account_owner_email   as string | null) ?? null,
    last_login_at: (row.last_login as string | null) ?? null,
    auth_status: (row.auth_status as BackendUser["auth_status"]) ?? null,
    last_invited_at: (row.last_invited_at as string | null) ?? null,
    last_password_reset_at: (row.last_password_reset_at as string | null) ?? null,
    quick_actions,
    portal_variant: ((row.portal_variant as string | null) === 'messe' ? 'messe' : 'standard') as BackendUser['portal_variant'],
    created_at: (row.created_at as string) || new Date().toISOString(),
    updated_at: (row.updated_at as string) || new Date().toISOString(),
  };
}

function statusToColumns(status: UserStatus): { status: string; approved: boolean; is_active: boolean } {
  if (status === "active") return { status: "active", approved: true, is_active: true };
  if (status === "pending") return { status: "pending", approved: false, is_active: true };
  return { status: "blocked", approved: true, is_active: false };
}

// ---------- API ----------

export async function fetchBackendUsers(): Promise<BackendUsersResult> {
  try {
    const { data, error } = await supabase
      .from("app_users")
      .select("*")
      .order("email", { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) {
      return { source: "fallback", users: listFallbackUsers(), error: "Supabase returnerede ingen brugere — viser preview-data." };
    }
    return { source: "supabase", users: data.map(rowToBackendUser) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { source: "fallback", users: listFallbackUsers(), error: `Supabase ikke tilgængelig (${msg}) — viser preview-data.` };
  }
}

export interface SaveResult {
  ok: boolean;
  source: BackendUsersSource;
  user?: BackendUser;
  error?: string;
}

// Dealer-side roles must never be able to manage payment terms or apply an
// extra dealer discount — these are reserved for Timan Backend and Timan
// Sælger. Enforced both in the UI and again at save-time as a security guard.
export const PAYMENT_AND_DISCOUNT_RESTRICTED_ROLES: PortalRole[] = [
  "timan_dealer",
  "timan_importer",
  "timan_service_partner",
  "dealer_user",
  "private_end_user",
  "exhibition_user",
  "pending",
];

export function isPaymentAndDiscountRestrictedRole(role: string | null | undefined): boolean {
  return !!role && (PAYMENT_AND_DISCOUNT_RESTRICTED_ROLES as string[]).includes(role);
}

// External dealer-side portal roles. These users must NEVER have Timan
// Backend access or backend meta modules. Timan CRM is allowed as a scoped
// external CRM view when an admin grants the area/module explicitly.
export const DEALER_SIDE_ROLES: PortalRole[] = [
  "timan_dealer",
  "timan_importer",
  "timan_service_partner",
  "dealer_user",
];

export function isDealerSideRole(role: string | null | undefined): boolean {
  return !!role && (DEALER_SIDE_ROLES as string[]).includes(role);
}

function sanitizePermsForRole(role: string, perms: BackendUser["perms"]): BackendUser["perms"] {
  let next = perms;
  if (isPaymentAndDiscountRestrictedRole(role)) {
    next = { ...next, can_manage_payment_terms: false, can_apply_extra_dealer_discount: false };
  }
  if (isDealerSideRole(role)) {
    next = { ...next, can_manage_users: false };
  }
  return next;
}

/**
 * Strip backend access from dealer-side users. Applied both in the
 * editor UI on role-change and at save-time.
 *
 * NOTE: We deliberately do NOT force-add "dealer_data" here. Doing so at
 * save-time would silently revert the admin's manual de-selection of
 * "Forhandlerdata" — the user's saved choice must win over role defaults.
 * Role defaults are applied separately when the admin changes the role
 * via the Role dropdown in the editor.
 */
export function sanitizeAccessForRole(draft: BackendUser): BackendUser {
  if (!isDealerSideRole(draft.role)) return draft;
  const allowed_areas = draft.allowed_areas.filter(
    (a) => a !== "timan_backend",
  );
  const allowed_modules = draft.allowed_modules.filter(
    (m) => m !== "timan_backend",
  );
  const backend_modules: BackendUser["backend_modules"] = [];
  return { ...draft, allowed_areas, allowed_modules, backend_modules };
}

export async function saveBackendUser(id: string, draft: BackendUser): Promise<SaveResult> {
  // Security guard: strip backend/CRM access and disallowed quick actions
  // when role is dealer-side, regardless of what the UI sent.
  draft = sanitizeAccessForRole(draft);

  // Prefer explicit toggle values from the draft (admin can flip them
  // independently); fall back to status-derived defaults otherwise.
  const fromStatus = statusToColumns(draft.status);
  const status = draft.status === "pending" ? "pending"
               : draft.status === "blocked" ? "blocked"
               : "active";
  const approved = typeof draft.approved === "boolean" ? draft.approved : fromStatus.approved;
  const is_active = typeof draft.is_active === "boolean" ? draft.is_active : fromStatus.is_active;
  const portalRoleForDb = draft.role === "pending"
    ? (status === "active" ? "dealer_user" : null)
    : draft.role;
  const roleForAccess = (portalRoleForDb ?? draft.role) as PortalRole;
  const dealerUserDefaults = draft.role === "pending" && portalRoleForDb === "dealer_user"
    ? DEFAULT_MODULE_ACCESS.dealer_user
    : null;
  const allowedAreasForDb = dealerUserDefaults
    ? dealerUserDefaults.filter((m): m is AreaKey => (ALL_AREAS as string[]).includes(m))
    : draft.allowed_areas;
  const allowedModulesForDb = dealerUserDefaults
    ? dealerUserDefaults.filter((m) => !(ALL_AREAS as string[]).includes(m))
    : draft.allowed_modules;

  const safePerms = sanitizePermsForRole(roleForAccess, draft.perms);

  const fullPatch: Record<string, unknown> = {
    full_name: draft.name,
    email: draft.email,
    initials: draft.initials,
    company: draft.company || null,
    country: draft.country || null,
    postal_code: draft.postal_code,
    preferred_language: draft.language,
    dealer_number: draft.dealer_number,
    company_dealer: draft.company_dealer,
    seller_initials: draft.seller_initials,
    seller_email: draft.seller_email,
    notes: draft.notes,
    portal_role: portalRoleForDb,
    status,
    approved,
    is_active,
    allowed_areas: allowedAreasForDb,
    allowed_modules: allowedModulesForDb,
    backend_modules: draft.backend_modules,
    can_view_prices: safePerms.can_view_prices,
    can_submit_order: safePerms.can_submit_order,
    permissions: safePerms,
    account_owner_user_id: draft.account_owner_user_id,
    account_owner_name: draft.account_owner_name,
    account_owner_initials: draft.account_owner_initials,
    account_owner_email: draft.account_owner_email,
    quick_actions: draft.quick_actions, // jsonb; null = role defaults
    portal_variant: draft.portal_variant === 'messe' ? 'messe' : 'standard',
    updated_at: new Date().toISOString(),
  };

  // SECURITY (phase63): privileged app_users writes are no longer possible
  // from the browser — RLS + a protected-column trigger block them. All
  // changes go through the `admin-user-actions` Edge Function, which
  // authenticates the caller, verifies timan_backend + approved + active,
  // whitelists every column, rejects self-escalation and writes an audit
  // entry. The function also performs the missing-column drop/retry fallback.
  const fnResult = await adminUpdateAppUser(id, fullPatch, draft.email);
  const droppedColumns: string[] = fnResult.dropped_columns ?? [];
  for (const col of droppedColumns) delete fullPatch[col];

  const attempt = {
    error: fnResult.ok ? null : ({ message: fnResult.error ?? "Ukendt fejl", code: "" } as { message: string; code?: string }),
    data: (fnResult.user ?? null) as Record<string, unknown> | null,
  };

  if (attempt.error) {
    const msg = attempt.error.message || String(attempt.error);
    const code = (attempt.error as { code?: string }).code || "";

    // Translate common RLS / auth issues into clear Danish messages.
    let friendly = `Kunne ikke gemme i Supabase: ${msg}`;
    if (code === "42501" || /row-level security|permission denied|policy|Adgang nægtet/i.test(msg)) {
      friendly =
        "Du har ikke rettigheder til at opdatere brugere. Log ind som en Timan Backend bruger " +
        "(portal_role = 'timan_backend') hvis app_users-rækken har auth_user_id koblet til din Supabase Auth-konto. " +
        `Detaljer: ${msg}`;
    } else if (code === "PGRST301" || /JWT|not authenticated/i.test(msg)) {
      friendly = `Din session er udløbet — log ind igen og prøv at gemme. Detaljer: ${msg}`;
    }

    const local = updateFallbackUser(id, draft);
    return {
      ok: false,
      source: "fallback",
      user: local,
      error: `${friendly} Ændringen blev gemt lokalt i preview indtil videre.`,
    };
  }

  // ----- Readback verification -----
  // supabase-js returns ok with `data: null` when an UPDATE matches 0 rows
  // (typical RLS denial via USING clause). We must explicitly re-read the
  // row and compare critical fields against the draft. If the row is
  // missing or any field differs, treat the save as FAILED so the UI does
  // not show a misleading success.
  const verify = await supabase.from("app_users").select("*").eq("id", id).maybeSingle();
  if (verify.error || !verify.data) {
    const local = updateFallbackUser(id, draft);
    return {
      ok: false,
      source: "fallback",
      user: local,
      error:
        `Kunne ikke verificere gemt bruger i Supabase (readback fejlede). ` +
        `Detaljer: ${verify.error?.message ?? "row not found"}. ` +
        `Ændringen blev gemt lokalt i preview indtil videre.`,
    };
  }

  const row = verify.data as Record<string, unknown>;
  const mismatches: string[] = [];
  const eq = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  // Compare only fields that were actually included in the (post-drop) patch
  // and that map to columns the live row exposes. Optional/missing columns
  // (e.g. account_owner_*, permissions on older schemas) are reported as a
  // developer console warning instead of a user-facing save failure.
  const checks: Array<[string, unknown, unknown]> = [
    ["initials", row.initials, draft.initials],
    ["full_name", row.full_name, draft.name],
    ["email", (row.email as string)?.toLowerCase(), draft.email.toLowerCase()],
    ["preferred_language", row.preferred_language, draft.language],
    ["portal_role", row.portal_role, portalRoleForDb],
    ["status", row.status, status],
    ["approved", row.approved, approved],
    ["is_active", row.is_active, is_active],
    ["allowed_areas", [...(asArray<string>(row.allowed_areas))].sort(), [...allowedAreasForDb].sort()],
    ["allowed_modules", [...(asArray<string>(row.allowed_modules))].sort(), [...allowedModulesForDb].sort()],
    ["backend_modules", [...(asArray<string>(row.backend_modules))].sort(), [...draft.backend_modules].sort()],
    ["can_view_prices", row.can_view_prices, safePerms.can_view_prices],
    ["can_submit_order", row.can_submit_order, safePerms.can_submit_order],
    ["quick_actions",
      draft.quick_actions == null
        ? null
        : [...(asArray<string>(row.quick_actions))].sort(),
      draft.quick_actions == null
        ? null
        : [...draft.quick_actions].sort(),
    ],
    ["portal_variant", (row.portal_variant as string | null) ?? 'standard', draft.portal_variant === 'messe' ? 'messe' : 'standard'],
  ];
  // Permissions: only compare keys we actually sent, since the DB row may
  // hold extra keys from older edits we don't want to overwrite logic on.
  if (!droppedColumns.includes("permissions")) {
    const rowPerms = (row.permissions as Record<string, boolean> | null) || {};
    const draftPerms = draft.perms as Record<string, boolean>;
    for (const k of Object.keys(draftPerms)) {
      if (!eq(rowPerms[k], draftPerms[k])) {
        mismatches.push(`permissions.${k}`);
      }
    }
  }
  for (const [field, actual, expected] of checks) {
    if (droppedColumns.includes(field)) continue;
    if (!eq(actual, expected)) mismatches.push(field);
  }

  if (droppedColumns.length > 0) {
    // Developer-only warning — don't fail the save because optional
    // columns are missing from the live schema.
    // eslint-disable-next-line no-console
    console.warn(
      `[backendUsersService] Skipped columns missing from public.app_users: ${droppedColumns.join(", ")}. ` +
      `Run the relevant phase2_backend_users.sql / phase3_crm_account_owner.sql migration to enable persistence.`,
    );
  }

  if (mismatches.length > 0) {
    const local = updateFallbackUser(id, draft);
    return {
      ok: false,
      source: "supabase",
      user: rowToBackendUser(row),
      error:
        `Følgende felter blev ikke gemt i Supabase: ${mismatches.join(", ")}. ` +
        `Sandsynlig årsag: RLS UPDATE policy på public.app_users blokerer (PATCH returnerer 0 rækker). ` +
        `Kør docs/sql/phase36_app_users_update_policy.sql i Supabase SQL Editor. ` +
        `Ændringen blev også gemt lokalt i preview.`,
    };
  }

  return {
    ok: true,
    source: "supabase",
    user: rowToBackendUser(row),
  };
}
