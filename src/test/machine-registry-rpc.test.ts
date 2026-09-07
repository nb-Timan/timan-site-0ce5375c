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

  it("keeps View-as as an RLS-preserving reduction and returns server-side counts", () => {
    const migration = read("supabase/migrations/20260907171500_machine_registry_view_as_scope.sql");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("wr.dealer_account_number = any(p_allowed_dealers)");
    expect(migration).toContain("count(*) filter (where health = 'needs_attention')");
    expect(migration).toContain("(wr.source <> 'legacy_machine_import') desc");
  });
});
