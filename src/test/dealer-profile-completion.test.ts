import { describe, expect, it } from "vitest";
import { computeCompletion } from "@/lib/dealerProfileCompletion";
import { computeDealerProfileBadge, computeDealerProfileSeverity, hasOnlySoftDealerProfileMissing } from "@/lib/dealerProfileBadge";
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
    payment_terms_override: null,
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
    standard_machine_discount_pct: null,
    importer_discount_pct: null,
    spare_parts_discount_pct: null,
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
    const profile = dealer({ website: "https://timan.dk" });
    const contacts = [
      contact("director"),
      contact("finance"),
      contact("parts", { email: null }),
      contact("sales", { role_title: "Salg", phone: "12345678" }),
      contact("workshop", { email: null }),
      contact("marketing", { name: null, email: null }),
    ];
    const completion = computeCompletion(profile, contacts);

    expect(completion.totalSteps).toBe(6);
    expect(completion.completedSteps).toBe(2);
    expect(completion.missingSteps).toBe(4);
    expect(completion.totalRequired).toBe(22);
    expect(completion.filledRequired).toBe(17);
    expect(completion.missingRequired).toBe(5);
    expect(completion.percentage).toBe(77);
    expect(computeDealerProfileBadge(profile, 0, contacts).missingPercent).toBe(23);
  });

  it("matches visible required state: phone is optional outside sales, address 2 is optional, website is marketing", () => {
    const completion = computeCompletion(dealer({
      address_line_2: "",
      invoice_email: "invoice@timan.dk",
      website: "https://timan.dk",
    }), [
      contact("director", { phone: null }),
      contact("finance", { phone: null }),
      contact("parts", { phone: null }),
      contact("sales", { role_title: "Salg", phone: "12345678" }),
      contact("workshop", { phone: null }),
      contact("marketing", { phone: null }),
    ]);

    expect(completion.totalRequired).toBe(22);
    expect(completion.filledRequired).toBe(22);
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
      contact("sales", { role_title: "Salg", phone: "12345678" }),
      contact("workshop"),
      contact("marketing"),
    ]);

    expect(completion.sections.find((section) => section.key === "finance")?.complete).toBe(true);
    expect(completion.percentage).toBe(100);
  });

  it("keeps CRM list status consistent when canonical contacts complete the profile", () => {
    const completeDealer = dealer({
      email: "info@timan.dk",
      invoice_email: "invoice@timan.dk",
      website: "https://timan.dk",
      latitude: 56.7,
      longitude: 9.5,
    });
    const contacts = [
      contact("director"), contact("finance"), contact("parts"),
      contact("sales", { role_title: "Salg", phone: "12345678" }), contact("workshop"), contact("marketing"),
    ];

    expect(computeDealerProfileSeverity(completeDealer, 0)).toBe("partial");
    expect(computeDealerProfileSeverity(completeDealer, 0, contacts)).toBe("complete");
  });

  it("uses a complete legacy sales contact identically in list and detail completion", () => {
    const profile = dealer({
      email: "info@timan.dk",
      invoice_email: "invoice@timan.dk",
      website: "https://timan.dk",
      latitude: 56.7,
      longitude: 9.5,
      sales_contact_name: "Legacy sales",
      sales_contact_email: "sales@timan.dk",
      sales_contact_phone: "12345678",
    });
    const contacts = [
      contact("director"), contact("finance"), contact("parts"),
      contact("workshop"), contact("marketing"),
    ];

    expect(computeCompletion(profile, contacts).percentage).toBe(100);
    expect(computeDealerProfileBadge(profile, 0, contacts).missingPercent).toBe(0);
    expect(computeDealerProfileSeverity(profile, 0, contacts)).toBe("complete");
  });

  it("treats a missing marketing section as the only soft CRM profile gap", () => {
    const profile = dealer({
      email: "info@timan.dk",
      invoice_email: "invoice@timan.dk",
      latitude: 56.7,
      longitude: 9.5,
    });
    const contacts = [
      contact("director"), contact("finance"), contact("parts"),
      contact("sales", { role_title: "Salg", phone: "12345678" }), contact("workshop"),
      contact("marketing", { name: null, email: null }),
    ];

    expect(hasOnlySoftDealerProfileMissing(profile, contacts)).toBe(true);
  });

  it("marks sales complete from one canonical contact with role, name, email, and phone", () => {
    const completion = computeCompletion(dealer(), [
      contact("sales", { role_title: "Salg", phone: "12345678", is_primary: false }),
    ]);

    expect(completion.sections.find((section) => section.key === "sales")).toMatchObject({
      required: 4,
      filled: 4,
      complete: true,
    });
  });

  it("keeps sales incomplete when the canonical contact is missing email", () => {
    const completion = computeCompletion(dealer(), [
      contact("sales", { role_title: "Salg", phone: "12345678", email: null }),
    ]);

    expect(completion.sections.find((section) => section.key === "sales")).toMatchObject({
      required: 4,
      filled: 3,
      complete: false,
    });
  });
});
