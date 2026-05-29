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
    const { error } = await supabase.from("budget_references").insert({
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
    });
    if (error) {
      // If the delta_qty column hasn't been added yet, retry without it so
      // the insert still succeeds in environments where Phase 46 hasn't run.
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("delta_qty")) {
        const { error: retryErr } = await supabase.from("budget_references").insert({
          id: row.id, created_at: row.created_at, cell_key: row.cell_key, budget_year: row.budget_year,
          seller_initials: row.seller_initials, seller_email: row.seller_email,
          product_code: row.product_code, model_name: row.model_name, category: row.category,
          month: row.month, month_idx: row.month_idx, budget_type: row.budget_type,
          old_value: row.old_value, new_value: row.new_value,
          dealer_name: row.dealer_name, contact_name: row.contact_name,
          lead_id: row.lead_id, demo_id: row.demo_id, note: row.note,
          created_by_email: row.created_by_email, created_by_name: row.created_by_name,
        });
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

export async function listBudgetReferences(opts: {
  cell_key?: string;
  year?: number;
  seller_email?: string | null;
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
    const { data, error } = await q;
    if (error) throw error;
    if (data && data.length > 0) return data as BudgetReference[];
  } catch (err) {
    console.warn("[budget_references.list] supabase failed → local fallback:", err);
  }
  // Local fallback
  let rows = readLocal();
  if (opts.cell_key) rows = rows.filter(r => r.cell_key === opts.cell_key);
  if (opts.year != null) rows = rows.filter(r => r.budget_year === opts.year);
  if (opts.seller_email) {
    const e = opts.seller_email.toLowerCase();
    rows = rows.filter(r => (r.seller_email || "").toLowerCase() === e);
  }
  return rows.slice(0, limit);
}
