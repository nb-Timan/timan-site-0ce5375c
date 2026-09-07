import { describe, expect, it } from "vitest";
import { classifyLegacyMachineRows, hasLegacySalesData, parseLegacySalesNumber, toCommercialAmount, type LegacyMachineImportRow } from "@/lib/legacyMachineImportService";

const row = (overrides: Partial<LegacyMachineImportRow>): LegacyMachineImportRow => ({
  warrantyNumber: null,
  erpOrderNumber: null,
  invoiceNumber: null,
  revenue: null,
  sourceRevenueAmount: null,
  costAmount: null,
  contributionMarginAmount: null,
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

  it("recognises ERP and financial columns as sales enrichment, not a warranty", () => {
    expect(hasLegacySalesData([row({
      warrantyNumber: "MO-091",
      erpOrderNumber: "135244",
      invoiceNumber: "133831",
      revenue: "177590.00",
      sourceRevenueAmount: "-177590.00",
      costAmount: "-129631.34",
      contributionMarginAmount: "47958.66",
    })])).toBe(true);
  });

  it("normalises ERP source signs to positive revenue and cost amounts", () => {
    expect(toCommercialAmount("-177590.00")).toBe(177590);
    expect(toCommercialAmount("-129631.34")).toBe(129631.34);
    expect(parseLegacySalesNumber("47958.66")).toBe(47958.66);
  });
});
