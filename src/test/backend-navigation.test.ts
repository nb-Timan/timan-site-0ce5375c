import { describe, expect, it } from "vitest";
import { backendSections, getBackendSectionForPath } from "@/lib/backendNavigation";

describe("backend navigation", () => {
  it("groups existing backend functions under fixed main areas", () => {
    const sections = Object.fromEntries(backendSections.map((section) => [section.id, section]));

    expect(sections["user-management"].items.map((item) => item.title)).toEqual([
      "Brugere",
      "Roller",
      "Modul-adgang",
      "Audit Log",
      "Timan sælgere",
    ]);
    expect(sections["data-integrations"].items.map((item) => item.title)).toContain("Budget Import");
    expect(sections["analytics"].items.map((item) => item.title)).not.toContain("Budget Dashboard");
    expect(sections.system.items.map((item) => item.title)).not.toContain("Nyheder");
    expect(sections.system.items.map((item) => item.title)).not.toContain("Nye features på sitet");
    expect(sections.system.items.find((item) => item.title === "Mailoversigt")?.to).toBe("/portal/backend/mailoversigt");
  });

  it("resolves active backend sidebar section for nested and tabbed routes", () => {
    expect(getBackendSectionForPath("/portal/backend")).toBe("dashboard");
    expect(getBackendSectionForPath("/portal/backend/users")).toBe("user-management");
    expect(getBackendSectionForPath("/portal/backend/dealer-accounts")).toBe("partner-management");
    expect(getBackendSectionForPath("/portal/backend/data", "?tab=garanti")).toBe("partner-management");
    expect(getBackendSectionForPath("/portal/backend/data", "?tab=forhandlere")).toBe("partner-management");
    expect(getBackendSectionForPath("/portal/backend/data")).toBe("data-integrations");
    expect(getBackendSectionForPath("/portal/backend/budget-import")).toBe("data-integrations");
    expect(getBackendSectionForPath("/portal/backend/portal-analytics")).toBe("analytics");
    expect(getBackendSectionForPath("/portal/backend/system-map")).toBe("system");
    expect(getBackendSectionForPath("/portal/backend/mailoversigt")).toBe("system");
  });
});
