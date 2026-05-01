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

// Demo audit entries removed — log starts empty and grows from real
// user actions via appendAuditEntry().
const SEED: AuditEntry[] = [];

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

/** Append a single audit entry (used by Budget module for arbejdsbudget changes). */
export function appendAuditEntry(
  entry: Omit<AuditEntry, "id" | "ts"> & Partial<Pick<AuditEntry, "ts">>,
): AuditEntry {
  const all = readAll();
  const next: AuditEntry = {
    id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    ts: entry.ts || new Date().toISOString(),
    user: entry.user,
    action: entry.action,
    module: entry.module,
    record: entry.record,
    old_value: entry.old_value ?? null,
    new_value: entry.new_value ?? null,
    ip: entry.ip || "internal",
    status: entry.status || "success",
  };
  const updated = [next, ...all].slice(0, 500); // keep storage bounded
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent("timan.audit_log.changed"));
    } catch { /* */ }
  }
  return next;
}

