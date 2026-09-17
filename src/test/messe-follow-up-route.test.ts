import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasMessePortalAccess, isMesseRouteContext } from "@/lib/portalAccess";

const app = readFileSync("src/App.tsx", "utf8");
const messeHome = readFileSync("src/pages/messe/MesseHomePage.tsx", "utf8");
const co2Calculator = readFileSync("src/pages/Co2CalculatorPage.tsx", "utf8");
const driftCalculator = readFileSync("src/pages/DriftberegnerPage.tsx", "utf8");

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

  it("keeps both calculators inside the Messe guard", () => {
    expect(app).toContain('<Route path="/messe/resources/driftberegner" element={<MesseRouteGuard><DriftberegnerPage /></MesseRouteGuard>} />');
    expect(app).toContain('<Route path="/messe/resources/co2" element={<MesseRouteGuard><Co2CalculatorPage /></MesseRouteGuard>} />');
  });

  it("renders the same canonical quick actions for every allowed Messe entry path", () => {
    expect(messeHome).toContain('QUICK_ACTIONS.map((action) =>');
    expect(messeHome).not.toContain('visibleQuickActions');
    expect(messeHome).not.toContain('isDealerUser');
  });

  it("uses the Messe route context before applying the customer-only calculator fallback", () => {
    expect(isMesseRouteContext('/messe/resources/co2')).toBe(true);
    expect(isMesseRouteContext('/messe/resources/driftberegner')).toBe(true);
    expect(isMesseRouteContext('/portal/resources/co2')).toBe(false);

    for (const calculator of [co2Calculator, driftCalculator]) {
      expect(calculator).toContain("import { isMesseRouteContext } from '@/lib/portalAccess';");
      expect(calculator).toContain('const location = useLocation();');
      expect(calculator).toContain('const isMesseCalculatorSession = isMesseRouteContext(location.pathname);');
      expect(calculator).toContain("appUser.role === 'slutkunde' && !isMesseCalculatorSession");
    }
  });
});
