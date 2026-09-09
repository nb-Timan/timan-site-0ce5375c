import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const app = fs.readFileSync(path.resolve(process.cwd(), "src/App.tsx"), "utf8");
const portal = fs.readFileSync(path.resolve(process.cwd(), "src/pages/PortalPage.tsx"), "utf8");

describe("CRM mine forhandlere runtime route", () => {
  it("keeps the CRM analytics route separate from Partnerdata and recovers a stale page chunk once", () => {
    expect(app).toContain('path="/portal/dealer-data" element={<DealerDataPage />}');
    expect(app).toContain('path="/portal/crm/my-dealers" element={<AcademyCapabilityGuard capability="crm"><CrmMyDealersPage /></AcademyCapabilityGuard>}');
    expect(app).toContain('lazyWithDynamicImportRecovery(() => import("./pages/crm/CrmMyDealersPage"))');
    expect(app).toContain('CRM_MY_DEALERS_CHUNK_RELOAD_KEY');
    expect(portal).toContain("dealer_data:    { to: '/portal/dealer-data'");
    expect(portal).not.toContain('/portal/crm/my-dealers?view=partner-list');
    expect(portal).not.toContain('const ownDealerPath');
  });
});
