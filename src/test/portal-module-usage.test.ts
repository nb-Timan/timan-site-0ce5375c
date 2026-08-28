import { describe, expect, it } from "vitest";
import {
  calculateModuleActiveSeconds,
  derivePortalModuleKey,
  shouldCountModuleHeartbeat,
} from "@/lib/visitorTracking";

describe("portal module usage tracking", () => {
  it("maps CRM Leads and Budget to separate module keys", () => {
    expect(derivePortalModuleKey("/portal/crm/leads")).toBe("crm_leads");
    expect(derivePortalModuleKey("/portal/crm/budget")).toBe("crm_budget");
  });

  it("maps marketing, configurator and messe routes to stable module keys", () => {
    expect(derivePortalModuleKey("/portal/marketing/site-features")).toBe("marketing_site_features");
    expect(derivePortalModuleKey("/configurator")).toBe("configurator");
    expect(derivePortalModuleKey("/messe/partner-map")).toBe("messe_partner_map");
  });

  it("only counts active time when the tab is visible and recently used", () => {
    const nowMs = 10_000;
    expect(shouldCountModuleHeartbeat({ visible: true, nowMs, lastInteractionMs: nowMs - 30_000 })).toBe(true);
    expect(shouldCountModuleHeartbeat({ visible: false, nowMs, lastInteractionMs: nowMs - 30_000 })).toBe(false);
    expect(shouldCountModuleHeartbeat({ visible: true, nowMs, lastInteractionMs: nowMs - 130_000 })).toBe(false);
  });

  it("caps active seconds per heartbeat", () => {
    expect(calculateModuleActiveSeconds({ nowMs: 60_000, lastHeartbeatMs: 15_000 })).toBe(45);
    expect(calculateModuleActiveSeconds({ nowMs: 180_000, lastHeartbeatMs: 0 })).toBe(90);
  });
});
