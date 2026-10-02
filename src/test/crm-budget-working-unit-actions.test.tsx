import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BudgetWorkingUnitDialog, { type BudgetWorkingUnitContext } from "@/components/crm/BudgetWorkingUnitDialog";
import { resolveWorkingBudgetAllocation } from "@/lib/workingBudgetAllocation";
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
  return {
    monthIdx,
    monthLabel,
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
    const choices = workingBudgetUnitChoices(months[1].allocation);
    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "Foras GmbH Zeven",
        selection: expect.objectContaining({
          kind: "dealer",
          dealer_account_id: dealerIds.foras,
          dealer_account_number: "10180",
          quantity: 1,
        }),
      }),
      expect.objectContaining({ selection: { kind: "unallocated", quantity: 1 } }),
    ]));
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
    fireEvent.click(screen.getByRole("button", { name: /Februar 2027 · 3 stk/i }));
    const weimerButtons = screen.getAllByRole("button", { name: /Weimer GmbH Lollar/i });
    fireEvent.click(weimerButtons[weimerButtons.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: /Flyt 1 enhed/i }));

    expect(onMove).toHaveBeenCalledWith(1, 9, {
      kind: "dealer",
      dealer_account_id: dealerIds.weimer,
      dealer_account_number: "10291",
      dealer_name: "Weimer GmbH Lollar",
      quantity: 1,
    });
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
      kind: "dealer",
      dealer_account_id: dealerIds.foras,
      quantity: 1,
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
    resolve(process.cwd(), "supabase/migrations/20261002085127_safe_working_budget_unit_adjustments.sql"),
    "utf8",
  );

  it("materializes inherited allocations before applying a one-unit delta", () => {
    expect(migration).toMatch(/create or replace function public\.adjust_crm_working_budget_quantity/i);
    expect(migration).toMatch(/insert into public\.budget_references[\s\S]*Arvet fra oprindeligt budget/i);
    expect(migration).toMatch(/if p_delta = 1 then[\s\S]*must start unallocated/i);
    expect(migration).toMatch(/v_new_value := v_old_value \+ p_delta/i);
  });

  it("requires explicit removal, prevents negative values and checks concurrency", () => {
    expect(migration).toMatch(/Select the exact Working Budget unit to remove/i);
    expect(migration).toMatch(/Working Budget quantity cannot become negative/i);
    expect(migration).toMatch(/p_expected_value/i);
    expect(migration).toMatch(/changed concurrently/i);
  });

  it("keeps moves atomic, authorized and recorded in the existing audit history", () => {
    expect(migration).toMatch(/create or replace function public\.move_crm_working_budget_unit/i);
    expect(migration).toMatch(/return public\.move_crm_working_budget_allocations/i);
    expect(migration).toMatch(/is_timan_budget_seller\(v_line\.seller_email\)/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/crm_working_budget_adjustment/i);
    expect(migration).toMatch(/record_type[\s\S]*crm_budget/i);
  });

  it("does not mutate original dealer budget rows or create a parallel allocation table", () => {
    expect(migration).not.toMatch(/update public\.crm_budget_dealer_lines/i);
    expect(migration).not.toMatch(/delete from public\.crm_budget_dealer_lines/i);
    expect(migration).not.toMatch(/create table[\s\S]*working_budget_allocations/i);
  });
});
