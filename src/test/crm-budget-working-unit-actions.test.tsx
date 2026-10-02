import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BudgetWorkingUnitDialog, { type BudgetWorkingUnitContext } from "@/components/crm/BudgetWorkingUnitDialog";
import { resolveWorkingBudgetAllocation } from "@/lib/workingBudgetAllocation";
import type { WorkingBudgetUnit } from "@/lib/workingBudgetMoveService";
import {
  sortWorkingBudgetMonths,
  workingBudgetMonthDistance,
  workingBudgetUnitChoices,
  type WorkingBudgetMonthState,
} from "@/lib/workingBudgetUnitActions";

afterEach(cleanup);

const dealerIds = {
  foras: "11111111-1111-4111-8111-111111111111",
  weimer: "22222222-2222-4222-8222-222222222222",
};

function month(
  monthIdx: number,
  monthLabel: string,
  total: number,
  references: Parameters<typeof resolveWorkingBudgetAllocation>[0]["references"] = [],
): WorkingBudgetMonthState {
  const units: WorkingBudgetUnit[] = [];
  let sequence = monthIdx * 100;
  references.forEach((reference) => {
    for (let index = 0; index < (reference.qty || 0); index += 1) {
      sequence += 1;
      units.push({
        id: `unit-${monthIdx}-${sequence}`,
        budget_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        sequence_no: sequence,
        month_idx: monthIdx,
        dealer_account_id: reference.dealer_account_id || null,
        dealer_account_number: reference.dealer_account_number || null,
        dealer_name: reference.dealer_name || null,
        origin_type: "original_budget",
        version: 1,
      });
    }
  });
  while (units.length < total) {
    sequence += 1;
    units.push({
      id: `unit-${monthIdx}-${sequence}`,
      budget_line_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      sequence_no: sequence,
      month_idx: monthIdx,
      dealer_account_id: null,
      dealer_account_number: null,
      dealer_name: null,
      origin_type: "manual_add",
      version: 1,
    });
  }
  return {
    monthIdx,
    monthLabel,
    units,
    allocation: resolveWorkingBudgetAllocation({ workingQty: total, references }),
  };
}

const months: WorkingBudgetMonthState[] = [
  month(0, "Januar 2027", 1),
  month(1, "Februar 2027", 3, [
    { dealer_account_id: dealerIds.foras, dealer_account_number: "10180", dealer_name: "Foras GmbH Zeven", qty: 1 },
    { dealer_account_id: dealerIds.weimer, dealer_account_number: "10291", dealer_name: "Weimer GmbH Lollar", qty: 1 },
  ]),
  month(2, "Marts 2027", 1),
  month(3, "April 2027", 1),
  month(4, "Maj 2027", 0),
  month(5, "Juni 2027", 0),
  month(6, "Juli 2026", 1),
  month(7, "August 2026", 1),
  month(8, "September 2026", 1),
  month(9, "Oktober 2026", 2, [
    { dealer_account_id: dealerIds.foras, dealer_account_number: "10180", dealer_name: "Foras GmbH Zeven", qty: 1 },
    { dealer_account_id: dealerIds.weimer, dealer_account_number: "10291", dealer_name: "Weimer GmbH Lollar", qty: 1 },
  ]),
  month(10, "November 2026", 1),
  month(11, "December 2026", 1),
];

function context(action: "increase" | "decrease" = "increase"): BudgetWorkingUnitContext {
  return {
    budgetLineId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    modelName: "RC-751",
    sellerLabel: "NB",
    action,
    monthIdx: 9,
    monthLabel: "Oktober 2026",
    months,
  };
}

describe("Working Budget unit actions", () => {
  it("sorts nearest months first across year boundaries and keeps distant months", () => {
    expect(sortWorkingBudgetMonths(months, 9).map((entry) => entry.monthIdx)).toEqual([
      8, 10, 7, 11, 6, 0, 5, 1, 4, 2, 3,
    ]);
    expect(workingBudgetMonthDistance(11, 0)).toBe(1);
    expect(workingBudgetMonthDistance(0, 11)).toBe(1);
    expect(sortWorkingBudgetMonths(months, 9).some((entry) => entry.monthIdx === 1)).toBe(true);
  });

  it("creates one-unit dealer and unallocated choices without losing dealer identity", () => {
    const choices = workingBudgetUnitChoices(months[1].units);
    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Foras GmbH Zeven",
        unit: expect.objectContaining({
          dealer_account_id: dealerIds.foras,
          dealer_account_number: "10180",
        }),
      }),
      expect.objectContaining({ label: "Ikke fordelt", unit: expect.objectContaining({ dealer_account_id: null }) }),
    ]));
  });

  it("keeps same-dealer units individually selectable with distinct stable ids", () => {
    const duplicateDealerMonth = month(11, "December 2026", 3, [
      { dealer_account_id: dealerIds.foras, dealer_account_number: "10180", dealer_name: "Foras GmbH Zeven", qty: 3 },
    ]);
    const choices = workingBudgetUnitChoices(duplicateDealerMonth.units);
    expect(new Set(choices.map((choice) => choice.unit.id)).size).toBe(3);
    expect(choices.map((choice) => choice.detail)).toEqual([
      "#10180 · Enhed 1 af 3",
      "#10180 · Enhed 2 af 3",
      "#10180 · Enhed 3 af 3",
    ]);
  });

  it("does not mutate on plus until the user explicitly confirms a new unit", () => {
    const onAddNew = vi.fn();
    render(
      <BudgetWorkingUnitDialog
        open
        context={context()}
        busy={false}
        onClose={vi.fn()}
        onAddNew={onAddNew}
        onRemove={vi.fn()}
        onMove={vi.fn()}
      />,
    );

    expect(onAddNew).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Tilføj ny enhed/i }));
    expect(screen.getByText(/Den nye enhed bliver ikke fordelt/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tilføj 1 ny enhed/i }));
    expect(onAddNew).toHaveBeenCalledTimes(1);
  });

  it("keeps February selectable for an October move and preserves the selected dealer", () => {
    const onMove = vi.fn();
    render(
      <BudgetWorkingUnitDialog
        open
        context={context()}
        busy={false}
        onClose={vi.fn()}
        onAddNew={vi.fn()}
        onRemove={vi.fn()}
        onMove={onMove}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Flyt fra en anden måned/i }));
    fireEvent.click(screen.getByRole("button", { name: /Vis alle måneder/i }));
    const februaryGroup = screen.getByRole("region", { name: /Februar 2027 · 3 stk/i });
    expect(within(februaryGroup).queryByRole("button", { name: /Februar 2027/i })).not.toBeInTheDocument();
    fireEvent.click(within(februaryGroup).getByRole("button", { name: /Weimer GmbH Lollar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Flyt 1 enhed/i }));

    expect(onMove).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      month_idx: 1,
      dealer_account_id: dealerIds.weimer,
      dealer_account_number: "10291",
      dealer_name: "Weimer GmbH Lollar",
      version: 1,
    }), 9);
  });

  it("requires an explicit allocated unit for minus and remains narrow-safe", () => {
    const onRemove = vi.fn();
    render(
      <BudgetWorkingUnitDialog
        open
        context={context("decrease")}
        busy={false}
        onClose={vi.fn()}
        onAddNew={vi.fn()}
        onRemove={onRemove}
        onMove={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveClass("w-[calc(100vw-1rem)]", "overflow-x-hidden");
    fireEvent.click(screen.getByRole("button", { name: /Fjern fra arbejdsbudget/i }));
    expect(screen.getByRole("button", { name: /Fjern 1 enhed/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Foras GmbH Zeven/i }));
    fireEvent.click(screen.getByRole("button", { name: /Fjern 1 enhed/i }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({
      dealer_account_id: dealerIds.foras,
      month_idx: 9,
      version: 1,
    }));
  });

  it("resets to the safe action choices when the dialog is reopened", () => {
    const props = {
      context: context("decrease"),
      busy: false,
      onClose: vi.fn(),
      onAddNew: vi.fn(),
      onRemove: vi.fn(),
      onMove: vi.fn(),
    };
    const { rerender } = render(<BudgetWorkingUnitDialog open {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /Flyt en enhed til en anden måned/i }));
    expect(screen.getByText(/Vælg destinationsmåned/i)).toBeInTheDocument();

    rerender(<BudgetWorkingUnitDialog open={false} {...props} />);
    rerender(<BudgetWorkingUnitDialog open {...props} />);

    expect(screen.queryByText(/Vælg destinationsmåned/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Flyt en enhed til en anden måned/i })).toBeInTheDocument();
  });
});

describe("safe Working Budget mutation migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261002101500_stable_working_budget_unit_identity.sql"),
    "utf8",
  );

  it("materializes stable allocated and unallocated unit identities idempotently", () => {
    expect(migration).toMatch(/create table public\.crm_working_budget_units/i);
    expect(migration).toMatch(/id uuid primary key default gen_random_uuid/i);
    expect(migration).toMatch(/unique \(budget_line_id, materialization_key\)/i);
    expect(migration).toMatch(/origin_type[\s\S]*original_budget[\s\S]*working_reference[\s\S]*manual_add/i);
    expect(migration).toMatch(/materialized-unallocated/i);
  });

  it("moves and removes by canonical unit id with optimistic concurrency", () => {
    expect(migration).toMatch(/create or replace function public\.move_crm_working_budget_unit\([\s\S]*p_unit_id uuid/i);
    expect(migration).toMatch(/create or replace function public\.remove_crm_working_budget_unit/i);
    expect(migration).toMatch(/v_unit\.version <> p_expected_version/i);
    expect(migration).toMatch(/changed concurrently/i);
    expect(migration).toMatch(/set month_idx = p_target_month_idx, version = version \+ 1/i);
  });

  it("keeps unit actions atomic, authorized and attached to existing audit history", () => {
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/is_timan_budget_seller\(v_line\.seller_email\)/i);
    expect(migration).toMatch(/working_budget_unit_id/i);
    expect(migration).toMatch(/revoke all on table public\.crm_working_budget_units from public, anon, authenticated/i);
  });

  it("does not mutate the immutable original dealer budget", () => {
    expect(migration).not.toMatch(/update public\.crm_budget_dealer_lines/i);
    expect(migration).not.toMatch(/delete from public\.crm_budget_dealer_lines/i);
  });
});
