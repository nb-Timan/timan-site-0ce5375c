import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dashboardMetricLabel,
  formatDashboardDate,
  formatDashboardMonthName,
  formatRevenueSeriesPoint,
} from "@/lib/crmDashboardDate";
import { PORTAL_LANGUAGE_CODES } from "@/lib/portalLanguages";

describe("CRM dealer dashboard date presentation", () => {
  it("renders real Danish daily dates as DD-MM-YY", () => {
    expect(formatDashboardDate("2026-09-10", "day", "da")).toBe("10-09-26");
  });

  it("renders Danish month buckets without inventing a calendar day", () => {
    const axis = formatDashboardDate("2026-09", "month", "da", "axis");
    const tooltip = formatDashboardDate("2026-09", "month", "da", "tooltip");

    expect(axis).toBe("sep. 26");
    expect(tooltip).toBe("september 2026");
    expect(axis).not.toContain("10-09");
    expect(tooltip).not.toContain("10-09");
  });

  it("prefers the canonical daily date while keeping legacy monthly payloads safe", () => {
    expect(formatRevenueSeriesPoint({ name: "2026-09", date: "2026-09-10" }, "da")).toEqual({
      grain: "day",
      axisLabel: "10-09-26",
      tooltipLabel: "10-09-26",
    });

    expect(formatRevenueSeriesPoint({ name: "2026-09" }, "da")).toEqual({
      grain: "month",
      axisLabel: "sep. 26",
      tooltipLabel: "september 2026",
    });
  });

  it("provides localized user-facing metric labels instead of the technical value key", () => {
    expect(dashboardMetricLabel("revenue", "da")).toBe("Omsætning");
    expect(dashboardMetricLabel("machines", "da")).toBe("Maskiner");

    for (const language of PORTAL_LANGUAGE_CODES) {
      expect(dashboardMetricLabel("revenue", language).toLowerCase()).not.toBe("value");
      expect(dashboardMetricLabel("machines", language).toLowerCase()).not.toBe("value");
    }
  });

  it("formats chart dates and month names for all nine portal languages", () => {
    expect(PORTAL_LANGUAGE_CODES).toHaveLength(9);

    for (const language of PORTAL_LANGUAGE_CODES) {
      expect(formatDashboardDate("2026-09-10", "day", language)).not.toBe("2026-09-10");
      expect(formatDashboardDate("2026-09", "month", language)).not.toBe("2026-09");
      expect(formatDashboardMonthName(8, language)).not.toBe("9");
    }
  });

  it("preserves the daily revenue aggregation and adds only the canonical date field", () => {
    const migration = readFileSync(resolve(
      process.cwd(),
      "supabase/migrations/20261001221000_preserve_dealer_dashboard_chart_dates.sql",
    ), "utf8");

    expect(migration).toContain("'date',to_char(activity_date,'YYYY-MM-DD')");
    expect(migration).toContain("select activity_date,sum(display_net) as value from display_rows group by activity_date");
    expect(migration).toContain("'name',to_char(activity_date,'YYYY-MM')");
  });
});
