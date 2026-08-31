import { describe, expect, it } from "vitest";
import {
  resolveAnalyticsAudienceScope,
  resolveAnalyticsPartnerAccountType,
  type AnalyticsAudienceUser,
} from "@/lib/portalAnalyticsAudienceScope";

const users: AnalyticsAudienceUser[] = [
  {
    user_id: "backend-1",
    email: "nb@timan.dk",
    display_name: "NB Backend",
    portal_role: "timan_backend",
    dealer_number: null,
  },
  {
    user_id: "seller-em",
    email: "em@timan.dk",
    display_name: "EM",
    portal_role: "timan_seller",
    dealer_number: null,
  },
  {
    user_id: "seller-bp",
    email: "bp@timan.dk",
    display_name: "BP",
    portal_role: "timan_seller",
    dealer_number: null,
  },
  {
    user_id: "messe-1",
    email: "messe@timan.dk",
    display_name: "Timan Messe",
    portal_role: "exhibition_user",
    dealer_number: null,
  },
  {
    user_id: "dag-1",
    email: "dag@example.com",
    display_name: "Dag Vilster Petersen",
    portal_role: "dealer_user",
    dealer_number: "DAG01",
    partner_account_type: "dealer",
  },
  {
    user_id: "importer-1",
    email: "importer@example.com",
    display_name: "Import GmbH",
    portal_role: "timan_importer",
    dealer_number: "IMP01",
    dealer_customer_type_label: "Importør",
  },
  {
    user_id: "service-1",
    email: "service@example.com",
    display_name: "Service GmbH",
    portal_role: "timan_service_partner",
    dealer_number: "SRV01",
    dealer_customer_type: "Service Partner",
  },
  {
    user_id: "system-1",
    email: "system@example.com",
    display_name: "Technical System",
    portal_role: null,
    dealer_number: null,
  },
];

describe("portal analytics audience scope", () => {
  it("keeps Timan-sælgere to canonical seller users only", () => {
    const scope = resolveAnalyticsAudienceScope({ users, audience: "timan_sellers" });
    expect(scope.effectiveUserKeys).toEqual(["seller-bp", "seller-em"]);
    expect(scope.effectiveUsers.map((user) => user.display_name)).not.toContain("Timan Messe");
    expect(scope.effectiveUsers.map((user) => user.display_name)).not.toContain("Dag Vilster Petersen");
  });

  it("keeps Alle Timan internal and includes Timan Messe outside seller scope", () => {
    const scope = resolveAnalyticsAudienceScope({ users, audience: "timan" });
    expect(scope.effectiveUserKeys).toEqual(["seller-bp", "seller-em", "backend-1", "messe-1"]);
    expect(scope.effectiveUsers.map((user) => user.display_name)).toContain("Timan Messe");
    expect(scope.effectiveUsers.map((user) => user.display_name)).not.toContain("Dag Vilster Petersen");
  });

  it("filters Samarbejdspartnere by canonical partner account type", () => {
    const dealers = resolveAnalyticsAudienceScope({ users, audience: "partners", partnerType: "dealer" });
    const importers = resolveAnalyticsAudienceScope({ users, audience: "partners", partnerType: "importer" });
    const servicePartners = resolveAnalyticsAudienceScope({ users, audience: "partners", partnerType: "service_partner" });

    expect(dealers.effectiveUsers.map((user) => user.display_name)).toEqual(["Dag Vilster Petersen"]);
    expect(importers.effectiveUsers.map((user) => user.display_name)).toEqual(["Import GmbH"]);
    expect(servicePartners.effectiveUsers.map((user) => user.display_name)).toEqual(["Service GmbH"]);
  });

  it("combines analysable portal users and excludes unclassified technical accounts", () => {
    const scope = resolveAnalyticsAudienceScope({ users, audience: "portal" });
    expect(scope.effectiveUserKeys).not.toContain("system-1");
    expect(scope.effectiveUsers).toHaveLength(7);
  });

  it("uses role filters only as narrowing filters inside the selected audience", () => {
    const scope = resolveAnalyticsAudienceScope({
      users,
      audience: "partners",
      partnerType: "dealer",
      selectedRoles: ["timan_backend"],
    });

    expect(scope.baseUsers.map((user) => user.display_name)).toEqual(["Dag Vilster Petersen"]);
    expect(scope.effectiveUsers).toHaveLength(0);
  });

  it("resolves partner types from dealer account metadata before role fallback", () => {
    expect(resolveAnalyticsPartnerAccountType(users[5])).toBe("importer");
    expect(resolveAnalyticsPartnerAccountType(users[6])).toBe("service_partner");
    expect(resolveAnalyticsPartnerAccountType(users[4])).toBe("dealer");
  });
});
