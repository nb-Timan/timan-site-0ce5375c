import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("machine registry RPC read-chain", () => {
  it("uses the scoped RPC rather than the legacy client-side overview loader", () => {
    const page = read("src/pages/service/MachineSearchPage.tsx");
    expect(page).toContain("fetchMachineRegistryPage");
    expect(page).toContain("withSellerScopeIdentity(effectiveUser, sellerView?.email)");
    expect(page).not.toContain("listAccessibleMachines(");
  });

  it("keeps commercial economics in CRM while exposing only identifiers in service search", () => {
    const page = read("src/pages/service/MachineSearchPage.tsx");
    expect(page).toContain('label="Garanti nr."');
    expect(page).toContain('label="MO nr."');
    expect(page).toContain('label="ERP nr."');
    expect(page).toContain('label="Portal-ordrenr."');
    expect(page).toContain(">Fakturanr.</th>");
    expect(page).not.toContain("costAmount");
    expect(page).not.toContain("contributionMarginAmount");
    expect(page).not.toContain("Omsætning");
    expect(page).not.toContain("Kostpris");
  });

  it("keeps View-as as an RLS-preserving reduction and returns server-side counts", () => {
    const migration = read("supabase/migrations/20260907171500_machine_registry_view_as_scope.sql");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("wr.dealer_account_number = any(p_allowed_dealers)");
    expect(migration).toContain("count(*) filter (where health = 'needs_attention')");
    expect(migration).toContain("(wr.source <> 'legacy_machine_import') desc");
  });

  it("calculates warranty/match status from canonical SP and active dealer facts", () => {
    const migration = read("supabase/migrations/20260907184020_machine_registry_warranty_match_status.sql");
    expect(migration).toContain("wr.dealer_match_status = 'matched'");
    expect(migration).toContain("not coalesce(dealer.is_deleted, false)");
    expect(migration).toContain("not coalesce(dealer.is_blocked, false)");
    expect(migration).toContain("'missing_warranty_and_dealer'");
    expect(migration).toContain("'warrantyMatchStatus', warranty_match_status");
  });

  it("returns warranty/match counts from the complete filtered server result", () => {
    const migration = read("supabase/migrations/20260907185421_machine_registry_warranty_match_counts.sql");
    expect(migration).toContain("count(*) filter(where warranty_match_status='approved')");
    expect(migration).toContain("'needsClarification'");
    expect(migration).toContain("'warrantyMatchDetail',warranty_match_detail");
  });

  it("applies the clickable warranty status drill-down after calculating card counts", () => {
    const migration = read("supabase/migrations/20260907191915_add_machine_registry_status_filter.sql");
    expect(migration).toContain("p_warranty_match text default 'all'");
    expect(migration).toContain("warranty_match_status=p_warranty_match");
    expect(migration.indexOf("), counts as (")).toBeLessThan(migration.indexOf("), filtered as ("));
  });

  it("sorts dealer-visible commercial fields in the database before the page slice", () => {
    const migration = read("supabase/migrations/20260907212720_fix_dealer_machine_server_sorting.sql");
    expect(migration).toContain("case when p_sort='invoice'");
    expect(migration).toContain("case when p_sort='revenue'");
    expect(migration).toContain("case when p_sort='cost'");
    expect(migration).toContain("case when p_sort='margin'");
    expect(migration).toContain("case when p_sort='marginPercent'");
    expect(migration.indexOf("), ordered as (")).toBeLessThan(migration.indexOf("), page as ("));
    expect(migration).toContain("nulls last");
  });
});
