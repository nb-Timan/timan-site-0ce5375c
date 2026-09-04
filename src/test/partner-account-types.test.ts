import { describe, expect, it } from "vitest";
import {
  PARTNER_ACCOUNT_MAP_TYPE_IDS,
  getPartnerAccountTypeColor,
  getPartnerAccountTypeLabel,
  normalizePartnerAccountType,
  resolvePartnerAccountType,
} from "@/lib/partnerAccountTypes";
import { dealerTypeFromCustomerType, isDealerCustomerAccount } from "@/lib/dealerAccountsService";

describe("partner account types", () => {
  it("uses customer_type_label as canonical source before legacy dealer_type", () => {
    expect(resolvePartnerAccountType({
      customer_type: "Leverandør mv.",
      customer_type_label: "Leverandør mv.",
      dealer_type: "dealer",
    })).toBe("supplier");
  });

  it("does not turn unknown account types into dealers", () => {
    expect(resolvePartnerAccountType({
      customer_type_label: "Special partner",
      customer_type: null,
      dealer_type: null,
    })).toBe("other_partner");
    expect(getPartnerAccountTypeLabel("other_partner", "da")).toBe("Anden partner");
  });

  it("keeps existing dealer, importer, service partner and dealer customer types", () => {
    expect(normalizePartnerAccountType("Forhandler")).toBe("dealer");
    expect(normalizePartnerAccountType("Importør")).toBe("importer");
    expect(normalizePartnerAccountType("Service Partner")).toBe("service_partner");
    expect(isDealerCustomerAccount({ customer_type_label: "Forhandlerkunde", customer_type: null, dealer_type: "dealer" })).toBe(true);
  });

  it("maps editable Partnerdata labels to stable dealer_type values", () => {
    expect(dealerTypeFromCustomerType("Leverandør mv.")).toBe("supplier");
    expect(dealerTypeFromCustomerType("Forhandler")).toBe("dealer");
    expect(dealerTypeFromCustomerType("Importør")).toBe("importer");
    expect(dealerTypeFromCustomerType("Service Partner")).toBe("service_partner");
  });

  it("gives supplier its own neutral map style", () => {
    expect(getPartnerAccountTypeLabel("supplier", "da")).toBe("Leverandør");
    expect(getPartnerAccountTypeColor("supplier")).not.toBe(getPartnerAccountTypeColor("dealer"));
  });

  it("only exposes relevant partner categories in the partner map top filter", () => {
    expect(PARTNER_ACCOUNT_MAP_TYPE_IDS).toEqual([
      "dealer",
      "service_partner",
      "importer",
      "supplier",
      "dealer_customer",
      "demo_location",
    ]);
    expect(PARTNER_ACCOUNT_MAP_TYPE_IDS).not.toEqual(expect.arrayContaining([
      "spare_parts",
      "misc",
      "end_customer",
      "closed_customer",
      "employee_single",
      "other_partner",
    ]));
  });
});
