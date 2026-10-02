import type { WorkingBudgetAllocation } from "@/lib/workingBudgetAllocation";
import type { WorkingBudgetMoveSelection } from "@/lib/workingBudgetMoveService";

export interface WorkingBudgetMonthState {
  monthIdx: number;
  monthLabel: string;
  allocation: WorkingBudgetAllocation;
}

export interface WorkingBudgetUnitChoice {
  key: string;
  label: string;
  detail: string;
  available: number;
  selection: WorkingBudgetMoveSelection;
}

export function workingBudgetMonthDistance(fromMonthIdx: number, toMonthIdx: number): number {
  const direct = Math.abs(fromMonthIdx - toMonthIdx);
  return Math.min(direct, 12 - direct);
}

/** Nearest month first, with the preceding month before the following month on ties. */
export function sortWorkingBudgetMonths(
  months: WorkingBudgetMonthState[],
  anchorMonthIdx: number,
): WorkingBudgetMonthState[] {
  return months
    .filter((month) => month.monthIdx !== anchorMonthIdx)
    .sort((left, right) => {
      const distance = workingBudgetMonthDistance(left.monthIdx, anchorMonthIdx)
        - workingBudgetMonthDistance(right.monthIdx, anchorMonthIdx);
      if (distance !== 0) return distance;
      const leftBackward = (anchorMonthIdx - left.monthIdx + 12) % 12;
      const rightBackward = (anchorMonthIdx - right.monthIdx + 12) % 12;
      const leftIsPrevious = leftBackward <= 6;
      const rightIsPrevious = rightBackward <= 6;
      if (leftIsPrevious !== rightIsPrevious) return leftIsPrevious ? -1 : 1;
      return left.monthIdx - right.monthIdx;
    });
}

export function workingBudgetUnitChoices(allocation: WorkingBudgetAllocation): WorkingBudgetUnitChoice[] {
  return [
    ...allocation.allocations.map((row, index) => ({
      key: `dealer:${row.dealer_account_id || row.dealer_account_number || row.dealer_name}:${index}`,
      label: row.dealer_name,
      detail: `${row.dealer_account_number ? `#${row.dealer_account_number} · ` : ""}${row.qty} stk.`,
      available: row.qty,
      selection: {
        kind: "dealer" as const,
        dealer_account_id: row.dealer_account_id,
        dealer_account_number: row.dealer_account_number,
        dealer_name: row.dealer_name,
        quantity: 1,
      },
    })),
    ...(allocation.unallocated > 0 ? [{
      key: "unallocated",
      label: "Ikke fordelt",
      detail: `${allocation.unallocated} stk. uden forhandler`,
      available: allocation.unallocated,
      selection: { kind: "unallocated" as const, quantity: 1 },
    }] : []),
  ];
}
