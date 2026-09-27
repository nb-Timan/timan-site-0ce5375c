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
