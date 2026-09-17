import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyScopeFilter } from "@/lib/useTeknikScope";
import type { JournalScope } from "@/lib/machineJournalService";

const servicePage = readFileSync("src/pages/ServiceMaintenancePage.tsx", "utf8");
const serviceClient = readFileSync("src/lib/serviceMaintenanceService.ts", "utf8");

const tiefelScope: JournalScope = {
  role: "timan_dealer",
  dealerLabel: "DVP",
  dealerNumbers: new Set(["10458"]),
  dealerNames: new Set(["tiefel garten + forstgeräte gmbh"]),
  unrestricted: false,
};

describe("Service maintenance effective dealer scope", () => {
  it("keeps the Tiefel machine population aligned to its canonical dealer scope", () => {
    const serviceMachines = [
      { serial: "411000-04-0192", dealer_number: "10458", dealer_name: "Tiefel Garten + Forstgeräte GmbH" },
      { serial: "185000-11-1222", dealer_number: "10100", dealer_name: "Lyngfeldt A/S" },
    ];

    const visible = applyScopeFilter(tiefelScope, serviceMachines, (machine) => machine);

    expect(visible).toEqual([serviceMachines[0]]);
    expect(visible).not.toContainEqual(expect.objectContaining({ dealer_name: "Lyngfeldt A/S" }));
  });

  it("uses effective dealer-number requests instead of an unfiltered Backend read during View-as", () => {
    expect(serviceClient).toContain("listServiceMachinesForDealerNumbers");
    expect(serviceClient).toContain("listServiceRegistrationsForDealerNumbers");
    expect(serviceClient).toContain("for (const dealerNumber of numbers)");
    expect(servicePage).toContain("const { scope: teknikScope, loading: resolvingTeknikScope } = useTeknikScope();");
    expect(servicePage).toContain("listServiceMachinesForDealerNumbers(scopedDealerNumbers, machineFilters)");
    expect(servicePage).toContain("listServiceRegistrationsForDealerNumbers(scopedDealerNumbers)");
  });

  it("clears stale Backend rows and scopes machine history and autocomplete after a View-as switch", () => {
    expect(servicePage).toContain("setMachines([]);");
    expect(servicePage).toContain("setRegistrations([]);");
    expect(servicePage).toContain("}, [effectiveScopeIdentity]);");
    expect(servicePage).toContain("setMachineSuggestions(applyScopeFilter(teknikScope, rows");
    expect(servicePage).toContain("listServiceRegistrationsForDealerNumbers(scopedDealerNumbers, { serialNumber: m.serial_number })");
  });

  it("retains the manual serial path without turning it into global machine browse", () => {
    expect(servicePage).toContain("searchServiceMachines(query, form.dealer_number || null)");
    expect(serviceClient).toContain("if (!normalized) return [];");
    expect(serviceClient).toContain("p_dealer_account_number: dealerNumber || null");
  });
});
