import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getLoansBackTarget, getPortalBackInfo, getPortalBackTarget } from "@/lib/portalBackNav";

describe("portal header parent navigation", () => {
  it.each([
    ['/portal/loans', '/portal/salg-marketing'],
    ['/portal/loans?view=stock', '/portal/salg-marketing'],
    ['/portal/loans?view=sale', '/portal/salg-marketing'],
    ['/portal/loans?status=closed', '/portal/salg-marketing'],
    ['/portal/loans/new', '/portal/loans'],
    ['/portal/loans/case-123', '/portal/loans'],
    ['/portal/loans/case-123/return', '/portal/loans/case-123'],
    ['/portal/loans/case-123/accept', '/portal/loans/case-123'],
    ['/portal/loans/case-123/return/?view=stock#photo', '/portal/loans/case-123'],
  ])('resolves the logical Loans parent for %s', (path, parent) => {
    expect(getLoansBackTarget(path)).toBe(parent);
    expect(getPortalBackTarget(path, '?fromMachine=unrelated')).toBe(parent);
    expect(getPortalBackInfo(path).to).toBe(parent);
  });

  it('does not claim unrelated routes or change the sales-stock Configurator handoff', () => {
    expect(getLoansBackTarget('/portal/loans-other/new')).toBeNull();
    expect(getLoansBackTarget('/portal/crm/leads/42')).toBeNull();
    expect(getPortalBackTarget('/configurator', '?salesStock=1')).toBe('/portal/salg-marketing');
  });

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
