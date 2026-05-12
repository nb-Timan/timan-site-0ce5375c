import { describe, it, expect, beforeEach, vi } from "vitest";

const JTN_EMAIL = "jtn@timan.dk";
const BP_EMAIL = "bp@timan.dk";
const YEAR = 2026;

vi.mock("@/lib/supabase", () => {
  const dealerLines: Array<Record<string, unknown>> = [];
  let failWrites = false;
  let hideReadback = false;

  function makeBuilder(table: string) {
    if (table !== "crm_budget_dealer_lines") {
      // Minimal stub for any other table touched accidentally.
      const empty = { data: [], error: null };
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: () => chain, eq: () => chain, ilike: () => chain, is: () => chain,
        in: () => chain, neq: () => chain, or: () => chain, limit: () => chain,
        upsert: () => ({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (r: (v: unknown) => unknown) => Promise.resolve(empty).then(r),
      });
      return chain;
    }

    const filters: Array<{ col: string; val: unknown; op: "eq" | "ilike" | "is" }> = [];
    const apply = () => (hideReadback ? [] : dealerLines).filter((row) => filters.every((f) => {
      const v = row[f.col];
      if (f.op === "is") return v === f.val;
      if (f.op === "ilike") return String(v ?? "").toLowerCase() === String(f.val ?? "").toLowerCase();
      return v === f.val;
    }));
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: (col: string, val: unknown) => { filters.push({ col, val, op: "eq" }); return chain; },
      ilike: (col: string, val: unknown) => { filters.push({ col, val, op: "ilike" }); return chain; },
      is: (col: string, val: unknown) => { filters.push({ col, val, op: "is" }); return chain; },
      limit: () => chain,
      upsert: (payload: unknown) => {
        if (failWrites) {
          return { select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "denied" } }) }) };
        }
        const row = { ...(payload as Record<string, unknown>) };
        // Enforce composite uniqueness like the real partial unique indexes.
        const matchIdx = dealerLines.findIndex((r) => {
          const sameScope = r.year === row.year
            && r.month_idx === row.month_idx
            && String(r.seller_email).toLowerCase() === String(row.seller_email).toLowerCase()
            && r.product_key === row.product_key;
          if (!sameScope) return false;
          if (row.dealer_account_id) return r.dealer_account_id === row.dealer_account_id;
          return r.dealer_account_id == null && r.dealer_name_norm === row.dealer_name_norm;
        });
        if (matchIdx >= 0) dealerLines[matchIdx] = { ...dealerLines[matchIdx], ...row };
        else dealerLines.push(row);
        return { select: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) };
      },
      maybeSingle: () => Promise.resolve({ data: apply()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: apply(), error: null }).then(resolve),
    });
    return chain;
  }

  return {
    supabase: { from: (table: string) => makeBuilder(table) },
    SUPABASE_URL: "http://mock",
    SUPABASE_ANON_KEY: "mock",
    __dealerDb: {
      reset: () => { dealerLines.length = 0; failWrites = false; hideReadback = false; },
      setFailWrites: (v: boolean) => { failWrites = v; },
      setHideReadback: (v: boolean) => { hideReadback = v; },
      rows: () => dealerLines,
    },
  };
});

import {
  upsertBudgetDealerLine,
  upsertBudgetDealerLines,
  listBudgetDealerLines,
  summarizeDealerLines,
  normalizeDealerName,
  BudgetPersistenceError,
} from "@/lib/crmBudgetService";

const supabaseMod = await import("@/lib/supabase") as unknown as {
  __dealerDb: { reset: () => void; setFailWrites: (v: boolean) => void; setHideReadback: (v: boolean) => void; rows: () => Array<Record<string, unknown>> };
};

beforeEach(() => supabaseMod.__dealerDb.reset());

const baseRow = (over: Partial<Parameters<typeof upsertBudgetDealerLine>[0]> = {}) => ({
  year: YEAR,
  month_idx: 4, // May
  seller_id: null,
  seller_name: "Jakob",
  seller_email: JTN_EMAIL,
  seller_initials: "JTN",
  dealer_account_id: "acc-wilmers",
  dealer_account_number: "10001",
  dealer_name: "Wilmers",
  dealer_name_norm: "wilmers",
  product_key: "RC-1000s",
  product_name: "RC-1000s",
  item_number: null,
  qty: 3,
  excluded_from_total: false,
  import_source: "phase35-test",
  import_batch_id: "batch-1",
  imported_by: "test",
  ...over,
});

describe("Phase 35 — crm_budget_dealer_lines service", () => {
  it("normalizeDealerName strips suffixes and punctuation", () => {
    expect(normalizeDealerName("Wilmers GmbH")).toBe("wilmers");
    expect(normalizeDealerName("Avi-Stech, A/S")).toBe("avi stech");
    expect(normalizeDealerName(null)).toBeNull();
    expect(normalizeDealerName("   ")).toBeNull();
  });

  it("upserts a dealer line and reads it back", async () => {
    await upsertBudgetDealerLine(baseRow());
    const all = await listBudgetDealerLines(YEAR);
    expect(all).toHaveLength(1);
    expect(all[0].qty).toBe(3);
    expect(all[0].dealer_account_id).toBe("acc-wilmers");
  });

  it("is idempotent for the same identity (account-id path)", async () => {
    await upsertBudgetDealerLine(baseRow({ qty: 3 }));
    await upsertBudgetDealerLine(baseRow({ qty: 3, id: "new-id" }));
    await upsertBudgetDealerLine(baseRow({ qty: 5 })); // qty change, same identity
    const all = await listBudgetDealerLines(YEAR);
    expect(all).toHaveLength(1);
    expect(all[0].qty).toBe(5);
  });

  it("falls back to dealer_name_norm identity when no account id", async () => {
    await upsertBudgetDealerLine(baseRow({ dealer_account_id: null, dealer_account_number: null, qty: 1 }));
    await upsertBudgetDealerLine(baseRow({ dealer_account_id: null, dealer_account_number: null, qty: 2 }));
    const all = await listBudgetDealerLines(YEAR);
    expect(all).toHaveLength(1);
    expect(all[0].qty).toBe(2);
    expect(all[0].dealer_name_norm).toBe("wilmers");
  });

  it("treats different sellers / months / products as distinct rows", async () => {
    await upsertBudgetDealerLines([
      baseRow(),
      baseRow({ month_idx: 5 }),
      baseRow({ product_key: "Timan 3330", qty: 0 }),
      baseRow({ seller_email: BP_EMAIL, seller_initials: "BP", dealer_account_id: "acc-avistech", dealer_name: "Avistech", dealer_name_norm: "avistech", qty: 1 }),
    ]);
    const all = await listBudgetDealerLines(YEAR);
    expect(all).toHaveLength(4);
  });

  it("excluded_from_total / qty 0 rows are stored but skipped by summarizeDealerLines", async () => {
    await upsertBudgetDealerLines([
      baseRow({ qty: 3 }),
      baseRow({ month_idx: 5, qty: 0, excluded_from_total: true, dealer_account_id: "acc-lost", dealer_name: "Kunde tabt", dealer_name_norm: "kunde tabt" }),
    ]);
    const sum = summarizeDealerLines(await listBudgetDealerLines(YEAR));
    const key = `${JTN_EMAIL}|${YEAR}|RC-1000s|4`;
    expect(sum.get(key)).toBe(3);
    // The excluded row contributes nothing.
    expect(Array.from(sum.values()).reduce((s, n) => s + n, 0)).toBe(3);
  });

  it("rejects rows missing seller_email", async () => {
    await expect(
      upsertBudgetDealerLine({ ...baseRow(), seller_email: "" } as never),
    ).rejects.toBeInstanceOf(BudgetPersistenceError);
  });

  it("throws when the write fails", async () => {
    supabaseMod.__dealerDb.setFailWrites(true);
    await expect(upsertBudgetDealerLine(baseRow())).rejects.toBeInstanceOf(BudgetPersistenceError);
  });

  it("throws when readback can't see the row (write succeeded but RLS hides it)", async () => {
    supabaseMod.__dealerDb.setHideReadback(true);
    await expect(upsertBudgetDealerLine(baseRow())).rejects.toBeInstanceOf(BudgetPersistenceError);
  });
});
