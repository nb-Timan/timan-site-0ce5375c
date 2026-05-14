/**
 * Phase 35 / Step 5 — pure aggregation helpers that wire imported dealer
 * budget rows into CRM Budget + Budget Dashboard totals.
 */
import { describe, it, expect } from "vitest";
import {
  aggregateDealerBudgetMonthly,
  hasDealerBudgetByMonth,
  mergeMonthlyPreferDealer,
  pickLargestDealerRowForCell,
  type BudgetDealerLine,
} from "@/lib/crmBudgetService";

const YEAR = 2026;

function row(over: Partial<BudgetDealerLine>): BudgetDealerLine {
  return {
    id: Math.random().toString(36).slice(2),
    year: YEAR,
    month_idx: 0,
    seller_id: null,
    seller_name: null,
    seller_email: "em@timan.dk",
    seller_initials: "EM",
    dealer_account_id: null,
    dealer_account_number: null,
    dealer_name: "Avistech",
    dealer_name_norm: "avistech",
    product_key: "RC-1000s",
    product_name: "RC-1000s",
    item_number: null,
    qty: 1,
    excluded_from_total: false,
    import_source: "test",
    import_batch_id: null,
    ...over,
  };
}

const manualMonthly = (qty: number) => Array.from({ length: 12 }, () => qty / 12);

describe("Phase 35 / Step 5 — dealer budget aggregation", () => {
  it("sums dealer rows into 12-month buckets, scoped by seller", () => {
    const rows = [
      row({ month_idx: 2, qty: 1 }),
      row({ month_idx: 2, qty: 2, dealer_name: "Other" }),
      row({ month_idx: 5, qty: 3 }),
      row({ seller_email: "jtn@timan.dk", month_idx: 2, qty: 7 }),
    ];
    const own = aggregateDealerBudgetMonthly(rows, "RC-1000s", new Set(["em@timan.dk"]));
    expect(own[2]).toBe(3);
    expect(own[5]).toBe(3);
    expect(own.reduce((a, b) => a + b, 0)).toBe(6);

    const all = aggregateDealerBudgetMonthly(rows, "RC-1000s", null);
    expect(all[2]).toBe(10);
  });

  it("ignores excluded_from_total and qty<=0", () => {
    const rows = [
      row({ month_idx: 0, qty: 0 }),
      row({ month_idx: 0, qty: 5, excluded_from_total: true }),
      row({ month_idx: 0, qty: 4 }),
    ];
    const out = aggregateDealerBudgetMonthly(rows, "RC-1000s", null);
    expect(out[0]).toBe(4);
    const has = hasDealerBudgetByMonth(rows, "RC-1000s", null);
    expect(has[0]).toBe(true);
    expect(has[1]).toBe(false);
  });

  it("filters by product_key (case/space tolerant)", () => {
    const rows = [
      row({ product_key: "rc-1000s", month_idx: 1, qty: 2 }),
      row({ product_key: "Timan 3330", month_idx: 1, qty: 9 }),
    ];
    const a = aggregateDealerBudgetMonthly(rows, "RC-1000s", null);
    const b = aggregateDealerBudgetMonthly(rows, "Timan 3330", null);
    expect(a[1]).toBe(2);
    expect(b[1]).toBe(9);
  });

  it("mergeMonthlyPreferDealer replaces manual cell when dealer row exists", () => {
    const manual = manualMonthly(12); // 1 per month
    const dealer = Array.from({ length: 12 }, () => 0);
    dealer[3] = 5; // imported value for April
    const has = Array.from({ length: 12 }, (_, i) => i === 3);
    const merged = mergeMonthlyPreferDealer(manual, dealer, has);
    expect(merged[3]).toBe(5);              // dealer wins (no double count)
    expect(merged[0]).toBe(1);              // manual fallback elsewhere
    expect(merged.reduce((a, b) => a + b, 0)).toBe(11 + 5);
  });

  it("does not double count when both sources exist for same month", () => {
    const rows = [row({ month_idx: 6, qty: 3 })];
    const dealer = aggregateDealerBudgetMonthly(rows, "RC-1000s", null);
    const has = hasDealerBudgetByMonth(rows, "RC-1000s", null);
    const manual = manualMonthly(24); // 2 per month
    const merged = mergeMonthlyPreferDealer(manual, dealer, has);
    expect(merged[6]).toBe(3); // NOT 2+3 = 5
  });

  it("backend 'all sellers' aggregates across every seller", () => {
    const rows = [
      row({ seller_email: "em@timan.dk", month_idx: 0, qty: 1 }),
      row({ seller_email: "jtn@timan.dk", month_idx: 0, qty: 2 }),
      row({ seller_email: "akr@timan.dk", month_idx: 0, qty: 4 }),
    ];
    const out = aggregateDealerBudgetMonthly(rows, "RC-1000s", null);
    expect(out[0]).toBe(7);
  });

  it("selected seller scope returns only that seller's totals", () => {
    const rows = [
      row({ seller_email: "em@timan.dk", month_idx: 0, qty: 1 }),
      row({ seller_email: "jtn@timan.dk", month_idx: 0, qty: 9 }),
    ];
    const out = aggregateDealerBudgetMonthly(rows, "RC-1000s", new Set(["jtn@timan.dk"]));
    expect(out[0]).toBe(9);
  });
});

describe("Phase 35 — pickLargestDealerRowForCell (plus/minus target)", () => {
  it("returns the largest non-excluded row for the cell", () => {
    const rows = [
      row({ id: "a", dealer_name: "Lyngfeldt", month_idx: 4, product_key: "Timan 3330", qty: 1 }),
      row({ id: "b", dealer_name: "Henrik A. Fog A/S", month_idx: 4, product_key: "Timan 3330", qty: 2 }),
      row({ id: "c", dealer_name: "Lyngfeldt demo", month_idx: 4, product_key: "Timan 3330", qty: 0, excluded_from_total: true }),
    ];
    const t = pickLargestDealerRowForCell(rows, YEAR, 4, "Timan 3330", new Set(["em@timan.dk"]));
    expect(t?.id).toBe("b");
    expect(t?.dealer_name).toBe("Henrik A. Fog A/S");
  });

  it("never picks an excluded_from_total row even when it has the largest qty", () => {
    const rows = [
      row({ id: "x", qty: 99, excluded_from_total: true, dealer_name: "Demo Z" }),
      row({ id: "y", qty: 2, dealer_name: "Active" }),
    ];
    const t = pickLargestDealerRowForCell(rows, YEAR, 0, "RC-1000s", null);
    expect(t?.id).toBe("y");
  });

  it("returns null when no dealer rows match the cell", () => {
    const rows = [row({ month_idx: 1 })];
    expect(pickLargestDealerRowForCell(rows, YEAR, 0, "RC-1000s", null)).toBeNull();
  });
});
