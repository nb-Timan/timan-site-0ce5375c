import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const journal = readFileSync("src/lib/machineJournalService.ts", "utf8");
const registryPage = readFileSync("src/lib/machineRegistryPageService.ts", "utf8");
const page = readFileSync("src/pages/service/MachineJournalPage.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260917195425_machine_registry_internal_corrections.sql", "utf8");

describe("incomplete machine registry detail", () => {
  it("uses the paged canonical registry as a detail fallback", () => {
    expect(journal).toContain("const registryLookup = fetchMachineRegistryPage");
    expect(journal).toContain("|| !!registryRecord");
    expect(journal).toContain("registryRecord?.machineModel");
    expect(journal).toContain("registryRecord?.dealerName");
    expect(journal).toContain("const correctionLookup = fetchMachineRegistryCorrection");
    expect(journal).toContain("registryRecord = {");
  });

  it("projects a saved internal correction back into historical registry rows", () => {
    expect(registryPage).toContain("async function applyInternalCorrections");
    expect(registryPage).toContain("machine_registry_corrections");
    expect(registryPage).toContain("rows: await applyInternalCorrections(rows)");
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
});
