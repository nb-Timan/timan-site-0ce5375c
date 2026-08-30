import { describe, expect, it } from "vitest";

import { tProfile } from "@/lib/dealerProfileI18n";

describe("dealer profile i18n", () => {
  it("contains the reorganized contact section labels", () => {
    expect(tProfile("da", "sec1")).toBe("Firma & ledelse");
    expect(tProfile("da", "sec2")).toBe("Økonomi");
    expect(tProfile("da", "sec3")).toBe("Indkøb & logistik");
    expect(tProfile("da", "sec4")).toBe("Salg");
    expect(tProfile("da", "sec5")).toBe("Værksted & service");
    expect(tProfile("da", "sec6")).toBe("Marketing");
  });

  it("contains the sales coordinator contact role", () => {
    expect(tProfile("da", "roleSalesCoordinator")).toBe("Salgskoordinator");
    expect(tProfile("en", "roleSalesCoordinator")).toBe("Sales Coordinator");
    expect(tProfile("de", "roleSalesCoordinator")).toBe("Vertriebskoordinator");
    expect(tProfile("it", "roleSalesCoordinator")).toBe("Coordinatore vendite");
    expect(tProfile("hu", "roleSalesCoordinator")).toBe("Értékesítési koordinátor");
  });

  it("contains the sales manager contact role", () => {
    expect(tProfile("da", "roleSalesManager")).toBe("Salgschef");
    expect(tProfile("en", "roleSalesManager")).toBe("Sales Manager");
    expect(tProfile("de", "roleSalesManager")).toBe("Verkaufsleiter");
    expect(tProfile("it", "roleSalesManager")).toBe("Responsabile vendite");
    expect(tProfile("hu", "roleSalesManager")).toBe("Értékesítési vezető");
  });

  it("contains the parts purchasing contact role", () => {
    expect(tProfile("da", "rolePartsPurchasing")).toBe("Indkøb / reservedele");
    expect(tProfile("en", "rolePartsPurchasing")).toBe("Purchasing / spare parts");
    expect(tProfile("de", "rolePartsPurchasing")).toBe("Einkauf / Ersatzteile");
    expect(tProfile("it", "rolePartsPurchasing")).toBe("Acquisti / ricambi");
    expect(tProfile("hu", "rolePartsPurchasing")).toBe("Beszerzés / alkatrészek");
  });

  it("contains purchasing and logistics contact roles", () => {
    expect(tProfile("da", "rolePurchasingManager")).toBe("Indkøbsansvarlig");
    expect(tProfile("da", "rolePurchaser")).toBe("Indkøber");
    expect(tProfile("da", "roleLogisticsManager")).toBe("Logistikansvarlig");
    expect(tProfile("da", "roleLogisticsCoordinator")).toBe("Logistikkoordinator");
  });

  it("contains move and duplicate contact labels", () => {
    expect(tProfile("da", "movePerson")).toBe("Flyt person");
    expect(tProfile("da", "duplicatePerson")).toBe("Duplikér person");
    expect(tProfile("en", "movePersonHelp")).toBe("Name, e-mail and phone are kept. The role is reset.");
    expect(tProfile("en", "duplicatePersonHelp")).toBe("The original is kept. The role in the new department is reset.");
  });
});
