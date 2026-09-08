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
    expect(page).toContain('label="Fakturanr." sort="invoice"');
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

  it("uses semantic numeric and date ordering before pagination", () => {
    const migration = read("supabase/migrations/20260907214212_fix_machine_registry_semantic_sorting.sql");
    expect(migration).toContain("regexp_replace(warranty_id, '[^0-9]', '', 'g')");
    expect(migration).toContain("regexp_replace(machine_order_number, '[^0-9]', '', 'g')");
    expect(migration).toContain("erp_order_number::bigint");
    expect(migration).toContain("invoice_number::bigint");
    expect(migration).toContain("then delivery_date end asc nulls last");
    expect(migration).toContain("normalized_serial asc) ordinal from filtered");
    expect(migration.indexOf("), ordered as (")).toBeLessThan(migration.indexOf("), page as ("));
  });

  it("keeps MO as the physical-machine reference when a serial also has SP", () => {
    const migration = read("supabase/migrations/20260908063000_backfill_canonical_machine_orders.sql");
    expect(migration).toContain("machine_order_source = 'portal_assigned'");
    expect(migration).toContain("machine_order_backfill");
    expect(migration).toContain("warranty_registrations_active_machine_order_unique");
    expect(migration).toContain("coalesce(nullif(btrim(wr.legacy_warranty_reference), ''), lc.machine_order_number) machine_order_number");
    expect(migration).toContain("wr.source <> 'legacy_machine_import'");
  });

  it("uses a deterministic source tie-breaker for canonical serials", () => {
    const migration = read("supabase/migrations/20260908065500_make_canonical_machine_order_deterministic.sql");
    expect(migration).toContain("wr.sharepoint_form_id desc nulls last,wr.id");
  });

  it("moves an MO reference to the deterministic canonical row for duplicate source serials", () => {
    const migration = read("supabase/migrations/20260908071500_align_canonical_machine_order_rows.sql");
    expect(migration).toContain("'TMP-' || r.target_id::text");
    expect(migration).toContain("machine_order_canonical_alignment");
    expect(migration).toContain("'{}'::jsonb");
  });
});
