import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const searchPage = read("src/pages/service/MachineSearchPage.tsx");
const journalPage = read("src/pages/service/MachineJournalPage.tsx");
const migration = read("supabase/migrations/20260917082443_machine_registry_view_as_effective_scope.sql");

describe("machine search effective View-as scope", () => {
  it("uses a stable identity key instead of refetching for every View-as render", () => {
    expect(searchPage).toContain("useEffectivePortalUserState(appUser)");
    expect(searchPage).toContain("const scopeIdentity = [");
    expect(searchPage).toContain("}, [appUser, resolvingEffectiveUser, scopeIdentity, query,");
    expect(searchPage).not.toContain("[appUser, effectiveUser, portalRole, query,");
  });

  it("waits for the effective account and clears stale Backend results before scoped results render", () => {
    expect(searchPage).toContain("if (!appUser || resolvingEffectiveUser || !effectiveUser) return;");
    expect(searchPage).toContain("setOverview([]);");
    expect(searchPage).toContain("if (resolvingEffectiveUser || !effectiveUser)");
  });

  it("uses the effective account for both the overview and direct machine lookup", () => {
    expect(searchPage).toContain("const scopeUser = withSellerScopeIdentity(effectiveUser, sellerView?.email);");
    expect(searchPage).toContain("const scope = await buildJournalScope(scopeUser, scopeRole);");
  });

  it("keeps the canonical detail route scoped to the effective View-as account", () => {
    expect(journalPage).toContain("useEffectivePortalUserState(appUser)");
    expect(journalPage).toContain("const scope: JournalScope = await buildJournalScope(scopeUser, scopeRole);");
    expect(journalPage).toContain("}, [appUser, serial, resolvingEffectiveUser, scopeIdentity, navigate]);");
    expect(journalPage).not.toContain("buildJournalScope(appUser, role)");
  });

  it("makes an explicit dealer allow-list win over a Backend JWT in the registry RPC", () => {
    expect(migration).toContain("case when p_allowed_dealers is null then (select public.is_timan_global_warranty())");
    expect(migration).toContain("else wr.dealer_account_number=any(p_allowed_dealers) end");
    expect(migration).toContain("does not match the expected View-as scope predicate");
  });
});
