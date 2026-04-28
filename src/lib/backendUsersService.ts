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
  listBackendUsers as listFallbackUsers,
  updateBackendUser as updateFallbackUser,
} from "@/lib/backend-users-store";

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
  const allowedAreasRaw = asArray<string>(row.allowed_areas);
  const allowedModulesRaw = asArray<string>(row.allowed_modules);
  const backendModulesRaw = asArray<string>(row.backend_modules);

  // Derive defaults from role when arrays are empty.
  const defaults = DEFAULT_MODULE_ACCESS[role] || [];
  const defaultAreas = defaults.filter((m): m is AreaKey => (ALL_AREAS as string[]).includes(m));
  const defaultModules = defaults.filter((m) => !(ALL_AREAS as string[]).includes(m));

  const allowed_areas: AreaKey[] = allowedAreasRaw.length
    ? (allowedAreasRaw.filter((a) => (ALL_AREAS as string[]).includes(a)) as AreaKey[])
    : defaultAreas;
  const allowed_modules: ModuleAccessKey[] = allowedModulesRaw.length
    ? (allowedModulesRaw as ModuleAccessKey[])
    : defaultModules;
  const backend_modules: BackendMetaModule[] = backendModulesRaw.length
    ? (backendModulesRaw.filter((m) => (BACKEND_META_MODULES as readonly string[]).includes(m)) as BackendMetaModule[])
    : (role === "timan_backend" ? [...BACKEND_META_MODULES] : []);

  const perms = (row.permissions as Record<string, boolean> | null) || {};
  const isBackend = role === "timan_backend";
  const isInternal = isBackend || role === "timan_seller" || role === "timan_service";

  return {
    id: String(row.id),
    initials: deriveInitials(row),
    name: (row.full_name as string) || (row.email as string),
    email: (row.email as string) || "",
    company: (row.company as string) || ((row.email as string)?.endsWith("@timan.dk") ? "Timan" : ""),
    country: ((row.country as string) || "DK").toUpperCase().slice(0, 2),
    language: ((row.preferred_language as BackendUser["language"]) || "da"),
    dealer_number: (row.dealer_number as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    role,
    status: deriveStatus(row),
    allowed_areas,
    allowed_modules,
    backend_modules,
    perms: {
      can_create_claims: perms.can_create_claims ?? !isBackend,
      can_approve_claims: perms.can_approve_claims ?? isInternal,
      can_create_tsb: perms.can_create_tsb ?? isBackend,
      can_manage_users: perms.can_manage_users ?? isBackend,
    },
    last_login_at: (row.last_login as string | null) ?? null,
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

export async function saveBackendUser(id: string, draft: BackendUser): Promise<SaveResult> {
  const { status, approved, is_active } = statusToColumns(draft.status);

  const fullPatch: Record<string, unknown> = {
    full_name: draft.name,
    email: draft.email,
    initials: draft.initials,
    company: draft.company || null,
    country: draft.country || null,
    preferred_language: draft.language,
    dealer_number: draft.dealer_number,
    notes: draft.notes,
    portal_role: draft.role,
    status,
    approved,
    is_active,
    allowed_areas: draft.allowed_areas,
    allowed_modules: draft.allowed_modules,
    backend_modules: draft.backend_modules,
    permissions: draft.perms,
    updated_at: new Date().toISOString(),
  };

  // Try a full update first; on missing-column errors retry with a minimal
  // patch so older databases (no Phase 2 migration) still get a partial save.
  let attempt = await supabase.from("app_users").update(fullPatch).eq("id", id).select("*").maybeSingle();

  if (attempt.error && /column .* does not exist/i.test(attempt.error.message)) {
    const minimal: Record<string, unknown> = {
      full_name: draft.name,
      email: draft.email,
      notes: draft.notes,
      approved,
      is_active,
      updated_at: new Date().toISOString(),
    };
    attempt = await supabase.from("app_users").update(minimal).eq("id", id).select("*").maybeSingle();
  }

  if (attempt.error) {
    // Fall back to the local store so the preview UI still reacts.
    const local = updateFallbackUser(id, draft);
    return {
      ok: false,
      source: "fallback",
      user: local,
      error: `Kunne ikke gemme i Supabase: ${attempt.error.message}. Ændringen blev gemt lokalt i preview.`,
    };
  }

  const row = attempt.data;
  return {
    ok: true,
    source: "supabase",
    user: row ? rowToBackendUser(row) : draft,
  };
}
