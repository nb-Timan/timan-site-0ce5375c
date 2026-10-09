import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  resolveWorkingBudgetAggregateAllocation,
  resolveWorkingBudgetAllocation,
} from "@/lib/workingBudgetAllocation";
import type { OriginalBudgetBasis } from "@/lib/crmBudgetService";
import BudgetWorkingAllocation from "@/components/crm/BudgetWorkingAllocation";
import BudgetWorkingSellerAllocation from "@/components/crm/BudgetWorkingSellerAllocation";

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

  it("preserves Foras and Weimer when November increases from two to three", () => {
    const result = resolveWorkingBudgetAllocation({
      workingQty: 3,
      references: [
        {
          dealer_account_id: "11111111-1111-4111-8111-111111111111",
          dealer_name: "Foras GmbH Zeven",
          dealer_account_number: "10180",
          qty: 1,
        },
        {
          dealer_account_id: "22222222-2222-4222-8222-222222222222",
          dealer_name: "Weimer GmbH Lollar",
          dealer_account_number: "10291",
          qty: 1,
        },
      ],
      hasWorkingChange: true,
    });

    expect(result.allocations).toEqual([
      expect.objectContaining({ dealer_name: "Foras GmbH Zeven", dealer_account_number: "10180", qty: 1 }),
      expect.objectContaining({ dealer_name: "Weimer GmbH Lollar", dealer_account_number: "10291", qty: 1 }),
    ]);
    expect(result).toMatchObject({ total: 3, allocated: 2, unallocated: 1, source: "explicit" });
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
      dealer_account_id: null,
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

  it("composes seller-scoped resolver results without flattening dealer ownership", () => {
    const result = resolveWorkingBudgetAggregateAllocation([
      {
        seller_initials: "AKR",
        seller_email: "akr@timan.dk",
        workingQty: 7,
        references: [{ dealer_name: "Shared Dealer", dealer_account_number: "100", qty: 4 }],
      },
      {
        seller_initials: "BP",
        seller_email: "bp@timan.dk",
        workingQty: 5,
        references: [{ dealer_name: "Shared Dealer", dealer_account_number: "100", qty: 5 }],
      },
    ]);

    expect(result).toMatchObject({ total: 12, allocated: 9, unallocated: 3 });
    expect(result.sellers).toHaveLength(2);
    expect(result.sellers[0].allocation.allocations[0]).toMatchObject({ dealer_name: "Shared Dealer", qty: 4 });
    expect(result.sellers[1].allocation.allocations[0]).toMatchObject({ dealer_name: "Shared Dealer", qty: 5 });
  });

  it("omits zero-quantity sellers without changing aggregate totals", () => {
    const result = resolveWorkingBudgetAggregateAllocation([
      { seller_initials: "EM", workingQty: 0, references: [{ dealer_name: "Unused", qty: 2 }] },
      { seller_initials: "JTN", workingQty: 3, references: [{ dealer_name: "Dealer J", qty: 2 }] },
    ]);

    expect(result.sellers.map((seller) => seller.seller_initials)).toEqual(["JTN"]);
    expect(result).toMatchObject({ total: 3, allocated: 2, unallocated: 1 });
  });

  it("keeps inherited baselines and explicit references isolated per seller", () => {
    const result = resolveWorkingBudgetAggregateAllocation([
      { seller_initials: "BP", workingQty: 5, originalBasis: original },
      {
        seller_initials: "AKR",
        workingQty: 7,
        originalBasis: { total: 7, allocations: [{ dealer_account_id: "z", dealer_account_number: "9", dealer_name: "Old", qty: 7 }] },
        references: [{ dealer_name: "Current", dealer_account_number: "10", qty: 4 }],
      },
    ]);

    expect(result.sellers[0].allocation.source).toBe("inherited");
    expect(result.sellers[1].allocation.source).toBe("explicit");
    expect(result.sellers[1].allocation.allocations).toEqual([{
      dealer_account_id: null,
      dealer_name: "Current",
      dealer_account_number: "10",
      qty: 4,
    }]);
  });

  it("renders seller sections and reconciled Backend totals in a narrow-safe layout", () => {
    const allocation = resolveWorkingBudgetAggregateAllocation([
      { seller_initials: "AKR", workingQty: 7, references: [{ dealer_name: "Dealer A", qty: 4 }] },
      { seller_initials: "BP", workingQty: 5, originalBasis: original },
    ]);
    const html = renderToStaticMarkup(createElement(BudgetWorkingSellerAllocation, { allocation }));

    expect(html).toContain("Aktuel forhandlerfordeling pr. sælger");
    expect(html).toContain("AKR");
    expect(html).toContain("BP");
    expect(html).toContain("Dealer A");
    expect(html).toContain("Avitech · #11913");
    expect(html).toContain("TOTAL FORDELT");
    expect(html).toContain("9 / 12 stk.");
    expect(html).toContain("TOTAL IKKE FORDELT");
    expect(html).toContain("3 stk.");
  });

  it("uses aggregate allocation only for Backend all-sellers hover composition", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/crm/CrmBudgetPage.tsx"), "utf8");
    expect(page).toContain('isAdmin && backendFilter === "all"');
    expect(page).toContain("resolveWorkingBudgetAggregateAllocation(inputs)");
    expect(page).toContain("workingAllocation={workingSellerAllocation ? null : workingAllocation}");
  });
});
