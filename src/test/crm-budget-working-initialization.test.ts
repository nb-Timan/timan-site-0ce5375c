import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc },
  SUPABASE_URL: "http://mock",
  SUPABASE_ANON_KEY: "mock",
}));

import {
  initializeWorkingBudgetFromOriginal,
  workingBudgetInitializationSellerEmails,
  type BudgetDealerLine,
  type BudgetLine,
} from "@/lib/crmBudgetService";

const migration = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260925181553_initialize_crm_working_budget_from_original.sql",
), "utf8");
const uuidAggregateFix = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260925183150_fix_working_budget_uuid_aggregate.sql",
), "utf8");
const hardenedInitialization = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260927102108_harden_working_budget_initialization_detection.sql",
), "utf8");
const cellLevelInitialization = readFileSync(resolve(
  process.cwd(),
  "supabase/migrations/20260927111524_reconcile_working_budget_cells.sql",
), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/pages/crm/CrmBudgetPage.tsx"), "utf8");
const service = readFileSync(resolve(process.cwd(), "src/lib/crmBudgetService.ts"), "utf8");

function line(email: string): BudgetLine {
  return {
    id: crypto.randomUUID(), year: 2026, product_key: "RC-751", product_name: "RC-751",
    item_number: null, category: "machine", seller_id: null, seller_name: null,
    seller_email: email, seller_initials: null, country: null, qty_budget: 0,
    value_budget: 0, monthly_split: Array(12).fill(1 / 12), locked: false,
    created_at: new Date().toISOString(),
  };
}

function dealerLine(email: string): BudgetDealerLine {
  return {
    id: crypto.randomUUID(), year: 2026, month_idx: 8, seller_id: null,
    seller_name: null, seller_email: email, seller_initials: null,
    dealer_account_id: null, dealer_account_number: null, dealer_name: "QA",
    dealer_name_norm: "qa", product_key: "RC-751", product_name: "RC-751",
    item_number: null, qty: 5, excluded_from_total: false, import_source: null,
    import_batch_id: null, imported_at: new Date().toISOString(), imported_by: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

beforeEach(() => rpc.mockReset());

describe("CRM working-budget initialization", () => {
  it("keeps seller/View-as initialization scoped to the requested seller", () => {
    expect(workingBudgetInitializationSellerEmails(
      [line("akr@timan.dk")], [dealerLine("bp@timan.dk")], "JTN@TIMAN.DK",
    )).toEqual(["jtn@timan.dk"]);
  });

  it("collects unique seller scopes for the Backend all-sellers view", () => {
    expect(workingBudgetInitializationSellerEmails(
      [line("akr@timan.dk")], [dealerLine("BP@timan.dk"), dealerLine("akr@timan.dk")], null,
    )).toEqual(["akr@timan.dk", "bp@timan.dk"]);
  });

  it("normalizes the seller email passed to the canonical RPC", async () => {
    rpc.mockResolvedValue({ data: [{ status: "seeded", seeded_count: 3 }], error: null });
    await expect(initializeWorkingBudgetFromOriginal(2026, " BP@Timan.dk ")).resolves.toEqual({
      status: "seeded", seeded_count: 3,
    });
    expect(rpc).toHaveBeenCalledWith("initialize_crm_working_budget_from_original", {
      p_year: 2026, p_seller_email: "bp@timan.dk",
    });
  });

  it("does not call the database without a seller scope", async () => {
    await expect(initializeWorkingBudgetFromOriginal(2026, " ")).resolves.toEqual({
      status: "no_original_budget", seeded_count: 0,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves the already-initialized result without reseeding", async () => {
    rpc.mockResolvedValue({ data: [{ status: "already_initialized", seeded_count: 0 }], error: null });
    await expect(initializeWorkingBudgetFromOriginal(2026, "akr@timan.dk")).resolves.toEqual({
      status: "already_initialized", seeded_count: 0,
    });
  });

  it("surfaces an unexplained partial forecast without overwriting it", async () => {
    rpc.mockResolvedValue({ data: [{ status: "ambiguous_partial_forecast", seeded_count: 0 }], error: null });
    await expect(initializeWorkingBudgetFromOriginal(2026, "jtn@timan.dk")).resolves.toEqual({
      status: "ambiguous_partial_forecast", seeded_count: 0,
    });
  });

  it("accepts a cell-level reconciliation result", async () => {
    rpc.mockResolvedValue({ data: [{ status: "reconciled", seeded_count: 35 }], error: null });
    await expect(initializeWorkingBudgetFromOriginal(2026, "jtn@timan.dk")).resolves.toEqual({
      status: "reconciled", seeded_count: 35,
    });
  });

  it("serializes seller/year initialization to prevent reload races", () => {
    expect(migration).toMatch(/pg_advisory_xact_lock[\s\S]*p_year::text[\s\S]*v_seller_email/i);
  });

  it("preserves genuine seller edits with canonical audit evidence", () => {
    expect(hardenedInitialization).toMatch(/public\.audit_log[\s\S]*budget_type'[\s\S]*arbejdsbudget[\s\S]*v_has_audit_history/i);
    expect(hardenedInitialization).toMatch(/if v_has_audit_history[\s\S]*already_initialized/i);
  });

  it("tracks initialization by seller, product and month", () => {
    expect(cellLevelInitialization).toMatch(/create table if not exists public\.crm_working_budget_initialized_cells/i);
    expect(cellLevelInitialization).toMatch(/primary key \(budget_line_id, month_idx\)/i);
    expect(cellLevelInitialization).toMatch(/initialized\.month_idx = baseline\.month_idx/i);
  });

  it("reconciles untouched cells from original budget while applying edit deltas", () => {
    expect(cellLevelInitialization).toMatch(/baseline\.baseline_qty \+ audit\.edit_delta/i);
    expect(cellLevelInitialization).toMatch(/new_value ->> 'value'[\s\S]*old_value ->> 'value'/i);
    expect(cellLevelInitialization).toMatch(/v_result_status := case[\s\S]*'reconciled'[\s\S]*'seeded'/i);
  });

  it("preserves explicit zero edits through their signed audit delta", () => {
    expect(cellLevelInitialization).toMatch(/sum\([\s\S]*new_value ->> 'value'[\s\S]*-[\s\S]*old_value ->> 'value'/i);
    expect(cellLevelInitialization).toMatch(/greatest\(0, baseline\.baseline_qty \+ audit\.edit_delta\)/i);
  });

  it("does not let pre-import audit rows alter a later canonical baseline", () => {
    expect(cellLevelInitialization).toMatch(/audit\.created_at >= baseline\.baseline_at/i);
    expect(cellLevelInitialization).toMatch(/max\(coalesce\(dealer\.imported_at, dealer\.created_at\)\)/i);
  });

  it("keeps ambiguous legacy values and references untouched", () => {
    expect(cellLevelInitialization).toMatch(/v_ambiguous_reference_count[\s\S]*ambiguous_reference_history/i);
    expect(cellLevelInitialization).toMatch(/v_ambiguous_cell_count[\s\S]*ambiguous_partial_forecast/i);
  });

  it("does not manufacture references or change original allocation rows", () => {
    expect(cellLevelInitialization).not.toMatch(/insert into public\.budget_references/i);
    expect(cellLevelInitialization).not.toMatch(/update public\.crm_budget_dealer_lines/i);
    expect(cellLevelInitialization).not.toMatch(/delete from public\.crm_budget_dealer_lines/i);
  });

  it("keeps cell provenance protected by the existing seller/backend scope", () => {
    expect(cellLevelInitialization).toMatch(/enable row level security/i);
    expect(cellLevelInitialization).toMatch(/is_timan_backend\(\)[\s\S]*is_timan_budget_seller\(line\.seller_email\)/i);
    expect(cellLevelInitialization).toMatch(/security invoker/i);
    expect(cellLevelInitialization).toMatch(/revoke all on function[\s\S]*from anon/i);
  });

  it("reloads the page data after either seed or reconciliation", () => {
    expect(page).toMatch(/result\.status === "seeded" \|\| result\.status === "reconciled"/i);
  });

  it("does not treat an unexplained partial forecast as fully initialized", () => {
    expect(hardenedInitialization).toMatch(/v_existing_forecast_count[\s\S]*v_expected_product_count/i);
    expect(hardenedInitialization).toMatch(/ambiguous_partial_forecast/i);
    expect(hardenedInitialization).not.toMatch(/delete from public\.crm_budget_forecasts/i);
    expect(hardenedInitialization).not.toMatch(/update public\.crm_budget_forecasts/i);
  });

  it("protects ambiguous historical working-budget references", () => {
    expect(migration).toMatch(/budget_references[\s\S]*budget_type = 'arbejdsbudget'[\s\S]*ambiguous_reference_history/i);
  });

  it("creates only missing canonical budget-line shells", () => {
    expect(migration).toMatch(/insert into public\.crm_budget_lines[\s\S]*on conflict do nothing/i);
  });

  it("uses a PostgreSQL-compatible deterministic aggregate for seller UUIDs", () => {
    expect(uuidAggregateFix).toMatch(/min\(dealer\.seller_id::text\)::uuid/i);
    expect(uuidAggregateFix).not.toMatch(/max\(dealer\.seller_id\)/i);
  });

  it("copies the resolved 12-month original budget into monthly_qty", () => {
    expect(migration).toMatch(/array_agg\(monthly\.resolved_qty order by monthly\.month_idx\)/i);
    expect(migration).toMatch(/insert into public\.crm_budget_forecasts/i);
  });

  it("uses dealer allocations per month without duplicating them", () => {
    expect(migration).toMatch(/when dealer\.has_dealer_budget then dealer\.dealer_qty/i);
    expect(migration).not.toMatch(/insert into public\.crm_budget_dealer_lines/i);
  });

  it("does not make orders part of working-budget initialization", () => {
    expect(migration).not.toMatch(/crm_configurations|crm_budget_sales_actuals/i);
  });

  it("does not manufacture budget references during initial seed", () => {
    expect(migration).not.toMatch(/insert into public\.budget_references/i);
  });

  it("keeps the RPC authenticated and under existing RLS", () => {
    expect(migration).toMatch(/security invoker/i);
    expect(migration).toMatch(/is_timan_backend\(\)[\s\S]*is_timan_budget_seller\(v_seller_email\)/i);
    expect(migration).toMatch(/revoke all on function[\s\S]*from public/i);
    expect(migration).toMatch(/grant execute on function[\s\S]*to authenticated/i);
  });

  it("keeps Performance based on orders divided by original Budget", () => {
    expect(service).toMatch(/scorePct = budgetQty === 0 \? 0 : Math\.round\(\(ordersQty \/ budgetQty\) \* 100\)/);
    expect(page).toMatch(/score = annualQty > 0 \? Math\.round\(\(soldQty \/ annualQty\) \* 100\) : 0/);
  });
});
