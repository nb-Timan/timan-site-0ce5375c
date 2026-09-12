import { describe, expect, it } from "vitest";
import {
  FISCAL_MONTH_ORDER,
  calendarMonthsForFiscalQuarter,
  currentFiscalYearForBudget,
  fiscalQuarterForCalendarMonth,
  fiscalYearForCalendarMonth,
  fiscalYearForDate,
  fiscalYearLabel,
  reorderCalendarMonthsForFiscalYear,
} from "@/lib/crmBudgetService";
import { buildLeadWorkingContributions, type CrmLead } from "@/lib/crmLeadsService";
import { pipelineProductQtyFromState, quotePipelineByMachineMonth, type ScopedConfiguration } from "@/lib/crmRelationsService";
import type { ConfiguratorState } from "@/types/configurator";

describe("CRM Budget fiscal year", () => {
  it("uses July through June and labels the fiscal year by its July start", () => {
    expect(FISCAL_MONTH_ORDER).toEqual([6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]);
    expect(reorderCalendarMonthsForFiscalYear(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]))
      .toEqual(["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"]);
    expect(fiscalYearForCalendarMonth(2026, 8)).toBe(2026);
    expect(fiscalYearForCalendarMonth(2027, 0)).toBe(2026);
    expect(fiscalYearForCalendarMonth(2027, 6)).toBe(2027);
    expect(fiscalYearForDate("2026-09-06T12:00:00Z")).toBe(2026);
    expect(fiscalYearForDate("2027-01-15T12:00:00Z")).toBe(2026);
    expect(fiscalYearLabel(2026)).toBe("2026/27");
  });

  it("maps every calendar month into Timan's fiscal quarters", () => {
    expect(calendarMonthsForFiscalQuarter(1)).toEqual([6, 7, 8]);
    expect(calendarMonthsForFiscalQuarter(2)).toEqual([9, 10, 11]);
    expect(calendarMonthsForFiscalQuarter(3)).toEqual([0, 1, 2]);
    expect(calendarMonthsForFiscalQuarter(4)).toEqual([3, 4, 5]);
    expect([6, 7, 8].map(fiscalQuarterForCalendarMonth)).toEqual([1, 1, 1]);
    expect([9, 10, 11].map(fiscalQuarterForCalendarMonth)).toEqual([2, 2, 2]);
    expect([0, 1, 2].map(fiscalQuarterForCalendarMonth)).toEqual([3, 3, 3]);
    expect([3, 4, 5].map(fiscalQuarterForCalendarMonth)).toEqual([4, 4, 4]);
  });

  it("defaults Budget to the fiscal year containing the current date", () => {
    expect(currentFiscalYearForBudget(new Date("2026-09-10T12:00:00Z"))).toBe(2026);
    expect(currentFiscalYearForBudget(new Date("2027-01-15T12:00:00Z"))).toBe(2026);
    expect(currentFiscalYearForBudget(new Date("2027-06-30T12:00:00Z"))).toBe(2026);
    expect(currentFiscalYearForBudget(new Date("2027-07-01T12:00:00Z"))).toBe(2027);
  });

  it("places working-budget leads into the same fiscal year without changing their calendar month", () => {
    const lead = {
      id: "lead-jan", lead_no: 1023, title: "January lead", move_to_working_qty: 2,
      expected_close_date: "2027-01-15", machine_types: ["RC-1000s"],
      owner_user_id: null, owner_email: "akr@timan.dk", owner_name: "AKR",
      linked_dealer_id: null, contact_information: null,
    } as unknown as CrmLead;

    expect(buildLeadWorkingContributions([lead])).toEqual(expect.arrayContaining([
      expect.objectContaining({ year: 2026, month_idx: 0, product_key: "RC-1000s", qty: 2 }),
    ]));
  });

  it("keeps September and January quotes in FY 2026/27, but starts July 2027 in FY 2027/28", () => {
    const quote = (id: string, month_iso: string): ScopedConfiguration => ({
      id,
      month_iso,
      machine_keys: ["RC-1000s"],
      machine_qty_by_key: { "RC-1000s": 1 },
      total_value: 100,
    } as unknown as ScopedConfiguration);

    const fy2026 = quotePipelineByMachineMonth([
      quote("sept", "2026-09-06T12:00:00Z"),
      quote("jan", "2027-01-15T12:00:00Z"),
      quote("next-july", "2027-07-01T12:00:00Z"),
    ], 2026)["RC-1000s"];

    expect(fy2026[8]?.qty).toBe(1);
    expect(fy2026[0]?.qty).toBe(1);
    expect(fy2026[6]?.qty).toBe(0);
  });

  it("maps loose-tool quote selections to their canonical budget products", () => {
    const products = pipelineProductQtyFromState({
      machineConfigs: [{ id: "m0", type: "LOOSE_TOOL", qty: 1, configMode: "individual", acc: [] }],
      individualUnitConfigs: { m0_1: { acc: ["LT3330_730600_3330", "LT3330_730601_3330"] } },
      accQty: {},
    } as unknown as ConfiguratorState);

    expect(products).toEqual({ T3330_730600: 1, T3330_730601: 1 });
  });
});
