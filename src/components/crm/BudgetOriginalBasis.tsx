import { Database } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OriginalBudgetBasis } from "@/lib/crmBudgetService";

interface Props {
  basis: OriginalBudgetBasis;
  framed?: boolean;
  className?: string;
}

export default function BudgetOriginalBasis({ basis, framed = false, className }: Props) {
  return (
    <section
      aria-label="Budgetgrundlag"
      className={cn(
        "space-y-1 text-xs",
        framed && "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
        <Database className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        Budgetgrundlag
      </div>
      <div className="flex items-center justify-between gap-3 text-slate-700">
        <span>Oprindeligt budget</span>
        <span className="font-semibold tabular-nums">{basis.total} stk.</span>
      </div>
      <div className="pt-0.5 text-[11px] font-medium text-slate-500">Fordelt på</div>
      <ul className="space-y-0.5">
        {basis.allocations.map((allocation) => (
          <li
            key={allocation.dealer_account_id || allocation.dealer_account_number || allocation.dealer_name}
            className="flex items-start justify-between gap-3 text-slate-700"
          >
            <span className="min-w-0 break-words">
              {allocation.dealer_name}
              {allocation.dealer_account_number ? ` · #${allocation.dealer_account_number}` : ""}
            </span>
            <span className="shrink-0 tabular-nums">{allocation.qty} stk.</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
