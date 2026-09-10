import { describe, expect, it } from "vitest";
import {
  orderDetailsForBudgetCell,
  type SalesActual,
} from "@/lib/crmBudgetService";

const YEAR = 2026;

function actual(overrides: Partial<SalesActual> = {}): SalesActual {
  return {
    budget_line_id: "actual_rc1000_akr",
    qty_sold: 1,
    value_sold: 50000,
    seller_email: "akr@timan.dk",
    seller_initials: "AKR",
    year: YEAR,
    product_key: "RC-1000s",
    monthly_qty: Array.from({ length: 12 }, (_, index) => (index === 8 ? 1 : 0)),
    monthly_order_details: Array.from({ length: 12 }, (_, index) => index === 8 ? [{
      order_id: "order-7002",
      order_number: "O-7002",
      title: "RC-1000s til Bachmann",
      dealer_name: "Ad. Bachmann AG",
      seller_initials: "AKR",
      seller_email: "akr@timan.dk",
      product_key: "RC-1000s",
      quantity: 1,
      order_total: 50000,
    }] : []),
    ...overrides,
  };
}

describe("CRM Budget order tooltip", () => {
  it("returns the concrete submitted order behind the product/month cell", () => {
    expect(orderDetailsForBudgetCell([actual()], YEAR, "RC-1000s", 8, null)).toEqual([
      expect.objectContaining({
        order_number: "O-7002",
        dealer_name: "Ad. Bachmann AG",
        seller_initials: "AKR",
        product_key: "RC-1000s",
        quantity: 1,
        order_total: 50000,
      }),
    ]);
  });

  it("uses the same seller scope as the order cell", () => {
    const jtn = actual({
      budget_line_id: "actual_rc1000_jtn",
      seller_email: "jtn@timan.dk",
      seller_initials: "JTN",
      monthly_order_details: Array.from({ length: 12 }, (_, index) => index === 8 ? [{
        order_id: "order-7005",
        order_number: "O-7005",
        title: "RC-1000s til anden forhandler",
        dealer_name: "Eksempel A/S",
        seller_initials: "JTN",
        seller_email: "jtn@timan.dk",
        product_key: "RC-1000s",
        quantity: 2,
        order_total: 80000,
      }] : []),
    });

    const details = orderDetailsForBudgetCell(
      [actual(), jtn], YEAR, "RC-1000s", 8, new Set(["akr@timan.dk"]),
    );
    expect(details).toHaveLength(1);
    expect(details[0].order_number).toBe("O-7002");
  });

  it("does not duplicate one order when the same actual record is encountered twice", () => {
    const details = orderDetailsForBudgetCell([actual(), actual()], YEAR, "RC-1000s", 8, null);
    expect(details).toHaveLength(1);
    expect(details[0].quantity).toBe(2);
  });
});
