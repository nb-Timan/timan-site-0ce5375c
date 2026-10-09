import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/crm/CrmMyDealersPage.tsx", "utf8");

describe("Mine forhandlere main-partner grouping", () => {
  it("uses the existing active service-partner relation as an additional hierarchy source", () => {
    expect(page).toContain("listPartnerAccountRelations");
    expect(page).toContain("mainPartnerAccountNumbersByChild");
    expect(page).toContain("groupDealersByParent(visibleDealers, mainPartnerByChildAccount)");
  });

  it("keeps a matching child visible together with its parent anchor", () => {
    expect(page).toContain("const parentAccountNumber = parentAccountNumberFor(d)");
    expect(page).toContain("visibleIds.add(parent.id)");
  });

  it("preserves child navigation and existing hierarchy presentation", () => {
    expect(page).toContain("r: b, depth: 1, variant: \"branch\"");
    expect(page).toContain("onOpenDetail: (d) => navigate(detailPath(d))");
    expect(page).toContain("branchRelationBadgeLabel");
  });
});
