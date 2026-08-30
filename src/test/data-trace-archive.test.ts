import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_TRACE_LOOKUP_TYPES,
  displayTraceTableName,
  expectedDeleteConfirmation,
  expectedRestoreConfirmation,
  normalizeDeletionNumber,
} from "@/lib/dataTraceArchiveService";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260830220459_data_trace_archive_delete_restore.sql",
);
const migrationSql = fs.readFileSync(migrationPath, "utf8");

describe("data trace archive service", () => {
  it("exposes the supported lookup roots in a stable order", () => {
    expect(DATA_TRACE_LOOKUP_TYPES.map((type) => type.value)).toEqual([
      "quote",
      "order",
      "lead",
      "demo",
      "warranty",
      "tsb",
      "serial",
      "dealer",
    ]);
  });

  it("builds exact confirmation text for delete and restore", () => {
    expect(expectedDeleteConfirmation(" O-1234 ")).toBe("SLET O-1234");
    expect(normalizeDeletionNumber(" slet-0147 ")).toBe("SLET-0147");
    expect(expectedRestoreConfirmation(" slet-0147 ")).toBe("GENDAN SLET-0147");
  });

  it("renders either table or table_name counts from Supabase JSON", () => {
    expect(displayTraceTableName({ table: "configurations", count: 2 })).toBe("configurations");
    expect(displayTraceTableName({ table: "", table_name: "crm_leads", count: 1 })).toBe("crm_leads");
  });
});

describe("data trace archive migration", () => {
  it("keeps archived records in a private schema and exposes only backend RPCs", () => {
    expect(migrationSql).toContain("create schema if not exists private_archive");
    expect(migrationSql).toContain("revoke all on schema private_archive from public, anon, authenticated");
    expect(migrationSql).toContain("public.is_timan_backend()");
    expect(migrationSql).toContain("public.preview_data_trace_deletion");
    expect(migrationSql).toContain("public.execute_data_trace_deletion");
    expect(migrationSql).toContain("public.preview_data_trace_restore");
    expect(migrationSql).toContain("public.execute_data_trace_restore");
  });

  it("archives the active relation tables that are part of supported data traces", () => {
    [
      "configuration_items",
      "configurations",
      "crm_activities",
      "crm_calendar_activities",
      "crm_lead_shares",
      "crm_leads",
      "crm_demo_leads",
      "warranty_registration_history",
      "warranty_registrations",
      "dealer_contacts",
      "dealer_accounts",
    ].forEach((tableName) => {
      expect(migrationSql).toContain(`'${tableName}'`);
    });
  });

  it("does not silently claim support for TSB without a verified remote table", () => {
    expect(migrationSql).toContain("remote public schema ikke indeholder en aktiv TSB-tabel");
  });
});
