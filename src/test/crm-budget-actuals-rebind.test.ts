/**
 * Regression test for the CRM Budget order-actuals rebind bug.
 *
 * Bug summary: when no persisted budget line existed for a (seller, machine)
 * combo, real submitted orders were attached to a synthetic seed_<year>_<key>
 * id. The first time the user clicked +/- on Budget or Arbejdsbudget,
 * `ensurePersistedLine` created a real line with a fresh `b_…` id but the
 * orders list was never re-derived → the previous synthetic id pointed at
 * nothing and the row's "Ordre" column dropped to 0.
 *
 * This test reproduces the failure mode against the real
 * `listSalesActuals` and verifies that, after persisting a budget line and
 * re-running the actuals derivation, the order quantities for JTN remain:
 *
 *   RC-1000S → 3 units
 *   RC-751   → 1 unit
 *
 * It also asserts that no order quantities are ever written into the
 * forecast upsert payload.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ----------------------------------------------------------------------
// Mock @/lib/supabase BEFORE importing crmBudgetService.
// We expose a mutable orders dataset via __setOrders so the test can
// switch the order rows the mocked Supabase returns.
// ----------------------------------------------------------------------
vi.mock("@/lib/supabase", () => {
  let ordersView: Array<Record<string, unknown>> = [];
  let ordersDetails: Array<Record<string, unknown>> = [];
  // Captured upsert payloads so the test can assert what was written.
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
        // Return error so service falls back to LS path (still writes LS).
        return {
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: { message: "mocked upsert no-op" } }),
          }),
        };
      },
      maybeSingle: () => Promise.resolve({ data: null, error: { message: "mocked" } }),
      single: () => exec(),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        exec().then(resolve, reject),
    });
    return chain;
  }

  return {
    supabase: { from: (table: string) => makeBuilder(table) },
    SUPABASE_URL: "http://mock",
    SUPABASE_ANON_KEY: "mock",
    __setOrders: (
      view: Array<Record<string, unknown>>,
      details: Array<Record<string, unknown>>,
    ) => {
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
  BUDGET_SELLERS,
  type BudgetLine,
} from "@/lib/crmBudgetService";

const YEAR = 2025;
const JTN = BUDGET_SELLERS.find((s) => s.initials === "JTN")!;

const setOrders = (
  view: Array<Record<string, unknown>>,
  details: Array<Record<string, unknown>>,
) => (supabaseModule as unknown as {
  __setOrders: (a: typeof view, b: typeof details) => void;
}).__setOrders(view, details);

const upsertCalls = (supabaseModule as unknown as {
  __upsertCalls: Array<{ table: string; payload: unknown }>;
}).__upsertCalls;

function makeOrder(id: string, machineType: string, qty: number) {
  // crm_configurations_view row (scope/header info)
  const view = {
    id,
    title: machineType,
    seller_email: JTN.email,
    seller_initials: JTN.initials,
    case_status: "ordre_afgivet",
    document_type: "order",
    order_sent_at: `${YEAR}-04-15T10:00:00Z`,
    submitted_at: `${YEAR}-04-15T10:00:00Z`,
    created_at: `${YEAR}-04-15T10:00:00Z`,
    dealer_name: "Test Dealer",
  };
  // configurations row (state_json with machineConfigs)
  const details = {
    id,
    state_json: {
      language: "da",
      flowType: "order",
      machineConfigs: [{ type: machineType, qty }],
    },
    total_price: 100000,
  };
  return { view, details };
}

describe("CRM Budget — order actuals stay bound after persisting a line", () => {
  beforeEach(() => {
    localStorage.clear();
    upsertCalls.length = 0;

    // JTN has 3 RC-1000S and 1 RC-751 in submitted orders for the year.
    const o1 = makeOrder("ord-1", "RC-1000S", 3);
    const o2 = makeOrder("ord-2", "RC-751", 1);
    setOrders([o1.view, o2.view], [o1.details, o2.details]);
  });

  it("binds actuals to synthetic seed ids when no budget line exists yet", async () => {
    const actuals = await listSalesActuals(YEAR);

    const rc1000 = actuals.find((a) => /RC-1000s/i.test(a.budget_line_id));
    const rc751 = actuals.find((a) => /RC-751/i.test(a.budget_line_id));

    expect(rc1000?.qty_sold).toBe(3);
    expect(rc751?.qty_sold).toBe(1);
    // Seed ids carry the marker so we know the bug pre-condition was reproduced.
    expect(rc1000?.budget_line_id.startsWith("seed_")).toBe(true);
    expect(rc751?.budget_line_id.startsWith("seed_")).toBe(true);
  });

  it("re-binds actuals to the real persisted line after ensurePersistedLine runs", async () => {
    // Simulate `ensurePersistedLine` for both machines — this is what the
    // first +/- click on a Budget/Arbejdsbudget cell triggers.
    const persistedRC1000 = await createBudgetLine({
      year: YEAR,
      product_key: "RC-1000s",
      product_name: "RC-1000s",
      item_number: "411000",
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
    const persistedRC751 = await createBudgetLine({
      year: YEAR,
      product_key: "RC-751",
      product_name: "RC-751",
      item_number: "410040",
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

    expect(persistedRC1000.id.startsWith("b_")).toBe(true);
    expect(persistedRC751.id.startsWith("b_")).toBe(true);

    // refreshActuals() in the page re-runs listSalesActuals — do the same
    // here and verify the order qty is now bound to the REAL line ids.
    const refreshed = await listSalesActuals(YEAR);

    const onRC1000 = refreshed.find((a) => a.budget_line_id === persistedRC1000.id);
    const onRC751 = refreshed.find((a) => a.budget_line_id === persistedRC751.id);

    expect(onRC1000?.qty_sold).toBe(3);
    expect(onRC751?.qty_sold).toBe(1);

    // The synthetic seed ids must no longer carry the same orders — the
    // persisted line now owns them. (Otherwise we would be double-counting.)
    const seedRC1000 = refreshed.find(
      (a) => a.budget_line_id !== persistedRC1000.id && /RC-1000s/i.test(a.budget_line_id),
    );
    const seedRC751 = refreshed.find(
      (a) => a.budget_line_id !== persistedRC751.id && /RC-751/i.test(a.budget_line_id),
    );
    expect(seedRC1000).toBeUndefined();
    expect(seedRC751).toBeUndefined();
  });

  it("upsertForecast never writes order qty/value into the forecast payload", async () => {
    // Persist BOTH lines so every order is matched to a real `b_…` id.
    const mkLine = (key: string, vnr: string) => createBudgetLine({
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
    const line: BudgetLine = await mkLine("RC-1000s", "411000");
    const lineRC751: BudgetLine = await mkLine("RC-751", "410040");

    await upsertForecast({
      id: "f1",
      budget_line_id: line.id,
      qty_forecast: 5,
      value_forecast: 0,
      monthly_qty: [0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0],
      updated_at: new Date().toISOString(),
    });

    const forecastUpsert = upsertCalls.find((c) => c.table === "crm_budget_forecasts");
    expect(forecastUpsert).toBeDefined();
    const payload = forecastUpsert!.payload as Record<string, unknown>;

    // Must NOT contain any order-actuals fields.
    expect(payload).not.toHaveProperty("qty_sold");
    expect(payload).not.toHaveProperty("value_sold");
    // Sanity: the forecast fields ARE there.
    expect(payload).toHaveProperty("qty_forecast", 5);
    expect(payload).toHaveProperty("budget_line_id", line.id);

    // And the actuals derivation must still report 3 / 1 after a forecast write.
    const refreshed = await listSalesActuals(YEAR);
    const totalRC1000 = refreshed
      .filter((a) => /RC-1000s/i.test(a.budget_line_id))
      .reduce((s, a) => s + a.qty_sold, 0);
    const totalRC751 = refreshed
      .filter((a) => /RC-751/i.test(a.budget_line_id))
      .reduce((s, a) => s + a.qty_sold, 0);
    expect(totalRC1000).toBe(3);
    expect(totalRC751).toBe(1);
  });
});
