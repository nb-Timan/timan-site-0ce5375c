import { describe, expect, it } from "vitest";
import { computeCompletion } from "@/lib/dealerProfileCompletion";
import type { DealerAccount } from "@/lib/dealerAccountsService";
import type { DealerContact, DealerContactArea } from "@/lib/dealerContactsService";

function dealer(overrides: Partial<DealerAccount> = {}): DealerAccount {
  return {
    id: "dealer-1",
    account_number: "TIMAN",
    company_name: "Timan A/S",
    customer_type: null,
    customer_type_label: null,
    dealer_type: null,
    country: "DK",
    postal_code: "9600",
    city: "Aars",
    address: null,
    address_line_1: "Industrivej 1",
    address_line_2: null,
    zip_city_raw: null,
    email: null,
    phone: null,
    vat_number: "DK12345678",
    primary_contact_name: null,
    primary_contact_email: null,
    primary_contact_phone: null,
    assigned_seller_id: null,
    assigned_seller_initials: null,
    assigned_seller_name: null,
    assigned_seller_email: null,
    source_created_at: null,
    source_changed_at: null,
    is_blocked: false,
    blocked_at: null,
    blocked_by: null,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    parent_account_number: null,
    is_main_account: true,
    branch_name: null,
    director_name: null,
    invoice_email: null,
    payment_terms: "Netto 30",
    currency_code: "DKK",
    finance_contact_name: null,
    finance_contact_phone: null,
    finance_contact_email: null,
    website: null,
    social_facebook: null,
    social_linkedin: null,
    social_tiktok: null,
    social_youtube: null,
    social_instagram: null,
    sales_contact_name: null,
    sales_contact_phone: null,
    sales_contact_email: null,
    sales_has_multiple: false,
    workshop_contact_name: null,
    workshop_contact_phone: null,
    workshop_contact_email: null,
    workshop_has_multiple: false,
    marketing_contact_name: null,
    marketing_contact_phone: null,
    marketing_contact_email: null,
    latitude: null,
    longitude: null,
    geocoded_at: null,
    geocoding_status: null,
    geocoding_error: null,
    google_place_id: null,
    successor_dealer_id: null,
    successor_dealer_account_number: null,
    closed_reason: null,
    closed_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function contact(area: DealerContactArea, overrides: Partial<DealerContact> = {}): DealerContact {
  return {
    id: `${area}-1`,
    dealer_account_id: "dealer-1",
    contact_area: area,
    role_title: null,
    name: `${area} contact`,
    email: `${area}@example.com`,
    phone: null,
    is_primary: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("dealer profile completion", () => {
  it("keeps missing section count separate from field-based profile percentage", () => {
    const completion = computeCompletion(dealer({ website: "https://timan.dk" }), [
      contact("director"),
      contact("finance"),
      contact("parts", { email: null }),
      contact("sales", { is_primary: false }),
      contact("workshop", { email: null }),
      contact("marketing", { name: null, email: null }),
    ]);

    expect(completion.totalSteps).toBe(6);
    expect(completion.completedSteps).toBe(1);
    expect(completion.missingSteps).toBe(5);
    expect(completion.totalRequired).toBe(21);
    expect(completion.filledRequired).toBe(15);
    expect(completion.missingRequired).toBe(6);
    expect(completion.percentage).toBe(71);
  });

  it("matches visible required state: phone and address 2 are optional, website is marketing", () => {
    const completion = computeCompletion(dealer({
      address_line_2: "",
      invoice_email: "invoice@timan.dk",
      website: "https://timan.dk",
    }), [
      contact("director", { phone: null }),
      contact("finance", { phone: null }),
      contact("parts", { phone: null }),
      contact("sales", { is_primary: true, phone: null }),
      contact("workshop", { phone: null }),
      contact("marketing", { phone: null }),
    ]);

    expect(completion.totalRequired).toBe(21);
    expect(completion.filledRequired).toBe(21);
    expect(completion.percentage).toBe(100);
    expect(completion.sections.find((section) => section.key === "marketing")?.required).toBe(3);
  });

  it("uses a complete canonical area contact before a partial one", () => {
    const completion = computeCompletion(dealer({
      invoice_email: "invoice@timan.dk",
      website: "https://timan.dk",
    }), [
      contact("director"),
      contact("finance", { id: "finance-partial", email: null }),
      contact("finance", { id: "finance-complete", name: "Finance Lead", email: "finance@timan.dk" }),
      contact("parts"),
      contact("sales", { is_primary: true }),
      contact("workshop"),
      contact("marketing"),
    ]);

    expect(completion.sections.find((section) => section.key === "finance")?.complete).toBe(true);
    expect(completion.percentage).toBe(100);
  });
});
