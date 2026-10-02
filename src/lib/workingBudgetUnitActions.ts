import type { WorkingBudgetAllocation } from "@/lib/workingBudgetAllocation";
import type { WorkingBudgetUnit } from "@/lib/workingBudgetMoveService";

export interface WorkingBudgetMonthState {
  monthIdx: number;
  monthLabel: string;
  allocation: WorkingBudgetAllocation;
  units: WorkingBudgetUnit[];
}

export interface WorkingBudgetUnitChoice {
  key: string;
  label: string;
  detail: string;
  unit: WorkingBudgetUnit;
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

export function workingBudgetUnitChoices(units: WorkingBudgetUnit[]): WorkingBudgetUnitChoice[] {
  const dealerCounts = new Map<string, number>();
  const dealerIndexes = new Map<string, number>();
  let unallocatedIndex = 0;

  for (const unit of units) {
    const key = unit.dealer_account_id || unit.dealer_account_number || unit.dealer_name;
    if (key) dealerCounts.set(key, (dealerCounts.get(key) || 0) + 1);
  }

  return units.map((unit) => {
    const dealerKey = unit.dealer_account_id || unit.dealer_account_number || unit.dealer_name;
    if (!dealerKey) {
      unallocatedIndex += 1;
      return {
        key: unit.id,
        label: "Ikke fordelt",
        detail: `Enhed ${unallocatedIndex}`,
        unit,
      };
    }

    const dealerIndex = (dealerIndexes.get(dealerKey) || 0) + 1;
    dealerIndexes.set(dealerKey, dealerIndex);
    const count = dealerCounts.get(dealerKey) || 1;
    const account = unit.dealer_account_number ? `#${unit.dealer_account_number}` : null;
    const occurrence = count > 1 ? `Enhed ${dealerIndex} af ${count}` : null;
    return {
      key: unit.id,
      label: unit.dealer_name || unit.dealer_account_number || "Ukendt forhandler",
      detail: [account, occurrence].filter(Boolean).join(" · ") || `Enhed ${unit.sequence_no}`,
      unit,
    };
  });
}
