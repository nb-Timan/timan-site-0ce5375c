import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync("src/components/service/ServiceMaintenanceSidebarLayout.tsx", "utf8");
const page = readFileSync("src/pages/ServiceMaintenancePage.tsx", "utf8");

describe("service maintenance navigation", () => {
  it("keeps the sidebar as the sole create entry point", () => {
    expect(sidebar).toContain('da: "Opret serviceregistrering"');
    expect(sidebar).toContain('{ view: "create", icon: PlusCircle }');
    expect(page).not.toContain("newServiceReg");
    expect(page).not.toContain("onClick={() => setView('create')}");
  });

  it("uses the effective view-as role for service navigation and scope", () => {
    expect(page).toContain("useEffectivePortalUserState(appUser)");
    expect(page).toContain("derivePortalRole(effectiveUser)");
    expect(page).toContain("effectiveUser?.dealer_number");
    expect(page).toContain("effectiveUser?.company_dealer");
  });
});
