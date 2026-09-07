import { describe, expect, it } from "vitest";
import { filterMachineOverview, sortMachineOverview } from "@/lib/machineOverviewFilters";
import type { MachineOverviewRow } from "@/lib/machineJournalService";

const machine = (serial: string, overrides: Partial<MachineOverviewRow> = {}): MachineOverviewRow => ({
  serial, normalizedSerial: serial, machineModel: "Tool-Trac", machineType: "Tool-Trac",
  dealerName: "A. Flensborg A/S", dealerNumber: "101", deliveryDate: "2018-01-01",
  operatingHours: 10, latestActivityDate: "2020-01-01", latestActivityLabel: null,
  sources: ["warranty"], openTickets: 0, openClaims: 0, openTsb: 0, health: "healthy",
  warrantyId: "SP-1", warrantyIdNumeric: 1, warrantyType: "normal", ...overrides,
});

describe("machine overview filtering and sorting", () => {
  it("uses the structured warranty type when filtering historical imports", () => {
    const rows = [machine("SP", { warrantyType: "normal" }), machine("MO", { warrantyType: "historical", warrantyId: "MO-1" })];
    expect(filterMachineOverview(rows, { warrantyType: "historical" }).map((row) => row.serial)).toEqual(["MO"]);
  });

  it("sorts the whole filtered result before pagination can slice it", () => {
    const rows = [machine("NEW", { deliveryDate: "2024-01-01" }), machine("OLD", { deliveryDate: "2017-01-01" }), machine("MID", { deliveryDate: "2020-01-01" })];
    const sorted = sortMachineOverview(rows, "delivery", "asc");
    expect(sorted.map((row) => row.serial)).toEqual(["OLD", "MID", "NEW"]);
    expect(sorted.slice(0, 2).map((row) => row.serial)).toEqual(["OLD", "MID"]);
  });

  it("keeps blank delivery dates and hours stable at the end", () => {
    const rows = [machine("BLANK", { deliveryDate: null, operatingHours: null }), machine("VALUE", { deliveryDate: "2020-01-01", operatingHours: 100 })];
    expect(sortMachineOverview(rows, "delivery", "desc").map((row) => row.serial)).toEqual(["VALUE", "BLANK"]);
    expect(sortMachineOverview(rows, "hours", "desc").map((row) => row.serial)).toEqual(["VALUE", "BLANK"]);
  });

  it("combines dealer, model, date, warranty type, and serial search", () => {
    const rows = [machine("MATCH", { warrantyType: "historical", deliveryDate: "2018-06-01" }), machine("OTHER", { warrantyType: "normal" })];
    expect(filterMachineOverview(rows, { query: "mat", dealerQuery: "flens", model: "Tool-Trac", warrantyType: "historical", dateFrom: "2018-01-01", dateTo: "2018-12-31" }).map((row) => row.serial)).toEqual(["MATCH"]);
  });
});
