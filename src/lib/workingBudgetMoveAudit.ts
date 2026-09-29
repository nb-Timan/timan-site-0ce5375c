export interface WorkingBudgetMoveAuditAllocation {
  kind: "dealer" | "unallocated";
  dealer_account_number: string | null;
  dealer_name: string | null;
  quantity: number;
}

export interface WorkingBudgetMoveAuditDetail {
  sourceMonth: string;
  destinationMonth: string;
  quantity: number;
  allocations: WorkingBudgetMoveAuditAllocation[];
}

export function readWorkingBudgetMoveAudit(value: unknown): WorkingBudgetMoveAuditDetail | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const raw = root.movement && typeof root.movement === "object"
    ? root.movement as Record<string, unknown>
    : root;
  const quantity = Number(raw.quantity || 0);
  const sourceMonth = typeof raw.source_month === "string" ? raw.source_month : "";
  const destinationMonth = typeof raw.destination_month === "string" ? raw.destination_month : "";
  if (quantity <= 0 || !sourceMonth || !destinationMonth) return null;

  const allocations = Array.isArray(raw.allocations)
    ? raw.allocations.flatMap((entry): WorkingBudgetMoveAuditAllocation[] => {
        if (!entry || typeof entry !== "object") return [];
        const allocation = entry as Record<string, unknown>;
        const kind = allocation.kind === "dealer" ? "dealer" : allocation.kind === "unallocated" ? "unallocated" : null;
        const allocationQuantity = Number(allocation.quantity || 0);
        if (!kind || allocationQuantity <= 0) return [];
        return [{
          kind,
          dealer_account_number: typeof allocation.dealer_account_number === "string" ? allocation.dealer_account_number : null,
          dealer_name: typeof allocation.dealer_name === "string" ? allocation.dealer_name : null,
          quantity: allocationQuantity,
        }];
      })
    : [];

  return { sourceMonth, destinationMonth, quantity, allocations };
}
