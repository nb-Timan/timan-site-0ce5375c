/**
 * Timan Backend → Audit log store (localStorage in preview).
 * Mock data only; safe if Supabase audit_log table is missing.
 */

export interface AuditEntry {
  id: string;
  ts: string;            // ISO
  user: string;          // display name or email
  action: "create" | "update" | "delete" | "approve" | "reject" | "login";
  module: string;
  record: string;
  old_value: string | null;
  new_value: string | null;
  ip: string;
  status: "success" | "failure";
}

const STORAGE_KEY = "timan.audit_log.v1";

function iso(daysAgo: number, h = 9, m = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const SEED: AuditEntry[] = [
  { id: "a-001", ts: iso(0, 9, 14),  user: "Nicolai B. Moesgaard", action: "update", module: "Brugere",        record: "u-akr",       old_value: "status: pending", new_value: "status: active",  ip: "10.0.1.22",   status: "success" },
  { id: "a-002", ts: iso(0, 8, 47),  user: "Janni Nielsen",        action: "create", module: "Roller",         record: "role:custom_seller", old_value: null, new_value: "Custom seller role", ip: "10.0.1.18", status: "success" },
  { id: "a-003", ts: iso(1, 15, 22), user: "Esben Madsen",         action: "approve", module: "Service / Claims", record: "CL-9050-1", old_value: "review",      new_value: "approved",            ip: "10.0.2.41",   status: "success" },
  { id: "a-004", ts: iso(1, 14, 5),  user: "Dag V. Petersen",      action: "create", module: "TSB Portal",     record: "TSB-2026-014", old_value: null,         new_value: "Draft created",       ip: "10.0.2.40",   status: "success" },
  { id: "a-005", ts: iso(2, 11, 30), user: "Birger Pedersen",      action: "update", module: "Modul-adgang",   record: "timan_dealer × tilbud", old_value: "view", new_value: "create",          ip: "10.0.1.9",    status: "success" },
  { id: "a-006", ts: iso(2, 10, 12), user: "Jakob T. Nielsen",     action: "login",  module: "Login/Auth",     record: "session",     old_value: null,           new_value: "session started",     ip: "92.43.117.4", status: "success" },
  { id: "a-007", ts: iso(3, 17, 1),  user: "Alexander Kirschner",  action: "delete", module: "Garantiregistrering", record: "WR-2025-882", old_value: "draft",  new_value: null,                  ip: "85.124.6.18", status: "success" },
  { id: "a-008", ts: iso(3, 16, 44), user: "Janni Nielsen",        action: "reject", module: "Service / Claims", record: "CL-8821-3", old_value: "review",      new_value: "rejected",            ip: "10.0.1.18",   status: "success" },
  { id: "a-009", ts: iso(4, 9, 5),   user: "ukendt",               action: "login",  module: "Login/Auth",     record: "esben@timan.dk", old_value: null,        new_value: "invalid password",     ip: "203.0.113.5", status: "failure" },
  { id: "a-010", ts: iso(5, 13, 27), user: "Nicolai B. Moesgaard", action: "update", module: "Brugere",        record: "u-bp",        old_value: "role: timan_seller", new_value: "role: timan_backend", ip: "10.0.1.22", status: "success" },
];

function readAll(): AuditEntry[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
      return SEED;
    }
    const parsed = JSON.parse(raw) as AuditEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return SEED;
    return parsed;
  } catch {
    return SEED;
  }
}

export function listAuditEntries(): AuditEntry[] {
  return readAll().slice().sort((a, b) => b.ts.localeCompare(a.ts));
}

export function resetAuditLog() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED));
  window.dispatchEvent(new CustomEvent("timan.audit_log.changed"));
}
