import { describe, expect, it } from "vitest";
import { resolveWarrantyMatchDetail, resolveWarrantyMatchStatus } from "@/lib/warrantyMatchStatus";

describe("resolveWarrantyMatchStatus", () => {
  it.each([
    [true, true, "approved"],
    [true, false, "needs_clarification"],
    [false, true, "needs_clarification"],
    [false, false, "missing_warranty_and_dealer"],
  ] as const)("maps warranty=%s activeDealer=%s to %s", (hasCanonicalWarranty, hasActiveDealer, expected) => {
    expect(resolveWarrantyMatchStatus({ hasCanonicalWarranty, hasActiveDealer })).toBe(expected);
  });

  it("moves from unresolved MO to approved as canonical data arrives", () => {
    expect(resolveWarrantyMatchStatus({ hasCanonicalWarranty: false, hasActiveDealer: false })).toBe("missing_warranty_and_dealer");
    expect(resolveWarrantyMatchStatus({ hasCanonicalWarranty: false, hasActiveDealer: true })).toBe("needs_clarification");
    expect(resolveWarrantyMatchStatus({ hasCanonicalWarranty: true, hasActiveDealer: true })).toBe("approved");
  });

  it.each([
    [true, true, "approved"],
    [true, false, "missing_active_dealer"],
    [false, true, "missing_warranty_registration"],
    [false, false, "missing_warranty_and_active_dealer"],
  ] as const)("provides the precise history text case for warranty=%s dealer=%s", (hasCanonicalWarranty, hasActiveDealer, expected) => {
    expect(resolveWarrantyMatchDetail({ hasCanonicalWarranty, hasActiveDealer })).toBe(expected);
  });
});
