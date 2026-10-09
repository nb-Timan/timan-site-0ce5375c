import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journal = readFileSync("src/lib/machineJournalService.ts", "utf8");
const registryPage = readFileSync("src/lib/machineRegistryPageService.ts", "utf8");
const page = readFileSync("src/pages/service/MachineJournalPage.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260917195425_machine_registry_internal_corrections.sql", "utf8");
const statusMigration = readFileSync("supabase/migrations/20260930153303_machine_registry_active_dealer_correction_status.sql", "utf8");

describe("incomplete machine registry detail", () => {
  it("uses the paged canonical registry as a detail fallback", () => {
    expect(journal).toContain("const registryLookup = fetchMachineRegistryPage");
    expect(journal).toContain("|| !!registryRecord");
    expect(journal).toContain("registryRecord?.machineModel");
    expect(journal).toContain("registryRecord?.dealerName");
    expect(journal).not.toContain("const correctionLookup = fetchMachineRegistryCorrection");
    expect(journal).not.toContain("registryRecord = {");
  });

  it("uses the RPC result directly so rows and server-side counters cannot diverge", () => {
    expect(registryPage).not.toContain("applyInternalCorrections");
    expect(registryPage).toContain("rows,");
  });

  it("renders known legacy registry data instead of a false empty state", () => {
    expect(page).toContain("Maskinoplysninger");
    expect(page).toContain("MO nr.");
    expect(page).toContain("Denne maskine kræver afklaring");
    expect(page).toContain("journal.summary.registryRecord?.warrantyId || \"Mangler\"");
    expect(page).toContain("Rettelseshistorik");
    expect(page).toContain("Godkendt garanti-reference<select");
  });

  it("keeps corrections separate from SP and MO source records", () => {
    expect(migration).toContain("create table if not exists public.machine_registry_corrections");
    expect(migration).toContain("create table if not exists public.machine_registry_correction_history");
    expect(migration).toContain("insert into public.machine_registry_correction_history");
    expect(migration).toContain("source <> 'legacy_machine_import'");
  });

  it("requires an internal Teknik & Service capability on the write RPC", () => {
    expect(migration).toContain("Machine registry correction requires internal Teknik & Service access");
    expect(migration).toContain("'teknik_service' = any");
    expect(migration).toContain("revoke all on function public.save_machine_registry_correction");
  });

  it("resolves a correction by dealer ID before canonical status and counts", () => {
    expect(statusMigration).toContain("left join public.machine_registry_corrections correction");
    expect(statusMigration).toContain("corrected_dealer.id is not null");
    expect(statusMigration).toContain("coalesce(corrected_dealer.is_active,true)");
    expect(statusMigration).toContain("not coalesce(corrected_dealer.is_deleted,false)");
    expect(statusMigration).toContain("not coalesce(corrected_dealer.is_blocked,false)");
    expect(statusMigration).not.toContain("corrected_dealer.company_name is not null");
  });

  it("keeps source fallback, inactive and missing dealer semantics explicit", () => {
    expect(statusMigration).toContain("case when correction.dealer_account_id is not null then");
    expect(statusMigration).toContain("else (wr.dealer_match_status='matched'");
    expect(statusMigration).toContain("when not has_canonical_warranty and not has_active_dealer");
    expect(statusMigration).toContain("when has_canonical_warranty then ''missing_active_dealer''");
  });

  it("preserves SP/MO precedence and uses the corrected dealer for View-as narrowing", () => {
    expect(statusMigration).toContain("(wr.source <> ''legacy_machine_import'' or corrected_warranty.id is not null) has_canonical_warranty");
    expect(statusMigration).toContain("(wr.source<>''legacy_machine_import'') desc");
    expect(statusMigration).toContain("corrected_dealer.account_number else wr.dealer_account_number end)=any(p_allowed_dealers)");
    expect(statusMigration).toContain("security invoker");
  });

  it("refetches detail and audited history immediately after save", () => {
    expect(page).toContain("setCorrectionHistory(await fetchMachineRegistryCorrectionHistory");
    expect(page).toContain("setJournalRefreshVersion((version) => version + 1)");
    expect(page).not.toContain("window.location.reload()");
  });
});
