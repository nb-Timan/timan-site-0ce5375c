/**
 * Dealer-level budget helpers for CRM "Mine forhandlere" + dealer detail.
 *
 * Replicates the Budget Dashboard attribution at the dealer-row level:
 *   • Budget = sum of crm_budget_dealer_lines.qty (non-excluded) where
 *     dealer_account_number / dealer_name normalises to this dealer.
 *   • Realised = sum of machine quantities on won orders (case_status
 *     'ordre_afgivet' or order_sent_at/submitted_at present) whose
 *     dealer_key resolves to this dealer.
 *
 * YTD = January .. end of current month (inclusive).
 *
 * Read-only — never writes back to budget tables. Pipeline is exposed
 * separately and is NEVER added into realised.
 */
import {
  listBudgetDealerLines,
  normalizeDealerName,
  type BudgetDealerLine,
} from "@/lib/crmBudgetService";
import { listScopedOrdersWithValue, type CrmOrderWithValue } from "@/lib/crmConfigurationsService";
import {
  listScopedOpenQuotes,
  dealerKeyOf,
  type ScopedConfiguration,
} from "@/lib/crmRelationsService";
import type { CrmConfigurationFilter } from "@/lib/crmConfigurationsService";
import type { DealerAccount } from "@/lib/dealerAccountsService";

export interface DealerBudgetTotals {
  /** January .. end of current month (0-indexed, inclusive). */
  ytdMonthIdx: number;
  /** Sum of qty across full year — "Årsbudget". */
  yearBudgetQty: number;
  /** Sum of qty Jan..ytdMonthIdx — "Budget YTD". */
  ytdBudgetQty: number;
  /** Sum of won-order machine qty Jan..ytdMonthIdx — "Realiseret YTD". */
  ytdRealisedQty: number;
  /** Sum of pipeline (open quotes + open orders) machine qty for the year. */
  pipelineQty: number;
  /** True if no budget row exists for this dealer for the year. */
  noBudget: boolean;
  /** Per-month budget qty (12 entries). */
  monthlyBudget: number[];
  /** Per-month realised qty from won orders (12 entries). */
  monthlyRealised: number[];
}

export interface DealerBudgetIndex {
  year: number;
  ytdMonthIdx: number;
  /** Per-dealer totals keyed by dealer_account_number. */
  byAccount: Map<string, DealerBudgetTotals>;
}

function emptyTotals(ytdMonthIdx: number): DealerBudgetTotals {
  return {
    ytdMonthIdx,
    yearBudgetQty: 0,
    ytdBudgetQty: 0,
    ytdRealisedQty: 0,
    pipelineQty: 0,
    noBudget: true,
    monthlyBudget: Array.from({ length: 12 }, () => 0),
    monthlyRealised: Array.from({ length: 12 }, () => 0),
  };
}

/** YTD month index: end of current month if same year, 11 if past year, -1 if future. */
function resolveYtdMonthIdx(year: number): number {
  const now = new Date();
  if (year < now.getFullYear()) return 11;
  if (year > now.getFullYear()) return -1;
  return now.getMonth();
}

function orderMonthIdx(o: CrmOrderWithValue, year: number): number | null {
  const iso = o.order_sent_at || o.submitted_at || o.last_saved_at || o.created_at;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== year) return null;
  return d.getMonth();
}

function isWonOrder(o: CrmOrderWithValue): boolean {
  const s = (o.case_status || "").toLowerCase();
  return s === "ordre_afgivet" || !!o.order_sent_at || !!o.submitted_at;
}

function sumQty(qtyByKey: Record<string, number>): number {
  let n = 0;
  for (const k in qtyByKey) n += Number(qtyByKey[k]) || 0;
  return n;
}

/** Build a per-dealer budget index for the given year using the SAME
 *  data source as Budget Dashboard (crm_budget_dealer_lines + scoped
 *  orders/quotes). All dealers passed in get an entry, even if they
 *  have no budget rows (noBudget=true, all zeros). */
export async function buildDealerBudgetIndex(opts: {
  year: number;
  dealers: DealerAccount[];
  /** Scope filter — same one used elsewhere (role/sellerId/sellerEmail/dealerNumber). */
  filter: Omit<CrmConfigurationFilter, "documentType">;
}): Promise<DealerBudgetIndex> {
  const { year, dealers, filter } = opts;
  const ytdMonthIdx = resolveYtdMonthIdx(year);

  const byAccount = new Map<string, DealerBudgetTotals>();
  for (const d of dealers) byAccount.set(d.account_number, emptyTotals(ytdMonthIdx));

  // Lookup tables for matching dealer-line rows to a dealer account.
  const byId = new Map<string, DealerAccount>();
  const byNum = new Map<string, DealerAccount>();
  const byName = new Map<string, DealerAccount>();
  for (const d of dealers) {
    if (d.id) byId.set(d.id, d);
    if (d.account_number) byNum.set(d.account_number.trim(), d);
    const n = normalizeDealerName(d.company_name);
    if (n) byName.set(n, d);
    const bn = normalizeDealerName(d.branch_name);
    if (bn && !byName.has(bn)) byName.set(bn, d);
  }

  // ── 1. Budget — crm_budget_dealer_lines ──
  let lines: BudgetDealerLine[] = [];
  try { lines = await listBudgetDealerLines(year); } catch { lines = []; }
  for (const r of lines) {
    if (r.excluded_from_total) continue;
    const qty = Number(r.qty) || 0;
    if (qty <= 0) continue;
    if (r.month_idx < 0 || r.month_idx > 11) continue;
    let dealer: DealerAccount | undefined;
    if (r.dealer_account_id) dealer = byId.get(r.dealer_account_id);
    if (!dealer && r.dealer_account_number) dealer = byNum.get(r.dealer_account_number.trim());
    if (!dealer && r.dealer_name_norm) dealer = byName.get(r.dealer_name_norm);
    if (!dealer && r.dealer_name) {
      const n = normalizeDealerName(r.dealer_name);
      if (n) dealer = byName.get(n);
    }
    if (!dealer) continue;
    const t = byAccount.get(dealer.account_number);
    if (!t) continue;
    t.noBudget = false;
    t.yearBudgetQty += qty;
    t.monthlyBudget[r.month_idx] += qty;
    if (ytdMonthIdx >= 0 && r.month_idx <= ytdMonthIdx) t.ytdBudgetQty += qty;
  }

  // ── 2. Realised — scoped orders ──
  // Build a canonical dealer-key index identical to crmRelationsService.dealerKeyOf.
  const nameKey = (s: string | null | undefined) =>
    (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const keyToAccount = new Map<string, string>();
  for (const d of dealers) {
    if (d.id) keyToAccount.set(`id:${d.id}`, d.account_number);
    if (d.account_number) keyToAccount.set(`num:${d.account_number.trim()}`, d.account_number);
    const n = nameKey(d.company_name);
    if (n) keyToAccount.set(`name:${n}`, d.account_number);
    const bn = nameKey(d.branch_name);
    if (bn && !keyToAccount.has(`name:${bn}`)) keyToAccount.set(`name:${bn}`, d.account_number);
  }
  const ordersRes = await listScopedOrdersWithValue(filter);
  for (const o of ordersRes.rows) {
    const m = orderMonthIdx(o, year);
    if (m == null) continue;
    if (!isWonOrder(o)) continue;
    const k = dealerKeyOf(o);
    if (!k) continue;
    const acct = keyToAccount.get(k);
    if (!acct) continue;
    const t = byAccount.get(acct);
    if (!t) continue;
    const qty = sumQty(o.machine_qty_by_key);
    t.monthlyRealised[m] += qty;
    if (ytdMonthIdx >= 0 && m <= ytdMonthIdx) t.ytdRealisedQty += qty;
  }

  // ── 3. Pipeline — open quotes (year-agnostic, current open) ──
  // Pipeline reflects "in flight" qty regardless of expected month; we add
  // total machine_qty across all open quotes for the dealer. Open orders
  // (not yet sent) also count.
  const quotesRes = await listScopedOpenQuotes(filter);
  const addPipeline = (r: ScopedConfiguration) => {
    const k = r.dealer_key || dealerKeyOf(r);
    if (!k) return;
    const acct = keyToAccount.get(k);
    if (!acct) return;
    const t = byAccount.get(acct);
    if (!t) return;
    t.pipelineQty += sumQty(r.machine_qty_by_key);
  };
  for (const q of quotesRes.rows) addPipeline(q);
  // Open orders (not yet won) → pipeline as well
  for (const o of ordersRes.rows) {
    if (isWonOrder(o)) continue;
    const k = dealerKeyOf(o);
    if (!k) continue;
    const acct = keyToAccount.get(k);
    if (!acct) continue;
    const t = byAccount.get(acct);
    if (!t) continue;
    t.pipelineQty += sumQty(o.machine_qty_by_key);
  }

  return { year, ytdMonthIdx, byAccount };
}

/** Aggregate totals across multiple dealer accounts (e.g. main + branches). */
export function aggregateDealerBudget(
  index: DealerBudgetIndex,
  accountNumbers: string[],
): DealerBudgetTotals {
  const out = emptyTotals(index.ytdMonthIdx);
  for (const a of accountNumbers) {
    const t = index.byAccount.get(a);
    if (!t) continue;
    if (!t.noBudget) out.noBudget = false;
    out.yearBudgetQty += t.yearBudgetQty;
    out.ytdBudgetQty += t.ytdBudgetQty;
    out.ytdRealisedQty += t.ytdRealisedQty;
    out.pipelineQty += t.pipelineQty;
    for (let i = 0; i < 12; i++) {
      out.monthlyBudget[i] += t.monthlyBudget[i];
      out.monthlyRealised[i] += t.monthlyRealised[i];
    }
  }
  return out;
}

export type BudgetStatus = "green" | "yellow" | "red" | "none";

/** Status classification: green if realised >= budget YTD; yellow if within
 *  20% of target; red if clearly below; none when no budget. */
export function classifyBudgetStatus(t: DealerBudgetTotals): {
  status: BudgetStatus;
  pct: number;
} {
  if (t.noBudget || t.ytdBudgetQty <= 0) return { status: "none", pct: 0 };
  const pct = Math.round((t.ytdRealisedQty / t.ytdBudgetQty) * 100);
  if (t.ytdRealisedQty >= t.ytdBudgetQty) return { status: "green", pct };
  if (pct >= 80) return { status: "yellow", pct };
  return { status: "red", pct };
}
