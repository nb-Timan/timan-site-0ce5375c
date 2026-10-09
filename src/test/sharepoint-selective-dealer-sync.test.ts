import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edge = readFileSync("supabase/functions/sharepoint-sync-dealers/index.ts", "utf8");
const dryRun = readFileSync("src/components/backend/SharePointDryRunButton.tsx", "utf8");
const realSync = readFileSync("src/components/backend/SharePointRealSyncButton.tsx", "utf8");
const panel = readFileSync("src/components/backend/SharePointSyncPanel.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260917113822_sharepoint_selective_dealer_sync_audit.sql", "utf8");

describe("selective SharePoint dealer sync", () => {
  it("returns concrete change candidates and field-level Portal-to-SharePoint diffs for dry-run", () => {
    expect(edge).toContain("type SyncCandidate");
    expect(edge).toContain("changed_field_count");
    expect(edge).toContain("changed_fields: SyncFieldDiff[]");
    expect(edge).toContain("summary.changes = candidates");
    expect(dryRun).toContain("candidate.company_name");
    expect(dryRun).toContain("candidate.account_number");
    expect(dryRun).toContain("candidate.country");
    expect(dryRun).toContain("Vis feltdiff");
    expect(dryRun).toContain("Portal nu");
    expect(dryRun).toContain("SharePoint");
  });

  it("starts with zero selected rows and exposes select-all and clear-all controls", () => {
    expect(dryRun).toContain("useState<Set<string>>(new Set())");
    expect(dryRun).toContain("setSelectedAccountIds(new Set())");
    expect(dryRun).toContain("Vælg alle");
    expect(dryRun).toContain("Fravælg alle");
    expect(dryRun).toContain("Synkronisér valgte ({selectedCount})");
    expect(dryRun).toContain("disabled={selectedCount === 0}");
  });

  it("keeps selection hooks stable for users without backend access", () => {
    expect(dryRun.indexOf("const selectedIds = useMemo")).toBeLessThan(
      dryRun.indexOf('if (!appUser || appUser.portal_role !== "timan_backend") return null;'),
    );
  });

  it("requires and validates an explicit server-side allowlist before real writes", () => {
    expect(edge).toContain("selected_account_ids");
    expect(edge).toContain("selected_account_ids is required for a real SharePoint sync");
    expect(edge).toContain("invalid_selected_account_ids");
    expect(edge).toContain("invalidSelected");
    expect(edge).toContain("const selectedCreates = toCreate.filter");
    expect(edge).toContain("const selectedUpdates = toUpdate.filter");
    expect(edge).not.toContain("for (const r of toUpdate) {");
    expect(realSync).toContain("{ body: { dryRun: false, selected_account_ids: selectedAccountIds } }");
  });

  it("keeps portal-only records and non-selected business data outside the write path", () => {
    expect(edge).toContain("Never deletes");
    expect(edge).toContain("MASTERDATA_PATCH_FIELDS");
    expect(dryRun).toContain("Portal-rækker uden SharePoint-match slettes aldrig");
    expect(edge).not.toContain(".delete(");
  });

  it("refreshes the candidate list after a selected sync and records its audit details", () => {
    expect(panel).toContain("dryRunRef.current?.start()");
    expect(edge).toContain("selected_account_ids: summary.selectedAccountIds ?? []");
    expect(edge).toContain("selected_count: summary.selectedCount ?? 0");
    expect(edge).toContain("change_details: summary.changes ?? []");
    expect(migration).toContain("selected_count integer not null default 0");
    expect(migration).toContain("selected_account_ids jsonb not null default '[]'::jsonb");
    expect(migration).toContain("change_details jsonb not null default '[]'::jsonb");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("sharepoint_sync_logs_select_backend");
  });
});
