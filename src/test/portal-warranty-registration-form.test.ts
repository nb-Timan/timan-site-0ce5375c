import { describe, expect, it } from "vitest";
import {
  PORTAL_WARRANTY_MACHINE_TYPES,
  PORTAL_WARRANTY_REPLACEMENT_BRANDS,
  replacementBrandsForMachine,
  splitPostalCity,
} from "@/lib/portalWarrantyRegistrationForm";
import { getPortalPermissions } from "@/lib/portalAccess";
import { WARRANTY_CREATE_ROUTE } from "@/lib/warrantyRoutes";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

  it("keeps warranty creation aligned with the existing role permissions", () => {
    expect(getPortalPermissions("timan_dealer").canCreateWarranty).toBe(true);
    expect(getPortalPermissions("timan_backend").canCreateWarranty).toBe(true);
    expect(getPortalPermissions("timan_service").canCreateWarranty).toBe(true);
    expect(getPortalPermissions("timan_importer").canCreateWarranty).toBe(false);
    expect(getPortalPermissions("timan_service_partner").canCreateWarranty).toBe(false);
  });

  it("keeps one dealer warranty-create entry in the warranty navigation", () => {
    const dashboard = readFileSync(
      join(process.cwd(), "src/components/warranty/WarrantyDashboardBody.tsx"),
      "utf8",
    );
    const navigation = readFileSync(
      join(process.cwd(), "src/components/warranty/WarrantyAdminSidebarLayout.tsx"),
      "utf8",
    );

    expect(dashboard).not.toContain("WARRANTY_CREATE_ROUTE");
    expect(navigation).toContain("to: WARRANTY_CREATE_ROUTE");
    expect(navigation).toContain("match: WARRANTY_CREATE_ROUTE");
  });

  it("does not duplicate the sidebar create entry in the registrations header", () => {
    const page = readFileSync(join(process.cwd(), "src/pages/WarrantyPage.tsx"), "utf8");
    expect(page).toContain("showCreate={false}");
  });

  it("allows every existing warranty-create permission through the canonical route", () => {
    const page = readFileSync(join(process.cwd(), "src/pages/WarrantyPage.tsx"), "utf8");
    expect(page).toContain('if (page === "new" && !canCreate)');
    expect(page).not.toContain('variant !== "dealer" || !canCreate');
  });

  it("routes every warranty-create entry through the single canonical page", () => {
    const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
    const quickActions = readFileSync(join(process.cwd(), "src/components/portal/QuickActions.tsx"), "utf8");
    const registrations = readFileSync(join(process.cwd(), "src/components/warranty/WarrantyRegistrationsTable.tsx"), "utf8");
    const page = readFileSync(join(process.cwd(), "src/pages/WarrantyPage.tsx"), "utf8");

    expect(WARRANTY_CREATE_ROUTE).toBe("/portal/service/warranty/new");
    expect(app).toContain("path={WARRANTY_CREATE_ROUTE}");
    expect(quickActions.match(/to: WARRANTY_CREATE_ROUTE/g)).toHaveLength(2);
    expect(registrations).toContain("to={WARRANTY_CREATE_ROUTE}");
    expect(page).toContain("<WarrantyNewForm");
  });
});
