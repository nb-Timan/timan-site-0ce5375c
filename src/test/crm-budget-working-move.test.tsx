import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BudgetWorkingMoveDialog, { type BudgetWorkingMoveContext } from "@/components/crm/BudgetWorkingMoveDialog";
import { resolveWorkingBudgetAllocation } from "@/lib/workingBudgetAllocation";
import { readWorkingBudgetMoveAudit } from "@/lib/workingBudgetMoveAudit";

afterEach(cleanup);

const context: BudgetWorkingMoveContext = {
  budgetLineId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  modelName: "RC-1000s",
  sellerLabel: "NB",
  sourceMonthIdx: 8,
  sourceMonthLabel: "Sep",
  allocation: resolveWorkingBudgetAllocation({
    workingQty: 6,
    references: [
      {
        dealer_account_id: "11111111-1111-4111-8111-111111111111",
        dealer_account_number: "10180",
        dealer_name: "Foras GmbH Zeven",
        qty: 2,
      },
      {
        dealer_account_id: "22222222-2222-4222-8222-222222222222",
        dealer_account_number: "10569",
        dealer_name: "Kobatec GmbH",
        qty: 1,
      },
    ],
  }),
};

const months = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

describe("Working Budget dealer-specific move", () => {
  it("shows dealer/account identity, quantities and unallocated quantity", () => {
    render(<BudgetWorkingMoveDialog open context={context} monthLabels={months} busy={false} onClose={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByText("Foras GmbH Zeven")).toBeInTheDocument();
    expect(screen.getByText("#10180 · 2 stk. tilgængelig")).toBeInTheDocument();
    expect(screen.getByText("Kobatec GmbH")).toBeInTheDocument();
    expect(screen.getByText("Ikke fordelt")).toBeInTheDocument();
    expect(screen.getByText("3 stk. uden forhandler")).toBeInTheDocument();
  });

  it("supports a multi-allocation move and preserves stable dealer ids", () => {
    const onConfirm = vi.fn();
    render(<BudgetWorkingMoveDialog open context={context} monthLabels={months} busy={false} onClose={vi.fn()} onConfirm={onConfirm} />);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    fireEvent.change(screen.getByLabelText("2. Vælg destinationsmåned"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Flyt" }));

    expect(onConfirm).toHaveBeenCalledWith(9, [
      {
        kind: "dealer",
        dealer_account_id: "11111111-1111-4111-8111-111111111111",
        dealer_account_number: "10180",
        dealer_name: "Foras GmbH Zeven",
        quantity: 1,
      },
      {
        kind: "dealer",
        dealer_account_id: "22222222-2222-4222-8222-222222222222",
        dealer_account_number: "10569",
        dealer_name: "Kobatec GmbH",
        quantity: 1,
      },
    ]);
    expect(screen.getByText("Flyt 2 stk.")).toBeInTheDocument();
  });

  it("allows selecting only unallocated quantity without inventing a dealer", () => {
    const onConfirm = vi.fn();
    render(<BudgetWorkingMoveDialog open context={context} monthLabels={months} busy={false} onClose={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    fireEvent.change(screen.getByLabelText("2. Vælg destinationsmåned"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Flyt" }));

    expect(onConfirm).toHaveBeenCalledWith(10, [{ kind: "unallocated", quantity: 1 }]);
  });

  it("caps the selected dealer quantity at the available quantity", () => {
    render(<BudgetWorkingMoveDialog open context={context} monthLabels={months} busy={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    const increment = screen.getAllByRole("button").find((button) => button.querySelector("svg.lucide-plus"));
    expect(increment).toBeTruthy();
    fireEvent.click(increment!);
    expect(screen.getByText("2", { selector: "span.tabular-nums" })).toBeInTheDocument();
    expect(increment).toBeDisabled();
  });

  it("keeps the selector narrow-safe and disables repeat confirmation while busy", () => {
    const { rerender } = render(<BudgetWorkingMoveDialog open context={context} monthLabels={months} busy={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveClass("w-[calc(100vw-1rem)]", "overflow-x-hidden");
    rerender(<BudgetWorkingMoveDialog open context={context} monthLabels={months} busy onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Flytter…" })).toBeDisabled();
  });
});

describe("Working Budget move migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260929215304_move_working_budget_dealer_allocations.sql"),
    "utf8",
  );

  it("extends the canonical references instead of creating a parallel allocation table", () => {
    expect(migration).toMatch(/alter table public\.budget_references[\s\S]*dealer_account_id uuid/i);
    expect(migration).not.toMatch(/create table public\.crm_working_budget_allocations/i);
  });

  it("moves forecast and reference rows atomically under seller authorization", () => {
    expect(migration).toMatch(/create or replace function public\.move_crm_working_budget_allocations/i);
    expect(migration).toMatch(/is_timan_budget_seller\(v_line\.seller_email\)/i);
    expect(migration).toMatch(/pg_advisory_xact_lock/i);
    expect(migration).toMatch(/update public\.crm_budget_forecasts[\s\S]*monthly_qty = v_monthly/i);
    expect(migration).toMatch(/insert into public\.budget_references[\s\S]*movement_id/i);
    expect(migration).toMatch(/when v_selection_dealer_id is not null then reference\.dealer_account_id = v_selection_dealer_id/i);
  });

  it("blocks insufficient, duplicate and replayed moves while writing existing audit history", () => {
    expect(migration).toMatch(/Duplicate allocation selections are not allowed/i);
    expect(migration).toMatch(/Move quantity exceeds the source month/i);
    expect(migration).toMatch(/already_applied/i);
    expect(migration).toMatch(/record_type, record_id[\s\S]*crm_working_budget_move/i);
    expect(migration).toMatch(/record_type[\s\S]*crm_budget/i);
  });
});

describe("Working Budget move audit", () => {
  it("exposes dealer, account, quantity and month direction to existing history UI", () => {
    expect(readWorkingBudgetMoveAudit({
      movement: {
        source_month: "Sep",
        destination_month: "Okt",
        quantity: 1,
        allocations: [{
          kind: "dealer",
          dealer_name: "Kobatec GmbH",
          dealer_account_number: "10569",
          quantity: 1,
        }],
      },
    })).toEqual({
      sourceMonth: "Sep",
      destinationMonth: "Okt",
      quantity: 1,
      allocations: [{
        kind: "dealer",
        dealer_name: "Kobatec GmbH",
        dealer_account_number: "10569",
        quantity: 1,
      }],
    });
  });
});
