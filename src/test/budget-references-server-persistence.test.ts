import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => {
  const references: Array<Record<string, unknown>> = [];
  let failWrites = false;

  function makeBuilder() {
    const filters: Array<{ column: string; value: unknown }> = [];
    let operation: "select" | "insert" | "delete" = "select";
    let inserted: Record<string, unknown> | null = null;
    let limit: number | null = null;
    const matches = (row: Record<string, unknown>) => filters.every(
      ({ column, value }) => row[column] === value,
    );
    const execute = () => {
      if (failWrites && operation !== "select") return { data: null, error: new Error("remote write denied") };
      if (operation === "insert" && inserted) {
        references.push(inserted);
        return { data: inserted, error: null };
      }
      if (operation === "delete") {
        for (let index = references.length - 1; index >= 0; index -= 1) {
          if (matches(references[index])) references.splice(index, 1);
        }
        return { data: null, error: null };
      }
      const rows = references.filter(matches);
      return { data: limit == null ? rows : rows.slice(0, limit), error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (payload: Record<string, unknown>) => { operation = "insert"; inserted = { ...payload }; return chain; },
      delete: () => { operation = "delete"; return chain; },
      eq: (column: string, value: unknown) => { filters.push({ column, value }); return chain; },
      ilike: (column: string, value: unknown) => { filters.push({ column, value }); return chain; },
      order: () => chain,
      limit: (value: number) => { limit = value; return chain; },
      single: () => Promise.resolve(execute()),
      then: (onfulfilled: (value: unknown) => unknown, onrejected: (reason: unknown) => unknown) => Promise.resolve(execute()).then(onfulfilled, onrejected),
    };
    return chain;
  }

  return {
    supabase: { from: () => makeBuilder() },
    __budgetReferenceDb: {
      references,
      reset: () => { references.length = 0; failWrites = false; },
      setFailWrites: (value: boolean) => { failWrites = value; },
    },
  };
});

vi.mock("@/lib/persistenceWarning", () => ({ notifyLocalFallback: vi.fn() }));

import * as supabaseModule from "@/lib/supabase";
import { createBudgetReference, deleteBudgetReferencesForCell, listBudgetReferences, type NewBudgetReference } from "@/lib/budgetReferencesService";

const db = (supabaseModule as unknown as {
  __budgetReferenceDb: { references: Array<Record<string, unknown>>; reset: () => void; setFailWrites: (value: boolean) => void };
}).__budgetReferenceDb;

const input: NewBudgetReference = {
  cell_key: "2026:bp:410040:4:budget", budget_year: 2026, seller_initials: "BP", seller_email: "bp@timan.dk",
  product_code: "410040", model_name: "Timan 3330", category: "machine", month: "Maj", month_idx: 4,
  budget_type: "budget", old_value: 3, new_value: 4, dealer_name: "Tiefel Garten + Forstgerate GmbH",
  dealer_account_number: "10458", contact_name: "Dag Vilster Petersen", lead_id: null, demo_id: null,
  note: null, created_by_email: "bp@timan.dk", created_by_name: "BP", delta_qty: 1, reference_group_id: "audit-1",
};

describe("budget references server persistence", () => {
  beforeEach(() => { localStorage.clear(); db.reset(); });

  it("persists to Supabase and reloads the confirmed remote row", async () => {
    const saved = await createBudgetReference(input);
    const reopened = await listBudgetReferences({ cell_key: input.cell_key, year: input.budget_year, budget_type: input.budget_type });
    expect(db.references).toHaveLength(1);
    expect(reopened).toEqual([saved]);
    expect(reopened[0]).toMatchObject({ dealer_account_number: "10458", contact_name: "Dag Vilster Petersen", delta_qty: 1 });
  });

  it("does not use stale localStorage when Supabase confirms an empty result", async () => {
    localStorage.setItem("timan.budget_references.v1", JSON.stringify([{ ...input, id: "stale", created_at: new Date().toISOString() }]));
    await expect(listBudgetReferences({ cell_key: input.cell_key })).resolves.toEqual([]);
  });

  it("deletes only the selected cell/year/type scope after remote confirmation", async () => {
    await createBudgetReference(input);
    await createBudgetReference({ ...input, budget_type: "arbejdsbudget", reference_group_id: "audit-2" });
    await createBudgetReference({ ...input, cell_key: "other-cell", reference_group_id: "audit-3" });
    await deleteBudgetReferencesForCell({ cell_key: input.cell_key, budget_year: input.budget_year, budget_type: input.budget_type });
    expect(db.references).toHaveLength(2);
    expect(db.references.map((row) => row.cell_key)).toContain("other-cell");
    expect(db.references.map((row) => row.budget_type)).toContain("arbejdsbudget");
  });

  it("rejects failed remote writes instead of reporting a server save", async () => {
    db.setFailWrites(true);
    await expect(createBudgetReference(input)).rejects.toThrow("remote write denied");
    expect(db.references).toHaveLength(0);
  });

  it("does not erase the local fallback when remote delete-cell fails", async () => {
    localStorage.setItem("timan.budget_references.v1", JSON.stringify([{ ...input, id: "fallback", created_at: new Date().toISOString() }]));
    db.setFailWrites(true);
    await expect(deleteBudgetReferencesForCell({ cell_key: input.cell_key, budget_year: input.budget_year, budget_type: input.budget_type })).rejects.toThrow("remote write denied");
    expect(JSON.parse(localStorage.getItem("timan.budget_references.v1") || "[]")).toHaveLength(1);
  });
});

describe("budget references migration", () => {
  const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260911082228_budget_references_server_persistence.sql"), "utf8");

  it("creates the server table with RLS and authenticated, seller-scoped policies", () => {
    expect(migration).toMatch(/create table public\.budget_references/i);
    expect(migration).toMatch(/enable row level security/i);
    expect(migration).toMatch(/revoke all on table public\.budget_references from anon/i);
    expect(migration).toMatch(/for select[\s\S]*is_timan_budget_seller\(seller_email\)/i);
    expect(migration).toMatch(/for insert[\s\S]*is_timan_budget_seller\(seller_email\)/i);
    expect(migration).toMatch(/for delete[\s\S]*is_timan_budget_seller\(seller_email\)/i);
  });
});
