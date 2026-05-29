/**
 * Budget references — optional context (dealer / contact / lead id / demo id /
 * note) the user can attach when changing a Budget or Arbejdsbudget value.
 *
 * Storage: public.budget_references (Phase 22 SQL). Falls back to localStorage
 * so the UI works in preview without the table.
 *
 * Note: References are explanatory metadata only. They never participate in
 * budget / pipeline / order calculations.
 */
import { supabase } from "@/lib/supabase";
import { notifyLocalFallback } from "@/lib/persistenceWarning";
import type { BudgetType } from "@/lib/crmBudgetService";

export interface BudgetReference {
  id: string;
  created_at: string;
  cell_key: string;
  budget_year: number;
  seller_initials: string | null;
  seller_email: string | null;
  product_code: string | null;
  model_name: string | null;
  category: string | null;
  month: string | null;
  month_idx: number | null;
  budget_type: BudgetType;
  old_value: number | null;
  new_value: number | null;
  dealer_name: string | null;
  contact_name: string | null;
  lead_id: string | null;
  demo_id: string | null;
  note: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  /** Antal stk. denne reference dækker over. NULL = ukendt (gamle rækker). */
  delta_qty: number | null;
  /** Stabil id for den budgetændring rækken hører til (typisk audit-id).
   *  Alle rækker fra samme gem deler samme id. NULL = gamle rækker uden gruppe. */
  reference_group_id: string | null;
}

export type NewBudgetReference = Omit<BudgetReference, "id" | "created_at">;

const STORAGE_KEY = "timan.budget_references.v1";

function readLocal(): BudgetReference[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BudgetReference[]) : [];
  } catch { return []; }
}
function writeLocal(rows: BudgetReference[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 500))); } catch { /* */ }
}

function genId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function createBudgetReference(input: NewBudgetReference): Promise<BudgetReference> {
  const row: BudgetReference = {
    id: genId(),
    created_at: new Date().toISOString(),
    ...input,
  };
  // Local cache first (immediate UI)
  writeLocal([row, ...readLocal()]);
  // Supabase insert (best-effort)
  try {
    const fullPayload = {
      id: row.id,
      created_at: row.created_at,
      cell_key: row.cell_key,
      budget_year: row.budget_year,
      seller_initials: row.seller_initials,
      seller_email: row.seller_email,
      product_code: row.product_code,
      model_name: row.model_name,
      category: row.category,
      month: row.month,
      month_idx: row.month_idx,
      budget_type: row.budget_type,
      old_value: row.old_value,
      new_value: row.new_value,
      dealer_name: row.dealer_name,
      contact_name: row.contact_name,
      lead_id: row.lead_id,
      demo_id: row.demo_id,
      note: row.note,
      created_by_email: row.created_by_email,
      created_by_name: row.created_by_name,
      delta_qty: row.delta_qty,
      reference_group_id: row.reference_group_id,
    };
    const { error } = await supabase.from("budget_references").insert(fullPayload);
    if (error) {
      // If a newer column hasn't been added yet (Phase 46 / Phase 47), retry
      // without those fields so the insert still succeeds in older envs.
      const msg = (error.message || "").toLowerCase();
      const stripped: Record<string, unknown> = { ...fullPayload };
      if (msg.includes("delta_qty")) delete stripped.delta_qty;
      if (msg.includes("reference_group_id")) delete stripped.reference_group_id;
      if (Object.keys(stripped).length !== Object.keys(fullPayload).length) {
        const { error: retryErr } = await supabase.from("budget_references").insert(stripped);
        if (retryErr) notifyLocalFallback({ table: "budget_references", action: "insert", error: retryErr });
      } else {
        notifyLocalFallback({ table: "budget_references", action: "insert", error });
      }
    }
  } catch (err) {
    notifyLocalFallback({ table: "budget_references", action: "insert", error: err });
  }
  return row;
}

/** Delete every reference row that belongs to the given change group.
 *  Used when the user re-opens a distribution and saves a new one — we
 *  replace the previous group rather than stacking duplicates on top. */
export async function deleteBudgetReferenceGroup(groupId: string): Promise<void> {
  if (!groupId) return;
  try {
    const { error } = await supabase
      .from("budget_references")
      .delete()
      .eq("reference_group_id", groupId);
    if (error) notifyLocalFallback({ table: "budget_references", action: "delete-group", error });
  } catch (err) {
    notifyLocalFallback({ table: "budget_references", action: "delete-group", error: err });
  }
  try {
    const remaining = readLocal().filter(r => r.reference_group_id !== groupId);
    writeLocal(remaining);
  } catch { /* */ }
}

/** Delete every reference row tied to a specific budget cell (cell_key +
 *  budget_year + budget_type). Used when re-saving a distribution so we
 *  replace ALL prior rows for the cell — including legacy rows without a
 *  reference_group_id. */
export async function deleteBudgetReferencesForCell(opts: {
  cell_key: string;
  budget_year?: number | null;
  budget_type?: BudgetType | null;
}): Promise<void> {
  if (!opts.cell_key) return;
  try {
    let q = supabase.from("budget_references").delete().eq("cell_key", opts.cell_key);
    if (opts.budget_year != null) q = q.eq("budget_year", opts.budget_year);
    if (opts.budget_type) q = q.eq("budget_type", opts.budget_type);
    const { error } = await q;
    if (error) notifyLocalFallback({ table: "budget_references", action: "delete-cell", error });
  } catch (err) {
    notifyLocalFallback({ table: "budget_references", action: "delete-cell", error: err });
  }
  try {
    const remaining = readLocal().filter(r => {
      if (r.cell_key !== opts.cell_key) return true;
      if (opts.budget_year != null && r.budget_year !== opts.budget_year) return true;
      if (opts.budget_type && r.budget_type !== opts.budget_type) return true;
      return false;
    });
    writeLocal(remaining);
  } catch { /* */ }
}

/** Delete a single reference row by id. */
export async function deleteBudgetReference(id: string): Promise<void> {
  if (!id) return;
  try {
    const { error } = await supabase.from("budget_references").delete().eq("id", id);
    if (error) notifyLocalFallback({ table: "budget_references", action: "delete", error });
  } catch (err) {
    notifyLocalFallback({ table: "budget_references", action: "delete", error: err });
  }
  try { writeLocal(readLocal().filter(r => r.id !== id)); } catch { /* */ }
}

export async function listBudgetReferences(opts: {
  cell_key?: string;
  year?: number;
  seller_email?: string | null;
  budget_type?: BudgetType | null;
  reference_group_id?: string | null;
  limit?: number;
} = {}): Promise<BudgetReference[]> {
  const limit = opts.limit ?? 50;
  try {
    let q = supabase
      .from("budget_references")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts.cell_key) q = q.eq("cell_key", opts.cell_key);
    if (opts.year != null) q = q.eq("budget_year", opts.year);
    if (opts.seller_email) q = q.ilike("seller_email", opts.seller_email);
    if (opts.budget_type) q = q.eq("budget_type", opts.budget_type);
    if (opts.reference_group_id) q = q.eq("reference_group_id", opts.reference_group_id);
    const { data, error } = await q;
    if (error) throw error;
    if (data && data.length > 0) return data as BudgetReference[];
  } catch (err) {
    console.warn("[budget_references.list] supabase failed → local fallback:", err);
  }
  let rows = readLocal();
  if (opts.cell_key) rows = rows.filter(r => r.cell_key === opts.cell_key);
  if (opts.year != null) rows = rows.filter(r => r.budget_year === opts.year);
  if (opts.seller_email) {
    const e = opts.seller_email.toLowerCase();
    rows = rows.filter(r => (r.seller_email || "").toLowerCase() === e);
  }
  if (opts.budget_type) rows = rows.filter(r => r.budget_type === opts.budget_type);
  if (opts.reference_group_id) {
    rows = rows.filter(r => r.reference_group_id === opts.reference_group_id);
  }
  return rows.slice(0, limit);
}

