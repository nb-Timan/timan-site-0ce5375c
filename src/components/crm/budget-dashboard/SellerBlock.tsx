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
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);
  const dealerCount = section.dealers.filter((d) => !d.unassigned).length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-start justify-between gap-4 px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white text-left transition-colors hover:bg-slate-50",
          !open && "border-b-0",
        )}
        aria-expanded={open}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-500 mt-1 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500 mt-1 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-slate-900">{seller.display_name}</h2>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500 mt-0.5">
              <span className="font-medium text-slate-600">{seller.initials}</span>
              <span>·</span>
              {section.countryIsos.length === 0 ? (
                <span>Land ukendt</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {section.countryIsos.map((iso) => (
                    <span
                      key={iso}
                      onMouseEnter={(e) => { e.stopPropagation(); setHoveredIso(iso); }}
                      onMouseLeave={() => setHoveredIso(null)}
                      className={cn(
                        "inline-flex items-center justify-center px-1.5 py-0.5 rounded border text-[10px] font-semibold tabular-nums tracking-wide transition-colors cursor-default",
                        hoveredIso === iso
                          ? "bg-slate-200 border-slate-300 text-slate-800"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
                      )}
                    >
                      {iso}
                    </span>
                  ))}
                </span>
              )}
              <span>·</span>
              <span>{dealerCount} forhandler{dealerCount === 1 ? "" : "e"}</span>
            </div>
          </div>
        </div>
      </button>
      {open && (
        <BudgetMatrix
          dealers={section.dealers}
          cells={section.cells}
          onCellClick={onCellClick}
          hoveredCountryIso={hoveredIso}
        />
      )}
    </section>
  );
}
