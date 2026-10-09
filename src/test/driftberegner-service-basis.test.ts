import { describe, expect, it } from "vitest";
import {
  calculateYearlyServiceCost,
  computeRelevantInterval,
} from "@/lib/serviceBasisData";

describe("Driftberegner service basis", () => {
  it("calculates the canonical service cost from 750 operating hours per year", () => {
    expect(calculateYearlyServiceCost("rc751", 750)).toBeCloseTo(5768.9);
    expect(calculateYearlyServiceCost("rc1000", 750)).toBeCloseTo(11142.97);
    expect(calculateYearlyServiceCost("timan3330", 750)).toBeCloseTo(3590);
  });

  it("uses the current service step only as the default basis view", () => {
    expect(computeRelevantInterval("rc751", 750)).toBe(200);
    expect(computeRelevantInterval("rc1000", 750)).toBe(200);
    expect(computeRelevantInterval("timan3330", 750)).toBe(650);
  });
});
