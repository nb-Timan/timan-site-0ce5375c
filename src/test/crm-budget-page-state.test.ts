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
    __resetBudget: () => { budgetLines.length = 0; forecasts.length = 0; },
    __setOrders: (v: Array<Record<string, unknown>>, d: Array<Record<string, unknown>>) => { ordersView = v; ordersDetails = d; },
  };
});

import * as supabaseModule from "@/lib/supabase";
import { ACCESSORIES, LOOSE_TOOL_KEY, getAccessoriesFlat } from "@/data/machines";
import {
  listSalesActuals, createBudgetLine, buildOrderActualsByKey, orderActualKey, monthlyOrderQtyForProduct,
  BUDGET_SELLERS, BUDGET_PRODUCTS, EQUIPMENT_BY_MACHINE, BUDGET_EXCLUDED_EQUIPMENT_VARENR,
  type BudgetLine, type SalesActual,
} from "@/lib/crmBudgetService";

const YEAR = 2025;
const MAY_FISCAL_YEAR = YEAR - 1;
const MAY_IDX = 4;
const SEPTEMBER_IDX = 8;
const JTN = BUDGET_SELLERS.find(s => s.initials === "JTN")!;
const AKR = BUDGET_SELLERS.find(s => s.initials === "AKR")!;
const setOrders = (v: Array<Record<string, unknown>>, d: Array<Record<string, unknown>>) =>
  (supabaseModule as unknown as { __setOrders: (a: typeof v, b: typeof d) => void }).__setOrders(v, d);
const resetBudget = () =>
  (supabaseModule as unknown as { __resetBudget: () => void }).__resetBudget();

function makeOrder(id: string, machineType: string, qty: number) {
  const view = {
    id, title: machineType,
    seller_email: JTN.email, seller_initials: JTN.initials,
    case_status: "ordre_afgivet", document_type: "order",
    order_number: null as string | null,
    order_sent_at: `${YEAR}-05-15T10:00:00Z`, submitted_at: `${YEAR}-05-15T10:00:00Z`, created_at: `${YEAR}-05-15T10:00:00Z`,
    dealer_name: "Test Dealer",
  };
  const details = { id, total_price: 100000, state_json: { language: "da", flowType: "order", machineConfigs: [{ type: machineType, qty }] } };
  return { view, details };
}

function seedLineFor(productKey: string): BudgetLine {
  const p = BUDGET_PRODUCTS.find(x => x.key === productKey)!;
  return {
    id: `seed_${MAY_FISCAL_YEAR}_${productKey}_anything`, year: MAY_FISCAL_YEAR, product_key: productKey, product_name: p.name,
    item_number: p.varenr, category: p.category, seller_id: null, seller_name: JTN.full_name, seller_email: JTN.email,
    seller_initials: JTN.initials, country: JTN.country, qty_budget: 0, value_budget: 0,
    monthly_split: Array.from({ length: 12 }, () => 1 / 12), locked: false, created_at: new Date().toISOString(),
  };
}

function rowOrderInMay(line: BudgetLine, actuals: SalesActual[]): number {
  const map = buildOrderActualsByKey(actuals);
  return map[orderActualKey(line.seller_email || line.seller_initials, MAY_FISCAL_YEAR, MAY_IDX, line.product_key)] || 0;
}

async function persistBudgetLine(productKey: string): Promise<BudgetLine> {
  const product = BUDGET_PRODUCTS.find(p => p.key === productKey)!;
  return createBudgetLine({
    year: MAY_FISCAL_YEAR, product_key: product.key, product_name: product.name, item_number: product.varenr, category: product.category,
    seller_id: null, seller_name: JTN.full_name, seller_email: JTN.email, seller_initials: JTN.initials, country: JTN.country,
    qty_budget: 0, value_budget: 0, monthly_split: Array.from({ length: 12 }, () => 1 / 12),
  });
}

describe("CrmBudgetPage — order display is independent from budget_line_id", () => {
  beforeEach(() => {
    localStorage.clear();
    resetBudget();
    const o1 = makeOrder("ord-1", "RC-1000S", 3);
    const o2 = makeOrder("ord-2", "RC-751", 1);
    setOrders([o1.view, o2.view], [o1.details, o2.details]);
  });

  it("initial render uses seller/year/month/productKey, not seed budget ids", async () => {
    const actuals = await listSalesActuals(MAY_FISCAL_YEAR);
    expect(rowOrderInMay(seedLineFor("RC-751"), actuals)).toBe(1);
    expect(rowOrderInMay(seedLineFor("RC-1000s"), actuals)).toBe(3);
  });

  it("after Budget + persists a new b_ id, order counts stay visible without rebinding", async () => {
    const actuals = await listSalesActuals(MAY_FISCAL_YEAR);
    const persisted = await persistBudgetLine("RC-751");
    expect(persisted.id.startsWith("seed_")).toBe(false);
    expect(rowOrderInMay(persisted, actuals)).toBe(1);
    expect(rowOrderInMay(seedLineFor("RC-1000s"), actuals)).toBe(3);
    expect(actuals.some(a => a.budget_line_id === persisted.id)).toBe(false);
  });

  it("after Arbejdsbudget persist/edit, order counts stay visible without touching actuals", async () => {
    const actuals = await listSalesActuals(MAY_FISCAL_YEAR);
    const persisted = await persistBudgetLine("RC-1000s");
    expect(rowOrderInMay(seedLineFor("RC-751"), actuals)).toBe(1);
    expect(rowOrderInMay(persisted, actuals)).toBe(3);
    expect(actuals.some(a => a.budget_line_id === persisted.id)).toBe(false);
  });

  it("counts O-7002 once in September for RC-1000s and its selected equipment", async () => {
    const view = {
      id: "o-7002", title: "ÖGA2026 Lead — RC-1000S", order_number: "O-7002", quote_number: "T-4001",
      seller_email: AKR.email, seller_initials: AKR.initials,
      case_status: "ordre_afgivet", document_type: "order",
      order_sent_at: `${YEAR}-09-06T17:26:34.993Z`, submitted_at: `${YEAR}-09-06T17:26:34.993Z`,
      created_at: `${YEAR}-09-01T07:29:25.363Z`, dealer_name: "Ad. Bachmann AG",
    };
    const details = {
      id: "o-7002", total_price: 224311,
      state_json: {
        language: "da", flowType: "order",
        machineConfigs: [{ id: "m0", type: "RC-1000S", qty: 1, configMode: "individual", acc: [] }],
        individualUnitConfigs: { m0_1: { acc: ["13101003", "410910", "411800", "412051", "412050", "411891", "411906"] } },
        accQty: {},
      },
    };
    // The view can contain duplicate joins. One submitted order must still count once.
    setOrders([view, view], [details]);

    const actuals = await listSalesActuals(YEAR);
    const byKey = buildOrderActualsByKey(actuals);
    const qty = (productKey: string) => byKey[orderActualKey(AKR.email, YEAR, SEPTEMBER_IDX, productKey)] || 0;

    expect(qty("RC-1000s")).toBe(1);
    expect(qty("RC1000_410910")).toBe(1);
    expect(qty("RC1000_411800")).toBe(1);
    expect(qty("RC1000_412051")).toBe(1);
    expect(qty("RC1000_412050")).toBe(1);
    expect(qty("RC1000_13101003")).toBe(0);
    expect(qty("RC1000_411891")).toBe(0);
    expect(qty("RC1000_411906")).toBe(0);
    expect(monthlyOrderQtyForProduct(actuals, YEAR, "RC-1000s", null)[SEPTEMBER_IDX]).toBe(1);
    expect(monthlyOrderQtyForProduct(actuals, YEAR, "RC-1000s", new Set([JTN.email]))[SEPTEMBER_IDX]).toBe(0);
  });

  it("derives current canonical equipment rows for all three budget machines", () => {
    const itemNumbers = (machine: string) => new Set(EQUIPMENT_BY_MACHINE[machine].map((item) => item.varenr));

    for (const itemNumber of ["412051", "412050"]) expect(itemNumbers("RC-1000s").has(itemNumber)).toBe(true);
    for (const itemNumber of ["730035", "730036"]) expect(itemNumbers("Timan 3330").has(itemNumber)).toBe(true);
    for (const itemNumber of ["744000", "774005", "770002", "770003", "770007"]) {
      expect(itemNumbers("Timan 2620").has(itemNumber)).toBe(true);
    }

    const allItemNumbers = new Set(Object.values(EQUIPMENT_BY_MACHINE).flat().map((item) => item.varenr));
    expect(BUDGET_EXCLUDED_EQUIPMENT_VARENR).toEqual(new Set([
      "13101003", "411891", "411906", "V35-502", "V35-300", "795002", "721059",
      "712903", "725126", "712902", "725120", "725121", "712901",
      "50101017", "50101018", "50101019", "50101020",
      "411701", "412585", "411594", "412603", "712900",
    ]));
    for (const itemNumber of BUDGET_EXCLUDED_EQUIPMENT_VARENR) {
      expect(allItemNumbers.has(itemNumber)).toBe(false);
    }
  });

  it("maps canonical item numbers from submitted orders to the derived budget rows", async () => {
    const view = {
      id: "catalog-order", order_number: "O-7005", seller_email: AKR.email, seller_initials: AKR.initials,
      case_status: "ordre_afgivet", document_type: "order", dealer_name: "Catalog Dealer",
      order_sent_at: `${YEAR}-09-06T17:26:34.993Z`, submitted_at: `${YEAR}-09-06T17:26:34.993Z`,
    };
    const details = {
      id: "catalog-order", total_price: 1,
      state_json: {
        language: "da", flowType: "order",
        machineConfigs: [
          { id: "rc", type: "RC-1000S", qty: 1, configMode: "shared", acc: ["412051", "412050"] },
          { id: "t3330", type: "Timan 3330", qty: 1, configMode: "shared", acc: ["730036", "730035"] },
          { id: "t2620", type: "Timan 2620", qty: 1, configMode: "shared", acc: ["3000-01", "3000-01__774005", "3000-05", "3000-06", "4000-01"] },
        ],
        accQty: {},
      },
    };
    setOrders([view], [details]);

    const actuals = await listSalesActuals(YEAR);
    const byKey = buildOrderActualsByKey(actuals);
    const qty = (productKey: string) => byKey[orderActualKey(AKR.email, YEAR, SEPTEMBER_IDX, productKey)] || 0;

    for (const productKey of [
      "RC1000_412051", "RC1000_412050", "T3330_730036", "T3330_730035",
      "T2620_744000", "T2620_774005", "T2620_770003", "T2620_770002", "T2620_770007",
    ]) {
      expect(qty(productKey)).toBe(1);
    }
  });

  it("counts a submitted loose-tools order by canonical item number", async () => {
    const view = {
      id: "o-7004", order_number: "O-7004", seller_email: AKR.email, seller_initials: AKR.initials,
      case_status: "ordre_afgivet", document_type: "order", dealer_name: "Loose Tools Dealer",
      order_sent_at: `${YEAR}-09-09T10:00:00Z`, submitted_at: `${YEAR}-09-09T10:00:00Z`,
    };
    const details = {
      id: "o-7004", total_price: 1,
      state_json: {
        language: "da", flowType: "order",
        machineConfigs: [{ id: "loose", type: "LOOSE_TOOL", qty: 1, configMode: "shared", acc: ["720130", "720130", "721059"] }],
        accQty: {},
      },
    };
    setOrders([view], [details]);

    const actuals = await listSalesActuals(YEAR);
    const byKey = buildOrderActualsByKey(actuals);
    const qty = (productKey: string) => byKey[orderActualKey(AKR.email, YEAR, SEPTEMBER_IDX, productKey)] || 0;

    expect(qty("T3330_720130")).toBe(1);
    expect(qty("T3330_721059")).toBe(0);
  });

  it("excludes canonical item numbers from submitted order aggregation", async () => {
    const excludedSelections = [...Object.keys(ACCESSORIES), LOOSE_TOOL_KEY].flatMap((machineType) =>
      getAccessoriesFlat(machineType)
        .filter((item) => BUDGET_EXCLUDED_EQUIPMENT_VARENR.has(item.varenr))
        .map((item) => ({ machineType, itemNumber: item.varenr, itemId: item.id })),
    );
    expect(new Set(excludedSelections.map((selection) => selection.itemNumber)))
      .toEqual(BUDGET_EXCLUDED_EQUIPMENT_VARENR);

    const view = {
      id: "excluded-equipment-order", order_number: "O-7997", seller_email: AKR.email, seller_initials: AKR.initials,
      case_status: "ordre_afgivet", document_type: "order", dealer_name: "Excluded Equipment Dealer",
      order_sent_at: `${YEAR}-09-09T10:00:00Z`, submitted_at: `${YEAR}-09-09T10:00:00Z`,
    };
    const details = {
      id: "excluded-equipment-order", total_price: 1,
      state_json: {
        language: "da", flowType: "order",
        machineConfigs: excludedSelections.map((selection, index) => ({
          id: `excluded-${index}`,
          type: selection.machineType,
          qty: 1,
          configMode: "shared",
          acc: [selection.itemId],
        })),
        accQty: {},
      },
    };
    setOrders([view], [details]);

    const byKey = buildOrderActualsByKey(await listSalesActuals(YEAR));
    for (const itemNumber of BUDGET_EXCLUDED_EQUIPMENT_VARENR) {
      const normalizedItemNumber = itemNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
      expect(Object.keys(byKey).some((key) => key.endsWith(`_${normalizedItemNumber}`))).toBe(false);
    }
  });

  it("maps every budget-relevant loose-tool catalog item through its canonical item number", async () => {
    const selected = getAccessoriesFlat(LOOSE_TOOL_KEY)
      .filter((item) => !item.isHeader && !item.hidden && !BUDGET_EXCLUDED_EQUIPMENT_VARENR.has(item.varenr))
      .filter((item) => item.priceDKK > 0 || item.priceEUR > 0);
    const view = {
      id: "full-loose-catalog", order_number: "O-7998", seller_email: AKR.email, seller_initials: AKR.initials,
      case_status: "ordre_afgivet", document_type: "order", dealer_name: "Catalog Dealer",
      order_sent_at: `${YEAR}-09-09T10:00:00Z`, submitted_at: `${YEAR}-09-09T10:00:00Z`,
    };
    const details = {
      id: "full-loose-catalog", total_price: 1,
      state_json: {
        language: "da", flowType: "order",
        machineConfigs: [{ id: "loose", type: LOOSE_TOOL_KEY, qty: 1, configMode: "shared", acc: selected.map((item) => item.id) }],
        accQty: {},
      },
    };
    setOrders([view], [details]);

    const canonicalRowsByItemNumber = new Map<string, string[]>();
    for (const item of Object.values(EQUIPMENT_BY_MACHINE).flat()) {
      if (!item.varenr) continue;
      canonicalRowsByItemNumber.set(item.varenr, [...(canonicalRowsByItemNumber.get(item.varenr) || []), item.key]);
    }
    const actualProductKeys = new Set((await listSalesActuals(YEAR)).map((actual) => actual.product_key));
    const unmatched = selected
      .filter((item) => !(canonicalRowsByItemNumber.get(item.varenr) || []).some((key) => actualProductKeys.has(key)))
      .map((item) => item.varenr);

    expect(unmatched).toEqual([]);
  });

  it("accepts a canonical O-number with a submitted timestamp even if a legacy status is stale", async () => {
    const order = makeOrder("submitted-o-number", "RC-1000S", 1);
    order.view.order_number = "O-7999";
    order.view.case_status = "aktiv";
    setOrders([order.view], [order.details]);

    const actuals = await listSalesActuals(MAY_FISCAL_YEAR);
    expect(rowOrderInMay(seedLineFor("RC-1000s"), actuals)).toBe(1);
  });
});
