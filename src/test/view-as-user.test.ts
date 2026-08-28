import { describe, expect, it } from "vitest";
import { mergeEffectivePortalUser } from "@/lib/viewAsUser";
import { canManageNewsContent, derivePortalRole, hasAreaAccess } from "@/lib/portalAccess";
import type { SessionUser } from "@/context/AppUserContext";
import type { UserView } from "@/lib/activeMode";

const baseUser: SessionUser = {
  email: "bp@timan.dk",
  role: "timan_saelger",
  partner_type: null,
  approved: true,
  is_active: true,
  start_step: 1,
  max_step: 4,
  can_view_prices: true,
  can_submit_order: true,
  can_edit_discount: true,
  can_switch_customer_mode: false,
  working_for: null,
  display_name: "Birger Pedersen",
  portal_role: "timan_backend",
  preferred_language: "da",
  preferred_currency: null,
  company_dealer: "Timan",
  module_access: null,
  allowed_areas: null,
  allowed_modules: null,
  status: "active",
  dealer_number: "100",
  permissions: { news_manage: true },
  quick_actions: null,
  portal_variant: "standard",
};

const bpSellerView: UserView = {
  key: "BP",
  initials: "BP",
  email: "bp@timan.dk",
  portalRole: "timan_seller",
  viewRole: "seller",
  label: "BP Sælger",
};

describe("mergeEffectivePortalUser", () => {
  it("does not leak backend-only permissions into same-login seller mode", () => {
    const effective = mergeEffectivePortalUser(baseUser, baseUser, bpSellerView);

    expect(derivePortalRole(effective)).toBe("timan_seller");
    expect(effective.permissions).toBeNull();
    expect(canManageNewsContent(effective)).toBe(false);
    expect(hasAreaAccess(effective, "marketing")).toBe(false);
    expect(hasAreaAccess(effective, "timan_crm")).toBe(true);
  });
});
