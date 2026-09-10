import { describe, expect, it } from "vitest";
import { ROLE_KEYS_WORKSHOP, roleKeysForContactArea } from "@/lib/dealerContactModel";
import { tProfile } from "@/lib/dealerProfileI18n";

describe("dealer contact role model", () => {
  it("offers the full canonical workshop and service role list", () => {
    expect(ROLE_KEYS_WORKSHOP).toEqual([
      "roleWorkshop",
      "roleWorkshopResponsible",
      "roleWorkshopManager",
      "roleServiceManager",
      "roleServiceTechnician",
      "roleMechanic",
      "roleServiceCoord",
      "rolePartsManager",
      "rolePartsOrderer",
      "roleOther",
    ]);
    expect(roleKeysForContactArea("workshop")).toBe(ROLE_KEYS_WORKSHOP);
  });

  it("translates the added workshop roles", () => {
    expect(tProfile("da", "roleWorkshop")).toBe("Værksted");
    expect(tProfile("da", "roleWorkshopResponsible")).toBe("Værkstedsansvarlig");
    expect(tProfile("da", "rolePartsOrderer")).toBe("Reservedelsbestiller");
    expect(tProfile("en", "rolePartsOrderer")).toBe("Parts Orderer");
    expect(tProfile("de", "rolePartsOrderer")).toBe("Ersatzteilbesteller");
  });
});
