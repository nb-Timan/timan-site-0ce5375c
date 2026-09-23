import { describe, expect, it } from "vitest";
import {
  calculatePortalActivityIndexes,
  mergePortalActivityCohort,
  takePortalActivityTopFive,
  type PortalActivityUserMetrics,
} from "@/lib/portalAnalyticsActivityIndex";
import { getPortalAnalyticsCopy } from "@/lib/portalAnalyticsI18n";

function user(
  key: string,
  current: Partial<PortalActivityUserMetrics["current"]> = {},
  previous: Partial<PortalActivityUserMetrics["previous"]> = {},
): PortalActivityUserMetrics {
  return {
    user_key: key,
    user_id: key,
    email: `${key}@example.com`,
    display_name: key,
    portal_role: "timan_seller",
    dealer_number: null,
    current: { activeDays: 0, activeSeconds: 0, sessions: 0, visits: 0, ...current },
    previous: { activeDays: 0, activeSeconds: 0, sessions: 0, visits: 0, ...previous },
  };
}

describe("Portal Analytics activity index", () => {
  it("returns zero for zero activity and keeps every score within 0-100", () => {
    const rows = calculatePortalActivityIndexes([
      user("zero"),
      user("extreme", { activeDays: 999, activeSeconds: 1e12, sessions: 1e9, visits: 1e9 }),
    ], 30, true);
    expect(rows.find((row) => row.user_key === "zero")?.currentIndex).toBe(0);
    expect(rows.every((row) => row.currentIndex >= 0 && row.currentIndex <= 100)).toBe(true);
  });

  it("gives active days the material 40 percent contribution", () => {
    const [row] = calculatePortalActivityIndexes([user("active", { activeDays: 15 })], 30, true);
    expect(row.currentIndex).toBe(20);
  });

  it("applies the documented 30/20/10 metric weights", () => {
    const [row] = calculatePortalActivityIndexes([user("metrics", {
      activeSeconds: 3600, sessions: 20, visits: 100,
    })], 30, true);
    expect(row.currentIndex).toBe(60);
  });

  it("uses logarithmic diminishing returns for time, sessions and visits", () => {
    const rows = calculatePortalActivityIndexes([
      user("moderate", { activeSeconds: 3600, sessions: 20, visits: 100 }),
      user("extreme", { activeSeconds: 360000, sessions: 2000, visits: 10000 }),
    ], 30, true);
    const moderate = rows.find((row) => row.user_key === "moderate")!;
    expect(moderate.currentIndex).toBeGreaterThan(30);
    expect(moderate.currentIndex).toBeLessThan(60);
  });

  it("prevents excessive visits or sessions from dominating active days", () => {
    const rows = calculatePortalActivityIndexes([
      user("frequency", { activeDays: 30, activeSeconds: 300, sessions: 2, visits: 2 }),
      user("refresh", { activeDays: 1, activeSeconds: 1, sessions: 100000, visits: 100000 }),
    ], 30, true);
    expect(rows[0].user_key).toBe("frequency");
  });

  it("normalizes the same cohort separately for current and previous periods", () => {
    const rows = calculatePortalActivityIndexes([
      user("a", { activeDays: 10, activeSeconds: 100, sessions: 10, visits: 10 }, { activeDays: 1, activeSeconds: 1000, sessions: 100, visits: 100 }),
      user("b", { activeDays: 5, activeSeconds: 1000, sessions: 100, visits: 100 }, { activeDays: 10, activeSeconds: 100, sessions: 10, visits: 10 }),
    ], 30, true);
    expect(rows.map((row) => row.user_key).sort()).toEqual(["a", "b"]);
    expect(rows.find((row) => row.user_key === "a")?.currentIndex).not.toBe(rows.find((row) => row.user_key === "a")?.previousIndex);
  });

  it("calculates delta from the activity index rather than a raw metric", () => {
    const [row] = calculatePortalActivityIndexes([
      user("a", { activeDays: 10, visits: 1 }, { activeDays: 1, visits: 1000 }),
    ], 30, true);
    expect(row.delta.state).toBe("up");
  });

  it("handles new, neutral and unavailable history without Infinity", () => {
    expect(calculatePortalActivityIndexes([user("new", { activeDays: 1 })], 30, true)[0].delta).toEqual({ state: "new", percent: null });
    expect(calculatePortalActivityIndexes([user("zero")], 30, true)[0].delta).toEqual({ state: "flat", percent: 0 });
    expect(calculatePortalActivityIndexes([user("unknown", { activeDays: 1 })], 30, false)[0].delta).toEqual({ state: "unavailable", percent: null });
  });

  it("uses deterministic score, days, time and name tie-breaking", () => {
    const rows = calculatePortalActivityIndexes([
      user("Beta", { activeDays: 2, activeSeconds: 10 }),
      user("Alpha", { activeDays: 2, activeSeconds: 10 }),
    ], 30, true);
    expect(rows.map((row) => row.display_name)).toEqual(["Alpha", "Beta"]);
  });

  it("returns at most five users while preserving smaller cohorts", () => {
    expect(takePortalActivityTopFive(Array.from({ length: 8 }, (_, index) => calculatePortalActivityIndexes([user(String(index), { activeDays: index })], 30, true)[0]))).toHaveLength(5);
    expect(takePortalActivityTopFive(calculatePortalActivityIndexes([user("a"), user("b")], 30, true))).toHaveLength(2);
  });

  it("adds zero rows only for the already-authorized filtered cohort", () => {
    const cohort = [user("allowed"), user("no-activity")].map(({ current: _current, previous: _previous, user_key: _key, ...value }) => value);
    const merged = mergePortalActivityCohort(cohort, [user("allowed", { activeDays: 1 }), user("unauthorized", { activeDays: 30 })]);
    expect(merged.map((row) => row.user_key)).toEqual(["allowed", "no-activity"]);
    expect(merged[1].current.activeDays).toBe(0);
  });

  it("changes the active-day score with the selected period", () => {
    const metrics = [user("a", { activeDays: 7 })];
    expect(calculatePortalActivityIndexes(metrics, 7, true)[0].currentIndex)
      .toBeGreaterThan(calculatePortalActivityIndexes(metrics, 90, true)[0].currentIndex);
  });
});

describe("Portal Analytics equivalent period labels", () => {
  it.each([
    [7, "vs. forrige 7 dage"],
    [30, "vs. forrige 30 dage"],
    [90, "vs. forrige 90 dage"],
    [365, "vs. forrige 12 mdr."],
  ])("labels %i days correctly", (days, label) => {
    expect(getPortalAnalyticsCopy("da").previousPeriod(days)).toBe(label);
  });

  it("provides period and score copy for every portal language", () => {
    (["da", "en", "de", "it", "hu", "sv", "fr", "pl", "cs"] as const).forEach((language) => {
      expect(getPortalAnalyticsCopy(language).activityIndex).toBeTruthy();
      expect(getPortalAnalyticsCopy(language).previousPeriod(30)).toContain("30");
    });
  });
});
