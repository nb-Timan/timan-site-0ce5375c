/**
 * Timan Backend → Module access matrix (roles × modules × permission level).
 * LocalStorage-backed. Safe if Supabase tables are missing.
 */

import { PortalRole, PORTAL_ROLES, DEFAULT_MODULE_ACCESS } from "@/lib/portalAccess";

export type PermissionLevel = "none" | "view" | "create" | "edit" | "approve" | "manage";

export const PERMISSION_LEVELS: PermissionLevel[] = [
  "none", "view", "create", "edit", "approve", "manage",
];

export type MatrixModuleKey =
  | "teknik_service" | "salg_marketing" | "marketing" | "timan_backend"
  | "claims" | "tsb" | "warranty" | "service_information"
  | "byg_din_timan" | "tilbud" | "ordre"
  | "videos" | "resources" | "sales_tools" | "contracts"
  | "users" | "roles" | "module_access" | "audit_log";

export interface MatrixModule { key: MatrixModuleKey; label: string }

export const MATRIX_MODULES: MatrixModule[] = [
  { key: "teknik_service",      label: "Teknik & Service" },
  { key: "salg_marketing",      label: "Salg" },
  { key: "marketing",           label: "Marketing" },
  { key: "timan_backend",       label: "Timan Backend" },
  { key: "claims",              label: "Service / Claims" },
  { key: "tsb",                 label: "TSB Portal" },
  { key: "warranty",            label: "Garantiregistrering" },
  { key: "service_information", label: "Serviceinformation" },
  { key: "byg_din_timan",       label: "Byg din Timan" },
  { key: "tilbud",              label: "Tilbud" },
  { key: "ordre",               label: "Ordre" },
  { key: "videos",              label: "Video Galleri" },
  { key: "resources",           label: "Beregnere & kalkulatorer" },
  { key: "sales_tools",         label: "Formularer" },
  { key: "contracts",           label: "Kontrakt" },
  { key: "users",               label: "Brugere" },
  { key: "roles",               label: "Roller" },
  { key: "module_access",       label: "Modul-adgang" },
  { key: "audit_log",           label: "Audit log" },
];

export type AccessMatrix = Record<PortalRole, Partial<Record<MatrixModuleKey, PermissionLevel>>>;

const STORAGE_KEY = "timan.module_access.v1";

function defaultLevel(role: PortalRole, key: MatrixModuleKey): PermissionLevel {
  // Backend → manage everything
  if (role === "timan_backend") return "manage";

  const backendOnly: MatrixModuleKey[] = ["timan_backend", "users", "roles", "module_access", "audit_log"];
  if (backendOnly.includes(key)) return "none";

  const defaults = DEFAULT_MODULE_ACCESS[role] as string[];
  // Map matrix keys that align with ModuleAccessKey
  const aligned: MatrixModuleKey[] = [
    "teknik_service","salg_marketing","marketing","claims","tsb","warranty",
    "service_information","byg_din_timan","tilbud","ordre","resources","sales_tools","contracts",
  ];
  if (aligned.includes(key)) {
    if (!defaults.includes(key)) return "none";
  }

  // Videos always visible to everyone with any portal access
  if (key === "videos") return "view";

  // Internal roles: edit/approve depending on module
  const internal = role === "timan_seller" || role === "timan_service";
  if (internal) {
    if (key === "claims") return role === "timan_service" ? "approve" : "edit";
    if (key === "tsb") return "edit";
    if (key === "warranty") return "edit";
    if (key === "ordre" || key === "tilbud") return role === "timan_seller" ? "edit" : "view";
    return "view";
  }

  // Dealer-side
  if (role === "timan_importer" || role === "timan_dealer" || role === "timan_service_partner") {
    if (key === "claims") return "create";
    if (key === "warranty") return "create";
    if (key === "tilbud" || key === "ordre" || key === "byg_din_timan") return "create";
    return "view";
  }

  // dealer_user — read only
  return "view";
}

function buildDefault(): AccessMatrix {
  const m = {} as AccessMatrix;
  for (const r of PORTAL_ROLES) {
    m[r] = {};
    for (const mod of MATRIX_MODULES) {
      m[r][mod.key] = defaultLevel(r, mod.key);
    }
  }
  return m;
}

function readAll(): AccessMatrix {
  if (typeof window === "undefined") return buildDefault();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const def = buildDefault();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(def));
      return def;
    }
    return JSON.parse(raw) as AccessMatrix;
  } catch {
    return buildDefault();
  }
}

export function getAccessMatrix(): AccessMatrix {
  return readAll();
}

export function setAccessMatrix(m: AccessMatrix) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(m));
  window.dispatchEvent(new CustomEvent("timan.module_access.changed"));
}

export function resetAccessMatrix(): AccessMatrix {
  const def = buildDefault();
  setAccessMatrix(def);
  return def;
}

export function subscribeAccessMatrix(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("storage", handler);
  window.addEventListener("timan.module_access.changed", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("timan.module_access.changed", handler);
  };
}
