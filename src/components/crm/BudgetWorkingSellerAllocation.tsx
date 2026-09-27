import BudgetWorkingAllocation from "@/components/crm/BudgetWorkingAllocation";
import type { WorkingBudgetAggregateAllocation } from "@/lib/workingBudgetAllocation";

interface Props {
  allocation: WorkingBudgetAggregateAllocation;
}

export default function BudgetWorkingSellerAllocation({ allocation }: Props) {
  return (
    <section aria-label="Aktuel forhandlerfordeling pr. sælger" className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-3 text-slate-700">
        <span className="font-semibold">Total</span>
        <span className="font-semibold tabular-nums">{allocation.total} stk.</span>
      </div>

      {allocation.sellers.map((seller) => (
        <div
          key={seller.seller_email || seller.seller_initials}
          className="space-y-1 border-t border-slate-200/60 pt-2 first:border-t-0 first:pt-0"
        >
          <div className="flex items-center justify-between gap-3 font-semibold text-slate-800">
            <span>{seller.seller_initials}</span>
            <span className="shrink-0 tabular-nums">{seller.allocation.total} stk.</span>
          </div>
          <BudgetWorkingAllocation allocation={seller.allocation} showTotal={false} />
        </div>
      ))}

      <div className="space-y-1 border-t border-slate-300 pt-2 font-semibold text-slate-800">
        <div className="flex items-center justify-between gap-3">
          <span>TOTAL FORDELT</span>
          <span className="shrink-0 tabular-nums">{allocation.allocated} / {allocation.total} stk.</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>TOTAL IKKE FORDELT</span>
          <span className="shrink-0 tabular-nums">{allocation.unallocated} stk.</span>
        </div>
      </div>
    </section>
  );
}
