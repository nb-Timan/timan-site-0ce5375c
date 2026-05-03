/**
 * Budget access windows — time-limited unlock windows for the CRM
 * Budget editor.
 *
 * Source of truth (when available): public.budget_access_windows.
 * Fallback: localStorage so the UI works in preview / before the
 * Phase 17 migration is applied.
 *
 * A window UNLOCKS the budget for either:
 *   - all sellers (scope = "all")
 *   - one specific seller (scope = "seller", identified by email/initials)
 * for the period [open_from, open_until]. When the time elapses or the
 * window is manually closed, the budget becomes read-only again.
 *
 * This file does NOT change configurator pricing, product data,
 * quote/order calculations, n8n webhooks, Supabase auth, or existing
 * budget rows. Per-seller "official lock" records (Phase 1) still work
 * exactly as before — the windows are layered on top.
 */
import { supabase } from "@/lib/supabase";

export type BudgetWindowScope = "all" | "seller";
export type BudgetWindowStatus = "open" | "closed";

export interface BudgetAccessWindow {
  id: string;
  budget_year: number;
  scope: BudgetWindowScope;
  seller_initials: string | null;
  seller_email: string | null;
  open_from: string;   // ISO
  open_until: string;  // ISO
  status: BudgetWindowStatus;
  closed_at: string | null;
  closed_by: string | null;
  created_by: string | null;
  created_at: string;
}

const LS_KEY = "timan.crm.budget.accessWindows.v1";

function readLocal(): BudgetAccessWindow[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function writeLocal(rows: BudgetAccessWindow[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(rows)); } catch { /* */ }
}
function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `baw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- CRUD ----------

export async function listBudgetAccessWindows(year: number): Promise<BudgetAccessWindow[]> {
  // Try Supabase first — fall back silently if table missing or unauthorised.
  try {
    const { data, error } = await supabase
      .from("budget_access_windows")
      .select("*")
      .eq("budget_year", year)
      .order("created_at", { ascending: false });
    if (!error && Array.isArray(data)) {
      // Mirror to local cache so seller pages keep working offline / on RLS hiccups.
      const merged = mergeWindows(readLocal(), data as BudgetAccessWindow[]);
      writeLocal(merged);
      return merged.filter((w) => w.budget_year === year);
    }
  } catch { /* */ }
  return readLocal().filter((w) => w.budget_year === year);
}

export interface CreateWindowInput {
  budget_year: number;
  scope: BudgetWindowScope;
  seller_initials?: string | null;
  seller_email?: string | null;
  open_from: string;
  open_until: string;
  created_by?: string | null;
}

export async function createBudgetAccessWindow(input: CreateWindowInput): Promise<BudgetAccessWindow> {
  const now = new Date().toISOString();
  const row: BudgetAccessWindow = {
    id: uid(),
    budget_year: input.budget_year,
    scope: input.scope,
    seller_initials: input.scope === "seller" ? (input.seller_initials || null) : null,
    seller_email:    input.scope === "seller" ? ((input.seller_email || "").toLowerCase() || null) : null,
    open_from: input.open_from,
    open_until: input.open_until,
    status: "open",
    closed_at: null,
    closed_by: null,
    created_by: input.created_by ?? null,
    created_at: now,
  };
  // Local-first write so the UI updates immediately even if Supabase fails.
  writeLocal([row, ...readLocal()]);
  try {
    const { error } = await supabase.from("budget_access_windows").insert({
      id: row.id,
      budget_year: row.budget_year,
      scope: row.scope,
      seller_initials: row.seller_initials,
      seller_email: row.seller_email,
      open_from: row.open_from,
      open_until: row.open_until,
      status: row.status,
      created_by: row.created_by,
      created_at: row.created_at,
    });
    if (error) console.warn("[budgetAccessWindows.create] supabase insert failed (kept local):", error.message);
  } catch (err) {
    console.warn("[budgetAccessWindows.create] unexpected:", err);
  }
  return row;
}

/** Close a window NOW (manual close-immediately). */
export async function closeBudgetAccessWindow(id: string, who: string | null): Promise<void> {
  const now = new Date().toISOString();
  const local = readLocal();
  const idx = local.findIndex((w) => w.id === id);
  if (idx >= 0) {
    local[idx] = { ...local[idx], status: "closed", closed_at: now, closed_by: who };
    writeLocal(local);
  }
  try {
    const { error } = await supabase
      .from("budget_access_windows")
      .update({ status: "closed", closed_at: now, closed_by: who })
      .eq("id", id);
    if (error) console.warn("[budgetAccessWindows.close] supabase update failed (kept local):", error.message);
  } catch (err) {
    console.warn("[budgetAccessWindows.close] unexpected:", err);
  }
}

/** Extend the open_until of an existing window. */
export async function extendBudgetAccessWindow(id: string, newOpenUntilIso: string): Promise<void> {
  const local = readLocal();
  const idx = local.findIndex((w) => w.id === id);
  if (idx >= 0) {
    local[idx] = { ...local[idx], open_until: newOpenUntilIso };
    writeLocal(local);
  }
  try {
    const { error } = await supabase
      .from("budget_access_windows")
      .update({ open_until: newOpenUntilIso })
      .eq("id", id);
    if (error) console.warn("[budgetAccessWindows.extend] supabase update failed (kept local):", error.message);
  } catch (err) {
    console.warn("[budgetAccessWindows.extend] unexpected:", err);
  }
}

// ---------- Resolution ----------

/**
 * Returns the most-relevant currently-active window for (year, sellerEmail), or
 * null if the budget is not currently open for that seller. "Most relevant" =
 * a seller-specific window wins over an "all" window when both are active.
 */
export function findActiveWindow(
  windows: BudgetAccessWindow[],
  year: number,
  sellerEmail: string | null | undefined,
  now: Date = new Date(),
): BudgetAccessWindow | null {
  const t = now.getTime();
  const email = (sellerEmail || "").toLowerCase();

  const active = windows.filter((w) => {
    if (w.budget_year !== year) return false;
    if (w.status !== "open") return false;
    const from = new Date(w.open_from).getTime();
    const until = new Date(w.open_until).getTime();
    if (Number.isNaN(from) || Number.isNaN(until)) return false;
    if (t < from || t > until) return false;
    if (w.scope === "all") return true;
    return email !== "" && (w.seller_email || "").toLowerCase() === email;
  });

  if (active.length === 0) return null;
  // Prefer seller-specific window over "all".
  active.sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "seller" ? -1 : 1;
    // Then most-recently created.
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return active[0];
}

/** Format ms as "Xh Ym" or "Ym Xs" for the countdown strip. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0m";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${secs}s`;
}

// ---------- Helpers ----------

function mergeWindows(local: BudgetAccessWindow[], remote: BudgetAccessWindow[]): BudgetAccessWindow[] {
  const byId = new Map<string, BudgetAccessWindow>();
  for (const w of local) byId.set(w.id, w);
  for (const w of remote) byId.set(w.id, w); // remote wins
  return Array.from(byId.values());
}
