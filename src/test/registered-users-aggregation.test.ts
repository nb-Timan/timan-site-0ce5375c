import { describe, expect, it } from "vitest";
import { buildRegisteredUserRows, type PortalUserLike } from "@/components/portal/RegisteredUsersTable";
import type { DealerContact } from "@/lib/dealerContactsService";

function contact(overrides: Partial<DealerContact>): DealerContact {
  return {
    id: "contact-id",
    dealer_account_id: "dealer-1",
    contact_area: "sales",
    role_title: null,
    name: null,
    email: null,
    phone: null,
    is_primary: false,
    created_at: "2026-08-31T00:00:00.000Z",
    updated_at: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("registered users aggregation", () => {
  it("counts one unique person while preserving multiple roles and areas", () => {
    const portalUsers: PortalUserLike[] = [{
      id: "user-roman",
      email: "roman@avistech.cz",
      full_name: "Ing. Roman Guichen",
      portal_role: "Partner",
      phone: "+420 111 222 333",
      status: "active",
    }];

    const contacts = [
      contact({
        id: "director-roman",
        contact_area: "director",
        role_title: "Direktør",
        name: "Ing. Roman Guichen",
        email: "ROMAN@avistech.cz",
        phone: "+420 111 222 333",
        is_primary: true,
      }),
      contact({
        id: "sales-roman",
        contact_area: "sales",
        role_title: "Sælger",
        name: "Ing. Roman Guichen",
        email: "roman@avistech.cz",
        phone: "+420 111 222 333",
      }),
    ];

    const rows = buildRegisteredUserRows(portalUsers, contacts, "da");
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Ing. Roman Guichen");
    expect(rows[0].roles).toEqual(["Partner", "Direktør", "Sælger"]);
    expect(rows[0].areas).toEqual(["Direktør", "Salg"]);
    expect(rows[0].isPrimary).toBe(true);
  });

  it("does not merge email-less contacts by name alone", () => {
    const contacts = [
      contact({ id: "one", name: "Samme Navn", role_title: "Direktør", contact_area: "director" }),
      contact({ id: "two", name: "Samme Navn", role_title: "Sælger", contact_area: "sales" }),
    ];

    const rows = buildRegisteredUserRows([], contacts, "da");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.key)).toEqual(["contact:one", "contact:two"]);
  });
});
