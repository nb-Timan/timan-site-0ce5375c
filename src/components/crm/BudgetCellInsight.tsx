/**
 * BudgetCellInsight — small wrapper that renders a number with a hover
 * tooltip showing the per-seller breakdown contributing to that number.
 *
 * Read-only / presentational. Does not mutate any data and does not affect
 * budget / pipeline / order calculations.
 */
import { ReactNode } from "react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

export type SellerNum = { initials: string; value: number };

interface Props {
  children: ReactNode;
  title: string;             // e.g. "Budget · Apr · RC-751"
  total: number;
  rows: SellerNum[];         // seller breakdown
  /** Performance variant adds Δ tone + missing-budget hints. */
  variant?: "budget" | "performance";
  /** For performance variant: who has 0 budget (so we can call them out). */
  missingBudget?: string[];
  /** Optional second line of context (e.g. "Pipeline: 3"). */
  extra?: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

export default function BudgetCellInsight({
  children, title, total, rows, variant = "budget", missingBudget, extra, side = "top",
}: Props) {
  // Filter empty if budget variant; performance variant keeps all (so user
  // sees zero-perf sellers too).
  const display = variant === "budget" ? rows.filter(r => r.value !== 0) : rows;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-default">{children}</span>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[260px]">
        <div className="text-xs space-y-1">
          <div className="font-semibold border-b border-slate-200/60 pb-1">{title}</div>
          <div className="flex justify-between">
            <span className="text-slate-300">Total</span>
            <span className="font-semibold tabular-nums">{variant === "performance" && total > 0 ? `+${total}` : total}</span>
          </div>
          {display.length > 0 ? (
            <ul className="space-y-0.5">
              {display.map((r) => {
                let cls = "tabular-nums";
                let label: string = String(r.value);
                if (variant === "performance") {
                  if (r.value > 0) { cls += " text-emerald-300"; label = `+${r.value}`; }
                  else if (r.value < 0) { cls += " text-rose-300"; }
                  else { cls += " text-slate-400"; }
                }
                return (
                  <li key={r.initials} className="flex justify-between gap-3">
                    <span className="text-slate-300">{r.initials}</span>
                    <span className={cls}>{label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="text-slate-400 italic">Ingen sælgere har værdier</div>
          )}
          {missingBudget && missingBudget.length > 0 && (
            <div className="pt-1 border-t border-slate-200/60 text-[11px] text-amber-300">
              Mangler budget: {missingBudget.join(", ")}
            </div>
          )}
          {extra && <div className="pt-1 border-t border-slate-200/60">{extra}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
