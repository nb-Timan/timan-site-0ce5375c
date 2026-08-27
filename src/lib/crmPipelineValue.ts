import type { CrmLead } from "@/lib/crmLeadsService";
import { calculateMachineInterestEstimate } from "@/lib/leadToConfiguratorDraft";

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
