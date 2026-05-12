import { describe, it, expect, beforeEach, vi } from "vitest";

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
      eq: () => chain,
      neq: () => chain,
      in: () => chain,
      or: () => chain,
      limit: () => chain,
      upsert: (payload: unknown) => {
        upsertCalls.push({ table, payload });
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "mocked upsert no-op" } }) }) };
      },
      maybeSingle: () => Promise.resolve({ data: null, error: { message: "mocked" } }),
      single: () => exec(),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => exec().then(resolve, reject),
    });
    return chain;
  }
  return {
    supabase: { from: (table: string) => makeBuilder(table) },
    SUPABASE_URL: "http://mock",
    SUPABASE_ANON_KEY: "mock",
    __setOrders: (view: Array<Record<string, unknown>>, details: Array<Record<string, unknown>>) => {
      ordersView = view;
      ordersDetails = details;
    },
    __upsertCalls: upsertCalls,
  };
});

import * as supabaseModule from "@/lib/supabase";
import {
  listSalesActuals,
  createBudgetLine,
  upsertForecast,
  buildOrderActualsByKey,
  orderActualKey,
  aggregateBudget,
  BUDGET_SELLERS,
  type BudgetLine,
} from "@/lib/crmBudgetService";

const YEAR = 2025;
const MAY_IDX = 4;
const JTN = BUDGET_SELLERS.find((s) => s.initials === "JTN")!;

const setOrders = (view: Array<Record<string, unknown>>, details: Array<Record<string, unknown>>) =>
  (supabaseModule as unknown as { __setOrders: (a: typeof view, b: typeof details) => void }).__setOrders(view, details);

const upsertCalls = (supabaseModule as unknown as { __upsertCalls: Array<{ table: string; payload: unknown }> }).__upsertCalls;

function makeOrder(id: string, machineType: string, qty: number) {
  return {
    view: {
      id,
      title: machineType,
      seller_email: JTN.email,
      seller_initials: JTN.initials,
      case_status: "ordre_afgivet",
      document_type: "order",
      order_sent_at: `${YEAR}-05-15T10:00:00Z`,
      submitted_at: `${YEAR}-05-15T10:00:00Z`,
      created_at: `${YEAR}-05-15T10:00:00Z`,
      dealer_name: "Test Dealer",
    },
    details: {
      id,
      state_json: { language: "da", flowType: "order", machineConfigs: [{ type: machineType, qty }] },
      total_price: 100000,
    },
  };
}

async function mkLine(key: string, vnr: string): Promise<BudgetLine> {
  return createBudgetLine({
    year: YEAR,
    product_key: key,
    product_name: key,
    item_number: vnr,
    category: "machine",
    seller_id: null,
    seller_name: JTN.full_name,
    seller_email: JTN.email,
    seller_initials: JTN.initials,
    country: JTN.country,
    qty_budget: 0,
    value_budget: 0,
    monthly_split: Array.from({ length: 12 }, () => 1 / 12),
  });
}

function qtyByStableKey(actuals: Awaited<ReturnType<typeof listSalesActuals>>, productKey: string) {
  return buildOrderActualsByKey(actuals)[orderActualKey(JTN.email, YEAR, MAY_IDX, productKey)] || 0;
}

describe("CRM Budget — order actuals are independent from budget_line_id", () => {
  beforeEach(() => {
    localStorage.clear();
    upsertCalls.length = 0;
    const o1 = makeOrder("ord-1", "RC-1000S", 3);
    const o2 = makeOrder("ord-2", "RC-751", 1);
    setOrders([o1.view, o2.view], [o1.details, o2.details]);
  });

  it("derives real orders onto stable seller/year/month/product keys", async () => {
    const actuals = await listSalesActuals(YEAR);
    expect(qtyByStableKey(actuals, "RC-1000s")).toBe(3);
    expect(qtyByStableKey(actuals, "RC-751")).toBe(1);
    expect(actuals.every((a) => !a.budget_line_id.startsWith("seed_"))).toBe(true);
    expect(actuals.every((a) => a.product_key && a.seller_email === JTN.email && a.year === YEAR)).toBe(true);
  });

  it("creating budget lines does not move or rebind order actuals", async () => {
    const before = await listSalesActuals(YEAR);
    const persistedRC1000 = await mkLine("RC-1000s", "411000");
    const persistedRC751 = await mkLine("RC-751", "410040");
    const after = await listSalesActuals(YEAR);

    expect(persistedRC1000.id.startsWith("b_")).toBe(true);
    expect(persistedRC751.id.startsWith("b_")).toBe(true);
    expect(after.some((a) => a.budget_line_id === persistedRC1000.id || a.budget_line_id === persistedRC751.id)).toBe(false);
    expect(qtyByStableKey(after, "RC-1000s")).toBe(qtyByStableKey(before, "RC-1000s"));
    expect(qtyByStableKey(after, "RC-751")).toBe(qtyByStableKey(before, "RC-751"));
  });

  it("upsertForecast only writes forecast fields and Dashboard Budget Fokus aggregates by stable order keys", async () => {
    const line = await mkLine("RC-1000s", "411000");
    await mkLine("RC-751", "410040");

    await upsertForecast({
      id: "f1",
      budget_line_id: line.id,
      qty_forecast: 5,
      value_forecast: 0,
      monthly_qty: [0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0],
      updated_at: new Date().toISOString(),
    });

    const payload = upsertCalls.find((c) => c.table === "crm_budget_forecasts")!.payload as Record<string, unknown>;
    expect(payload).not.toHaveProperty("qty_sold");
    expect(payload).not.toHaveProperty("value_sold");
    expect(payload).toHaveProperty("qty_forecast", 5);
    expect(payload).toHaveProperty("budget_line_id", line.id);

    const actuals = await listSalesActuals(YEAR);
    const rollup = aggregateBudget([line], [], actuals, JTN.email).byMachine.find((r) => r.product_key === "RC-1000s");
    expect(rollup?.ordersQty).toBe(3);
    expect(qtyByStableKey(actuals, "RC-751")).toBe(1);
  });
});
