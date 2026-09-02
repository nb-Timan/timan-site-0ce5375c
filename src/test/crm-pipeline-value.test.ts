import { describe, expect, it } from "vitest";
import { calculateMachineInterestEstimate } from "@/lib/leadToConfiguratorDraft";
import { getLeadPipelineValue, getLeadPipelineValueSnapshot, parsePipelineNumber } from "@/lib/crmPipelineValue";
import type { CrmLead } from "@/lib/crmLeadsService";

function lead(input: Partial<CrmLead>): Pick<CrmLead, "estimated_value" | "machine_types"> {
  return {
    estimated_value: input.estimated_value ?? null,
    machine_types: input.machine_types ?? [],
  };
}

function previousDashboardRule(input: Pick<CrmLead, "estimated_value" | "machine_types">): number {
  const savedValue = parsePipelineNumber(input.estimated_value);
  if (savedValue > 0) return Math.round(savedValue);

  const machineEstimate = calculateMachineInterestEstimate(input.machine_types, "da").total;
  return machineEstimate > 0 ? machineEstimate : 0;
}

describe("getLeadPipelineValue", () => {
  it("uses explicit estimated_value before machine prices", () => {
    const row = lead({ estimated_value: 123_456, machine_types: ["RC-751"] });
    expect(getLeadPipelineValue(row)).toBe(123_456);
    expect(getLeadPipelineValue(row)).toBe(previousDashboardRule(row));
  });

  it("uses known machine type price when estimated_value is missing", () => {
    const row = lead({ estimated_value: null, machine_types: ["RC-751"] });
    expect(getLeadPipelineValue(row)).toBe(167_500);
    expect(getLeadPipelineValue(row)).toBe(previousDashboardRule(row));
  });

  it("adds multiple known machine types", () => {
    const row = lead({ machine_types: ["RC-751", "Timan 3330"] });
    expect(getLeadPipelineValue(row)).toBe(529_200);
    expect(getLeadPipelineValue(row)).toBe(previousDashboardRule(row));
  });

  it("calculates a partial estimate from securely matched item numbers and ignores unmatched items", () => {
    const estimate = calculateMachineInterestEstimate([
      "RC-1000S",
      "Equipment: RC-1000S - Standardöl - Texaco HDZ46 (13101003)",
      "Equipment: RC-1000S - Schlegelmäher inkl. Y-Schlegel-Set (410910)",
      "Equipment: RC-1000S - Ständer zum Abstellen des Schlegelmähers (411701)",
      "Equipment: RC-1000S - Fingerbalkenmäher 1700 mm (411800)",
      "Equipment: RC-1000S - Hakenplatte für Ausrüstung (411891)",
      "Equipment: RC-1000S - Heckgewicht (411906)",
      "Equipment: RC-1000S - Ukendt specialredskab (999999)",
    ], "da");

    expect(estimate.total).toBe(346_220);
    expect(estimate.pricedItems).toHaveLength(7);
    expect(estimate.unmappedItems).toEqual([
      "Equipment: RC-1000S - Ukendt specialredskab (999999)",
    ]);
  });

  it("returns 0 for unknown or missing machine types", () => {
    expect(getLeadPipelineValue(lead({ machine_types: ["Unknown machine"] }))).toBe(0);
    expect(getLeadPipelineValue(lead({ machine_types: [] }))).toBe(0);
  });

  it("keeps the old dashboard number parsing behavior", () => {
    const row = {
      estimated_value: "1.234,50 kr.",
      machine_types: ["RC-751"],
    } as unknown as Pick<CrmLead, "estimated_value" | "machine_types">;

    expect(getLeadPipelineValue(row)).toBe(previousDashboardRule(row));
    expect(getLeadPipelineValue(row)).toBe(1235);
  });

  it("describes why the snapshot value was selected", () => {
    expect(getLeadPipelineValueSnapshot(lead({ estimated_value: 100, machine_types: ["RC-751"] }))).toMatchObject({
      value: 100,
      reason: "estimated_value",
    });
    expect(getLeadPipelineValueSnapshot(lead({ machine_types: ["RC-751"] }))).toMatchObject({
      value: 167_500,
      reason: "machine_types_price",
    });
    expect(getLeadPipelineValueSnapshot(lead({ machine_types: ["Full Line"] }))).toMatchObject({
      value: 0,
      reason: "zero_unmapped_or_group_only_machine_types",
    });
  });
});
