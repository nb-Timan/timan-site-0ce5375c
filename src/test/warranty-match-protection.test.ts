import { describe, expect, it } from "vitest";
import { isPortalApprovedDealerMatch } from "../../supabase/functions/_shared/warranty-match-protection";

describe("warranty dealer match protection", () => {
  it("does not protect rows without a dealer link", () => {
    expect(isPortalApprovedDealerMatch(null)).toBe(false);
    expect(isPortalApprovedDealerMatch({ dealer_match_method: "manual" })).toBe(false);
  });

  it("does not protect ordinary automatic matches", () => {
    expect(isPortalApprovedDealerMatch({
      dealer_account_id: "dealer-1",
      dealer_match_method: "exact_name",
    })).toBe(false);
    expect(isPortalApprovedDealerMatch({
      dealer_account_id: "dealer-1",
      dealer_match_method: "alias",
    })).toBe(false);
  });

  it("protects manual or reviewed portal matches", () => {
    expect(isPortalApprovedDealerMatch({
      dealer_account_id: "dealer-1",
      dealer_match_method: "manual",
    })).toBe(true);
    expect(isPortalApprovedDealerMatch({
      dealer_account_id: "dealer-1",
      dealer_match_reviewed_at: "2026-08-28T12:00:00Z",
    })).toBe(true);
    expect(isPortalApprovedDealerMatch({
      dealer_account_id: "dealer-1",
      dealer_match_reviewed_by: "user-1",
    })).toBe(true);
  });
});
