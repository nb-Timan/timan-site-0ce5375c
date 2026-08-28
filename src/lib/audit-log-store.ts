/**
 * Timan Backend → Audit log store.
 *
 * Source of truth: public.audit_log (Phase 20 SQL — see
 * docs/sql/phase20_audit_log.sql). Falls back to localStorage so the UI
 * still works if the table doesn't exist yet.
 *
 * Read access is restricted to Timan Backend users via RLS.
 */
import { supabase } from "@/lib/supabase";

export type AuditAction =
  | "create" | "update" | "delete" | "approve" | "reject" | "login" | "invite" | "reset";

export type AuditValue = string | number | boolean | null | { [k: string]: unknown } | unknown[];

export interface AuditEntry {
  id: string;
  ts: string;            // ISO (alias for created_at)
  user: string;          // display name or email (derived: actor_name || actor_email)
  action: AuditAction;
  module: string;
  record: string;        // record_label || record_id
  old_value: AuditValue;
  new_value: AuditValue;
  ip: string;
  status: "success" | "failure";

  // Extended fields (Phase 20)
  actor_email?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  active_mode?: string | null;
  seller_context?: string | null;
  record_type?: string | null;
  record_id?: string | null;
  user_agent?: string | null;
}

const STORAGE_KEY = "timan.audit_log.v1";

function readLocal(): AuditEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeLocal(rows: AuditEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 500)));
    window.dispatchEvent(new CustomEvent("timan.audit_log.changed"));
  } catch { /* */ }
}

function rowToEntry(r: Record<string, unknown>): AuditEntry {
  const actor_email = (r.actor_email as string) ?? null;
  const actor_name = (r.actor_name as string) ?? null;
  const record_label = (r.record_label as string) ?? null;
  const record_id = (r.record_id as string) ?? null;
  return {
    id: String(r.id),
    ts: String(r.created_at ?? new Date().toISOString()),
    user: actor_name || actor_email || "—",
    action: (r.action as AuditAction) || "update",
    module: String(r.module ?? ""),
    record: record_label || record_id || "—",
    old_value: (r.old_value as AuditValue) ?? null,
    new_value: (r.new_value as AuditValue) ?? null,
    ip: (r.ip_address as string) || "internal",
    status: ((r.status as string) === "failure" ? "failure" : "success"),
    actor_email,
    actor_name,
    actor_role: (r.actor_role as string) ?? null,
    active_mode: (r.active_mode as string) ?? null,
    seller_context: (r.seller_context as string) ?? null,
    record_type: (r.record_type as string) ?? null,
    record_id,
    user_agent: (r.user_agent as string) ?? null,
  };
}

/** Async — preferred. Reads from Supabase, falls back to local. */
export async function fetchAuditEntries(limit = 500): Promise<AuditEntry[]> {
  try {
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    if (data) return (data as Record<string, unknown>[]).map(rowToEntry);
  } catch (err) {
    console.warn("[audit_log.fetch] supabase failed → local fallback:", err);
  }
  return readLocal().slice().sort((a, b) => b.ts.localeCompare(a.ts));
}

/** Fetch budget audit entries (record_type = 'crm_budget'). Optionally filter
 *  by year, seller_context (email or initials), and/or cell_key. */
export async function fetchBudgetAuditEntries(opts: {
  year?: number;
  seller_context?: string | null;
  cell_key?: string | null;
  limit?: number;
} = {}): Promise<AuditEntry[]> {
  const limit = opts.limit ?? 50;
  try {
    let q = supabase
      .from("audit_log")
      .select("*")
      .eq("record_type", "crm_budget")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.seller_context) q = q.ilike("seller_context", opts.seller_context);
    if (opts.cell_key) q = q.eq("new_value->>cell_key", opts.cell_key);
    const { data, error } = await q;
    if (error) throw error;
    let rows = (data || []) as Record<string, unknown>[];
    if (opts.year != null) {
      rows = rows.filter((r) => {
        const nv = r.new_value as Record<string, unknown> | null;
        const ov = r.old_value as Record<string, unknown> | null;
        return Number((nv?.year ?? ov?.year)) === opts.year;
      });
    }
    return rows.map(rowToEntry);
  } catch (err) {
    console.warn("[audit_log.fetchBudget] supabase failed:", err);
    return [];
  }
}

/** Sync legacy accessor — local only. Kept for compatibility. */
export function listAuditEntries(): AuditEntry[] {
  return readLocal().slice().sort((a, b) => b.ts.localeCompare(a.ts));
}

export function resetAuditLog() {
  writeLocal([]);
}

export interface AppendAuditInput {
  user?: string;          // legacy
  action: AuditAction;
  module: string;
  record?: string;        // legacy → record_label
  old_value?: AuditValue;
  new_value?: AuditValue;
  ip?: string;
  status?: "success" | "failure";
  ts?: string;

  actor_email?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  active_mode?: string | null;
  seller_context?: string | null;
  record_type?: string | null;
  record_id?: string | null;
  record_label?: string | null;
  user_agent?: string | null;
}

/** Append one audit entry — fire-and-forget Supabase insert + local cache. */
export function appendAuditEntry(input: AppendAuditInput): AuditEntry {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const ts = input.ts || new Date().toISOString();
  const actor_name = input.actor_name ?? input.user ?? null;
  const actor_email = input.actor_email ?? null;
  const record_label = input.record_label ?? input.record ?? null;
  const ip = input.ip || "internal";
  const ua =
    input.user_agent ?? (typeof navigator !== "undefined" ? navigator.userAgent : null);

  const entry: AuditEntry = {
    id,
    ts,
    user: actor_name || actor_email || input.user || "—",
    action: input.action,
    module: input.module,
    record: record_label || input.record_id || "—",
    old_value: input.old_value ?? null,
    new_value: input.new_value ?? null,
    ip,
    status: input.status || "success",
    actor_email,
    actor_name,
    actor_role: input.actor_role ?? null,
    active_mode: input.active_mode ?? null,
    seller_context: input.seller_context ?? null,
    record_type: input.record_type ?? null,
    record_id: input.record_id ?? null,
    user_agent: ua,
  };

  // Local cache (immediate)
  writeLocal([entry, ...readLocal()]);

  // Supabase insert (best-effort)
  void (async () => {
    try {
      const { error } = await supabase.from("audit_log").insert({
        id,
        created_at: ts,
        actor_email,
        actor_name,
        actor_role: entry.actor_role,
        active_mode: entry.active_mode,
        seller_context: entry.seller_context,
        action: entry.action,
        module: entry.module,
        record_type: entry.record_type,
        record_id: entry.record_id,
        record_label,
        old_value: entry.old_value,
        new_value: entry.new_value,
        status: entry.status,
        ip_address: ip,
        user_agent: ua,
      });
      if (error) console.warn("[audit_log.insert] supabase failed (kept local):", error.message);
    } catch (err) {
      console.warn("[audit_log.insert] unexpected:", err);
    }
  })();

  return entry;
}
