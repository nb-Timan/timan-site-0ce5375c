import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isEligibleServicePartnerParent,
  resolveServicePartnerMainRelationType,
} from "@/lib/partnerAdminEdit";

const migrationPath = "supabase/migrations/20260922104421_service_partner_main_billing_relation.sql";

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "account-id",
    customer_type: "Forhandler",
    customer_type_label: "Forhandler",
    dealer_type: "dealer",
    is_blocked: false,
    is_deleted: false,
    ...overrides,
  } as never;
}

describe("service partner main relation", () => {
  it("only offers active dealers and importers as a main partner", () => {
    expect(isEligibleServicePartnerParent(account(), "child-id")).toBe(true);
    expect(isEligibleServicePartnerParent(account({ dealer_type: "importer", customer_type: "Importør", customer_type_label: "Importør" }), "child-id")).toBe(true);
    expect(isEligibleServicePartnerParent(account({ dealer_type: "service_partner", customer_type: "Servicepartner", customer_type_label: "Servicepartner" }), "child-id")).toBe(false);
    expect(isEligibleServicePartnerParent(account({ id: "child-id" }), "child-id")).toBe(false);
    expect(isEligibleServicePartnerParent(account({ is_blocked: true }), "child-id")).toBe(false);
    expect(isEligibleServicePartnerParent(account({ is_deleted: true }), "child-id")).toBe(false);
  });

  it("maps canonical parent types to the existing relation model", () => {
    expect(resolveServicePartnerMainRelationType(account())).toBe("dealer_has_service_partner");
    expect(resolveServicePartnerMainRelationType(account({ dealer_type: "importer", customer_type_label: "Importør" }))).toBe("importer_has_service_partner");
    expect(resolveServicePartnerMainRelationType(account({ dealer_type: "supplier", customer_type_label: "Leverandør" }))).toBeNull();
  });

  it("keeps hierarchy and billing as separate canonical fields", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("add column if not exists billing_account_id uuid");
    expect(migration).toContain("public.partner_account_relations");
    expect(migration).toContain("p_bill_via_parent boolean default false");
    expect(migration).toContain("case when p_bill_via_parent then v_parent.id else null end");
    expect(migration).not.toContain("set parent_account_number =");
  });

  it("uses one scoped atomic RPC and preserves ordinary external isolation", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace function public.set_service_partner_main_relation");
    expect(migration).toContain("security definer");
    expect(migration).toContain("public.can_manage_partner_admin_fields");
    expect(migration).toContain("outside your permitted partner scope");
    expect(migration).toContain("revoke execute on function public.set_service_partner_main_relation");
    expect(migration).toContain("from public, anon");
    expect(migration).toContain("new.billing_account_id is distinct from old.billing_account_id");
  });

  it("records relation changes append-only without rewriting business history", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create table if not exists public.partner_account_relation_history");
    expect(migration).toContain("insert into public.partner_account_relation_history");
    expect(migration).not.toMatch(/update\s+public\.(configurations|crm_leads|service_registrations|warranty_registrations)/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.(configurations|crm_leads|service_registrations|warranty_registrations)/i);
  });

  it("renders hierarchy and billing controls in the existing partner editor", () => {
    const page = readFileSync("src/pages/crm/CrmDealerDetailPage.tsx", "utf8");
    const service = readFileSync("src/lib/dealerAccountsService.ts", "utf8");

    expect(page).toContain('tl("linked_main_partner", lang)');
    expect(page).toContain('placeholder={tl("search_main_partner", lang)}');
    expect(page).toContain("visibleParentOptions.map");
    expect(page).toContain("const existingAddress = dealer.address ?? dealer.address_line_1 ?? null");
    expect(page).toContain("address: addressChanged ? trim(form.address) : dealer.address");
    expect(page).toContain('tl("billing_via", lang)');
    expect(page).toContain("setServicePartnerMainRelation");
    expect(page).toContain("linkedMainPartnerRelation");
    expect(service).toContain('.from("partner_account_relations")');
    expect(service).toContain("related partner account read failed");
  });
});
