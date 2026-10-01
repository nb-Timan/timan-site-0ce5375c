import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface BudgetFocusNoBudgetDisclosureProps {
  title: string;
  orders: number;
  orderLabel: string;
  items: number;
  itemLabel: string;
  children: ReactNode;
}

export default function BudgetFocusNoBudgetDisclosure({
  title,
  orders,
  orderLabel,
  items,
  itemLabel,
  children,
}: BudgetFocusNoBudgetDisclosureProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  return (
    <div className="border-t border-amber-100 pt-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded(value => !value)}
        className="group flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-amber-800 transition-colors hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 sm:flex-nowrap"
      >
        <span className="flex min-w-0 items-center gap-2 font-semibold text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
          <span>{title}</span>
        </span>
        <span className="flex items-center gap-2 text-xs font-medium tabular-nums text-amber-700 sm:shrink-0">
          <span>
            {orders} {orderLabel}
            <span className="mx-1.5 text-amber-300">·</span>
            {items} {itemLabel}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {expanded && <div id={contentId} className="mt-2 space-y-2.5 pl-2">{children}</div>}
    </div>
  );
}
