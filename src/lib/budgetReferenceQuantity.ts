export interface BudgetReferenceQuantityLimits {
  minimum: number;
  maximum: number | null;
  canDecrement: boolean;
  canIncrement: boolean;
}

function normalizeQuantity(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/**
 * Keeps the reference editor's buttons, input and validation on the same
 * allocation rule. A total of zero means there is no active allocation cap.
 */
export function getBudgetReferenceQuantityLimits({
  totalAllowed,
  allocated,
  rowQuantity,
}: {
  totalAllowed: number;
  allocated: number;
  rowQuantity: number;
}): BudgetReferenceQuantityLimits {
  const normalizedTotal = normalizeQuantity(totalAllowed);
  const normalizedAllocated = normalizeQuantity(allocated);
  const normalizedRowQuantity = normalizeQuantity(rowQuantity);
  const hasMaximum = normalizedTotal > 0;
  const otherAllocated = Math.max(0, normalizedAllocated - normalizedRowQuantity);
  const maximum = hasMaximum ? Math.max(0, normalizedTotal - otherAllocated) : null;

  return {
    minimum: 0,
    maximum,
    canDecrement: normalizedRowQuantity > 0,
    canIncrement: maximum === null || normalizedRowQuantity < maximum,
  };
}

export function clampBudgetReferenceQuantity(value: number, maximum: number | null): number {
  const normalized = normalizeQuantity(value);
  return maximum === null ? normalized : Math.min(normalized, maximum);
}
