import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUDGET_SELLERS,
  aggregateBudget,
  calculateBudgetScorePct,
  currentFiscalYearForBudget,
  type BudgetDealerLine,
  type BudgetForecast,
  type BudgetLine,
  type SalesActual,
} from "@/lib/crmBudgetService";

const YEAR = 2026;
const PRODUCT = "Timan 3330";
const EVEN = Array.from({ length: 12 }, () => 1 / 12);

function line(initials: string, email: string): BudgetLine {
  return {
    id: `line-${initials}`,
    year: YEAR,
    product_key: PRODUCT,
    product_name: PRODUCT,
    item_number: "3330",
    category: "machine",
    seller_id: null,
    seller_name: initials,
    seller_email: email,
    seller_initials: initials,
    country: initials === "AKR" ? "DE" : "DK",
    qty_budget: 0,
    value_budget: 0,
    monthly_split: EVEN,
    locked: true,
    created_at: "2026-07-01T00:00:00.000Z",
  };
}

function dealerLine(initials: string, email: string, qty: number): BudgetDealerLine {
  return {
    id: `dealer-${initials}`,
    year: YEAR,
    month_idx: 6,
    seller_id: null,
    seller_name: initials,
    seller_email: email,
    seller_initials: initials,
    dealer_account_id: `dealer-${initials}`,
    dealer_account_number: initials,
    dealer_name: `Dealer ${initials}`,
    dealer_name_norm: `dealer ${initials.toLowerCase()}`,
    product_key: PRODUCT,
    product_name: PRODUCT,
    item_number: "3330",
    qty,
    excluded_from_total: false,
    import_source: "test",
    import_batch_id: "test",
  };
}

function actual(initials: string, email: string, qty: number, year = YEAR): SalesActual {
  return {
    budget_line_id: `line-${initials}`,
    qty_sold: qty,
    value_sold: 0,
    seller_key: email,
    seller_email: email,
    seller_initials: initials,
    year,
    product_key: PRODUCT,
  };
}

const expected = new Map([
  ["BP", { budgetQty: 100, ordersQty: 10, scorePct: 10 }],
  ["EM", { budgetQty: 80, ordersQty: 4, scorePct: 5 }],
  ["JTN", { budgetQty: 60, ordersQty: 3, scorePct: 5 }],
  ["AKR", { budgetQty: 77, ordersQty: 4, scorePct: 5 }],
  ["NB", { budgetQty: 0, ordersQty: 0, scorePct: 0 }],
]);

const lines = BUDGET_SELLERS.map((seller) => line(seller.initials, seller.email));
const dealerLines = BUDGET_SELLERS
  .map((seller) => ({ seller, values: expected.get(seller.initials)! }))
  .filter(({ values }) => values.budgetQty > 0)
  .map(({ seller, values }) => dealerLine(seller.initials, seller.email, values.budgetQty));
const actuals = BUDGET_SELLERS.map((seller) =>
  actual(seller.initials, seller.email, expected.get(seller.initials)!.ordersQty),
);

describe("CRM Dashboard canonical Budget Score", () => {
  it.each(BUDGET_SELLERS)("matches Budget for $initials without cross-seller leakage", (seller) => {
    const result = aggregateBudget(lines, [], actuals, seller.email, dealerLines, YEAR).totals;
    expect(result).toMatchObject(expected.get(seller.initials)!);
  });

  it("handles a genuine zero budget without division by zero", () => {
    expect(calculateBudgetScorePct(0, 4)).toBe(0);
    expect(Number.isFinite(calculateBudgetScorePct(0, 4))).toBe(true);
  });

  it("does not let Working Budget alter Budget Score", () => {
    const forecasts: BudgetForecast[] = lines.map((budgetLine) => ({
      id: `forecast-${budgetLine.id}`,
      budget_line_id: budgetLine.id,
      qty_forecast: 999,
      value_forecast: 999,
      monthly_qty: Array.from({ length: 12 }, () => 999),
      updated_at: "2026-09-28T00:00:00.000Z",
    }));
    const seller = BUDGET_SELLERS.find((item) => item.initials === "AKR")!;
    expect(aggregateBudget(lines, forecasts, actuals, seller.email, dealerLines, YEAR).totals.scorePct).toBe(5);
  });

  it("does not let equipment orders inflate the machine Budget Score", () => {
    const seller = BUDGET_SELLERS.find((item) => item.initials === "BP")!;
    const equipmentActual: SalesActual = {
      ...actual("BP", seller.email, 50),
      budget_line_id: "equipment-order",
      product_key: "LOOSE_TOOL",
    };
    const result = aggregateBudget(lines, [], [...actuals, equipmentActual], seller.email, dealerLines, YEAR);
    expect(result.byMachine.find((row) => row.product_key === "LOOSE_TOOL")?.ordersQty).toBe(50);
    expect(result.totals).toMatchObject({ budgetQty: 100, ordersQty: 10, scorePct: 10 });
  });

  it("uses the current July-June budget year", () => {
    expect(currentFiscalYearForBudget(new Date("2026-09-28T12:00:00Z"))).toBe(2026);
    expect(currentFiscalYearForBudget(new Date("2026-02-01T12:00:00Z"))).toBe(2025);
  });

  it("ignores actuals from another budget year", () => {
    const seller = BUDGET_SELLERS.find((item) => item.initials === "BP")!;
    const wrongYearActual = actual("BP", seller.email, 50, YEAR - 1);
    const currentActuals = actuals.filter((item) => item.seller_initials !== "BP");
    expect(aggregateBudget(lines, [], [...currentActuals, wrongYearActual], seller.email, dealerLines, YEAR).totals.ordersQty).toBe(0);
  });

  it("wires Dashboard and Budget page to the same canonical service", () => {
    const dashboard = readFileSync("src/components/crm/SellerCockpitSection.tsx", "utf8");
    const dashboardPage = readFileSync("src/pages/crm/CrmDashboardPage.tsx", "utf8");
    const budgetPage = readFileSync("src/pages/crm/CrmBudgetPage.tsx", "utf8");
    expect(dashboard).toContain("listBudgetDealerLines(budgetYear)");
    expect(dashboard).toContain("currentFiscalYearForBudget()");
    expect(dashboard).toMatch(/aggregateBudget\(budgetLines, forecasts, actuals, seller\.email, dealerLines, budgetYear\)/);
    expect(dashboardPage).toContain("sellerEmail={getEffectiveSellerEmail(appUser) ?? appUser?.email ?? null}");
    expect(budgetPage).toContain("calculateBudgetScorePct(annualQty, soldQty)");
  });
});
