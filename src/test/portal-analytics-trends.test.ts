import { describe, expect, it } from "vitest";
import { formatCountTrend, formatPercentTrend } from "@/lib/portalAnalyticsTrends";

describe("portal analytics KPI trends", () => {
  it("formats positive, negative and flat percentage trends", () => {
    expect(formatPercentTrend(2, 1)).toEqual({
      text: "+100 % vs. sidste uge",
      tone: "positive",
      direction: "up",
    });
    expect(formatPercentTrend(88, 100)).toEqual({
      text: "-12 % vs. sidste uge",
      tone: "negative",
      direction: "down",
    });
    expect(formatPercentTrend(4, 4)).toEqual({
      text: "Uændret vs. sidste uge",
      tone: "neutral",
      direction: "flat",
    });
  });

  it("uses neutral or new-activity wording when previous period is zero", () => {
    expect(formatPercentTrend(1, 0)).toEqual({
      text: "Ny aktivitet vs. sidste uge",
      tone: "positive",
      direction: "up",
    });
    expect(formatPercentTrend(0, 0)).toEqual({
      text: "Uændret vs. sidste uge",
      tone: "neutral",
      direction: "flat",
    });
  });

  it("formats count trends for sessions and active days", () => {
    expect(formatCountTrend(4, 2, "sessioner").text).toBe("+2 sessioner vs. sidste uge");
    expect(formatCountTrend(1, 3, "dage").text).toBe("-2 dage vs. sidste uge");
    expect(formatCountTrend(2, 2, "dage").tone).toBe("neutral");
  });
});
