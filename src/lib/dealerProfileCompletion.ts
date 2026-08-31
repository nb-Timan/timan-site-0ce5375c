/**
 * Computes completion status for the self-service dealer profile.
 * A section is "complete" when all required fields are non-empty.
 */
import type { DealerAccount } from "@/lib/dealerAccountsService";

export type SectionKey = "company" | "finance" | "purchasing" | "sales" | "workshop" | "marketing";

export interface SectionStatus {
  key: SectionKey;
  required: number;
  filled: number;
  complete: boolean;
}

export interface ProfileCompletion {
  totalSteps: number;
  completedSteps: number;
  missingSteps: number;
  percentage: number;
  sections: SectionStatus[];
}

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function hasCoordinates(d: DealerAccount | null): boolean {
  return typeof d?.latitude === "number" && typeof d?.longitude === "number";
}

/** Required field map per section. Optional fields are excluded from required-count. */
function requiredFields(d: DealerAccount | null): Record<SectionKey, string[]> {
  return {
    company: [
      d?.company_name ?? "",
      d?.address_line_1 ?? "",
      d?.postal_code ?? "",
      d?.city ?? "",
      d?.country ?? "",
      d?.vat_number ?? "",
      d?.director_name ?? "",
      hasCoordinates(d) ? "koordinater" : "",
    ],
    finance: [
      d?.finance_contact_name ?? "",
      d?.finance_contact_email ?? "",
      d?.invoice_email ?? "",
    ],
    purchasing: [],
    sales: [
      d?.sales_contact_name ?? "",
      d?.sales_contact_email ?? "",
    ],
    workshop: [
      d?.workshop_contact_name ?? "",
      d?.workshop_contact_email ?? "",
    ],
    marketing: [
      d?.marketing_contact_name ?? "",
      d?.marketing_contact_email ?? "",
    ],
  };
}

export function computeCompletion(d: DealerAccount | null): ProfileCompletion {
  const required = requiredFields(d);
  const sections: SectionStatus[] = (Object.keys(required) as SectionKey[]).map((key) => {
    const vals = required[key];
    const filled = vals.filter(nonEmpty).length;
    return { key, required: vals.length, filled, complete: filled === vals.length };
  });
  const completedSteps = sections.filter((s) => s.complete).length;
  const totalSteps = sections.length;
  return {
    totalSteps,
    completedSteps,
    missingSteps: totalSteps - completedSteps,
    percentage: Math.round((completedSteps / totalSteps) * 100),
    sections,
  };
}
