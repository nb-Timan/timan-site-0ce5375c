import { describe, expect, it } from "vitest";
import {
  dealerDashboardPrototypeRows,
  filterDealerDashboardRows,
  prototypeScopeForSeller,
  salesLabelForDashboardRow,
  totalDiscountPct,
} from "@/lib/crmDealerDashboardPrototype";

const baseFilters = {
  from: "",
  to: "",
  fromYear: "2021",
  toYear: "2026",
  countries: [],
  sellers: [],
  dealers: [],
  customers: [],
  machines: [],
  partnerType: "all",
  currency: "both" as const,
};

describe("dealer dashboard local prototype", () => {
  it("ships a realistic local-only data set", () => {
    expect(dealerDashboardPrototypeRows).toHaveLength(72);
    expect(new Set(dealerDashboardPrototypeRows.map((row) => row.seller))).toEqual(new Set(["AKR", "EM", "BP", "JTN"]));
    expect(new Set(dealerDashboardPrototypeRows.map((row) => row.currency))).toEqual(new Set(["DKK", "EUR"]));
  });

  it("applies country, seller, machine, date and currency through one filter model", () => {
    const rows = filterDealerDashboardRows(dealerDashboardPrototypeRows, {
      ...baseFilters,
      from: "2024-01-01",
      to: "2025-12-31",
      countries: ["Tyskland"],
      sellers: ["AKR"],
      machines: ["Timan 3330"],
      currency: "EUR",
    }, "backend");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.country === "Tyskland" && row.seller === "AKR" && row.machine === "Timan 3330" && row.currency === "EUR")).toBe(true);
  });

  it("uses full year boundaries only when concrete dates are not selected", () => {
    const rows = filterDealerDashboardRows(dealerDashboardPrototypeRows, {
      ...baseFilters,
      fromYear: "2024",
      toYear: "2024",
    }, "backend");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.date.startsWith("2024-"))).toBe(true);
  });

  it("prioritizes concrete dates over the selected years", () => {
    const rows = filterDealerDashboardRows(dealerDashboardPrototypeRows, {
      ...baseFilters,
      from: "2025-01-01",
      to: "2025-12-31",
      fromYear: "2021",
      toYear: "2026",
    }, "backend");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.date.startsWith("2025-"))).toBe(true);
  });

  it("simulates AKR seller scope without changing any live permission", () => {
    const rows = filterDealerDashboardRows(dealerDashboardPrototypeRows, baseFilters, "seller");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.seller === "AKR")).toBe(true);
  });

  it("locks a JTN seller view to JTN data rather than the AKR prototype fallback", () => {
    expect(prototypeScopeForSeller("JTN")).toBe("jtn_seller");
    const rows = filterDealerDashboardRows(dealerDashboardPrototypeRows, baseFilters, "jtn_seller");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.seller === "JTN")).toBe(true);
  });

  it("keeps partner scopes inside their local canonical relation allow-list", () => {
    const importerRows = filterDealerDashboardRows(dealerDashboardPrototypeRows, baseFilters, "importer_avistech");
    expect(importerRows.length).toBeGreaterThan(0);
    expect(importerRows.every((row) => ["AVISTECH SRO", "Weimer & Hollar", "Hummelmühle-Lockwitz"].includes(row.dealer))).toBe(true);

    const serviceRows = filterDealerDashboardRows(dealerDashboardPrototypeRows, baseFilters, "service_nordic");
    expect(serviceRows.length).toBeGreaterThan(0);
    expect(serviceRows.every((row) => ["Nordic Mower AB", "Lyngfeldt"].includes(row.dealer))).toBe(true);
  });

  it("does not let a filter expand an already restricted scope", () => {
    const rows = filterDealerDashboardRows(dealerDashboardPrototypeRows, {
      ...baseFilters,
      dealers: ["Fora GmbH Zeven"],
    }, "dealer_wj");
    expect(rows).toEqual([]);
  });

  it("uses partner sales contacts or an explicit missing-information label in partner scopes", () => {
    const wjRow = dealerDashboardPrototypeRows.find((row) => row.dealer === "WJ Maskinservice");
    const avistechRow = dealerDashboardPrototypeRows.find((row) => row.dealer === "AVISTECH SRO");
    expect(wjRow).toBeDefined();
    expect(avistechRow).toBeDefined();
    expect(salesLabelForDashboardRow(wjRow!, "dealer_wj")).toBe("Info mangler");
    expect(["Petra Novák", "Marek Svoboda"]).toContain(salesLabelForDashboardRow(avistechRow!, "importer_avistech"));
  });

  it("keeps the discount breakdown additive for display", () => {
    const row = dealerDashboardPrototypeRows[0];
    expect(totalDiscountPct(row)).toBe(row.standardDiscountPct + row.extraDiscountPct + row.paymentDeliveryDiscountPct);
  });
});
