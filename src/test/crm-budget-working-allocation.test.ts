import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { resolveWorkingBudgetAllocation } from "@/lib/workingBudgetAllocation";
import type { OriginalBudgetBasis } from "@/lib/crmBudgetService";
import BudgetWorkingAllocation from "@/components/crm/BudgetWorkingAllocation";

const original: OriginalBudgetBasis = {
  total: 5,
  allocations: [
    { dealer_account_id: "a", dealer_account_number: "11913", dealer_name: "Avitech", qty: 1 },
    { dealer_account_id: "b", dealer_account_number: "10925", dealer_name: "Dauzina", qty: 1 },
    { dealer_account_id: "c", dealer_account_number: "12058", dealer_name: "Metec", qty: 1 },
    { dealer_account_id: "d", dealer_account_number: "12044", dealer_name: "Oikea", qty: 1 },
    { dealer_account_id: "e", dealer_account_number: "10474", dealer_name: "PROSAT", qty: 1 },
  ],
};

describe("CRM Working Budget dealer allocation", () => {
  it("inherits the frozen dealer baseline for an untouched matching cell", () => {
    const result = resolveWorkingBudgetAllocation({ workingQty: 5, originalBasis: original });
    expect(result.source).toBe("inherited");
    expect(result.allocations).toHaveLength(5);
    expect(result.allocated).toBe(5);
    expect(result.unallocated).toBe(0);
  });

  it("does not present the old baseline as current after a working change", () => {
    const result = resolveWorkingBudgetAllocation({
      workingQty: 4,
      originalBasis: original,
      hasWorkingChange: true,
    });
    expect(result).toMatchObject({ source: "unallocated", allocated: 0, unallocated: 4 });
  });

  it("uses explicit references instead of the original baseline", () => {
    const result = resolveWorkingBudgetAllocation({
      workingQty: 5,
      originalBasis: original,
      references: [
        { dealer_name: "Dealer A", dealer_account_number: "1", qty: 1 },
        { dealer_name: "Dealer B", dealer_account_number: "2", qty: 2 },
      ],
    });
    expect(result.source).toBe("explicit");
    expect(result.allocations.map((row) => row.qty)).toEqual([1, 2]);
    expect(result.allocated).toBe(3);
    expect(result.unallocated).toBe(2);
  });

  it("never allocates more than the Working Budget total", () => {
    const result = resolveWorkingBudgetAllocation({
      workingQty: 4,
      references: [
        { dealer_name: "Dealer A", qty: 3 },
        { dealer_name: "Dealer B", qty: 3 },
      ],
    });
    expect(result.allocations.map((row) => row.qty)).toEqual([3, 1]);
    expect(result).toMatchObject({ allocated: 4, unallocated: 0 });
  });

  it("groups repeated references for the same dealer", () => {
    const result = resolveWorkingBudgetAllocation({
      workingQty: 5,
      references: [
        { dealer_name: "Avitech", dealer_account_number: "11913", qty: 1 },
        { dealer_name: "Avitech", dealer_account_number: "11913", qty: 2 },
      ],
    });
    expect(result.allocations).toEqual([{
      dealer_name: "Avitech",
      dealer_account_number: "11913",
      qty: 3,
    }]);
  });

  it("does not mutate the frozen original allocation", () => {
    const before = JSON.stringify(original);
    resolveWorkingBudgetAllocation({
      workingQty: 2,
      originalBasis: original,
      references: [{ dealer_name: "Dealer A", qty: 2 }],
    });
    expect(JSON.stringify(original)).toBe(before);
  });

  it("uses the same resolver output in the hover and reference modal", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/crm/CrmBudgetPage.tsx"), "utf8");
    const modal = readFileSync(resolve(process.cwd(), "src/components/crm/BudgetReferenceModal.tsx"), "utf8");
    expect(page).toContain("resolveWorkingBudgetAllocation({");
    expect(page).toContain("workingAllocation={workingAllocation}");
    expect(modal).toContain("resolveWorkingBudgetAllocation({");
    expect(modal).toContain("allocation={workingAllocation}");
  });

  it("renders dealer, account number, totals and inherited-baseline status", () => {
    const allocation = resolveWorkingBudgetAllocation({ workingQty: 5, originalBasis: original });
    const html = renderToStaticMarkup(createElement(BudgetWorkingAllocation, { allocation }));
    expect(html).toContain("Startfordeling fra oprindeligt budget");
    expect(html).toContain("Avitech · #11913");
    expect(html).toContain("Fordelt");
    expect(html).toContain("5 / 5 stk.");
    expect(html).toContain("Ikke fordelt");
    expect(html).toContain("0 stk.");
  });
});
