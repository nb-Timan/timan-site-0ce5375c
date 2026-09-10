import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canEditPartnerDataAccount,
} from "@/lib/partnerDataScope";
import { getPortalBackTarget } from "@/lib/portalBackNav";

describe("Partnerdata list-first flow", () => {
  it("keeps the Partnerdata entry route separate from CRM analytics", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const portal = readFileSync("src/pages/PortalPage.tsx", "utf8");

    expect(app).toContain('path="/portal/dealer-data" element={<PartnerDataRoute />}');
    expect(app).toContain('path="/portal/crm/my-dealers" element={<AcademyCapabilityGuard capability="crm"><CrmMyDealersPage /></AcademyCapabilityGuard>}');
    expect(portal).toContain("dealer_data:    { to: '/portal/dealer-data'");
  });

  it("routes no-account links to the list and only opens detail after a selection", () => {
    const route = readFileSync("src/pages/portal/PartnerDataRoute.tsx", "utf8");
    const app = readFileSync("src/App.tsx", "utf8");
    expect(route).toContain('<CrmMyDealersPage presentation="partnerdata" />');
    expect(app).toContain('<Route path="/portal/dealer-data/:accountNumber" element={<CrmDealerDetailPage presentation="partnerdata" />} />');
  });

  it("returns the Partnerdata overview to the Partnerdata list", () => {
    expect(getPortalBackTarget("/portal/dealer-data/10368")).toBe("/portal/dealer-data");
  });

  it("reuses the established table while keeping CRM analytics out of Partnerdata", () => {
    const overview = readFileSync("src/pages/crm/CrmMyDealersPage.tsx", "utf8");
    const detail = readFileSync("src/pages/crm/CrmDealerDetailPage.tsx", "utf8");
    expect(overview).toContain('presentation?: "crm" | "partnerdata"');
    expect(overview).toContain('!partnerDataPresentation && (');
    expect(overview).toContain('`/portal/dealer-data/${encodeURIComponent(dealer.account_number)}`');
    expect(overview).toContain("computeDealerProfileBadge");
    expect(overview).toContain("const completionPercent = 100 - badge.missingPercent");
    expect(detail).toContain('presentation = "crm"');
    expect(detail).toContain('key: "dealer-data"');
    expect(detail).toContain('`/portal/dealer-data?accountNumber=${encodeURIComponent(dealer.account_number)}`');
  });

  it("allows an external partner to edit only its own account", () => {
    const user = { dealer_number: "10295" } as Parameters<typeof canEditPartnerDataAccount>[0];
    expect(canEditPartnerDataAccount(user, "timan_dealer", "10295")).toBe(true);
    expect(canEditPartnerDataAccount(user, "timan_dealer", "11841")).toBe(false);
  });

  it("keeps the scope resolver explicit for global, seller, and partner users", () => {
    const source = readFileSync("src/lib/partnerDataScope.ts", "utf8");
    expect(source).toContain('fetchDealerAccounts()');
    expect(source).toContain('fetchDealerAccountsForSeller');
    expect(source).toContain('buildJournalScope');
    expect(source).toContain('listCanonicalRelatedAccountNumbers');
    expect(source).toContain('result.dealers.map((dealer) => dealer.id)');
  });
});
