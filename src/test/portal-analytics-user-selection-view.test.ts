import { describe, expect, it } from "vitest";
import { resolvePortalAnalyticsUserSelectionView } from "@/lib/portalAnalyticsUserSelectionView";

describe("portal analytics user selection view", () => {
  it("uses the normal scoped users table when no individual users are selected", () => {
    expect(resolvePortalAnalyticsUserSelectionView(0)).toBe("scope");
  });

  it("uses the compact single-user summary for exactly one selected user", () => {
    expect(resolvePortalAnalyticsUserSelectionView(1)).toBe("single");
  });

  it("uses the multi-user notice plus users table for two or more selected users", () => {
    expect(resolvePortalAnalyticsUserSelectionView(2)).toBe("multi");
    expect(resolvePortalAnalyticsUserSelectionView(3)).toBe("multi");
  });
});
