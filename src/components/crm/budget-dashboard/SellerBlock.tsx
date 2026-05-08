import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import BudgetMatrix from "./BudgetMatrix";
import type {
  MachineKey,
  Quarter,
  SellerDisplay,
  SellerSection,
} from "./useBudgetDashboardData";

interface Props {
  seller: SellerDisplay;
  section: SellerSection;
  defaultOpen?: boolean;
  onCellClick: (dealerKey: string, quarter: Quarter, machine: MachineKey) => void;
}

export default function SellerBlock({ seller, section, defaultOpen = false, onCellClick }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const dealerCount = section.dealers.filter((d) => !d.unassigned).length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white text-left transition-colors hover:bg-slate-50",
          !open && "border-b-0",
        )}
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
          <div>
            <h2 className="text-base font-bold text-slate-900">{seller.display_name}</h2>
            <p className="text-[11px] text-slate-500">
              {seller.initials} · {seller.country} · {dealerCount} forhandler{dealerCount === 1 ? "" : "e"}
            </p>
          </div>
        </div>
      </button>
      {open && <BudgetMatrix dealers={section.dealers} cells={section.cells} onCellClick={onCellClick} />}
    </section>
  );
}
