import { describe, expect, it } from "vitest";

import { tProfile } from "@/lib/dealerProfileI18n";

describe("dealer profile i18n", () => {
  it("contains the sales coordinator contact role", () => {
    expect(tProfile("da", "roleSalesCoordinator")).toBe("Salgskoordinator");
    expect(tProfile("en", "roleSalesCoordinator")).toBe("Sales Coordinator");
    expect(tProfile("de", "roleSalesCoordinator")).toBe("Vertriebskoordinator");
    expect(tProfile("it", "roleSalesCoordinator")).toBe("Coordinatore vendite");
    expect(tProfile("hu", "roleSalesCoordinator")).toBe("Értékesítési koordinátor");
  });

  it("contains the parts purchasing contact role", () => {
    expect(tProfile("da", "rolePartsPurchasing")).toBe("Indkøb / reservedele");
    expect(tProfile("en", "rolePartsPurchasing")).toBe("Purchasing / spare parts");
    expect(tProfile("de", "rolePartsPurchasing")).toBe("Einkauf / Ersatzteile");
    expect(tProfile("it", "rolePartsPurchasing")).toBe("Acquisti / ricambi");
    expect(tProfile("hu", "rolePartsPurchasing")).toBe("Beszerzés / alkatrészek");
  });
});
