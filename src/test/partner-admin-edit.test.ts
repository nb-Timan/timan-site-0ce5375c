import { describe, expect, it } from "vitest";
import {
  buildPartnerAdminSellerOptions,
  buildPartnerAdminSellerState,
  buildPartnerAdminTypePatch,
  getInitialPartnerAdminType,
  resolvePartnerAdminSeller,
} from "@/lib/partnerAdminEdit";

const sellers = [
  { id: "bp-id", email: "bp@timan.dk", initials: "BP", name: "Birger Pedersen", phone: "+45 12 34 56 78" },
  { id: "akr-id", email: "akr@timan.dk", initials: "AKR", name: "Alexander Kirschner", phone: null },
  { id: "em-id", email: "em@timan.dk", initials: "EM", name: "Esben Madsen", phone: null },
];

describe("partner admin edit helpers", () => {
  it("preselects the canonical seller by stable id before display fields", () => {
    const seller = resolvePartnerAdminSeller({
      assigned_seller_id: "em-id",
      assigned_seller_email: "bp@timan.dk",
      assigned_seller_initials: "BP",
    }, sellers);

    expect(seller?.id).toBe("em-id");
  });

  it("resolves legacy initials-only dealers to a unique Timan seller", () => {
    const seller = resolvePartnerAdminSeller({
      assigned_seller_id: null,
      assigned_seller_email: null,
      assigned_seller_initials: "BP",
    }, sellers);

    expect(seller?.id).toBe("bp-id");
  });

  it("keeps the dropdown preselected from canonical assigned_seller_id even before seller options are loaded", () => {
    const state = buildPartnerAdminSellerState({
      assigned_seller_id: "bp-id",
      assigned_seller_email: "bp@timan.dk",
      assigned_seller_initials: "BP",
      assigned_seller_name: "Birger Pedersen",
    }, []);

    expect(state.seller_id).toBe("bp-id");
    expect(state.assigned_seller_id).toBe("bp-id");
    expect(state.assigned_seller_initials).toBe("BP");
    expect(state.assigned_seller_name).toBe("Birger Pedersen");
    expect(state.assigned_seller_email).toBe("bp@timan.dk");
  });

  it("adds the current canonical seller as a fallback option so Ingen sælger is only a real null choice", () => {
    const state = buildPartnerAdminSellerState({
      assigned_seller_id: "bp-id",
      assigned_seller_email: "bp@timan.dk",
      assigned_seller_initials: "BP",
      assigned_seller_name: "Birger Pedersen",
    }, []);

    expect(buildPartnerAdminSellerOptions(state, [])).toEqual([
      { id: "bp-id", email: "bp@timan.dk", initials: "BP", name: "Birger Pedersen", phone: null },
    ]);
  });

  it("uses existing AK to AKR seller-initial compatibility for legacy rows", () => {
    const seller = resolvePartnerAdminSeller({
      assigned_seller_id: null,
      assigned_seller_email: null,
      assigned_seller_initials: "AK",
    }, sellers);

    expect(seller?.id).toBe("akr-id");
    expect(seller?.initials).toBe("AKR");
  });

  it("uses canonical partner type ids when building the admin patch", () => {
    expect(getInitialPartnerAdminType({
      dealer_type: "importer",
      customer_type: "Importør",
      customer_type_label: "Importør",
    })).toBe("importer");

    expect(buildPartnerAdminTypePatch("importer")).toEqual({
      dealer_type: "importer",
      customer_type: "Importør",
      customer_type_label: "Importør",
    });
  });
});
