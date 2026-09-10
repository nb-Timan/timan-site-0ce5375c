import { describe, expect, it } from "vitest";
import { matchesWorkingBudgetScope } from "@/lib/crmBudgetWorkingScope";

describe("CRM Budget working-budget scope", () => {
  it("keeps every seller's lead contribution in Backend's all-sellers view", () => {
    expect(matchesWorkingBudgetScope({
      ownerEmail: "em@timan.dk",
      isAdmin: true,
      backendFilter: "all",
      sellerContextEmail: "",
    })).toBe(true);

    expect(matchesWorkingBudgetScope({
      ownerEmail: "akr@timan.dk",
      isAdmin: true,
      backendFilter: "all",
      sellerContextEmail: "",
    })).toBe(true);
  });

  it("continues to limit a selected seller view to that seller", () => {
    expect(matchesWorkingBudgetScope({
      ownerEmail: "em@timan.dk",
      isAdmin: true,
      backendFilter: "em@timan.dk",
      sellerContextEmail: "",
    })).toBe(true);

    expect(matchesWorkingBudgetScope({
      ownerEmail: "akr@timan.dk",
      isAdmin: true,
      backendFilter: "em@timan.dk",
      sellerContextEmail: "",
    })).toBe(false);
  });
});
