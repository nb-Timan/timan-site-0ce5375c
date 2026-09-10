import { describe, expect, it } from "vitest";
import {
  formatBudgetReferenceDealerContact,
  sortBudgetReferenceDealerContacts,
} from "@/lib/budgetReferenceDealerContacts";
import type { DealerContact } from "@/lib/dealerContactsService";

function contact(overrides: Partial<DealerContact>): DealerContact {
  return {
    id: "contact-id",
    dealer_account_id: "dealer-id",
    contact_area: "marketing",
    role_title: null,
    name: "Kontakt",
    email: null,
    phone: null,
    is_primary: false,
    created_at: "2026-09-10T10:00:00.000Z",
    updated_at: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

describe("budget reference dealer contacts", () => {
  it("prioritises relevant canonical roles before other contacts", () => {
    const contacts = sortBudgetReferenceDealerContacts([
      contact({ id: "other", name: "Maja", contact_area: "marketing" }),
      contact({ id: "parts", name: "Per", contact_area: "parts", role_title: "Reservedelsbestiller" }),
      contact({ id: "sales", name: "Søren", contact_area: "sales" }),
      contact({ id: "director", name: "Ditte", contact_area: "director" }),
      contact({ id: "purchasing", name: "Ida", contact_area: "finance", role_title: "Indkøber" }),
    ]);

    expect(contacts.map((item) => item.id)).toEqual(["director", "sales", "purchasing", "parts", "other"]);
  });

  it("formats each option with name, role and email", () => {
    expect(formatBudgetReferenceDealerContact(contact({
      name: "Anna Amrhein",
      contact_area: "sales",
      role_title: "Sælger",
      email: "anna@example.com",
    }))).toBe("Anna Amrhein · Sælger · anna@example.com");
  });
});
