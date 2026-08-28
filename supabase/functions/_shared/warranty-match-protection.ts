export type WarrantyDealerMatchRow = {
  dealer_account_id?: unknown;
  dealer_match_method?: unknown;
  dealer_match_reviewed_by?: unknown;
  dealer_match_reviewed_at?: unknown;
};

export function isPortalApprovedDealerMatch(row: WarrantyDealerMatchRow | null | undefined): boolean {
  if (!row?.dealer_account_id) return false;
  const method = String(row.dealer_match_method ?? "").trim().toLowerCase();
  return (
    method === "manual" ||
    method === "approved" ||
    method === "portal" ||
    method === "portal_edit" ||
    Boolean(row.dealer_match_reviewed_by) ||
    Boolean(row.dealer_match_reviewed_at)
  );
}
