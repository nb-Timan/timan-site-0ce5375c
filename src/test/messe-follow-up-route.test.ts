import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasMessePortalAccess } from "@/lib/portalAccess";

const app = readFileSync("src/App.tsx", "utf8");
const messeHome = readFileSync("src/pages/messe/MesseHomePage.tsx", "utf8");

describe("Messe follow-up quick action", () => {
  it("keeps the card on the canonical follow-up route", () => {
    expect(messeHome).toContain("{ to: '/messe/follow-up', icon: ClipboardList");
  });

  it("uses the normal Messe access guard instead of redirecting external Messe roles", () => {
    expect(app).toContain('<Route path="/messe/follow-up" element={<MesseRouteGuard><MesseFollowUpPage /></MesseRouteGuard>} />');
    expect(app).not.toContain('<Route path="/messe/follow-up" element={<MesseRouteGuard blockDealerUser>');
  });

  it("keeps the normal Messe access decision for a dealer with the Messe module", () => {
    expect(hasMessePortalAccess({
      portal_role: "timan_dealer",
      allowed_modules: ["messe_portal"],
      module_access: [],
      portal_variant: "standard",
    } as never)).toBe(true);
  });

  it("does not alter the existing calculator routes", () => {
    expect(app).toContain('path="/messe/resources/driftberegner"');
    expect(app).toContain('path="/messe/resources/co2"');
  });
});
