import { describe, expect, it } from "vitest";
import {
  PORTAL_WARRANTY_MACHINE_TYPES,
  PORTAL_WARRANTY_REPLACEMENT_BRANDS,
  replacementBrandsForMachine,
  splitPostalCity,
} from "@/lib/portalWarrantyRegistrationForm";
import { getPortalPermissions } from "@/lib/portalAccess";

describe("portal warranty registration form", () => {
  it("uses the canonical five-machine list, including Timan 2620", () => {
    expect(PORTAL_WARRANTY_MACHINE_TYPES).toEqual([
      "Timan 3330", "RC-1000s", "Tool-Trac", "RC-751", "Timan 2620",
    ]);
    expect(new Set(PORTAL_WARRANTY_MACHINE_TYPES).size).toBe(PORTAL_WARRANTY_MACHINE_TYPES.length);
  });

  it("uses the same approved replacement-brand choices for every warranty machine", () => {
    const expected = ["Nej", "Timan", "Kärcher", "Vitra", "Egholm", "Hako", "Fort", "Andet"];

    expect(PORTAL_WARRANTY_REPLACEMENT_BRANDS).toEqual(expected);
    expect(new Set(PORTAL_WARRANTY_REPLACEMENT_BRANDS).size).toBe(expected.length);
    for (const machine of PORTAL_WARRANTY_MACHINE_TYPES) {
      expect(replacementBrandsForMachine(machine)).toEqual(expected);
    }
    expect(replacementBrandsForMachine("Unknown machine")).toEqual([]);
  });

  it("splits the existing combined postal/city field for the server register", () => {
    expect(splitPostalCity("7700 Thisted")).toEqual({ postalCode: "7700", city: "Thisted" });
  });

  it("only grants portal warranty creation to the dealer role", () => {
    expect(getPortalPermissions("timan_dealer").canCreateWarranty).toBe(true);
    expect(getPortalPermissions("timan_importer").canCreateWarranty).toBe(false);
    expect(getPortalPermissions("timan_service_partner").canCreateWarranty).toBe(false);
  });
});
