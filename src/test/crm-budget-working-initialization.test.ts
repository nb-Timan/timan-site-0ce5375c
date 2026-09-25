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

  it("serializes seller/year initialization to prevent reload races", () => {
    expect(migration).toMatch(/pg_advisory_xact_lock[\s\S]*p_year::text[\s\S]*v_seller_email/i);
  });

  it("protects every partially initialized seller/year", () => {
    expect(migration).toMatch(/if exists[\s\S]*crm_budget_forecasts[\s\S]*already_initialized/i);
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
