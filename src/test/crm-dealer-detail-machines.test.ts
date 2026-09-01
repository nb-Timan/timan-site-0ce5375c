import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/crm/CrmDealerDetailPage.tsx", "utf8");

describe("CRM dealer detail machine register integration", () => {
  it("renders the canonical dealer detail route with a machines tab", () => {
    expect(source).toContain('["machines", tl("tab_machines", lang)]');
    expect(source).toContain('<TabsContent value="machines"');
    expect(source).toContain("CrmMachineRegisterPanel");
  });

  it("shows the demo machine panel in the overview right column even for empty data", () => {
    expect(source).toContain("CrmDemoMachinesPanel");
    expect(source).toContain('tl("no_active_demo_machines", lang)');
    expect(source).toContain('setActiveTab("machines")');
  });

  it("keeps recent quotes and activities side by side while making relation and demo panels full width", () => {
    expect(source).toContain('<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">');
    expect(source).toContain('<div className="sm:col-span-2">');
    expect(source.indexOf('tl("recent_quotes", lang)')).toBeLessThan(source.indexOf("CollaborationPartnersPanel"));
    expect(source.indexOf('tl("recent_activities", lang)')).toBeLessThan(source.indexOf("CrmDemoMachinesPanel"));
  });

  it("reuses the shared dealer machine register service from DealerDataPage", () => {
    expect(source).toContain("listDealerMachineRegister");
    expect(source).toContain("getDemoOverviewMachines");
    expect(source).toContain("DealerMachineRegisterRow");
  });

  it("shows the canonical company name under the company and personal data quick card", () => {
    expect(source).toContain('{ key: "dealer-data", label: tl("open_dealer_data", lang), sublabel: dealer.company_name || undefined');
  });

  it("uses the shared Partnerdata first-contact resolver for quick cards", () => {
    expect(source).toContain("resolveCanonicalFirstContact(dealer, contacts)");
    expect(source).not.toContain("contacts.find((c) => c.is_primary)");
    expect(source).toContain("(primaryName || callPhone) ? { key: \"call\"");
    expect(source).toContain("const mailAddr  = primaryEmail || (!firstContact ? dealer.email : null);");
  });
});
