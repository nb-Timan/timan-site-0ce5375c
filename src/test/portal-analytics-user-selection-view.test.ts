import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolvePortalAnalyticsUserSelectionView } from "@/lib/portalAnalyticsUserSelectionView";

describe("portal analytics user selection view", () => {
  it("uses the normal scoped users table when no individual users are selected", () => {
    expect(resolvePortalAnalyticsUserSelectionView(0)).toBe("scope");
  });

  it("uses the compact single-user summary for exactly one selected user", () => {
    expect(resolvePortalAnalyticsUserSelectionView(1)).toBe("single");
  });

  it("uses the users table for two or more selected users", () => {
    expect(resolvePortalAnalyticsUserSelectionView(2)).toBe("multi");
    expect(resolvePortalAnalyticsUserSelectionView(3)).toBe("multi");
  });

  it("renders the users table directly before analytics charts when shown", () => {
    const source = readFileSync("src/pages/backend/BackendPortalAnalyticsPage.tsx", "utf8");
    const renderSource = source.slice(source.indexOf("{busy || !analytics ? ("));

    expect(source).not.toContain("SelectedUsersNotice");
    expect(renderSource.match(/<DataTable analytics=\{analytics\}/g)).toHaveLength(1);

    const usersTableIndex = renderSource.indexOf("{showUsersTable && <DataTable analytics={analytics} />}");
    const moduleChartIndex = renderSource.indexOf("Modulbrug denne uge");

    expect(usersTableIndex).toBeGreaterThan(-1);
    expect(moduleChartIndex).toBeGreaterThan(usersTableIndex);
  });
});
