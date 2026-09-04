import { describe, expect, it } from "vitest";
import type { DealerAccount } from "@/lib/dealerAccountsService";
import {
  buildDealerDetailRowsFromVisibleDealers,
  canOpenDealerDetailFromVisibleDealers,
} from "@/lib/dealerDetailScope";

function dealer(
  accountNumber: string,
  overrides: Partial<DealerAccount> = {},
): DealerAccount {
  return {
    id: `dealer-${accountNumber}`,
    account_number: accountNumber,
    company_name: `Dealer ${accountNumber}`,
    customer_type: "Forhandler",
    customer_type_label: "Forhandler",
    dealer_type: "dealer",
    country: "DK",
    postal_code: "7500",
    city: "Holstebro",
    address: "Testvej 1",
    address_line_1: "Testvej 1",
    address_line_2: null,
    zip_city_raw: null,
    email: null,
    phone: null,
    vat_number: null,
    primary_contact_name: null,
    primary_contact_email: null,
    primary_contact_phone: null,
    assigned_seller_initials: "JTN",
    assigned_seller_name: "Jakob Nielsen",
    assigned_seller_email: "jtn@timan.dk",
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
    payment_terms: null,
    currency_code: null,
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
    ...overrides,
  } as DealerAccount;
}

describe("CRM dealer detail scope", () => {
  it("allows backend/global detail when the dealer exists in the visible list", () => {
    const visibleDealers = [
      dealer("100"),
      dealer("11913", { assigned_seller_initials: "BP", assigned_seller_email: "bp@timan.dk" }),
    ];

    expect(canOpenDealerDetailFromVisibleDealers(visibleDealers, "11913")).toBe(true);
    expect(buildDealerDetailRowsFromVisibleDealers(visibleDealers, "11913").map((d) => d.account_number)).toEqual(["11913"]);
  });

  it("does not depend on geocoding fields when opening a dealer detail", () => {
    const visibleDealers = [
      dealer("10287", {
        company_name: "JB Motorservice APS",
        address: "Gartnerivej 13",
        postal_code: "7500",
        city: "Holstebro",
      }),
    ];

    expect(canOpenDealerDetailFromVisibleDealers(visibleDealers, "10287")).toBe(true);
  });

  it("allows a seller to open an assigned dealer from the same scoped list", () => {
    const jtnVisibleDealers = [
      dealer("11841", { assigned_seller_initials: "JTN", assigned_seller_email: "jtn@timan.dk" }),
      dealer("11842", { parent_account_number: "11841", is_main_account: false }),
    ];

    expect(canOpenDealerDetailFromVisibleDealers(jtnVisibleDealers, "11841")).toBe(true);
    expect(buildDealerDetailRowsFromVisibleDealers(jtnVisibleDealers, "11842").map((d) => d.account_number)).toEqual([
      "11841",
      "11842",
    ]);
  });

  it("blocks detail access when a dealer is not present in the seller scoped list", () => {
    const bpVisibleDealers = [
      dealer("12058", { assigned_seller_initials: "BP", assigned_seller_email: "bp@timan.dk" }),
    ];

    expect(canOpenDealerDetailFromVisibleDealers(bpVisibleDealers, "11913")).toBe(false);
    expect(buildDealerDetailRowsFromVisibleDealers(bpVisibleDealers, "11913")).toEqual([]);
  });

  it("maps account-number routes to the matching dealer record", () => {
    const visibleDealers = [
      dealer("10295"),
      dealer("11913", { company_name: "Avistech s.r.o." }),
    ];

    const rows = buildDealerDetailRowsFromVisibleDealers(visibleDealers, "11913");

    expect(rows).toHaveLength(1);
    expect(rows[0].company_name).toBe("Avistech s.r.o.");
  });
});
