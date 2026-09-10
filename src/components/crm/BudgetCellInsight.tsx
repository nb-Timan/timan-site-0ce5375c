/**
 * BudgetCellInsight — small wrapper that renders a number with a hover
 * tooltip showing the per-seller breakdown contributing to that number.
 *
 * Optional `references` prop renders a list of attached budget references
 * (dealer + lead/demo flag) — used on Budget cells so the user sees which
 * concrete reference posts add up to the cell total.
 *
 * Read-only / presentational. Does not mutate any data and does not affect
 * budget / pipeline / order calculations.
 */
import { ReactNode } from "react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

export type SellerNum = { initials: string; value: number };

export interface OrderTooltipDetail {
  order_id: string;
  order_number: string | null;
  title: string | null;
  dealer_name: string;
  seller_initials: string;
  product_label: string;
  quantity: number;
  order_total: number;
}

export interface CellReference {
  dealer_label: string | null;   // already-formatted "Company · 12345 · BP" or fritekst from before
  has_lead: boolean;
  has_demo: boolean;
  note?: string | null;
  /** Antal stk. denne reference dækker (NULL = ukendt for gamle rækker). */
  qty?: number | null;
}

interface Props {
  children: ReactNode;
  title: string;
  total: number;
  rows: SellerNum[];
  variant?: "budget" | "performance";
  missingBudget?: string[];
  extra?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** Optional list of attached references to display under the breakdown. */
  references?: CellReference[];
  /** Optional list of dealer names contributing orders to this cell.
   *  Duplicates are grouped and counted in parentheses when >1. */
  dealers?: string[];
  /** Concrete submitted-order rows from the same actuals as the cell total. */
  orderDetails?: OrderTooltipDetail[];
  /** Keep the total after the explanatory rows for budget/order cells. */
  totalAtBottom?: boolean;
}

function refKindLabel(r: CellReference): string {
  if (r.has_lead && r.has_demo) return "Lead + Demo";
  if (r.has_lead) return "Lead";
  if (r.has_demo) return "Demo";
  return "Uden lead";
}

export default function BudgetCellInsight({
  children, title, total, rows, variant = "budget", missingBudget, extra, side = "top", references, dealers,
  orderDetails, totalAtBottom = false,
}: Props) {
  const display = variant === "budget" ? rows.filter(r => r.value !== 0) : rows;
  const refs = references ?? [];
  const concreteOrders = orderDetails ?? [];
  const totalRow = (
    <div className="flex justify-between border-t border-slate-200/60 pt-1">
      <span className="font-semibold text-slate-700">Total</span>
      <span className="font-semibold tabular-nums">{variant === "performance" && total > 0 ? `+${total}` : total}</span>
    </div>
  );
  // Group dealer names; preserve first-seen order.
  const dealerGroups: Array<{ name: string; count: number }> = (() => {
    if (!dealers || dealers.length === 0) return [];
    const map = new Map<string, number>();
    for (const raw of dealers) {
      const name = (raw || "—").trim() || "—";
      map.set(name, (map.get(name) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  })();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{children}</span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[300px]">
        <div className="text-xs space-y-1">
          <div className="font-semibold border-b border-slate-200/60 pb-1">{title}</div>
          {!totalAtBottom && totalRow}
          {concreteOrders.length > 0 ? (
            <div className="space-y-1.5">
              {concreteOrders.map((order) => (
                <div key={`${order.order_id}-${order.product_label}`} className="space-y-0.5 border-b border-slate-100 pb-1.5 last:border-0 last:pb-0">
                  <div className="font-medium">
                    <a href="/portal/crm/orders" className="text-sky-700 hover:underline">
                      {order.order_number || order.order_id.slice(0, 8)}
                    </a>
                    {order.title ? <span className="ml-1 text-slate-600">· {order.title}</span> : null}
                  </div>
                  <div className="text-slate-600">{order.dealer_name}</div>
                  <div className="text-slate-600">Produkt: {order.product_label} · {order.quantity} stk.</div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Sælger: {order.seller_initials || "—"}</span>
                    <span className="font-semibold tabular-nums">
                      Beløb: {new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(order.order_total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : display.length > 0 ? (
            <ul className="space-y-0.5">
              {display.map((r) => {
                let cls = "tabular-nums";
                let label: string = String(r.value);
                if (variant === "performance") {
                  if (r.value > 0) { cls += " text-emerald-600"; label = `+${r.value}`; }
                  else if (r.value < 0) { cls += " text-rose-600"; }
                  else { cls += " text-slate-500"; }
                }
                return (
                  <li key={r.initials} className="flex justify-between gap-3">
                    <span className="text-slate-700">{r.initials}</span>
                    <span className={cls}>{label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-slate-500 italic">Ingen sælgere har værdier</div>
          )}
          {refs.length > 0 && (
            <div className="pt-1 border-t border-slate-200/60 space-y-0.5">
              <div className="text-slate-700">Referencer ({refs.length})</div>
              <ul className="space-y-0.5">
                {refs.map((r, i) => (
                  <li key={i} className="text-slate-700 truncate">
                    · {r.dealer_label || "—"}
                    {typeof r.qty === "number" && r.qty > 0 ? ` · ${r.qty} stk.` : ""}
                    {" · "}<span className="text-slate-500">{refKindLabel(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {concreteOrders.length === 0 && dealerGroups.length > 0 && (
            <div className="pt-1 border-t border-slate-200/60 space-y-0.5">
              <div className="text-slate-700">Forhandler:</div>
              <ul className="space-y-0.5">
                {dealerGroups.map((d) => (
                  <li key={d.name} className="text-slate-700 truncate">
                    · {d.name}{d.count > 1 ? ` (${d.count})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {missingBudget && missingBudget.length > 0 && (
            <div className="pt-1 border-t border-slate-200/60 text-[11px] text-amber-300">
              Mangler budget: {missingBudget.join(", ")}
            </div>
          )}
          {extra && <div className="pt-1 border-t border-slate-200/60">{extra}</div>}
          {totalAtBottom && totalRow}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
