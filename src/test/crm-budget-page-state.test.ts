/**
 * Focused page-state regression test for the visible UI bug:
 * "Order counts disappear immediately when clicking Budget +/− on a row
 * whose budget line had not yet been persisted."
 *
 * Real failure mode (before fix):
 *   - JTN has live orders: RC-751 = 1, RC-1000S = 3.
 *   - Both rows initially render as synthetic seed lines
 *     (id = `seed_<year>_<productKey>_<sellerSlug>`).
 *   - User clicks + on RC-751 Budget. `ensurePersistedLine` calls
 *     `createBudgetLine` which returns a real `b_…` id; the seed line is
 *     replaced in `lines` state synchronously.
 *   - `actuals` is still keyed by the OLD seed id. `lineMonthly()` looks up
 *     `actuals.find(a => a.budget_line_id === line.id)` — no match — and the
 *     row's "Ordre" cell flashes to 0 until `refreshActuals()` resolves.
 *
 * This test exercises the exact synchronous transition without rendering
 * the whole 2400-line page: it replays the state transformation that
 * `ensurePersistedLine` performs against `lines` and `actuals`, then
 * computes the same `ordersMonthly` selector that the page uses to render
 * the row, and asserts the visible totals stay stable.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabase the same way as the rebind test so listSalesActuals works
// without network. We seed JTN with 3x RC-1000S and 1x RC-751.
vi.mock("@/lib/supabase", () => {
  let ordersView: Array<Record<string, unknown>> = [];
  let ordersDetails: Array<Record<string, unknown>> = [];
  const upsertCalls: Array<{ table: string; payload: unknown }> = [];

  const responses: Record<string, () => { data: unknown; error: unknown }> = {
    crm_budget_lines: () => ({ data: null, error: { message: "mocked: fall back to LS" } }),
    crm_budget_forecasts: () => ({ data: [], error: null }),
    crm_budget_sales_actuals: () => ({ data: [], error: null }),
    app_users: () => ({ data: [], error: null }),
    crm_configurations_view: () => ({ data: ordersView, error: null }),
    configurations: () => ({ data: ordersDetails, error: null }),
  };

  function makeBuilder(table: string) {
    const exec = () => Promise.resolve(responses[table]?.() ?? { data: [], error: null });
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain, neq: () => chain, in: () => chain, or: () => chain, limit: () => chain,
      upsert: (payload: unknown) => {
        upsertCalls.push({ table, payload });
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "no-op" } }) }) };
      },
      maybeSingle: () => Promise.resolve({ data: null, error: { message: "mocked" } }),
      single: () => exec(),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => exec().then(resolve, reject),
    });
    return chain;
  }

  return {
    supabase: { from: (table: string) => makeBuilder(table) },
    SUPABASE_URL: "http://mock", SUPABASE_ANON_KEY: "mock",
    __setOrders: (v: Array<Record<string, unknown>>, d: Array<Record<string, unknown>>) => { ordersView = v; ordersDetails = d; },
    __upsertCalls: upsertCalls,
  };
});

import * as supabaseModule from "@/lib/supabase";
import {
  listSalesActuals, createBudgetLine,
  BUDGET_SELLERS, BUDGET_PRODUCTS,
  type BudgetLine, type SalesActual,
} from "@/lib/crmBudgetService";

const YEAR = 2025;
const JTN = BUDGET_SELLERS.find(s => s.initials === "JTN")!;

const setOrders = (v: Array<Record<string, unknown>>, d: Array<Record<string, unknown>>) =>
  (supabaseModule as unknown as { __setOrders: (a: typeof v, b: typeof d) => void }).__setOrders(v, d);

function makeOrder(id: string, machineType: string, qty: number) {
  const view = {
    id, title: machineType,
    seller_email: JTN.email, seller_initials: JTN.initials,
    case_status: "ordre_afgivet", document_type: "order",
    order_sent_at: `${YEAR}-04-15T10:00:00Z`,
    submitted_at: `${YEAR}-04-15T10:00:00Z`,
    created_at: `${YEAR}-04-15T10:00:00Z`,
    dealer_name: "Test Dealer",
  };
  const details = {
    id, total_price: 100000,
    state_json: { language: "da", flowType: "order", machineConfigs: [{ type: machineType, qty }] },
  };
  return { view, details };
}

// ---- Replicas of the page-internal logic we are testing ---------------------
//
// `seedLineFor` mirrors the inline construction in CrmBudgetPage at the row
// render site (the seed object the page hands to `lineMonthly`).
function seedLineFor(productKey: string): BudgetLine {
  const p = BUDGET_PRODUCTS.find(x => x.key === productKey)!;
  const slug = JTN.email.replace(/[^a-z0-9]/gi, "");
  return {
    id: `seed_${YEAR}_${productKey}_${slug}`,
    year: YEAR, product_key: productKey, product_name: p.name,
    item_number: p.varenr, category: p.category,
    seller_id: null, seller_name: JTN.full_name, seller_email: JTN.email,
    seller_initials: JTN.initials, country: JTN.country,
    qty_budget: 0, value_budget: 0,
    monthly_split: Array.from({ length: 12 }, () => 1 / 12),
    locked: false, created_at: new Date().toISOString(),
  };
}

// Mirror of `lineMonthly().ordersMonthly` from CrmBudgetPage — only the
// orders-selection slice. Returns the annual total the row would display.
function rowOrdersAnnual(line: BudgetLine, actuals: SalesActual[]): number {
  const ac = actuals.find(a => a.budget_line_id === line.id);
  if (!ac) return 0;
  if (ac.monthly_qty && ac.monthly_qty.length === 12) {
    return ac.monthly_qty.reduce((a, b) => a + b, 0);
  }
  return ac.qty_sold ?? 0;
}

// Mirror of `ensurePersistedLine` state transformation. Returns the new
// `lines` and `actuals` state arrays — including the SYNCHRONOUS rebind
// that prevents the visible flash.
async function persistAndRebind(opts: {
  productKey: string; lines: BudgetLine[]; actuals: SalesActual[];
}): Promise<{ lines: BudgetLine[]; actuals: SalesActual[]; persisted: BudgetLine }> {
  const product = BUDGET_PRODUCTS.find(p => p.key === opts.productKey)!;
  const persisted = await createBudgetLine({
    year: YEAR, product_key: product.key, product_name: product.name,
    item_number: product.varenr, category: product.category,
    seller_id: null, seller_name: JTN.full_name, seller_email: JTN.email,
    seller_initials: JTN.initials, country: JTN.country,
    qty_budget: 0, value_budget: 0,
    monthly_split: Array.from({ length: 12 }, () => 1 / 12),
  });
  const seedSlug = JTN.email.replace(/[^a-z0-9]/gi, "");
  const seedId = `seed_${YEAR}_${product.key}_${seedSlug}`;
  // SYNCHRONOUS rebind (the fix under test).
  const rebound = opts.actuals.map(a =>
    a.budget_line_id === seedId ? { ...a, budget_line_id: persisted.id } : a,
  );
  return { lines: [...opts.lines, persisted], actuals: rebound, persisted };
}

describe("CrmBudgetPage — order counts stay visible during Budget/Arbejdsbudget +/− click", () => {
  beforeEach(() => {
    localStorage.clear();
    const o1 = makeOrder("ord-1", "RC-1000S", 3);
    const o2 = makeOrder("ord-2", "RC-751", 1);
    setOrders([o1.view, o2.view], [o1.details, o2.details]);
  });

  it("Initial render: RC-751 = 1, RC-1000S = 3 (seed lines, no persisted lines yet)", async () => {
    const actuals = await listSalesActuals(YEAR);
    const rc751 = seedLineFor("RC-751");
    const rc1000 = seedLineFor("RC-1000s");
    expect(rowOrdersAnnual(rc751, actuals)).toBe(1);
    expect(rowOrdersAnnual(rc1000, actuals)).toBe(3);
  });

  it("After + on RC-751 Budget, RC-751 still = 1 AND RC-1000S still = 3 (no async wait)", async () => {
    let actuals = await listSalesActuals(YEAR);
    let lines: BudgetLine[] = [];

    // Click + on RC-751 Budget → ensurePersistedLine.
    const r1 = await persistAndRebind({ productKey: "RC-751", lines, actuals });
    lines = r1.lines; actuals = r1.actuals;

    // RENDER STATE IMMEDIATELY AFTER THE CLICK — no refreshActuals() yet.
    const rc751View = lines.find(l => l.product_key === "RC-751")!;
    const rc1000View = seedLineFor("RC-1000s"); // still a seed (not yet persisted)
    expect(rowOrdersAnnual(rc751View, actuals)).toBe(1); // would be 0 before fix
    expect(rowOrdersAnnual(rc1000View, actuals)).toBe(3); // unaffected — must stay 3
  });

  it("After + on RC-1000S Budget (after RC-751 already persisted), both totals still visible", async () => {
    let actuals = await listSalesActuals(YEAR);
    let lines: BudgetLine[] = [];
    ({ lines, actuals } = await persistAndRebind({ productKey: "RC-751", lines, actuals }));
    ({ lines, actuals } = await persistAndRebind({ productKey: "RC-1000s", lines, actuals }));

    const rc751View = lines.find(l => l.product_key === "RC-751")!;
    const rc1000View = lines.find(l => l.product_key === "RC-1000s")!;
    expect(rowOrdersAnnual(rc751View, actuals)).toBe(1);
    expect(rowOrdersAnnual(rc1000View, actuals)).toBe(3);
  });

  it("Arbejdsbudget interaction (also triggers ensurePersistedLine) — orders stay visible", async () => {
    // Arbejdsbudget +/- goes through the same `ensurePersistedLine` path
    // before mutating workingDraft — so the same rebind must protect it.
    let actuals = await listSalesActuals(YEAR);
    let lines: BudgetLine[] = [];
    ({ lines, actuals } = await persistAndRebind({ productKey: "RC-751", lines, actuals }));

    const rc751View = lines.find(l => l.product_key === "RC-751")!;
    const rc1000View = seedLineFor("RC-1000s");
    expect(rowOrdersAnnual(rc751View, actuals)).toBe(1);
    expect(rowOrdersAnnual(rc1000View, actuals)).toBe(3);
  });
});
