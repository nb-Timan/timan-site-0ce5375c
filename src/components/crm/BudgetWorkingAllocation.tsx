import { cn } from "@/lib/utils";
import type { WorkingBudgetAllocation } from "@/lib/workingBudgetAllocation";

interface Props {
  allocation: WorkingBudgetAllocation;
  framed?: boolean;
  showTotal?: boolean;
  className?: string;
}

export default function BudgetWorkingAllocation({ allocation, framed = false, showTotal = true, className }: Props) {
  return (
    <section
      aria-label="Aktuel forhandlerfordeling"
      className={cn(
        "space-y-1 text-xs",
        framed && "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2",
        className,
      )}
    >
      {showTotal && (
        <div className="flex items-center justify-between gap-3 text-slate-700">
          <span className="font-semibold">Total</span>
          <span className="font-semibold tabular-nums">{allocation.total} stk.</span>
        </div>
      )}
      {allocation.source === "inherited" && (
        <div className="text-[11px] text-slate-500">Startfordeling fra oprindeligt budget</div>
      )}
      <div className="pt-0.5 text-[11px] font-medium text-slate-500">Fordelt på</div>
      {allocation.allocations.length > 0 ? (
        <ul className="space-y-0.5">
          {allocation.allocations.map((row) => (
            <li
              key={row.dealer_account_number || row.dealer_name}
              className="flex items-start justify-between gap-3 text-slate-700"
            >
              <span className="min-w-0 break-words">
                {row.dealer_name}
                {row.dealer_account_number ? ` · #${row.dealer_account_number}` : ""}
              </span>
              <span className="shrink-0 tabular-nums">{row.qty} stk.</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-[11px] italic text-slate-500">Ingen aktuel forhandlerfordeling</div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200/60 pt-1 text-slate-700">
        <span>Fordelt</span>
        <span className="font-semibold tabular-nums">{allocation.allocated} / {allocation.total} stk.</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-slate-700">
        <span>Ikke fordelt</span>
        <span className="font-semibold tabular-nums">{allocation.unallocated} stk.</span>
      </div>
    </section>
  );
}
