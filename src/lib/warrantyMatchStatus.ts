export type WarrantyMatchStatus = "approved" | "needs_clarification" | "missing_warranty_and_dealer";
export type WarrantyMatchDetail = "approved" | "missing_active_dealer" | "missing_warranty_registration" | "missing_warranty_and_active_dealer";

export function resolveWarrantyMatchStatus(input: {
  hasCanonicalWarranty: boolean;
  hasActiveDealer: boolean;
}): WarrantyMatchStatus {
  if (input.hasCanonicalWarranty && input.hasActiveDealer) return "approved";
  if (!input.hasCanonicalWarranty && !input.hasActiveDealer) return "missing_warranty_and_dealer";
  return "needs_clarification";
}

export function resolveWarrantyMatchDetail(input: {
  hasCanonicalWarranty: boolean;
  hasActiveDealer: boolean;
}): WarrantyMatchDetail {
  if (input.hasCanonicalWarranty && input.hasActiveDealer) return "approved";
  if (input.hasCanonicalWarranty) return "missing_active_dealer";
  if (input.hasActiveDealer) return "missing_warranty_registration";
  return "missing_warranty_and_active_dealer";
}

export const warrantyMatchStatusCopy: Record<WarrantyMatchStatus, { label: string; history: string }> = {
  approved: { label: "Godkendt", history: "Garantiregistrering godkendt" },
  needs_clarification: { label: "Kræver afklaring", history: "Mangler garantiregistrering" },
  missing_warranty_and_dealer: {
    label: "Mangler garanti og aktiv forhandler",
    history: "Mangler garantiregistrering og aktiv forhandler",
  },
};

export const warrantyMatchDetailCopy: Record<WarrantyMatchDetail, string> = {
  approved: "Garantiregistrering godkendt",
  missing_active_dealer: "Mangler aktiv forhandler",
  missing_warranty_registration: "Mangler garantiregistrering",
  missing_warranty_and_active_dealer: "Mangler garantiregistrering og aktiv forhandler",
};
