import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const panel = readFileSync("src/pages/crm/CrmDealerDetailPage.tsx", "utf8");
const service = readFileSync("src/lib/dealerMachineRegisterService.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260907193556_dealer_machine_registry_search_sort.sql", "utf8");

describe("dealer machine registry search and sorting", () => {
  it("uses the canonical paged registry with delivery descending as the default", () => {
    expect(panel).toContain('useState<MachineSortKey>("delivery")');
    expect(panel).toContain('useState<MachineSortDirection>("desc")');
    expect(service).toContain("fetchMachineRegistryPage");
    expect(service).toContain("page: input.page");
  });

  it("resets list state when navigating to another dealer", () => {
    expect(panel).toContain("[dealer?.account_number]");
    expect(panel).toContain('setSort("delivery"); setDirection("desc"); setPage(1)');
  });

  it("makes search, demo filtering, and table sorting server-side", () => {
    expect(service).toContain("query: input.query");
    expect(service).toContain("demoOnly: input.demoOnly");
    expect(migration).toContain("p_demo_only boolean default false");
    expect(migration).toContain("machine_model ilike");
    expect(migration).toContain("warranty_id ilike");
    expect(migration).toContain("delivery_date end desc nulls last");
  });

  it("keeps the existing scoped RLS predicate", () => {
    expect(migration).toContain("is_timan_global_warranty()");
    expect(migration).toContain("wr.dealer_account_number=any(p_allowed_dealers)");
    expect(migration).toContain("security invoker");
  });
});
