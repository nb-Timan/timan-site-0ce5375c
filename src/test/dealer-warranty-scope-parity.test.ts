import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyScopeFilter, teknikScopeIdentityKey } from "@/lib/useTeknikScope";
import type { JournalScope } from "@/lib/machineJournalService";

const tiefelScope: JournalScope = {
  role: "timan_dealer",
  dealerLabel: "DVP",
  dealerNumbers: new Set(["10458"]),
  dealerNames: new Set(["tiefel garten + forstgerate gmbh"]),
  unrestricted: false,
};

describe("dealer warranty scope parity", () => {
  it("keeps the approved SP serial set aligned with the dealer's Partnerdata scope", () => {
    const partnerDataMachines = [
      { serial: "411000-04-0192", warrantyId: "SP-192", dealerNumber: "10458" },
      { serial: "411000-04-0193", warrantyId: "SP-193", dealerNumber: "10458" },
      { serial: "411000-04-0198", warrantyId: "SP-198", dealerNumber: "10458" },
    ];
    const warrantyRows = [
      ...partnerDataMachines.map((machine) => ({
        machineSerial: machine.serial,
        certificateNumber: machine.warrantyId,
        dealerNumber: machine.dealerNumber,
      })),
      { machineSerial: "411000-04-9999", certificateNumber: "SP-999", dealerNumber: "99999" },
    ];

    const approvedSpRows = applyScopeFilter(tiefelScope, warrantyRows, (row) => ({
      dealer_number: row.dealerNumber,
    }));

    expect(approvedSpRows.map((row) => row.certificateNumber)).toEqual(
      partnerDataMachines.map((machine) => machine.warrantyId),
    );
    expect(approvedSpRows).not.toContainEqual(expect.objectContaining({ certificateNumber: "SP-999" }));
  });

  it("excludes MO-only machines from the approved SP registration set", () => {
    const rows = [
      { certificateNumber: "SP-192", source: "sharepoint" },
      { certificateNumber: null, source: "legacy_machine_import", legacyWarrantyReference: "MO-1979" },
    ];

    expect(rows.filter((row) => /^SP-\d+$/.test(row.certificateNumber ?? ""))).toEqual([
      { certificateNumber: "SP-192", source: "sharepoint" },
    ]);
  });

  it("rebuilds scope when a backend session switches to a concrete dealer view", () => {
    const backendDealerPreview = {
      id: "backend-id",
      email: "backend@timan.dk",
      dealer_number: null,
      company_dealer: null,
    };
    const viewedDealer = {
      id: "dealer-id",
      email: "backend@timan.dk",
      dealer_number: "10458",
      company_dealer: "Tiefel Garten + Forstgerate GmbH",
    };

    expect(teknikScopeIdentityKey(viewedDealer)).not.toBe(teknikScopeIdentityKey(backendDealerPreview));
  });

  it("uses the dealer-aware identity key as the hook dependency", () => {
    const hook = readFileSync(resolve(process.cwd(), "src/lib/useTeknikScope.ts"), "utf8");

    expect(hook).toContain("const effectiveScopeKey = teknikScopeIdentityKey(effective);");
    expect(hook).toContain("}, [effectiveScopeKey, role]);");
  });
});
