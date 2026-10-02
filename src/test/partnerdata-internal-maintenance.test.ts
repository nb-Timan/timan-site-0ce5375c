import fs from "node:fs";
import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/context/AppUserContext";
import {
  canEditPartnerDataAccount,
  canMaintainPartnerdata,
} from "@/lib/partnerDataScope";

function internalUser(portalRole: "timan_backend" | "timan_seller" | "timan_service", areas?: string[] | null) {
  return {
    id: `${portalRole}-id`,
    email: `${portalRole}@example.invalid`,
    portal_role: portalRole,
    approved: true,
    is_active: true,
    allowed_areas: areas,
  } as SessionUser;
}

describe("canonical internal Timan Partnerdata maintenance", () => {
  it("separates a seller's Partnerdata capability from its resolved account scope", () => {
    const seller = internalUser("timan_seller", ["dealer_data"]);
    expect(canMaintainPartnerdata(seller, "timan_seller")).toBe(true);
    expect(canEditPartnerDataAccount(seller, "timan_seller", "own-account", true)).toBe(true);
    expect(canEditPartnerDataAccount(seller, "timan_seller", "other-account", false)).toBe(false);
  });

  it.each(["timan_backend", "timan_service"] as const)(
    "preserves explicit global Partnerdata maintenance for %s",
    (role) => {
      const user = internalUser(role, role === "timan_backend" ? [] : ["dealer_data"]);
      expect(canMaintainPartnerdata(user, role)).toBe(true);
      expect(canEditPartnerDataAccount(user, role, "unrelated-account")).toBe(true);
    },
  );

  it("honors explicit Partnerdata area removal for non-Backend employees", () => {
    const seller = internalUser("timan_seller", []);
    const service = internalUser("timan_service", ["teknik_service"]);
    expect(canMaintainPartnerdata(seller, "timan_seller")).toBe(false);
    expect(canMaintainPartnerdata(service, "timan_service")).toBe(false);
  });

  it("never treats external roles as internal maintenance users", () => {
    const external = {
      ...internalUser("timan_seller", ["dealer_data"]),
      portal_role: "timan_dealer",
      dealer_number: "OWN-100",
    } as SessionUser;
    expect(canMaintainPartnerdata(external, "timan_dealer")).toBe(false);
    expect(canEditPartnerDataAccount(external, "timan_dealer", "OWN-100")).toBe(true);
    expect(canEditPartnerDataAccount(external, "timan_dealer", "OTHER-200")).toBe(false);
  });

  it("uses the same seller-scoped account resolver in Partnerdata and Mine forhandlere", () => {
    const app = fs.readFileSync("src/App.tsx", "utf8");
    const layout = fs.readFileSync("src/components/crm/CrmLayout.tsx", "utf8");
    const overview = fs.readFileSync("src/pages/crm/CrmMyDealersPage.tsx", "utf8");
    const detail = fs.readFileSync("src/pages/crm/CrmDealerDetailPage.tsx", "utf8");
    expect(app.match(/PortalAreaAccessGuard area="dealer_data"/g)).toHaveLength(2);
    expect(layout).toContain("partnerDataAreaAllowed || externalDealerDetailAllowed || hasCrmAreaAccess");
    expect(layout).toContain("!partnerDataPresentation && !canUseCrm(portalRole)");
    expect(layout).toContain("partnerDataPresentation && !hasCrmAreaAccess");
    expect(overview).toContain("if (canMaintainPartnerData)");
    expect(overview).toContain('i18n("area_dealer_data_title", uiLanguage)');
    expect(overview).toContain("partnerDataPresentation={partnerDataPresentation}");
    expect(overview).toContain("!admin && !canMaintainPartnerData");
    expect(overview).toContain("fetchDealerAccountsForSeller({ sellerId: effectiveUserId");
    expect(detail).toContain("if (seller)");
    expect(detail).toContain("sellerId: effectiveUser?.id ?? null");
  });
});
