import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDefaultQuickActionRoles, resolveEffectiveQuickActions } from "@/lib/quickActionsAccess";
import { mergeEffectivePortalUser } from "@/lib/viewAsUser";
import { derivePortalRole } from "@/lib/portalAccess";
import type { SessionUser } from "@/context/AppUserContext";
import type { UserView } from "@/lib/activeMode";

const seller: any = {
  email: "jtn@timan.dk",
  role: "timan_saelger",
  partner_type: null,
  portal_role: "timan_seller",
  allowed_areas: ["salg_marketing", "dealer_data", "timan_crm"],
  allowed_modules: ["byg_din_timan", "videos", "tilbud", "resources", "ordre", "sales_tools", "messe_portal"],
  module_access: null,
};

const dealer: any = {
  email: "dagvilpet@gmail.com",
  role: "partner",
  partner_type: "forhandler",
  portal_role: "timan_dealer",
  allowed_areas: ["salg_marketing", "timan_crm"],
  allowed_modules: ["sales_tools", "warranty"],
  module_access: null,
};

const baseBackendUser: SessionUser = {
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

const jtnView: UserView = {
  key: "JTN",
  initials: "JTN",
  email: "jtn@timan.dk",
  portalRole: "timan_seller",
  viewRole: "seller",
  label: "JTN Sælger",
};

const dvpView: UserView = {
  key: "DVP",
  initials: "DVP",
  email: "dagvilpet@gmail.com",
  portalRole: "timan_dealer",
  viewRole: "dealer",
  label: "DVP Forhandler",
};

describe("quick action access", () => {
  it("places the backend role overview on the portal homepage only", () => {
    const portalPage = readFileSync(join(process.cwd(), "src/pages/PortalPage.tsx"), "utf8");
    const backendHome = readFileSync(join(process.cwd(), "src/components/portal/BackendHome.tsx"), "utf8");

    expect(portalPage).toContain("const isEffectiveBackend = portalRole === 'timan_backend';");
    expect(portalPage).toContain("showAllActions={isEffectiveBackend}");
    expect(portalPage).toContain("showRoleOverview={isEffectiveBackend}");
    expect(backendHome).not.toContain("QuickActions");
  });

  it("gives a Timan Sælger without overrides the four canonical defaults", () => {
    expect(resolveEffectiveQuickActions({ ...seller, quick_actions: null })).toEqual([
      "create_lead",
      "create_demo",
      "company_contact_info",
      "partner_map",
    ]);
  });

  it("lets JTN's manual quick action setup show all four configured actions", () => {
    expect(resolveEffectiveQuickActions({
      ...seller,
      quick_actions: ["create_lead", "create_demo", "company_contact_info", "partner_map"],
    })).toEqual(["create_lead", "create_demo", "company_contact_info", "partner_map"]);
  });

  it("lets manual OFF override role defaults", () => {
    expect(resolveEffectiveQuickActions({
      ...seller,
      quick_actions: ["create_lead", "create_demo", "company_contact_info"],
    })).toEqual(["create_lead", "create_demo", "company_contact_info"]);
  });

  it("lets manual ON add an action outside the role default when the route access exists", () => {
    expect(resolveEffectiveQuickActions({
      ...seller,
      portal_role: "timan_service",
      allowed_areas: ["teknik_service", "timan_crm"],
      allowed_modules: ["claims", "warranty", "sales_tools"],
      quick_actions: ["partner_map"],
    })).toEqual(["partner_map"]);
  });

  it("gives Timan Forhandler the canonical lead, invoice, and warranty actions", () => {
    expect(resolveEffectiveQuickActions({
      ...dealer,
      quick_actions: ["create_lead", "create_demo", "partner_map"],
    })).toEqual([
      "create_lead",
      "dealer_invoice_accept",
      "warranty_registrations",
    ]);
  });

  it("uses the same effective quick actions for view-as and real user resolution", () => {
    const target = {
      ...baseBackendUser,
      ...seller,
      display_name: "Jakob Nielsen",
      quick_actions: ["create_lead", "create_demo", "company_contact_info", "partner_map"],
    } as SessionUser;
    const effective = mergeEffectivePortalUser(baseBackendUser, target, jtnView);

    expect(derivePortalRole(effective)).toBe("timan_seller");
    expect(resolveEffectiveQuickActions(effective)).toEqual(resolveEffectiveQuickActions(target));
  });

  it("uses DVP's effective dealer access rather than Backend's actions in view-as", () => {
    const target = {
      ...baseBackendUser,
      ...dealer,
      display_name: "Dag Vilster Petersen",
      quick_actions: ["create_lead", "create_demo", "partner_map"],
    } as SessionUser;
    const effective = mergeEffectivePortalUser(baseBackendUser, target, dvpView);

    expect(derivePortalRole(effective)).toBe("timan_dealer");
    expect(resolveEffectiveQuickActions(effective)).toEqual([
      "create_lead",
      "dealer_invoice_accept",
      "warranty_registrations",
    ]);
  });

  it("derives Backend's action-role overview from the existing access resolver", () => {
    expect(getDefaultQuickActionRoles("create_lead")).toEqual([
      "timan_backend",
      "timan_seller",
      "timan_dealer",
    ]);
    expect(getDefaultQuickActionRoles("dealer_invoice_accept")).toEqual([
      "timan_importer",
      "timan_dealer",
      "timan_service_partner",
    ]);
    expect(getDefaultQuickActionRoles("warranty_registrations")).toEqual([
      "timan_dealer",
    ]);
  });
});
