import type { OriginalBudgetBasis } from "@/lib/crmBudgetService";

export interface WorkingBudgetAllocationReference {
  dealer_name?: string | null;
  dealer_account_number?: string | null;
  qty?: number | null;
}

export interface WorkingBudgetDealerAllocation {
  dealer_name: string;
  dealer_account_number: string | null;
  qty: number;
}

export interface WorkingBudgetAllocation {
  total: number;
  allocated: number;
  unallocated: number;
  allocations: WorkingBudgetDealerAllocation[];
  source: "inherited" | "explicit" | "unallocated";
}

export interface WorkingBudgetSellerAllocationInput extends ResolveWorkingBudgetAllocationInput {
  seller_initials: string;
  seller_email?: string | null;
}

export interface WorkingBudgetSellerAllocation {
  seller_initials: string;
  seller_email: string | null;
  allocation: WorkingBudgetAllocation;
}

export interface WorkingBudgetAggregateAllocation {
  total: number;
  allocated: number;
  unallocated: number;
  sellers: WorkingBudgetSellerAllocation[];
}

interface ResolveWorkingBudgetAllocationInput {
  workingQty: number;
  originalBasis?: OriginalBudgetBasis | null;
  references?: WorkingBudgetAllocationReference[] | null;
  hasWorkingChange?: boolean;
}

function normalizedQuantity(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value || 0));
}

function normalizedDealerName(value: string | null | undefined): string {
  const firstLabelPart = (value || "").split("·")[0]?.trim();
  return firstLabelPart || "Ikke angivet";
}

function clampAndGroup(
  total: number,
  rows: WorkingBudgetAllocationReference[],
): WorkingBudgetDealerAllocation[] {
  const grouped = new Map<string, WorkingBudgetDealerAllocation>();
  let remaining = total;

  for (const row of rows) {
    if (remaining <= 0) break;
    const requested = normalizedQuantity(row.qty);
    if (requested <= 0) continue;

    const qty = Math.min(requested, remaining);
    const dealerName = normalizedDealerName(row.dealer_name);
    const accountNumber = row.dealer_account_number?.trim() || null;
    const key = accountNumber || dealerName.toLocaleLowerCase();
    const existing = grouped.get(key);
    if (existing) existing.qty += qty;
    else grouped.set(key, {
      dealer_name: dealerName,
      dealer_account_number: accountNumber,
      qty,
    });
    remaining -= qty;
  }

  return Array.from(grouped.values());
}

/**
 * Resolves the current dealer allocation for one Working Budget cell.
 * Explicit budget references are canonical once present. Untouched cells may
 * inherit the frozen original allocation only while quantity and history still
 * prove that the original baseline is intact.
 */
export function resolveWorkingBudgetAllocation({
  workingQty,
  originalBasis = null,
  references = [],
  hasWorkingChange = false,
}: ResolveWorkingBudgetAllocationInput): WorkingBudgetAllocation {
  const total = normalizedQuantity(workingQty);
  const explicitReferences = references || [];

  if (explicitReferences.length > 0) {
    const allocations = clampAndGroup(total, explicitReferences);
    const allocated = allocations.reduce((sum, row) => sum + row.qty, 0);
    return {
      total,
      allocated,
      unallocated: Math.max(0, total - allocated),
      allocations,
      source: "explicit",
    };
  }

  if (!hasWorkingChange && originalBasis && total === normalizedQuantity(originalBasis.total)) {
    const allocations = clampAndGroup(total, originalBasis.allocations.map((row) => ({
      dealer_name: row.dealer_name,
      dealer_account_number: row.dealer_account_number,
      qty: row.qty,
    })));
    const allocated = allocations.reduce((sum, row) => sum + row.qty, 0);
    return {
      total,
      allocated,
      unallocated: Math.max(0, total - allocated),
      allocations,
      source: "inherited",
    };
  }

  return {
    total,
    allocated: 0,
    unallocated: total,
    allocations: [],
    source: "unallocated",
  };
}

/**
 * Composes the canonical per-seller resolver for Backend's all-sellers view.
 * Dealer rows stay nested under their seller, so equal dealers in separate
 * seller scopes are never merged.
 */
export function resolveWorkingBudgetAggregateAllocation(
  inputs: WorkingBudgetSellerAllocationInput[],
): WorkingBudgetAggregateAllocation {
  const sellers = inputs
    .map(({ seller_initials, seller_email = null, ...input }) => ({
      seller_initials: seller_initials.trim().toUpperCase() || "—",
      seller_email: seller_email?.trim().toLowerCase() || null,
      allocation: resolveWorkingBudgetAllocation(input),
    }))
    .filter((seller) => seller.allocation.total > 0);

  return sellers.reduce<WorkingBudgetAggregateAllocation>((result, seller) => {
    result.sellers.push(seller);
    result.total += seller.allocation.total;
    result.allocated += seller.allocation.allocated;
    result.unallocated += seller.allocation.unallocated;
    return result;
  }, { total: 0, allocated: 0, unallocated: 0, sellers: [] });
}
