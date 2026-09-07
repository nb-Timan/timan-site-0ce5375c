export type WarrantyMatchStatus = "approved" | "needs_clarification" | "missing_warranty_and_dealer";

export function resolveWarrantyMatchStatus(input: {
  hasCanonicalWarranty: boolean;
  hasActiveDealer: boolean;
}): WarrantyMatchStatus {
  if (input.hasCanonicalWarranty && input.hasActiveDealer) return "approved";
  if (!input.hasCanonicalWarranty && !input.hasActiveDealer) return "missing_warranty_and_dealer";
  return "needs_clarification";
}

export const warrantyMatchStatusCopy: Record<WarrantyMatchStatus, { label: string; history: string }> = {
  approved: { label: "Godkendt", history: "Garantiregistrering godkendt" },
  needs_clarification: { label: "Kræver afklaring", history: "Mangler garantiregistrering" },
  missing_warranty_and_dealer: {
    label: "Mangler garanti og aktiv forhandler",
    history: "Mangler garantiregistrering og aktiv forhandler",
  },
};
