import { describe, expect, it } from "vitest";
import { resolveCanonicalFirstContact, type DealerContact } from "@/lib/dealerContactsService";

function contact(overrides: Partial<DealerContact> = {}): DealerContact {
  return {
    id: "contact-1",
    dealer_account_id: "dealer-100",
    contact_area: "sales",
    role_title: null,
    name: "Birger Pedersen",
    email: "bp@timan.dk",
    phone: null,
    is_primary: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const dealer = {
  primary_contact_name: "Legacy Primary",
  primary_contact_email: "primary@example.com",
  primary_contact_phone: "11111111",
  sales_contact_name: "Legacy Sales",
  sales_contact_email: "sales@example.com",
  sales_contact_phone: "22222222",
};

describe("canonical dealer first-contact resolver", () => {
  it("prefers the explicit Partnerdata first contact across contact areas", () => {
    const resolved = resolveCanonicalFirstContact(dealer, [
      contact({ contact_area: "finance", is_primary: false, name: "Finance", email: "finance@example.com" }),
      contact({ contact_area: "director", is_primary: true, name: "Birger Pedersen", email: "birger@example.com", phone: "" }),
    ]);

    expect(resolved).toEqual({
      name: "Birger Pedersen",
      email: "birger@example.com",
      phone: null,
      source: "dealer_contacts",
    });
  });

  it("uses legacy primary fields before the documented sales fallback", () => {
    expect(resolveCanonicalFirstContact(dealer, [])?.source).toBe("dealer_accounts_primary");
    expect(resolveCanonicalFirstContact({ ...dealer, primary_contact_name: null, primary_contact_email: null, primary_contact_phone: null }, [])).toMatchObject({
      name: "Legacy Sales",
      email: "sales@example.com",
      phone: "22222222",
      source: "dealer_accounts_sales",
    });
  });

  it("does not guess from the first non-primary contact row", () => {
    const resolved = resolveCanonicalFirstContact({
      primary_contact_name: null,
      primary_contact_email: null,
      primary_contact_phone: null,
      sales_contact_name: null,
      sales_contact_email: null,
      sales_contact_phone: null,
    }, [
      contact({ is_primary: false, name: "Not First", email: "not-first@example.com" }),
    ]);

    expect(resolved).toBeNull();
  });
});
