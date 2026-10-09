import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findServiceMachineType,
  resolveMachineModelCorrectionValue,
  SERVICE_MACHINE_TYPES,
} from "@/lib/serviceMachineTypes";

const page = readFileSync("src/pages/service/MachineJournalPage.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260930174546_validate_machine_registry_canonical_model.sql",
  "utf8",
);
const registryStatusMigration = readFileSync(
  "supabase/migrations/20260930153303_machine_registry_active_dealer_correction_status.sql",
  "utf8",
);

describe("machine registry model correction", () => {
  it("reuses the canonical service machine model source", () => {
    expect(SERVICE_MACHINE_TYPES.map((model) => model.value)).toEqual(expect.arrayContaining([
      "RC-1000",
      "RC-1000s",
      "RC-751",
      "Timan 3330",
      "Timan 2620",
      "TC-750",
      "Timan Tool-Trac",
    ]));
    expect(findServiceMachineType("RC-1000s")?.label).toBe("RC-1000s");
    for (const model of SERVICE_MACHINE_TYPES) {
      expect(migration).toContain(`'${model.value}'`);
    }
  });

  it("preselects a saved correction before the effective source model", () => {
    expect(resolveMachineModelCorrectionValue("RC-751", "RC-1000s")).toBe("RC-751");
    expect(resolveMachineModelCorrectionValue(null, "RC-1000s")).toBe("RC-1000s");
  });

  it("preserves an unknown legacy value for deliberate correction", () => {
    const legacy = resolveMachineModelCorrectionValue(null, "Legacy free text model");
    expect(legacy).toBe("Legacy free text model");
    expect(findServiceMachineType(legacy)).toBeUndefined();
    expect(page).toContain("Nuværende kildeværdi:");
    expect(page).toContain("!selectedCanonicalModel");
  });

  it("renders a select and removes the free-text model input", () => {
    expect(page).toContain("Model<select");
    expect(page).toContain("SERVICE_MACHINE_TYPES.map");
    expect(page).not.toContain("Model<input");
  });

  it("saves the exact canonical option and blocks arbitrary values", () => {
    expect(page).toContain("machine_model: selectedCanonicalModel.value");
    expect(page).toContain("Vælg en gyldig Timan-model fra listen.");
    expect(migration).toContain("not public.is_canonical_machine_model(v_model)");
    expect(migration).toContain("Choose a canonical Timan machine model");
  });

  it("keeps the audited overlay and registry precedence intact", () => {
    expect(migration).toContain("insert into public.machine_registry_correction_history");
    expect(migration).toContain("insert into public.audit_log");
    expect(registryStatusMigration).toContain("coalesce(correction.machine_model,wr.machine_model) machine_model");
    expect(page).toContain("setJournalRefreshVersion((version) => version + 1)");
  });
});
