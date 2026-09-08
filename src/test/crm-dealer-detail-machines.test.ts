import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/pages/crm/CrmDealerDetailPage.tsx", "utf8");
const financialRedactionMigration = readFileSync(
  "supabase/migrations/20260908090000_redact_external_machine_financials.sql",
  "utf8",
);

describe("CRM dealer detail machine register integration", () => {
  it("renders the canonical dealer detail route with a machines tab", () => {
    expect(source).toContain('["machines", tl("tab_machines", lang)]');
    expect(source).toContain('<TabsContent value="machines"');
    expect(source).toContain("CrmMachineRegisterPanel");
  });

  it("shows the demo machine panel in the overview right column even for empty data", () => {
    expect(source).toContain("CrmDemoMachinesPanel");
    expect(source).toContain("CrmDemoMachinesPreview");
    expect(source).not.toContain("demoOverviewMachines");
    expect(source).not.toContain("machineStatusFilter");
    expect(source).toContain('tl("no_active_demo_machines", lang)');
    expect(source).toContain('setActiveTab("machines")');
  });

  it("keeps recent quotes and activities side by side while making relation and demo panels full width", () => {
    expect(source).toContain('<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">');
    expect(source).toContain('<div className="sm:col-span-2">');
    expect(source.indexOf('tl("recent_quotes", lang)')).toBeLessThan(source.indexOf("CollaborationPartnersPanel"));
    expect(source.indexOf('tl("recent_activities", lang)')).toBeLessThan(source.indexOf("CrmDemoMachinesPanel"));
  });

  it("uses the canonical paged machine registry through the shared dealer machine register service", () => {
    expect(source).toContain("fetchDealerMachineRegisterPage");
    expect(source).toContain("demoOnly");
    expect(source).toContain("DealerMachineRegisterRow");
    expect(source).toContain("withSellerScopeIdentity(effectiveUser, sellerView?.email)");
    expect(source).toContain('sellerView ? "timan_seller" : portalRole');
  });

  it("keeps the View-as machine scope request stable after it updates page state", () => {
    expect(source).toContain("const effectiveUserKey = [");
    expect(source).toContain("effectiveUser?.email?.trim().toLowerCase() ?? \"\"");
    expect(source).toContain("[appUser, effectiveUserKey, accountNumber, portalRole");
    expect(source).not.toContain("[appUser, effectiveUser, accountNumber, portalRole");
  });

  it("uses the dealer preview only to hide commercial fields, without changing the machine source", () => {
    expect(source).toContain('showFinancials={!externalCrm && machinePresentation === "timan"}');
    expect(source).toContain('machinePresentation={machinePresentation}');
    expect(source).toContain('onMachinePresentationChange={setMachinePresentation}');
    expect(source).toContain('{showFinancials && <>');
  });

  it("redacts commercial values in the RPC for external roles", () => {
    expect(financialRedactionMigration).toContain("'timan_backend', 'timan_service', 'timan_seller'");
    expect(financialRedactionMigration).toContain("au.auth_user_id = auth.uid()");
    expect(financialRedactionMigration).toContain("then revenue else null end");
    expect(financialRedactionMigration).toContain("then cost_amount else null end");
  });

  it("shows the separate commercial identifiers only in their own columns", () => {
    expect(source).toContain('label="Garanti nr." sortKey="warrantyId"');
    expect(source).toContain('label="MO nr." sortKey="machineOrder"');
    expect(source).toContain('label="ERP nr." sortKey="erpOrder"');
    expect(source).toContain('label="Portal-ordrenr." sortKey="portalOrder"');
    expect(source).toContain("row.machineOrderNumber || \"—\"");
    expect(source).toContain("row.erpOrderNumber || \"—\"");
    expect(source).toContain("row.portalOrderNumber || \"—\"");
    expect(source).toContain('label="Fakturanr." sortKey="invoice"');
    expect(source).toContain('label="Omsætning" sortKey="revenue"');
    expect(source).toContain('label="Kostpris" sortKey="cost"');
    expect(source).toContain('label="Dækningsbidrag" sortKey="margin"');
    expect(source).toContain('label="Dækningsgrad" sortKey="marginPercent"');
    expect(source).toContain("formatDkk(row.costAmount)");
    expect(source).toContain("formatPercent(row.revenue, row.contributionMarginAmount)");
  });

  it("sends every visible sortable column to the canonical paged registry", () => {
    expect(source).toContain("dealer, scope, query, demoOnly, sort, direction, page, pageSize,");
    expect(source).toContain('label="Fakturanr." sortKey="invoice"');
    expect(source).toContain('label="Omsætning" sortKey="revenue"');
    expect(source).toContain('label="Kostpris" sortKey="cost"');
    expect(source).toContain('label="Dækningsbidrag" sortKey="margin"');
    expect(source).toContain('label="Dækningsgrad" sortKey="marginPercent"');
    expect(source).toContain('setSort("delivery"); setDirection("desc"); setPage(1);');
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

  it("does not truncate the assigned seller phone number", () => {
    expect(source).toContain('showFullSublabel: true');
    expect(source).toContain('a.showFullSublabel');
  });
});
