import type { CrmLead } from "@/lib/crmLeadsService";
import { calculateMachineInterestEstimate } from "@/lib/leadToConfiguratorDraft";

export type LeadPipelineValueReason =
  | "estimated_value"
  | "machine_types_price"
  | "zero_unmapped_or_group_only_machine_types"
  | "zero_no_value_or_machine_types";

export function parsePipelineNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getLeadPipelineValue(
  lead: Pick<CrmLead, "estimated_value" | "machine_types">,
): number {
  const savedValue = parsePipelineNumber(lead.estimated_value);
  if (savedValue > 0) return Math.round(savedValue);

  const machineEstimate = calculateMachineInterestEstimate(lead.machine_types, "da").total;
  return machineEstimate > 0 ? machineEstimate : 0;
}

export function getLeadPipelineValueSnapshot(
  lead: Pick<CrmLead, "estimated_value" | "machine_types">,
): { value: number; reason: LeadPipelineValueReason; updatedAt: string } {
  const savedValue = parsePipelineNumber(lead.estimated_value);
  if (savedValue > 0) {
    return {
      value: Math.round(savedValue),
      reason: "estimated_value",
      updatedAt: new Date().toISOString(),
    };
  }

  const machineEstimate = calculateMachineInterestEstimate(lead.machine_types, "da").total;
  if (machineEstimate > 0) {
    return {
      value: machineEstimate,
      reason: "machine_types_price",
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    value: 0,
    reason: (lead.machine_types || []).length > 0
      ? "zero_unmapped_or_group_only_machine_types"
      : "zero_no_value_or_machine_types",
    updatedAt: new Date().toISOString(),
  };
}
