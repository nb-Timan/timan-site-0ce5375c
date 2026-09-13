import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync("src/components/claims/ClaimsAdminSidebarLayout.tsx", "utf8");
const dashboard = readFileSync("src/pages/claims/DealerClaimsDashboardPage.tsx", "utf8");
const mine = readFileSync("src/pages/claims/DealerClaimsMinePage.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");

describe("dealer claims navigation", () => {
  it("puts the existing create route below Mine claims only for users with create access", () => {
    expect(sidebar).toContain('to: "/portal/service/claims?tab=mine"');
    expect(sidebar).toContain('to: "/portal/service/claims/new"');
    expect(sidebar).toContain("canCreateClaim ? [...DEALER_NAV, DEALER_CREATE_NAV] : DEALER_NAV");
    expect(sidebar).toContain('if (pathname === "/portal/service/claims/new") return "new"');
    expect(app).toContain('path="/portal/service/claims/new" element={<NewClaimPage />}');
  });

  it("keeps the sidebar as the sole dealer create entry point", () => {
    expect(dashboard).not.toContain('to="/portal/service/claims/new"');
    expect(mine).not.toContain('to="/portal/service/claims/new"');
    expect(dashboard).toContain("canCreateClaim={!readOnly}");
    expect(mine).toContain("canCreateClaim={!readOnly}");
  });
});
