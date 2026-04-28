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
export type AreaKey = "teknik_service" | "salg_marketing" | "timan_backend";

export const ALL_AREAS: AreaKey[] = ["teknik_service", "salg_marketing", "timan_backend"];

export const ALL_MODULES: ModuleAccessKey[] = [
  "claims",
  "tsb",
  "warranty",
  "service_information",
  "byg_din_timan",
  "resources",
  "sales_tools",
  // Backend-only meta modules — kept here for the editor UI even though they
  // are not yet enforced in portalAccess.ts.
  "tilbud",
  "ordre",
];

/** Backend-only module keys shown in the editor. Not yet in portalAccess.ts. */
export const BACKEND_META_MODULES = ["users", "roles", "module_access", "audit_log"] as const;
export type BackendMetaModule = typeof BACKEND_META_MODULES[number];

export interface BackendUser {
  id: string;              // uuid (mock: deterministic seed id)
  initials: string;
  name: string;
  email: string;
  company: string;
  country: string;         // ISO-2 (DK, GB, DE...)
  language: "da" | "en" | "de" | "it" | "hu";
  dealer_number: string | null;
  notes: string | null;
  role: PortalRole;
  status: UserStatus;
  allowed_areas: AreaKey[];
  allowed_modules: ModuleAccessKey[];
  backend_modules: BackendMetaModule[];
  perms: {
    can_create_claims: boolean;
    can_approve_claims: boolean;
    can_create_tsb: boolean;
    can_manage_users: boolean;
  };
  /** CRM — responsible Timan Sælger for this account. Null = unassigned. */
  account_owner_user_id: string | null;
  account_owner_name: string | null;
  account_owner_initials: string | null;
  account_owner_email: string | null;
  last_login_at: string | null; // ISO
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
    language: "da",
    dealer_number: null,
    notes: null,
    status: "active",
    allowed_areas: allowedAreas,
    allowed_modules: allowedModules,
    backend_modules: isBackend ? [...BACKEND_META_MODULES] : [],
    perms: {
      can_create_claims: !isBackend, // backend reviews; sellers/service/dealers create
      can_approve_claims: isInternal,
      can_create_tsb: isBackend,
      can_manage_users: isBackend,
    },
    account_owner_user_id: null,
    account_owner_name: null,
    account_owner_initials: null,
    account_owner_email: null,
    last_login_at: null,
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
