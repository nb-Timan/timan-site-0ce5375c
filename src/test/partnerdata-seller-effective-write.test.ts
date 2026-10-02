import fs from "node:fs";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return fs.readFileSync(file, "utf8");
}

describe("Partnerdata Seller effective write path", () => {
  const page = read("src/pages/portal/DealerDataPage.tsx");
  const editor = read("src/components/portal/DealerProfileEditor.tsx");
  const accountService = read("src/lib/dealerAccountsService.ts");
  const contactService = read("src/lib/dealerContactsService.ts");
  const dealerList = read("src/pages/crm/CrmMyDealersPage.tsx");

  it("passes the effective View-as identity through every profile write", () => {
    expect(page).toContain("effectiveUserId={effectiveUser?.id ?? null}");
    expect(editor).toContain("buildProfilePatch(draft, canManageFinancialTerms)");
    expect(editor).toContain("effectiveUserId,");
    expect(editor).toContain("}, effectiveUserId);");
    expect(editor).toContain("deleteDealerContact(id, effectiveUserId)");
  });

  it("uses scoped server RPCs for company and contact writes", () => {
    expect(accountService).toContain('supabase.rpc("update_partnerdata_account_profile"');
    expect(contactService).toContain('supabase.rpc("upsert_partnerdata_contact"');
    expect(contactService).toContain('supabase.rpc("delete_partnerdata_contact"');
  });

  it("uses the canonical effective seller id in Mine forhandlere", () => {
    expect(dealerList).toContain("fetchDealerAccountsForSeller({ sellerId: effectiveUserId, initials, email: effEmail })");
  });

  it("keeps financial terms Backend-only and seller authorization id-only", () => {
    expect(page).toContain("dealer?.assigned_seller_id");
    expect(page).toContain("const canManageFinancialTerms = portalRole === 'timan_backend'");
    expect(page).not.toContain("sellerInitialsMatch(dealer.assigned_seller_initials");
    expect(editor).toContain('key === "payment_terms_override" || key === "currency_code"');
  });
});
