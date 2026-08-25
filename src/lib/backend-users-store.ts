/**
 * Timan Backend — Users administration store.
 *
 * Local-storage backed store for the Users page in /portal/backend/users.
 * If the Supabase `backend_users` table becomes available later, swap the
 * read/write helpers here without changing the page components.
 *
 * Seeded with the 7 initial Timan users (Esben, Jakob, Dag, Nicolai, Janni,
 * Alexander, Birger) on first load.
 */

import {
  PortalRole,
  ModuleAccessKey,
  DEFAULT_MODULE_ACCESS,
} from "@/lib/portalAccess";

export type UserStatus = "active" | "pending" | "blocked";
export type AreaKey = "teknik_service" | "salg_marketing" | "marketing" | "timan_crm" | "timan_backend" | "dealer_data";

export const ALL_AREAS: AreaKey[] = ["salg_marketing", "marketing", "teknik_service", "dealer_data", "timan_crm", "timan_backend"];

export const ALL_MODULES: ModuleAccessKey[] = [
  // Salg
  "byg_din_timan",
  "resources",
  "videos",
  "sales_tools",
  "contracts",
  "tilbud",
  "ordre",
  "messe_portal",
  // Teknik & Service
  "claims",
  "warranty",
  "tsb",
  "service_information",
];

/** Backend-only module keys shown in the editor. Not yet in portalAccess.ts. */
export const BACKEND_META_MODULES = ["users", "roles", "module_access", "audit_log"] as const;
export type BackendMetaModule = typeof BACKEND_META_MODULES[number];

/**
 * Portal front-page "Hurtige handlinger" / "Quick actions" keys.
 * Stored in app_users.quick_actions (jsonb). NULL = role defaults (fallback).
 */
export const QUICK_ACTION_KEYS = ["create_lead", "create_demo", "calendar", "my_dealers"] as const;
export type QuickActionKey = typeof QUICK_ACTION_KEYS[number];

/** Default quick actions per portal role. Used when quick_actions is NULL. */
export const DEFAULT_QUICK_ACTIONS: Record<PortalRole, QuickActionKey[]> = {
  timan_backend: ["create_lead", "create_demo", "calendar", "my_dealers"],
  timan_seller:  ["create_lead", "create_demo", "calendar", "my_dealers"],
  timan_service: [],
  timan_importer: [],
  timan_dealer: [],
  timan_service_partner: [],
  dealer_user: [],
  private_end_user: [],
  exhibition_user: [],
  pending: [],
};

export interface BackendUser {
  id: string;              // uuid (mock: deterministic seed id)
  initials: string;
  name: string;
  email: string;
  company: string;
  country: string;         // ISO-2 (DK, GB, DE...)
  postal_code: string | null;
  language: "da" | "en" | "de" | "it" | "hu";
  dealer_number: string | null;
  /** Mirrored from dealer_accounts.company_name when admin links a dealer. */
  company_dealer: string | null;
  /** Mirrored from dealer_accounts.assigned_seller_initials. */
  seller_initials: string | null;
  /** Mirrored from dealer_accounts.assigned_seller_email. */
  seller_email: string | null;
  notes: string | null;
  role: PortalRole;
  status: UserStatus;
  approved: boolean;
  is_active: boolean;
  allowed_areas: AreaKey[];
  allowed_modules: ModuleAccessKey[];
  backend_modules: BackendMetaModule[];
  perms: {
    can_create_claims: boolean;
    can_approve_claims: boolean;
    can_create_tsb: boolean;
    can_manage_users: boolean;
    can_manage_payment_terms: boolean;
    can_apply_extra_dealer_discount: boolean;
    can_save_configurator_as_lead: boolean;
    news_manage: boolean;
    can_view_prices: boolean;
    can_submit_order: boolean;
  };

  /** CRM — responsible Timan Sælger for this account. Null = unassigned. */
  account_owner_user_id: string | null;
  account_owner_name: string | null;
  account_owner_initials: string | null;
  account_owner_email: string | null;
  last_login_at: string | null; // ISO
  /** Auth lifecycle, written by the admin-user-actions Edge Function. */
  auth_status?: "app_only" | "invited" | "auth_exists" | null;
  last_invited_at?: string | null;
  last_password_reset_at?: string | null;
  /**
   * Quick actions visible on the portal front page. NULL = use role defaults.
   * Empty array = explicitly hide all quick actions.
   */
  quick_actions: QuickActionKey[] | null;
  /** Phase 59 — 'standard' (default) or 'messe' (locked to /messe layout). */
  portal_variant: "standard" | "messe";
  created_at: string;
  updated_at: string;
}

const STORAGE_KEY = "timan.backend_users.v1";

function nowIso() {
  return new Date().toISOString();
}

function seedUser(
  partial: Pick<BackendUser, "id" | "initials" | "name" | "email" | "country" | "role">,
): BackendUser {
  const role = partial.role;
  const allowedAreas: AreaKey[] = (DEFAULT_MODULE_ACCESS[role] || [])
    .filter((m): m is AreaKey => (ALL_AREAS as string[]).includes(m));
  const allowedModules: ModuleAccessKey[] = (DEFAULT_MODULE_ACCESS[role] || [])
    .filter((m) => !(ALL_AREAS as string[]).includes(m));
  const isBackend = role === "timan_backend";
  const isInternal = role === "timan_backend" || role === "timan_seller" || role === "timan_service";
  return {
    ...partial,
    company: "Timan",
    postal_code: null,
    language: "da",
    dealer_number: null,
    company_dealer: null,
    seller_initials: null,
    seller_email: null,
    notes: null,
    status: "active",
    approved: true,
    is_active: true,
    allowed_areas: allowedAreas,
    allowed_modules: allowedModules,
    backend_modules: isBackend ? [...BACKEND_META_MODULES] : [],
    perms: {
      can_create_claims: !isBackend, // backend reviews; sellers/service/dealers create
      can_approve_claims: isInternal,
      can_create_tsb: isBackend,
      can_manage_users: isBackend,
      can_manage_payment_terms: isBackend || role === "timan_seller",
      can_apply_extra_dealer_discount: isBackend,
      can_save_configurator_as_lead: isBackend || role === "timan_seller",
      news_manage: isBackend,
      can_view_prices: true,
      can_submit_order: role !== "timan_service" && role !== "dealer_user",
    },

    account_owner_user_id: null,
    account_owner_name: null,
    account_owner_initials: null,
    account_owner_email: null,
    last_login_at: null,
    quick_actions: [...(DEFAULT_QUICK_ACTIONS[role] ?? [])],
    portal_variant: "standard",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

const SEED: BackendUser[] = [
  seedUser({ id: "u-em",  initials: "EM",  name: "Esben Madsen",        email: "esben@timan.dk",     country: "DK", role: "timan_seller" }),
  seedUser({ id: "u-jtn", initials: "JTN", name: "Jakob T. Nielsen",    email: "jakob@timan.dk",     country: "DK", role: "timan_seller" }),
  seedUser({ id: "u-dvp", initials: "DVP", name: "Dag V. Petersen",     email: "dag@timan.dk",       country: "DK", role: "timan_service" }),
  seedUser({ id: "u-nb",  initials: "NB",  name: "Nicolai B. Moesgaard", email: "nicolai@timan.dk",  country: "DK", role: "timan_backend" }),
  seedUser({ id: "u-jn",  initials: "JN",  name: "Janni Nielsen",       email: "janni@timan.dk",     country: "GB", role: "timan_backend" }),
  seedUser({ id: "u-akr", initials: "AKR", name: "Alexander Kirschner", email: "alexander@timan.dk", country: "DE", role: "timan_seller" }),
  seedUser({ id: "u-bp",  initials: "BP",  name: "Birger Pedersen",     email: "birger@timan.dk",    country: "DK", role: "timan_backend" }),
];

function readAll(): BackendUser[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
      return SEED;
    }
    const parsed = JSON.parse(raw) as BackendUser[];
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED;
    return parsed;
  } catch {
    return SEED;
  }
}

function writeAll(users: BackendUser[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  window.dispatchEvent(new CustomEvent("timan.backend_users.changed"));
}

export function listBackendUsers(): BackendUser[] {
  return readAll();
}

export function getBackendUser(id: string): BackendUser | undefined {
  return readAll().find((u) => u.id === id);
}

export function updateBackendUser(id: string, patch: Partial<BackendUser>): BackendUser | undefined {
  const all = readAll();
  const idx = all.findIndex((u) => u.id === id);
  if (idx < 0) return undefined;
  const next: BackendUser = { ...all[idx], ...patch, id: all[idx].id, updated_at: nowIso() };
  all[idx] = next;
  writeAll(all);
  return next;
}

export function resetBackendUsers() {
  writeAll(SEED);
}

/** Subscribe to store changes (cross-tab + same-tab). */
export function subscribeBackendUsers(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("storage", handler);
  window.addEventListener("timan.backend_users.changed", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("timan.backend_users.changed", handler);
  };
}
