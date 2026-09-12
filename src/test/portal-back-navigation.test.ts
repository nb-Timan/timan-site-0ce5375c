import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getPortalBackTarget } from "@/lib/portalBackNav";

describe("portal header parent navigation", () => {
  it("returns the Sales root to the portal home", () => {
    expect(getPortalBackTarget("/portal/salg-marketing")).toBe("/portal");
  });

  it("returns Sales children to the Sales root", () => {
    expect(getPortalBackTarget("/configurator")).toBe("/portal/salg-marketing");
    expect(getPortalBackTarget("/portal/videos")).toBe("/portal/salg-marketing");
    expect(getPortalBackTarget("/portal/resources")).toBe("/portal/salg-marketing");
    expect(getPortalBackTarget("/portal/misc/forms")).toBe("/portal/salg-marketing");
    expect(getPortalBackTarget("/portal/contracts")).toBe("/portal/salg-marketing");
  });

  it("keeps nested routes within their established parent areas", () => {
    expect(getPortalBackTarget("/portal/videos/maintenance")).toBe("/portal/videos");
    expect(getPortalBackTarget("/portal/resources/driftberegner")).toBe("/portal/resources");
    expect(getPortalBackTarget("/portal/crm/leads/42")).toBe("/portal/crm/leads");
  });

  it("uses the canonical parent route in the shared header instead of browser history", () => {
    const header = readFileSync("src/components/portal/PortalHeader.tsx", "utf8");
    const backButton = header.slice(header.indexOf("{showPortalBackButton && ("), header.indexOf("{showPortalBackButton && (") + 1300);

    expect(backButton).toContain("onClick={() => navigate(portalBackTarget)}");
    expect(backButton).not.toContain("navigate(-1)");
    expect(backButton).not.toContain("window.history");
  });
});
