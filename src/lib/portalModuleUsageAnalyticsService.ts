import { supabase } from "@/lib/supabase";
import {
  normalizePartnerAccountType,
  type PartnerAccountTypeId,
} from "@/lib/partnerAccountTypes";

export interface PortalUsageUserOption {
  user_id: string | null;
  email: string;
  display_name: string | null;
  portal_role: string | null;
  dealer_number: string | null;
  partner_type?: string | null;
  partner_account_type?: PartnerAccountTypeId | null;
  dealer_customer_type?: string | null;
  dealer_customer_type_label?: string | null;
  dealer_type?: string | null;
}

export interface PortalUsageTotals {
  user_count: number;
  session_count: number;
  visit_count: number;
  active_seconds: number;
  active_days_7: number;
  active_days_30: number;
  active_days_90: number;
  last_active_at: string | null;
}

export interface PortalUsageUserSummary extends PortalUsageUserOption {
  last_login: string | null;
  last_active_at: string | null;
  session_count: number;
  visit_count: number;
  active_seconds: number;
  active_days_7: number;
  active_days_30: number;
  active_days_90: number;
  top_module: string | null;
  top_module_visits: number | null;
}

export interface PortalUsageModuleSummary {
  module_key: string;
  user_count?: number;
  session_count?: number;
  visit_count: number;
  active_seconds: number;
  last_active_at?: string | null;
}

export interface PortalUsageDaySummary {
  day: string;
  active_users: number;
  session_count: number;
  visit_count: number;
  active_seconds: number;
}

export interface PortalUsageComparisonPeriod {
  current_visits: number;
  previous_visits: number;
  current_seconds: number;
  previous_seconds: number;
  current_sessions?: number;
  previous_sessions?: number;
  current_users?: number;
  previous_users?: number;
  current_active_days?: number;
  previous_active_days?: number;
}

export interface PortalUsageAnalytics {
  generated_at: string;
  period: { days: number; from: string; to: string };
  totals: PortalUsageTotals;
  users: PortalUsageUserSummary[];
  modules: PortalUsageModuleSummary[];
  module_usage_this_week: PortalUsageModuleSummary[];
  module_usage_last_30_days: PortalUsageModuleSummary[];
  active_days_over_time: PortalUsageDaySummary[];
  comparisons: {
    week: PortalUsageComparisonPeriod;
    month: PortalUsageComparisonPeriod;
    same_period_last_year: PortalUsageComparisonPeriod;
  };
  filters: PortalUsageAnalyticsFilterOptions;
}

export interface PortalUsageAnalyticsFilterOptions {
  users: PortalUsageUserOption[];
  roles: string[];
  dealer_numbers: string[];
  modules: string[];
}

export interface PortalUsageAnalyticsFilters {
  userKeys?: string[] | null;
  roles?: string[] | null;
  dealerNumbers?: string[] | null;
  moduleKeys?: string[] | null;
  days?: number;
}

export interface PortalUsageUserComparison {
  user: PortalUsageUserOption;
  analytics: PortalUsageAnalytics;
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalizeModule(value: unknown): PortalUsageModuleSummary {
  const row = record(value);
  return {
    module_key: String(row.module_key || "unknown"),
    user_count: num(row.user_count),
    session_count: num(row.session_count),
    visit_count: num(row.visit_count),
    active_seconds: num(row.active_seconds),
    last_active_at: typeof row.last_active_at === "string" ? row.last_active_at : null,
  };
}

function normalizeUserOption(value: unknown): PortalUsageUserOption {
  const row = record(value);
  return {
    user_id: typeof row.user_id === "string" ? row.user_id : null,
    email: String(row.email || ""),
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    portal_role: typeof row.portal_role === "string" ? row.portal_role : null,
    dealer_number: typeof row.dealer_number === "string" ? row.dealer_number : null,
    partner_type: typeof row.partner_type === "string" ? row.partner_type : null,
    partner_account_type: normalizePartnerAccountType(row.partner_account_type),
    dealer_customer_type: typeof row.dealer_customer_type === "string" ? row.dealer_customer_type : null,
    dealer_customer_type_label: typeof row.dealer_customer_type_label === "string" ? row.dealer_customer_type_label : null,
    dealer_type: typeof row.dealer_type === "string" ? row.dealer_type : null,
  };
}

function normalizeAnalytics(value: unknown): PortalUsageAnalytics {
  const payload = record(value);
  const totals = record(payload.totals);
  const comparisons = record(payload.comparisons);
  const week = record(comparisons.week);
  const month = record(comparisons.month);
  const lastYear = record(comparisons.same_period_last_year);
  const filters = record(payload.filters);

  return {
    generated_at: typeof payload.generated_at === "string" ? payload.generated_at : new Date().toISOString(),
    period: payload.period && typeof payload.period === "object"
      ? payload.period as PortalUsageAnalytics["period"]
      : { days: 30, from: "", to: "" },
    totals: {
      user_count: num(totals.user_count),
      session_count: num(totals.session_count),
      visit_count: num(totals.visit_count),
      active_seconds: num(totals.active_seconds),
      active_days_7: num(totals.active_days_7),
      active_days_30: num(totals.active_days_30),
      active_days_90: num(totals.active_days_90),
      last_active_at: typeof totals.last_active_at === "string" ? totals.last_active_at : null,
    },
    users: Array.isArray(payload.users)
      ? payload.users.map((value) => {
          const row = record(value);
          return {
          ...normalizeUserOption(row),
          last_login: typeof row.last_login === "string" ? row.last_login : null,
          last_active_at: typeof row.last_active_at === "string" ? row.last_active_at : null,
          session_count: num(row.session_count),
          visit_count: num(row.visit_count),
          active_seconds: num(row.active_seconds),
          active_days_7: num(row.active_days_7),
          active_days_30: num(row.active_days_30),
          active_days_90: num(row.active_days_90),
          top_module: typeof row.top_module === "string" ? row.top_module : null,
          top_module_visits: row?.top_module_visits == null ? null : num(row.top_module_visits),
          };
        })
      : [],
    modules: Array.isArray(payload.modules) ? payload.modules.map(normalizeModule) : [],
    module_usage_this_week: Array.isArray(payload.module_usage_this_week)
      ? payload.module_usage_this_week.map(normalizeModule)
      : [],
    module_usage_last_30_days: Array.isArray(payload.module_usage_last_30_days)
      ? payload.module_usage_last_30_days.map(normalizeModule)
      : [],
    active_days_over_time: Array.isArray(payload.active_days_over_time)
      ? payload.active_days_over_time.map((value) => {
          const row = record(value);
          return {
            day: String(row.day || ""),
            active_users: num(row.active_users),
            session_count: num(row.session_count),
            visit_count: num(row.visit_count),
            active_seconds: num(row.active_seconds),
          };
        })
      : [],
    comparisons: {
      week: {
        current_visits: num(week.current_visits), previous_visits: num(week.previous_visits),
        current_seconds: num(week.current_seconds), previous_seconds: num(week.previous_seconds),
        current_sessions: num(week.current_sessions), previous_sessions: num(week.previous_sessions),
        current_users: num(week.current_users), previous_users: num(week.previous_users),
        current_active_days: num(week.current_active_days), previous_active_days: num(week.previous_active_days),
      },
      month: {
        current_visits: num(month.current_visits), previous_visits: num(month.previous_visits),
        current_seconds: num(month.current_seconds), previous_seconds: num(month.previous_seconds),
        current_sessions: num(month.current_sessions), previous_sessions: num(month.previous_sessions),
        current_users: num(month.current_users), previous_users: num(month.previous_users),
        current_active_days: num(month.current_active_days), previous_active_days: num(month.previous_active_days),
      },
      same_period_last_year: {
        current_visits: num(lastYear.current_visits), previous_visits: num(lastYear.previous_visits),
        current_seconds: num(lastYear.current_seconds), previous_seconds: num(lastYear.previous_seconds),
        current_sessions: num(lastYear.current_sessions), previous_sessions: num(lastYear.previous_sessions),
        current_users: num(lastYear.current_users), previous_users: num(lastYear.previous_users),
        current_active_days: num(lastYear.current_active_days), previous_active_days: num(lastYear.previous_active_days),
      },
    },
    filters: {
      users: Array.isArray(filters.users) ? filters.users : [],
      roles: Array.isArray(filters.roles) ? filters.roles.filter(Boolean) : [],
      dealer_numbers: Array.isArray(filters.dealer_numbers) ? filters.dealer_numbers.filter(Boolean) : [],
      modules: Array.isArray(filters.modules) ? filters.modules.filter(Boolean) : [],
    },
  };
}

function normalizeFilterOptions(value: unknown): PortalUsageAnalytics["filters"] {
  const payload = record(value);
  return {
    users: Array.isArray(payload.users) ? payload.users.map(normalizeUserOption) : [],
    roles: Array.isArray(payload.roles) ? payload.roles.filter((value): value is string => typeof value === "string" && Boolean(value)) : [],
    dealer_numbers: Array.isArray(payload.dealer_numbers) ? payload.dealer_numbers.filter((value): value is string => typeof value === "string" && Boolean(value)) : [],
    modules: Array.isArray(payload.modules) ? payload.modules.filter((value): value is string => typeof value === "string" && Boolean(value)) : [],
  };
}

export async function fetchPortalUsageFilterOptions(): Promise<PortalUsageAnalytics["filters"]> {
  const { data, error } = await supabase.rpc("get_backend_portal_analytics_filter_options");
  if (error) throw error;
  return normalizeFilterOptions(data);
}

export async function fetchPortalUsageAnalytics(filters: PortalUsageAnalyticsFilters = {}): Promise<PortalUsageAnalytics> {
  const clean = (values: string[] | null | undefined) => {
    const out = Array.from(new Set((values || []).map((value) => value.trim().toLowerCase()).filter(Boolean)));
    return out.length ? out : null;
  };

  const analyticsResult = await supabase.rpc("get_backend_user_activity_analytics_v2", {
    p_user_keys: clean(filters.userKeys),
    p_roles: clean(filters.roles),
    p_dealer_numbers: clean(filters.dealerNumbers),
    p_module_keys: clean(filters.moduleKeys),
    p_days: filters.days ?? 30,
  });

  if (analyticsResult.error) throw analyticsResult.error;
  const analytics = normalizeAnalytics(analyticsResult.data);
  analytics.filters = await fetchPortalUsageFilterOptions();
  return analytics;
}

/**
 * Reuse the canonical backend aggregation for each explicitly selected user.
 * The same module and period filters are applied server-side to every series.
 */
export async function fetchPortalUsageUserComparisons(
  users: PortalUsageUserOption[],
  filters: Pick<PortalUsageAnalyticsFilters, "moduleKeys" | "days"> = {},
): Promise<PortalUsageUserComparison[]> {
  const cleanModules = Array.from(new Set((filters.moduleKeys || [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)));
  return Promise.all(users.map(async (user) => {
    const userKey = String(user.user_id || user.email).trim().toLowerCase();
    const result = await supabase.rpc("get_backend_user_activity_analytics_v2", {
      p_user_keys: [userKey],
      p_roles: null,
      p_dealer_numbers: null,
      p_module_keys: cleanModules.length ? cleanModules : null,
      p_days: filters.days ?? 30,
    });
    if (result.error) throw result.error;
    return { user, analytics: normalizeAnalytics(result.data) };
  }));
}
