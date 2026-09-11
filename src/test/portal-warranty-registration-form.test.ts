import { describe, expect, it } from "vitest";
import { replacementBrandsForMachine, splitPostalCity } from "@/lib/portalWarrantyRegistrationForm";
import { getPortalPermissions } from "@/lib/portalAccess";

describe("portal warranty registration form", () => {
  it("uses mutually exclusive replacement lists for the two supported machines", () => {
    expect(replacementBrandsForMachine("Timan 3330")).toContain("Kärcher");
    expect(replacementBrandsForMachine("Timan 3330")).not.toContain("AS Motor");
    expect(replacementBrandsForMachine("RC-1000s")).toContain("AS Motor");
    expect(replacementBrandsForMachine("RC-1000s")).not.toContain("Kärcher");
    expect(replacementBrandsForMachine("Tool-Trac")).toEqual([]);
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
