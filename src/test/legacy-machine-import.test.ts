import { describe, expect, it } from "vitest";
import { classifyLegacyMachineRows, type LegacyMachineImportRow } from "@/lib/legacyMachineImportService";

const row = (overrides: Partial<LegacyMachineImportRow>): LegacyMachineImportRow => ({
  warrantyNumber: null,
  serial: "UH9712X02TM2T1228",
  model: "Timan 3330",
  dealerNumber: "10131",
  dealerName: "WJ Maskinservice A/S",
  deliveryDate: "2026-02-17",
  hours: null,
  latestActivityAt: null,
  history: null,
  ...overrides,
});

describe("legacy machine import preview", () => {
  it("only accepts an exact normalized serial match as an existing machine", () => {
    const [result] = classifyLegacyMachineRows([row({ serial: "uh9712x02tm2t1228" })], {
      existingSerials: ["UH9712X02TM2T1228"],
      activeDealerNumbers: ["10131"],
      mappedDealerNumbers: [],
    });
    expect(result).toMatchObject({ status: "duplicate", statusLabel: "Maskine findes allerede" });
  });

  it("keeps duplicate file rows and missing dealer numbers out of import", () => {
    const results = classifyLegacyMachineRows([row({}), row({ serial: " UH9712X02TM2T1228 " }), row({ serial: "OTHER", dealerNumber: null })], {
      existingSerials: [], activeDealerNumbers: ["10131"], mappedDealerNumbers: [],
    });
    expect(results.map((result) => result.status)).toEqual(["matched", "error", "error"]);
    expect(results[2].statusLabel).toBe("Mangler forhandler nr.");
  });

  it("marks historical dealer mappings distinctly from direct active dealer matches", () => {
    const [result] = classifyLegacyMachineRows([row({ dealerNumber: "90001" })], {
      existingSerials: [], activeDealerNumbers: [], mappedDealerNumbers: ["90001"],
    });
    expect(result).toMatchObject({ status: "mapped", statusLabel: "Matchet via historisk mapping" });
  });
});
