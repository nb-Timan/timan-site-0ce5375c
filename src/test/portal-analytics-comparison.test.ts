import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPortalAnalyticsComparison,
  PORTAL_ANALYTICS_COMPARISON_LIMIT,
  PORTAL_ANALYTICS_USER_COLORS,
} from "@/lib/portalAnalyticsComparison";
import type {
  PortalUsageAnalytics,
  PortalUsageUserComparison,
} from "@/lib/portalModuleUsageAnalyticsService";

function analytics({
  visits,
  weekConfigurator,
  monthConfigurator,
  activeSeconds,
}: {
  visits: number[];
  weekConfigurator: number;
  monthConfigurator: number;
  activeSeconds: number;
}): PortalUsageAnalytics {
  return {
    generated_at: "2026-09-23T12:00:00Z",
    period: { days: 30, from: "2026-09-22", to: "2026-09-23" },
    totals: {
      user_count: 1, session_count: 1, visit_count: visits.reduce((sum, value) => sum + value, 0),
      active_seconds: activeSeconds, active_days_7: 1, active_days_30: 1, active_days_90: 1,
      last_active_at: "2026-09-23T12:00:00Z",
    },
    users: [],
    modules: [{ module_key: "configurator", visit_count: monthConfigurator, active_seconds: activeSeconds }],
    module_usage_this_week: [{ module_key: "configurator", visit_count: weekConfigurator, active_seconds: activeSeconds }],
    module_usage_last_30_days: [{ module_key: "configurator", visit_count: monthConfigurator, active_seconds: activeSeconds }],
    active_days_over_time: [
      { day: "2026-09-22", active_users: visits[0] ? 1 : 0, session_count: visits[0] ? 1 : 0, visit_count: visits[0], active_seconds: 0 },
      { day: "2026-09-23", active_users: visits[1] ? 1 : 0, session_count: visits[1] ? 1 : 0, visit_count: visits[1], active_seconds: activeSeconds },
    ],
    activity_users: [],
    selected_period_comparison: {
      days: 30, current_from: "", current_to: "", previous_from: "", previous_to: "",
      current_visits: 0, previous_visits: 0, current_seconds: 0, previous_seconds: 0,
      current_sessions: 0, previous_sessions: 0, current_users: 0, previous_users: 0,
      current_active_days: 0, previous_active_days: 0, has_previous_data: false,
    },
    comparisons: {
      week: { current_visits: 0, previous_visits: 0, current_seconds: 0, previous_seconds: 0 },
      month: { current_visits: 0, previous_visits: 0, current_seconds: 0, previous_seconds: 0 },
      same_period_last_year: { current_visits: 0, previous_visits: 0, current_seconds: 0, previous_seconds: 0 },
    },
    filters: { users: [], roles: [], dealer_numbers: [], modules: [] },
  };
}

function comparison(id: string, name: string, data: PortalUsageAnalytics): PortalUsageUserComparison {
  return {
    user: { user_id: id, email: `${id}@timan.dk`, display_name: name, portal_role: "timan_seller", dealer_number: null },
    analytics: data,
  };
}

describe("portal analytics manual user comparison", () => {
  const birger = comparison("bp", "Birger Pedersen", analytics({
    visits: [0, 8], weekConfigurator: 8, monthConfigurator: 12, activeSeconds: 3600,
  }));
  const esben = comparison("em", "Esben Madsen", analytics({
    visits: [4, 3], weekConfigurator: 4, monthConfigurator: 10, activeSeconds: 1800,
  }));

  it("keeps one selected user as one complete series", () => {
    const result = buildPortalAnalyticsComparison([birger]);
    expect(result.series).toHaveLength(1);
    expect(result.activityRows[1].user_0).toBe(8);
    expect(result.weekModuleRows[0].user_0).toBe(8);
  });

  it("builds separate visit series and keeps zero-activity days", () => {
    const result = buildPortalAnalyticsComparison([birger, esben]);
    expect(result.series.map((series) => series.name)).toEqual(["Birger Pedersen", "Esben Madsen"]);
    expect(result.activityRows[0]).toMatchObject({ user_0: 0, user_1: 4 });
    expect(result.activityRows[1]).toMatchObject({ user_0: 8, user_1: 3 });
  });

  it("uses the same deterministic user identity across every chart", () => {
    const result = buildPortalAnalyticsComparison([birger, esben]);
    expect(result.series.map((series) => series.color)).toEqual(PORTAL_ANALYTICS_USER_COLORS.slice(0, 2));
    expect(result.weekModuleRows[0]).toMatchObject({ user_0: 8, user_1: 4 });
    expect(result.monthModuleRows[0]).toMatchObject({ user_0: 12, user_1: 10 });
    expect(result.activeSecondsModuleRows[0]).toMatchObject({ user_0: 3600, user_1: 1800 });
  });

  it("caps only visual comparison data at the documented limit", () => {
    const users = Array.from({ length: 7 }, (_, index) => comparison(`u${index}`, `User ${index}`, birger.analytics));
    expect(buildPortalAnalyticsComparison(users).series).toHaveLength(PORTAL_ANALYTICS_COMPARISON_LIMIT);
  });

  it("keeps aggregate charts and uses the canonical secured RPC for each comparison", () => {
    const page = readFileSync("src/pages/backend/BackendPortalAnalyticsPage.tsx", "utf8");
    const service = readFileSync("src/lib/portalModuleUsageAnalyticsService.ts", "utf8");
    expect(page).toContain("comparisonActive");
    expect(page).toContain("<ModuleBars rows={analytics.module_usage_this_week}");
    expect(page).toContain("Sammenligning vises for op til");
    expect(service).toContain('supabase.rpc("get_backend_user_activity_analytics_v3"');
    expect(service).toContain("p_module_keys: cleanModules.length ? cleanModules : null");
  });
});
