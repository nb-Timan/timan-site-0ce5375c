import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("user to dealer account mapping", () => {
  it("invalidates stale session snapshots after dealer mapping changes", () => {
    const source = read("src/context/AppUserContext.tsx");
    expect(source).toContain("const SESSION_CACHE_VERSION = 5");
    expect(source).toContain("dealer_number: (row.dealer_number as string | null) ?? null");
    expect(source).toContain("company_dealer: (row.company_dealer as string | null) ?? null");
  });

  it("waits for concrete view-as hydration before Partnerdata scope resolves", () => {
    const listPage = read("src/pages/crm/CrmMyDealersPage.tsx");
    const detailPage = read("src/pages/portal/DealerDataPage.tsx");

    expect(listPage).toContain("useEffectivePortalUserState");
    expect(listPage).toContain("resolvingEffectiveUser");
    expect(detailPage).toContain("useEffectivePortalUserState");
    expect(detailPage).toContain("resolvingEffectiveUser");
  });

  it("uses targeted dealer account reads for external Partnerdata scope", () => {
    const source = read("src/pages/crm/CrmMyDealersPage.tsx");
    const externalBranch = source.split("} else if (externalCrm) {")[1]?.split("} catch (e)")[0] ?? "";

    expect(externalBranch).toContain("buildJournalScope(effectiveUser, portalRole)");
    expect(externalBranch).toContain("fetchDealerAccountsByNumbers(scopedDealerNumbers)");
    expect(externalBranch).not.toContain("fetchDealerAccounts({ includeDeleted: false })");
  });

  it("keeps the fix generic, without hardcoding DVP account 10458", () => {
    const productionSources = [
      "src/context/AppUserContext.tsx",
      "src/lib/viewAsUser.ts",
      "src/lib/partnerDataScope.ts",
      "src/lib/machineJournalScope.ts",
      "src/pages/crm/CrmMyDealersPage.tsx",
      "src/pages/portal/DealerDataPage.tsx",
    ].map(read).join("\n");

    expect(productionSources).not.toContain("10458");
    expect(productionSources).not.toContain("Tiefel Garten");
  });
});
