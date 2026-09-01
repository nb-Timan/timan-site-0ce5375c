import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { SessionUser } from "@/context/AppUserContext";
import {
  canSellerSeeAccount,
  canUseImplicitExternalCrmDealerScope,
  filterAccountsForSeller,
  isProtectedInternalCrmDealerAccount,
} from "@/lib/crmScope";
import { buildJournalScope } from "@/lib/machineJournalScope";
import { dealerScopeAllows } from "@/lib/machineJournalService";

function sessionUser(overrides: Partial<SessionUser>): SessionUser {
  return {
    email: "sales@timan.dk",
    display_name: "Timan Sales",
    role: "slutkunde",
    partner_type: "forhandler",
    approved: true,
    is_active: true,
    can_view_prices: true,
    can_submit_order: true,
    ...overrides,
  } as SessionUser;
}

describe("external CRM account scope", () => {
  it("blocks account 100 / Timan as implicit external CRM scope", () => {
    const account100 = {
      account_number: "100",
      company_name: "Timan",
      branch_name: null,
    };

    expect(isProtectedInternalCrmDealerAccount(account100)).toBe(true);
    expect(canUseImplicitExternalCrmDealerScope(account100)).toBe(false);
  });

  it("still allows ordinary external dealer accounts as implicit scope", () => {
    expect(canUseImplicitExternalCrmDealerScope({
      account_number: "11913",
      company_name: "Avistech s.r.o.",
      branch_name: null,
    })).toBe(true);
  });

  it("does not let Forhandler A match Forhandler B by dealer number", () => {
    expect(filterAccountsForSeller({
      role: "timan_seller",
      sellerId: "seller-a",
    }, [
      { id: "dealer-a", account_owner_user_id: "seller-a" },
      { id: "dealer-b", account_owner_user_id: "seller-b" },
    ])).toEqual([{ id: "dealer-a", account_owner_user_id: "seller-a" }]);

    expect(canSellerSeeAccount({
      role: "timan_seller",
      sellerId: "seller-a",
    }, { id: "dealer-b", account_owner_user_id: "seller-b" })).toBe(false);
  });

  it("keeps backend unrestricted and seller scope assigned-only", () => {
    expect(canSellerSeeAccount({ role: "timan_backend", sellerId: null }, {
      id: "dealer-b",
      account_owner_user_id: "seller-b",
    })).toBe(true);

    expect(canSellerSeeAccount({ role: "timan_seller", sellerId: "seller-a" }, {
      id: "dealer-a",
      account_owner_user_id: "seller-a",
    })).toBe(true);
  });

  it("prevents account 100 from becoming a Teknik & Service name wildcard", async () => {
    const scope = await buildJournalScope(sessionUser({
      portal_role: "timan_dealer",
      dealer_number: "100",
      company_dealer: "Timan",
    }), "timan_dealer");

    expect(scope.unrestricted).toBe(false);
    expect(scope.dealerNumbers.size).toBe(0);
    expect(scope.dealerNames.size).toBe(0);
    expect(dealerScopeAllows(scope, { dealer_number: "100", dealer_name: "Timan" })).toBe(false);
  });

  it("keeps the lead list RPC from trusting client-provided external scope", () => {
    const migration = readFileSync("supabase/migrations/20260901065220_secure_external_crm_lead_scope.sql", "utf8");

    expect(migration).toContain("p_external_dealer_ids");
    expect(migration).toContain("external_dealer_rows as");
    expect(migration).toContain("not public.is_protected_internal_crm_account(own.account_number");
    expect(migration).toContain("from public.crm_lead_shares cls");
    expect(migration).toContain("drop policy if exists crm_leads_all");
    expect(migration).toContain("drop policy if exists crm_demo_leads_all");
    expect(migration).not.toContain("r.linked_dealer_id = any(a.external_dealer_ids)");
  });

  it("repairs the canonical CRM lead sharing tables forward-only", () => {
    const migration = readFileSync("supabase/migrations/20260901143150_repair_crm_lead_sharing_dependencies.sql", "utf8");

    expect(migration).toContain("create table if not exists public.crm_lead_shares");
    expect(migration).toContain("create table if not exists public.crm_lead_share_audit_log");
    expect(migration).toContain("references public.crm_leads(id) on delete cascade");
    expect(migration).toContain("references public.app_users(id) on delete cascade");
    expect(migration).toContain("crm_lead_shares_active_user_unique");
    expect(migration).toContain("alter table public.crm_lead_shares enable row level security");
    expect(migration).toContain("grant select, insert, update on public.crm_lead_shares to authenticated");
    expect(migration).not.toContain("service_partner_dealer_links");
  });

  it("uses partner account relations for the live scoped CRM RLS follow-up", () => {
    const migration = readFileSync("supabase/migrations/20260901143152_secure_external_crm_scope_partner_relations.sql", "utf8");

    expect(migration).toContain("drop policy if exists crm_leads_all");
    expect(migration).toContain("drop policy if exists crm_demo_leads_all");
    expect(migration).toContain("from public.crm_lead_shares cls");
    expect(migration).toContain("from public.partner_account_relations par");
    expect(migration).toContain("par.relation_type = 'service_partner_has_dealer'");
    expect(migration).toContain("not public.is_protected_internal_crm_account(own.account_number");
    expect(migration).toContain("not public.is_protected_internal_crm_account(da.account_number");
    expect(migration).not.toContain("service_partner_dealer_links");
  });

  it("removes anonymous write grants from CRM lead tables", () => {
    const migration = readFileSync("supabase/migrations/20260901164010_tighten_anon_crm_write_grants.sql", "utf8");

    expect(migration).toContain("revoke insert, update, delete, truncate, references, trigger");
    expect(migration).toContain("on table public.crm_leads");
    expect(migration).toContain("on table public.crm_demo_leads");
    expect(migration).toContain("from anon, public");
    expect(migration).not.toMatch(/grant\s+.*\b(insert|update|delete|truncate)\b/i);
  });
});
