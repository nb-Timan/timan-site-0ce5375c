import { describe, expect, it } from "vitest";
import {
  originalBudgetBasisForCell,
  type BudgetDealerLine,
} from "@/lib/crmBudgetService";

const row = (overrides: Partial<BudgetDealerLine>): BudgetDealerLine => ({
  id: crypto.randomUUID(),
  year: 2026,
  month_idx: 6,
  seller_id: null,
  seller_name: "Jakob Nielsen",
  seller_email: "jtn@timan.dk",
  seller_initials: "JTN",
  dealer_account_id: "dealer-a",
  dealer_account_number: "10001",
  dealer_name: "Dealer A",
  dealer_name_norm: "dealer a",
  product_key: "RC-751",
  product_name: "RC-751",
  item_number: null,
  qty: 1,
  excluded_from_total: false,
  import_source: "budget-import",
  import_batch_id: "batch-1",
  ...overrides,
});

const jtnRows: BudgetDealerLine[] = [
  ...Array.from({ length: 20 }, (_, index) => row({
    id: `rc751-${index}`,
    product_key: "RC-751",
    month_idx: index % 12,
    dealer_account_id: `dealer-${index % 5}`,
    dealer_account_number: String(10000 + (index % 5)),
    dealer_name: `Dealer ${index % 5}`,
  })),
  ...Array.from({ length: 47 }, (_, index) => row({
    id: `rc1000-${index}`,
    product_key: "RC-1000s",
    month_idx: index % 12,
    dealer_account_id: `dealer-${index % 7}`,
    dealer_account_number: String(10000 + (index % 7)),
    dealer_name: `Dealer ${index % 7}`,
  })),
  ...Array.from({ length: 7 }, (_, index) => row({
    id: `3330-${index}`,
    product_key: "Timan 3330",
    month_idx: index,
    dealer_account_id: `dealer-${index % 2}`,
    dealer_account_number: String(10000 + (index % 2)),
    dealer_name: `Dealer ${index % 2}`,
  })),
];

describe("CRM Budget original dealer basis", () => {
  it("reproduces JTN's canonical 2026 model totals without a second source", () => {
    const scope = new Set(["jtn@timan.dk"]);
    expect(originalBudgetBasisForCell(jtnRows, 2026, null, "RC-751", scope)?.total).toBe(20);
    expect(originalBudgetBasisForCell(jtnRows, 2026, null, "RC-1000s", scope)?.total).toBe(47);
    expect(originalBudgetBasisForCell(jtnRows, 2026, null, "Timan 3330", scope)?.total).toBe(7);
  });

  it("groups dealer allocations and uses calendar month indexes inside the Jul-Jun fiscal display", () => {
    const rows = [
      row({ id: "a-jul-1", qty: 1, month_idx: 6 }),
      row({ id: "a-jul-2", qty: 2, month_idx: 6 }),
      row({ id: "b-jul", dealer_account_id: "dealer-b", dealer_name: "Dealer B", qty: 1, month_idx: 6 }),
      row({ id: "a-jan", qty: 9, month_idx: 0 }),
    ];
    const july = originalBudgetBasisForCell(rows, 2026, 6, "RC-751", new Set(["jtn@timan.dk"]));
    expect(july).toEqual({
      total: 4,
      allocations: [
        expect.objectContaining({ dealer_name: "Dealer A", qty: 3 }),
        expect.objectContaining({ dealer_name: "Dealer B", qty: 1 }),
      ],
    });
  });

  it("keeps View-as scope and excluded rows out without mutating the source", () => {
    const rows = [
      row({ id: "jtn", qty: 2 }),
      row({ id: "other", seller_email: "other@timan.dk", seller_initials: "OTH", qty: 8 }),
      row({ id: "excluded", qty: 5, excluded_from_total: true }),
    ];
    const snapshot = structuredClone(rows);
    expect(originalBudgetBasisForCell(rows, 2026, 6, "RC-751", new Set(["jtn@timan.dk"]))?.total).toBe(2);
    expect(rows).toEqual(snapshot);
  });

  it("returns null when no imported allocation exists for the cell", () => {
    expect(originalBudgetBasisForCell(jtnRows, 2026, 11, "Unknown", null)).toBeNull();
  });
});
