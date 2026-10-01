import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  budgetFocusProductLabel,
  noBudgetOrderTotals,
  sortNoBudgetOrderRows,
} from "@/lib/crmBudgetFocusPresentation";
import BudgetFocusNoBudgetDisclosure from "@/components/crm/BudgetFocusNoBudgetDisclosure";

afterEach(cleanup);

describe("Budget Fokus orders without budget", () => {
  it("is collapsed by default and supports whole-row expand/collapse semantics", () => {
    render(
      <BudgetFocusNoBudgetDisclosure
        title="Ordrer uden budget"
        orders={48}
        orderLabel="ordrer"
        items={14}
        itemLabel="varer"
      >
        <div>LOOSE_TOOL</div>
      </BudgetFocusNoBudgetDisclosure>,
    );

    const trigger = screen.getByRole("button", { name: /Ordrer uden budget.*48 ordrer.*14 varer/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls");
    expect(screen.queryByText("LOOSE_TOOL")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("LOOSE_TOOL")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("LOOSE_TOOL")).not.toBeInTheDocument();
  });

  it("uses actual totals and sorts highest order count first with a stable label tie-break", () => {
    const rows = [
      { label: "Zulu", ordersQty: 2 },
      { label: "Beta", ordersQty: 8 },
      { label: "Alpha", ordersQty: 8 },
    ];

    expect(noBudgetOrderTotals(rows)).toEqual({ orders: 18, items: 3 });
    expect(sortNoBudgetOrderRows(rows).map(row => row.label)).toEqual(["Alpha", "Beta", "Zulu"]);
    expect(rows.map(row => row.label)).toEqual(["Zulu", "Beta", "Alpha"]);
  });

  it("uses the canonical Configurator-derived product label and keeps technical fallbacks", () => {
    expect(budgetFocusProductLabel("RC1000_410910", "RC1000_410910", "da"))
      .toBe("410910 · Slagleklipper inkl Y-slagle sæt");
    expect(budgetFocusProductLabel("LOOSE_TOOL", "LOOSE_TOOL", "da")).toBe("LOOSE_TOOL");
    expect(budgetFocusProductLabel("custom_key", "Custom budget product", "da"))
      .toBe("Custom budget product");
  });

  it("uses singular summary labels without duplicating language identities", () => {
    render(
      <BudgetFocusNoBudgetDisclosure
        title="Orders without budget"
        orders={1}
        orderLabel="order"
        items={1}
        itemLabel="item"
      >
        <div>One product</div>
      </BudgetFocusNoBudgetDisclosure>,
    );

    expect(screen.getByRole("button", { name: /Orders without budget.*1 order.*1 item/i }))
      .toHaveAttribute("aria-expanded", "false");
  });
});
