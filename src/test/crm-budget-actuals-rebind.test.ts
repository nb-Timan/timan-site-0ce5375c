import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase", () => {
  const uuid = () => crypto.randomUUID();
  let ordersView: Array<Record<string, unknown>> = [];
  let ordersDetails: Array<Record<string, unknown>> = [];
  const budgetLines: Array<Record<string, unknown>> = [];
  const forecasts: Array<Record<string, unknown>> = [];
  const upsertCalls: Array<{ table: string; payload: unknown }> = [];
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
      eq: (col: string, val: unknown) => { filters.push({ col, val, op: "eq" }); return chain; },
      ilike: (col: string, val: unknown) => { filters.push({ col, val, op: "ilike" }); return chain; },
      neq: () => chain,
      in: (col: string, val: unknown[]) => { filters.push({ col, val, op: "in" }); return chain; },
      or: () => chain,
      limit: () => chain,
      upsert: (payload: unknown) => {
        upsertCalls.push({ table, payload });
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
    SUPABASE_URL: "http://mock",
    SUPABASE_ANON_KEY: "mock",
    __resetBudget: () => { budgetLines.length = 0; forecasts.length = 0; upsertCalls.length = 0; },
    __setOrders: (view: Array<Record<string, unknown>>, details: Array<Record<string, unknown>>) => {
      ordersView = view;
      ordersDetails = details;
    },
    __upsertCalls: upsertCalls,
  };
});

import * as supabaseModule from "@/lib/supabase";
import { buildSalesStockConfiguratorState, updateSalesStockAssetPricing } from '@/lib/salesStockConfigurator';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import type { FabricLoanAsset } from '@/lib/fabricLoanStock';
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
const FISCAL_YEAR = YEAR - 1;
const MAY_IDX = 4;
const JTN = BUDGET_SELLERS.find((s) => s.initials === "JTN")!;

const setOrders = (view: Array<Record<string, unknown>>, details: Array<Record<string, unknown>>) =>
  (supabaseModule as unknown as { __setOrders: (a: typeof view, b: typeof details) => void }).__setOrders(view, details);

const resetBudget = () =>
  (supabaseModule as unknown as { __resetBudget: () => void }).__resetBudget();

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
    year: FISCAL_YEAR,
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
  return buildOrderActualsByKey(actuals)[orderActualKey(JTN.email, FISCAL_YEAR, MAY_IDX, productKey)] || 0;
}

describe("CRM Budget — order actuals are independent from budget_line_id", () => {
  it('keeps non-catalogue stock quantities and allocates revenue by frozen line values, not catalogue or quantity ratios', async () => {
    const asset = (sku: string, brik: number, quantity: number): FabricLoanAsset => ({
      asset_id: `stock-${brik}`, asset_instance_id: `LINE|DAT|${brik}`, instance_ordinal: 1, company: 'DAT',
      account_number: '1010', order_number: 'QA', line_number: 1, item_number: sku,
      item_name: sku, line_text: `Original ${sku}`, serial_number: null, serial_number_normalized: null,
      warehouse_location_code: '4', warehouse_location_name: 'Lager 4', inventory_qty: quantity,
      reserved_qty: 0, stock_last_changed: '2026-10-10T10:00:00', classification: 'LOAN_CANDIDATE',
      review_required: false, review_reason: null, identity_conflict: false, source_present: true,
      item_type: null, allocated: false, sales_committed: false, brik_number: brik,
    });
    const assets = [asset('210100-01', 96, 3), asset('210112-02', 157, 1)];
    let state = buildSalesStockConfiguratorState(assets);
    state = updateSalesStockAssetPricing(state, assets[0].asset_id, { pricingMethod: 'adjusted_base', adjustedBasePrice: 100, pricingReason: 'QA' });
    state = updateSalesStockAssetPricing(state, assets[1].asset_id, { pricingMethod: 'adjusted_base', adjustedBasePrice: 500, pricingReason: 'QA' });
    state = await finalizeConfiguratorPricingSnapshot({ ...state, flowType: 'order', manualDealerDiscountPct: 5 });
    const row = makeOrder('stock-order', 'SALES_STOCK', 2);
    setOrders([row.view], [{ ...row.details, state_json: state, total_price: 760 }]);
    const actuals = await listSalesActuals(FISCAL_YEAR);
    expect(actuals.find(item => item.product_key === '210100-01')).toMatchObject({ qty_sold: 3, value_sold: 285 });
    expect(actuals.find(item => item.product_key === '210112-02')).toMatchObject({ qty_sold: 1, value_sold: 475 });
    expect(actuals.some(item => item.product_key === 'SALES_STOCK')).toBe(false);
  });
  beforeEach(() => {
    localStorage.clear();
    resetBudget();
    const o1 = makeOrder("ord-1", "RC-1000S", 3);
    const o2 = makeOrder("ord-2", "RC-751", 1);
    setOrders([o1.view, o2.view], [o1.details, o2.details]);
  });

  it("derives real orders onto stable seller/year/month/product keys", async () => {
    const actuals = await listSalesActuals(FISCAL_YEAR);
    expect(qtyByStableKey(actuals, "RC-1000s")).toBe(3);
    expect(qtyByStableKey(actuals, "RC-751")).toBe(1);
    expect(actuals.every((a) => !a.budget_line_id.startsWith("seed_"))).toBe(true);
    expect(actuals.every((a) => a.product_key && a.seller_email === JTN.email && a.year === FISCAL_YEAR)).toBe(true);
  });

  it('includes one sales-stock order exactly once in canonical actuals', async () => {
    const order = makeOrder('sales-stock-order', 'RC-751', 1);
    order.details.state_json = { ...order.details.state_json, salesChannel: 'sales_stock_demo' };
    setOrders([order.view], [order.details]);
    const actuals = await listSalesActuals(FISCAL_YEAR);
    expect(qtyByStableKey(actuals, 'RC-751')).toBe(1);
    expect(actuals.filter((row) => row.product_key === 'RC-751')).toHaveLength(1);
  });

  it("creating budget lines does not move or rebind order actuals", async () => {
    const before = await listSalesActuals(FISCAL_YEAR);
    const persistedRC1000 = await mkLine("RC-1000s", "411000");
    const persistedRC751 = await mkLine("RC-751", "410040");
    const after = await listSalesActuals(FISCAL_YEAR);

    expect(persistedRC1000.id.startsWith("seed_")).toBe(false);
    expect(persistedRC751.id.startsWith("seed_")).toBe(false);
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

    const actuals = await listSalesActuals(FISCAL_YEAR);
    const rollup = aggregateBudget([line], [], actuals, JTN.email).byMachine.find((r) => r.product_key === "RC-1000s");
    expect(rollup?.ordersQty).toBe(3);
    expect(qtyByStableKey(actuals, "RC-751")).toBe(1);
  });
});
