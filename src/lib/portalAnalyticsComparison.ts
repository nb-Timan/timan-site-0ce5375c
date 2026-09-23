import type {
  PortalUsageAnalytics,
  PortalUsageUserComparison,
} from "@/lib/portalModuleUsageAnalyticsService";

export const PORTAL_ANALYTICS_COMPARISON_LIMIT = 5;
export const PORTAL_ANALYTICS_USER_COLORS = [
  "#047857",
  "#2563eb",
  "#7c3aed",
  "#e11d48",
  "#d97706",
] as const;

export interface PortalAnalyticsSeries {
  key: string;
  dataKey: string;
  name: string;
  color: string;
}

export interface PortalAnalyticsComparisonData {
  series: PortalAnalyticsSeries[];
  activityRows: Array<Record<string, string | number>>;
  weekModuleRows: Array<Record<string, string | number>>;
  monthModuleRows: Array<Record<string, string | number>>;
  activeSecondsModuleRows: Array<Record<string, string | number>>;
}

function userKey(comparison: PortalUsageUserComparison): string {
  return String(comparison.user.user_id || comparison.user.email).trim().toLowerCase();
}

function userName(comparison: PortalUsageUserComparison): string {
  return comparison.user.display_name?.trim() || comparison.user.email || "Ukendt bruger";
}

function dayLabel(day: string): string {
  return new Date(day).toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit" });
}

function buildActivityRows(
  comparisons: PortalUsageUserComparison[],
  series: PortalAnalyticsSeries[],
): Array<Record<string, string | number>> {
  const days = Array.from(new Set(comparisons.flatMap(({ analytics }) =>
    analytics.active_days_over_time.map((row) => row.day),
  ))).sort();
  return days.map((day) => {
    const row: Record<string, string | number> = { day: dayLabel(day), isoDay: day };
    comparisons.forEach(({ analytics }, index) => {
      row[series[index].dataKey] = analytics.active_days_over_time
        .find((entry) => entry.day === day)?.visit_count || 0;
    });
    return row;
  });
}

function buildModuleRows(
  comparisons: PortalUsageUserComparison[],
  series: PortalAnalyticsSeries[],
  selectRows: (analytics: PortalUsageAnalytics) => PortalUsageAnalytics["modules"],
  valueKey: "visit_count" | "active_seconds",
): Array<Record<string, string | number>> {
  const totals = new Map<string, number>();
  comparisons.forEach(({ analytics }) => {
    selectRows(analytics).forEach((module) => {
      totals.set(module.module_key, (totals.get(module.module_key) || 0) + (module[valueKey] || 0));
    });
  });
  const moduleKeys = [...totals.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([key]) => key);
  return moduleKeys.map((moduleKey) => {
    const row: Record<string, string | number> = { moduleKey };
    comparisons.forEach(({ analytics }, index) => {
      row[series[index].dataKey] = selectRows(analytics)
        .find((module) => module.module_key === moduleKey)?.[valueKey] || 0;
    });
    return row;
  });
}

export function buildPortalAnalyticsComparison(
  comparisons: PortalUsageUserComparison[],
): PortalAnalyticsComparisonData {
  const limited = comparisons.slice(0, PORTAL_ANALYTICS_COMPARISON_LIMIT);
  const series = limited.map((comparison, index) => ({
    key: userKey(comparison),
    dataKey: `user_${index}`,
    name: userName(comparison),
    color: PORTAL_ANALYTICS_USER_COLORS[index],
  }));
  return {
    series,
    activityRows: buildActivityRows(limited, series),
    weekModuleRows: buildModuleRows(limited, series, (analytics) => analytics.module_usage_this_week, "visit_count"),
    monthModuleRows: buildModuleRows(limited, series, (analytics) => analytics.module_usage_last_30_days, "visit_count"),
    activeSecondsModuleRows: buildModuleRows(limited, series, (analytics) => analytics.modules, "active_seconds"),
  };
}
