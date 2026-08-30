import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dealerDataSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/pages/portal/DealerDataPage.tsx"),
  "utf8",
);

const dealerProfileSource = fs.readFileSync(
  path.resolve(process.cwd(), "src/components/portal/DealerProfileEditor.tsx"),
  "utf8",
);

describe("Partnerdata layout regression guard", () => {
  it("keeps CRM-style tabs and demo machines out of Partnerdata", () => {
    expect(dealerDataSource).not.toContain("TabsList");
    expect(dealerDataSource).not.toContain("TabsTrigger");
    expect(dealerDataSource).not.toContain("DemoMachinesWidget");
    expect(dealerDataSource).not.toContain("MachineRegisterTable");
    expect(dealerDataSource).not.toContain("dealerMachineRegisterService");
  });

  it("renders the dealer profile editor directly when a partner is loaded", () => {
    expect(dealerDataSource).toContain("<DealerProfileEditor");
    expect(dealerDataSource).not.toContain("value=\"machines\"");
    expect(dealerDataSource).not.toContain("value=\"documents\"");
    expect(dealerDataSource).not.toContain("value=\"overview\"");
  });

  it("keeps social and marketing fields inside the Marketing section", () => {
    const companyIndex = dealerProfileSource.indexOf('skey="company"');
    const marketingIndex = dealerProfileSource.indexOf('skey="marketing"');
    const facebookIndex = dealerProfileSource.indexOf('id="social_facebook"');

    expect(companyIndex).toBeGreaterThan(-1);
    expect(marketingIndex).toBeGreaterThan(-1);
    expect(facebookIndex).toBeGreaterThan(marketingIndex);
  });
});
