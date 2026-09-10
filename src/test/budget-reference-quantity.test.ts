import { describe, expect, it } from "vitest";
import {
  clampBudgetReferenceQuantity,
  getBudgetReferenceQuantityLimits,
} from "@/lib/budgetReferenceQuantity";

describe("budget reference quantity controls", () => {
  it("allows plus, minus and direct input while a reference has room", () => {
    const limits = getBudgetReferenceQuantityLimits({
      totalAllowed: 5,
      allocated: 1,
      rowQuantity: 1,
    });

    expect(limits).toMatchObject({ minimum: 0, maximum: 5, canDecrement: true, canIncrement: true });
    expect(clampBudgetReferenceQuantity(2, limits.maximum)).toBe(2);
    expect(clampBudgetReferenceQuantity(5, limits.maximum)).toBe(5);
  });

  it("disables plus at the allocation maximum and minus at zero", () => {
    const atMaximum = getBudgetReferenceQuantityLimits({
      totalAllowed: 3,
      allocated: 3,
      rowQuantity: 3,
    });
    const atMinimum = getBudgetReferenceQuantityLimits({
      totalAllowed: 3,
      allocated: 0,
      rowQuantity: 0,
    });

    expect(atMaximum.canIncrement).toBe(false);
    expect(clampBudgetReferenceQuantity(4, atMaximum.maximum)).toBe(3);
    expect(atMinimum.canDecrement).toBe(false);
  });

  it("does not disable plus when the current change has no allocation cap", () => {
    const limits = getBudgetReferenceQuantityLimits({
      totalAllowed: 0,
      allocated: 1,
      rowQuantity: 1,
    });

    expect(limits.maximum).toBeNull();
    expect(limits.canIncrement).toBe(true);
    expect(clampBudgetReferenceQuantity(5, limits.maximum)).toBe(5);
  });
});
