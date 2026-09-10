/**
 * Resolves which lead-based working-budget contributions are visible in the
 * current CRM Budget scope. Backend's "all" filter intentionally includes
 * contributions from every seller.
 */
export function matchesWorkingBudgetScope(params: {
  ownerEmail: string | null | undefined;
  isAdmin: boolean;
  backendFilter: string;
  sellerContextEmail: string;
}): boolean {
  const ownerEmail = (params.ownerEmail || "").toLowerCase();

  if (!params.isAdmin && params.sellerContextEmail) {
    return ownerEmail === params.sellerContextEmail.toLowerCase();
  }

  if (params.isAdmin && params.backendFilter && params.backendFilter.toLowerCase() !== "all") {
    return ownerEmail === params.backendFilter.toLowerCase();
  }

  return true;
}
