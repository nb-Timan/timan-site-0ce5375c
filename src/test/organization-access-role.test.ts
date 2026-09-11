import { describe, expect, it } from "vitest";
import { DEFAULT_MODULE_ACCESS } from "@/lib/portalAccess";
import {
  hasCollaborationManagerAccess,
  normalizeOrganizationAccessRole,
} from "@/lib/organizationAccess";

describe("collaboration_manager access role", () => {
  it("only recognizes the canonical external organization role", () => {
    expect(normalizeOrganizationAccessRole("collaboration_manager")).toBe("collaboration_manager");
    expect(normalizeOrganizationAccessRole("timan_backend")).toBeNull();
    expect(normalizeOrganizationAccessRole(null)).toBeNull();
    expect(hasCollaborationManagerAccess({ organization_access_role: "collaboration_manager" }, "timan_dealer")).toBe(true);
    expect(hasCollaborationManagerAccess({ organization_access_role: "collaboration_manager" }, "timan_seller")).toBe(false);
  });

  it("does not grant modules through the organization role", () => {
    expect(DEFAULT_MODULE_ACCESS.dealer_user).not.toContain("timan_backend");
    expect(DEFAULT_MODULE_ACCESS.dealer_user).not.toContain("timan_crm");
  });
});
