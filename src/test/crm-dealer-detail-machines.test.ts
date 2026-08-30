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

  it("reuses the shared dealer machine register service from DealerDataPage", () => {
    expect(source).toContain("listDealerMachineRegister");
    expect(source).toContain("getDemoOverviewMachines");
    expect(source).toContain("DealerMachineRegisterRow");
  });
});
