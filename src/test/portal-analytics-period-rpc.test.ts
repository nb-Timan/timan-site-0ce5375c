import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20260923161328_portal_analytics_activity_index_period_comparison.sql"), "utf8");
const page = fs.readFileSync(path.join(root, "src/pages/backend/BackendPortalAnalyticsPage.tsx"), "utf8");

describe("Portal Analytics equivalent period RPC", () => {
  it("uses immediately preceding 7/30/90/365-day windows without overlap", () => {
    expect(migration).toContain("v_current_from := v_now - make_interval(days => v_days)");
    expect(migration).toContain("v_previous_from := v_current_from - make_interval(days => v_days)");
    expect(migration).toContain("su.last_active_at >= v_previous_from and su.last_active_at < v_current_from");
    expect(migration).toContain("least(greatest(coalesce(p_days, 30), 7), 365)");
  });

  it("applies identical audience and module filters to current and previous periods", () => {
    expect(migration).toContain("ui.canonical_user_id::text = any(p_user_keys)");
    expect(migration).toContain("ui.canonical_portal_role = any(p_roles)");
    expect(migration).toContain("ui.module_key = any(p_module_keys)");
    expect(migration.match(/from scoped_usage/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps Backend authorization inside the security-definer RPC", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("if not public.is_timan_backend()");
    expect(migration).toContain("revoke all on function public.get_backend_user_activity_analytics_v3");
  });

  it("drives all four KPI deltas from selected-period metrics", () => {
    expect(page.match(/analytics\.selected_period_comparison/g)?.length).toBeGreaterThanOrEqual(9);
    expect(page).not.toContain("analytics.comparisons.week.current_users");
  });

  it("preserves the existing multi-user comparison feature", () => {
    expect(page).toContain("buildPortalAnalyticsComparison(userComparisons)");
    expect(page).toContain("PORTAL_ANALYTICS_COMPARISON_LIMIT");
    expect(page).toContain("<ComparisonModuleBars");
  });
});
