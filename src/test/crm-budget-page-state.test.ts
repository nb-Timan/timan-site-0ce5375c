import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase", () => {
  const uuid = () => crypto.randomUUID();
  let ordersView: Array<Record<string, unknown>> = [];
  let ordersDetails: Array<Record<string, unknown>> = [];
  const budgetLines: Array<Record<string, unknown>> = [];
  const forecasts: Array<Record<string, unknown>> = [];
  const responses: Record<string, () => { data: unknown[]; error: unknown }> = {
    crm_budget_lines: () => ({ data: budgetLines, error: null }),
    crm_budget_forecasts: () => ({ data: forecasts, error: null }),
    crm_budget_sales_actuals: () => ({ data: [], error: null }),
    app_users: () => ({ data: [], error: null }),
    crm_configurations_view: () => ({ data: ordersView, error: null }),
    configurations: () => ({ data: ordersDetails, error: null }),
  };
  function makeBuilder(table: string) {
    const filters: Array<{ col: string; val: unknown; op: "eq" | "ilike" | "in" }> = [];
    const applyFilters = (rows: unknown[]) => rows.filter((row) => filters.every((f) => {
      const value = (row as Record<string, unknown>)[f.col];
      if (f.op === "in") return Array.isArray(f.val) && f.val.includes(value);
      if (f.op === "ilike") return String(value || "").toLowerCase() === String(f.val || "").toLowerCase();
      return value === f.val;
    }));
    const exec = () => {
      const res = responses[table]?.() ?? { data: [], error: null };
      return Promise.resolve({ ...res, data: applyFilters(res.data) });
    };
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: (col: string, val: unknown) => { filters.push({ col, val, op: "eq" }); return chain; }, neq: () => chain,
      ilike: (col: string, val: unknown) => { filters.push({ col, val, op: "ilike" }); return chain; },
      in: (col: string, val: unknown[]) => { filters.push({ col, val, op: "in" }); return chain; }, or: () => chain, limit: () => chain,
      upsert: (payload: unknown) => {
        const row = { ...(payload as Record<string, unknown>) };
        if (table === "crm_budget_lines") {
          row.created_at ||= new Date().toISOString();
          const idx = budgetLines.findIndex((r) => r.id === row.id);
          if (idx >= 0) budgetLines[idx] = { ...budgetLines[idx], ...row };
          else budgetLines.push(row);
        }
        if (table === "crm_budget_forecasts") {
          row.id ||= uuid();
          const idx = forecasts.findIndex((r) => r.budget_line_id === row.budget_line_id);
          if (idx >= 0) forecasts[idx] = { ...forecasts[idx], ...row };
          else forecasts.push(row);
        }
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) };
      },
      maybeSingle: async () => {
        const res = await exec();
        return { data: res.data[0] ?? null, error: null };
      },
      single: () => exec(),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => exec().then(resolve, reject),
    });
    return chain;
  }
  return {
    supabase: { from: (table: string) => makeBuilder(table) },
    SUPABASE_URL: "http://mock", SUPABASE_ANON_KEY: "mock",
    __setOrders: (v: Array<Record<string, unknown>>, d: Array<Record<string, unknown>>) => { ordersView = v; ordersDetails = d; },
  };
});

import * as supabaseModule from "@/lib/supabase";
import {
  listSalesActuals, createBudgetLine, buildOrderActualsByKey, orderActualKey,
  BUDGET_SELLERS, BUDGET_PRODUCTS,
  type BudgetLine, type SalesActual,
} from "@/lib/crmBudgetService";

const YEAR = 2025;
const MAY_IDX = 4;
const JTN = BUDGET_SELLERS.find(s => s.initials === "JTN")!;
const setOrders = (v: Array<Record<string, unknown>>, d: Array<Record<string, unknown>>) =>
  (supabaseModule as unknown as { __setOrders: (a: typeof v, b: typeof d) => void }).__setOrders(v, d);

function makeOrder(id: string, machineType: string, qty: number) {
  const view = {
    id, title: machineType,
    seller_email: JTN.email, seller_initials: JTN.initials,
    case_status: "ordre_afgivet", document_type: "order",
    order_sent_at: `${YEAR}-05-15T10:00:00Z`, submitted_at: `${YEAR}-05-15T10:00:00Z`, created_at: `${YEAR}-05-15T10:00:00Z`,
    dealer_name: "Test Dealer",
  };
  const details = { id, total_price: 100000, state_json: { language: "da", flowType: "order", machineConfigs: [{ type: machineType, qty }] } };
  return { view, details };
}

function seedLineFor(productKey: string): BudgetLine {
  const p = BUDGET_PRODUCTS.find(x => x.key === productKey)!;
  return {
    id: `seed_${YEAR}_${productKey}_anything`, year: YEAR, product_key: productKey, product_name: p.name,
    item_number: p.varenr, category: p.category, seller_id: null, seller_name: JTN.full_name, seller_email: JTN.email,
    seller_initials: JTN.initials, country: JTN.country, qty_budget: 0, value_budget: 0,
    monthly_split: Array.from({ length: 12 }, () => 1 / 12), locked: false, created_at: new Date().toISOString(),
  };
}

function rowOrderInMay(line: BudgetLine, actuals: SalesActual[]): number {
  const map = buildOrderActualsByKey(actuals);
  return map[orderActualKey(line.seller_email || line.seller_initials, YEAR, MAY_IDX, line.product_key)] || 0;
}

async function persistBudgetLine(productKey: string): Promise<BudgetLine> {
  const product = BUDGET_PRODUCTS.find(p => p.key === productKey)!;
  return createBudgetLine({
    year: YEAR, product_key: product.key, product_name: product.name, item_number: product.varenr, category: product.category,
    seller_id: null, seller_name: JTN.full_name, seller_email: JTN.email, seller_initials: JTN.initials, country: JTN.country,
    qty_budget: 0, value_budget: 0, monthly_split: Array.from({ length: 12 }, () => 1 / 12),
  });
}

describe("CrmBudgetPage — order display is independent from budget_line_id", () => {
  beforeEach(() => {
    localStorage.clear();
    const o1 = makeOrder("ord-1", "RC-1000S", 3);
    const o2 = makeOrder("ord-2", "RC-751", 1);
    setOrders([o1.view, o2.view], [o1.details, o2.details]);
  });

  it("initial render uses seller/year/month/productKey, not seed budget ids", async () => {
    const actuals = await listSalesActuals(YEAR);
    expect(rowOrderInMay(seedLineFor("RC-751"), actuals)).toBe(1);
    expect(rowOrderInMay(seedLineFor("RC-1000s"), actuals)).toBe(3);
  });

  it("after Budget + persists a new b_ id, order counts stay visible without rebinding", async () => {
    const actuals = await listSalesActuals(YEAR);
    const persisted = await persistBudgetLine("RC-751");
    expect(persisted.id.startsWith("b_")).toBe(true);
    expect(rowOrderInMay(persisted, actuals)).toBe(1);
    expect(rowOrderInMay(seedLineFor("RC-1000s"), actuals)).toBe(3);
    expect(actuals.some(a => a.budget_line_id === persisted.id)).toBe(false);
  });

  it("after Arbejdsbudget persist/edit, order counts stay visible without touching actuals", async () => {
    const actuals = await listSalesActuals(YEAR);
    const persisted = await persistBudgetLine("RC-1000s");
    expect(rowOrderInMay(seedLineFor("RC-751"), actuals)).toBe(1);
    expect(rowOrderInMay(persisted, actuals)).toBe(3);
    expect(actuals.some(a => a.budget_line_id === persisted.id)).toBe(false);
  });
});
