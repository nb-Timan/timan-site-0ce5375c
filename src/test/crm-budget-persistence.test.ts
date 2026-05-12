import { describe, it, expect, beforeEach, vi } from "vitest";

const BP = { email: "bp@timan.dk", initials: "BP", name: "BP" };
const JTN = { email: "jtn@timan.dk", initials: "JTN", name: "JTN" };
const YEAR = 2026;

vi.mock("@/lib/supabase", () => {
  const lines: Array<Record<string, unknown>> = [];
  const forecasts: Array<Record<string, unknown>> = [];
  let failWrites = false;
  let hideReadback = false;
  const ls = () => lines;
  const fs = () => forecasts;

  function makeBuilder(table: string) {
    const filters: Array<{ col: string; val: unknown; op: "eq" | "ilike" | "in" }> = [];
    const rows = () => (table === "crm_budget_lines" ? ls() : table === "crm_budget_forecasts" ? fs() : []);
    const apply = () => (hideReadback ? [] : rows()).filter((row) => filters.every((f) => {
      const v = row[f.col];
      if (f.op === "in") return Array.isArray(f.val) && f.val.includes(v);
      if (f.op === "ilike") return String(v || "").toLowerCase() === String(f.val || "").toLowerCase();
      return v === f.val;
    }));
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: (col: string, val: unknown) => { filters.push({ col, val, op: "eq" }); return chain; },
      ilike: (col: string, val: unknown) => { filters.push({ col, val, op: "ilike" }); return chain; },
      in: (col: string, val: unknown[]) => { filters.push({ col, val, op: "in" }); return chain; },
      neq: () => chain,
      or: () => chain,
      limit: () => chain,
      upsert: (payload: unknown) => {
        if (failWrites) return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "write denied" } }) }) };
        const row = { ...(payload as Record<string, unknown>) };
        const target = table === "crm_budget_lines" ? lines : forecasts;
        if (table === "crm_budget_lines") row.created_at ||= new Date().toISOString();
        if (table === "crm_budget_forecasts") row.id ||= crypto.randomUUID();
        const idx = table === "crm_budget_forecasts"
          ? target.findIndex((r) => r.budget_line_id === row.budget_line_id)
          : target.findIndex((r) => r.id === row.id);
        if (idx >= 0) target[idx] = { ...target[idx], ...row };
        else target.push(row);
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) };
      },
      maybeSingle: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: apply(), error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: apply(), error: null }).then(resolve, reject),
    });
    return chain;
  }

  return {
    supabase: { from: (table: string) => makeBuilder(table) },
    SUPABASE_URL: "http://mock",
    SUPABASE_ANON_KEY: "mock",
    __budgetDb: {
      reset: () => { lines.length = 0; forecasts.length = 0; failWrites = false; hideReadback = false; },
      setFailWrites: (v: boolean) => { failWrites = v; },
      setHideReadback: (v: boolean) => { hideReadback = v; },
      lines,
      forecasts,
    },
  };
});

import * as supabaseModule from "@/lib/supabase";
import {
  aggregateBudget,
  createBudgetLine,
  listBudgetLines,
  listForecasts,
  upsertBudgetLine,
  upsertForecast,
  type BudgetForecast,
  type BudgetLine,
} from "@/lib/crmBudgetService";

const db = (supabaseModule as unknown as {
  __budgetDb: {
    reset: () => void;
    setFailWrites: (v: boolean) => void;
    setHideReadback: (v: boolean) => void;
    lines: Array<Record<string, unknown>>;
  };
}).__budgetDb;

function makeInput(seller = BP, product_key = "RC-751") {
  return {
    year: YEAR,
    product_key,
    product_name: product_key,
    item_number: product_key === "RC-751" ? "410040" : "411000",
    category: "machine" as const,
    seller_id: null,
    seller_name: seller.name,
    seller_email: seller.email,
    seller_initials: seller.initials,
    country: "DK",
    qty_budget: 0,
    value_budget: 0,
    monthly_split: Array.from({ length: 12 }, () => 1 / 12),
  };
}

async function saveBudget(seller = BP, qty = 7): Promise<BudgetLine> {
  const line = await createBudgetLine(makeInput(seller));
  return upsertBudgetLine({ ...line, qty_budget: qty, value_budget: qty * 1000 });
}

describe("CRM Budget Supabase persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    db.reset();
  });

  it("persists BP budget value and reloads it from listBudgetLines", async () => {
    const saved = await saveBudget(BP, 7);
    const reloaded = await listBudgetLines({ year: YEAR });
    expect(reloaded.find((l) => l.id === saved.id)?.qty_budget).toBe(7);
    expect(reloaded.find((l) => l.id === saved.id)?.seller_email).toBe(BP.email);
  });

  it("persists BP arbejdsbudget monthly_qty and reloads it from listForecasts", async () => {
    const line = await saveBudget(BP, 3);
    const forecast: BudgetForecast = {
      id: "ignored-by-upsert",
      budget_line_id: line.id,
      qty_forecast: 5,
      value_forecast: 5000,
      monthly_qty: [0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0],
      updated_at: new Date().toISOString(),
    };
    await upsertForecast(forecast);
    const reloaded = await listForecasts(YEAR);
    expect(reloaded.find((f) => f.budget_line_id === line.id)?.monthly_qty?.[4]).toBe(5);
  });

  it("keeps BP and JTN seller budgets isolated while backend aggregation combines them", async () => {
    await saveBudget(BP, 4);
    await saveBudget(JTN, 6);
    const lines = await listBudgetLines({ year: YEAR });
    expect(aggregateBudget(lines, [], [], BP.email).totals.budgetQty).toBe(4);
    expect(aggregateBudget(lines, [], [], JTN.email).totals.budgetQty).toBe(6);
    expect(aggregateBudget(lines, [], [], null).totals.budgetQty).toBe(10);
  });

  it("empty Supabase reads do not fall back to stale localStorage", async () => {
    localStorage.setItem("timan.crm.budget.lines.v6", JSON.stringify([{ ...makeInput(BP), id: "stale", created_at: new Date().toISOString(), locked: false, qty_budget: 99 }]));
    expect(await listBudgetLines({ year: YEAR })).toEqual([]);
  });

  it("failed Supabase writes reject instead of silently saving locally", async () => {
    db.setFailWrites(true);
    await expect(createBudgetLine(makeInput(BP))).rejects.toThrow(/Supabase|write denied/);
    expect(db.lines).toHaveLength(0);
  });

  it("save-then-readback verification fails when Supabase does not return saved values", async () => {
    db.setHideReadback(true);
    await expect(createBudgetLine(makeInput(BP))).rejects.toThrow(/readback|created/i);
  });
});
