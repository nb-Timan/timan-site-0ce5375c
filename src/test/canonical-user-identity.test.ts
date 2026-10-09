import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalDisplayName, canonicalInitials } from "@/lib/canonicalUserIdentity";
import { resolveReferencedUserInitials, type SellerDirectory } from "@/lib/sellerDirectory";

const directory: SellerDirectory = {
  list: [{
    id: "user-nb",
    email: "nb@timan.dk",
    initials: "NB",
    full_name: "Nicolai Moesgaard",
    portal_role: "timan_backend",
    company: "Timan",
    phone: null,
  }],
  byId: new Map(),
  byEmail: new Map(),
  byInitials: new Map(),
};
directory.byId.set("user-nb", directory.list[0]);
directory.byEmail.set("nb@timan.dk", directory.list[0]);
directory.byInitials.set("NB", directory.list[0]);

const portalHeader = readFileSync("src/components/portal/PortalHeader.tsx", "utf8");
const crmActivities = readFileSync("src/pages/crm/CrmActivitiesPage.tsx", "utf8");

describe("canonical portal user identity", () => {
  it("prioritizes app_users.display_name over the legacy full_name", () => {
    const row = { email: "sales@timan.dk", display_name: "Tilman Sales", full_name: "Timan Sales", initials: "TS" };
    expect(canonicalDisplayName(row)).toBe("Tilman Sales");
    expect(canonicalInitials(row)).toBe("TS");
  });

  it("uses full_name and email only when the canonical display name is absent", () => {
    expect(canonicalDisplayName({ email: "sales@timan.dk", full_name: "Timan Sales" })).toBe("Timan Sales");
    expect(canonicalDisplayName({ email: "sales@timan.dk" })).toBe("sales");
  });

  it("prefers configured initials for history rows with a canonical user reference", () => {
    expect(resolveReferencedUserInitials({
      userId: "user-nb",
      legacyLabel: "Nicolai Moesgaard",
    }, directory)).toBe("NB");
    expect(resolveReferencedUserInitials({
      userId: "user-nb",
      legacyLabel: "nb@timan.dk",
    }, directory)).toBe("NB");
  });

  it("preserves legacy author text when no canonical user reference exists", () => {
    expect(resolveReferencedUserInitials({ legacyLabel: "MN" }, directory)).toBe("MN");
    expect(resolveReferencedUserInitials({ legacyLabel: "Legacy User" }, directory)).toBe("Legacy User");
  });

  it("keeps header initials canonical and resolves CRM activity authors by user reference", () => {
    expect(portalHeader).toContain("user.initials || getInitials(displayName)");
    expect(crmActivities).toContain("resolveReferencedUserInitials");
    expect(crmActivities).toContain("userId: a.created_by_user_id");
  });
});
