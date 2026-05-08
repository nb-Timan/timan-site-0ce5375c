import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CellAgg } from "./useBudgetDashboardData";

interface Props {
  cell: CellAgg;
  machineLabel: string;
  onClick: () => void;
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export default function MachineCell({ cell, machineLabel, onClick }: Props) {
  const empty = cell.budgetQty === 0 && cell.orderQty === 0 && cell.workingQty === 0 && cell.items.length === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border bg-white p-3 transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/40",
        empty ? "border-red-300 bg-red-50/40" : "border-slate-200",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-700 truncate">{machineLabel}</span>
        {empty && <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-hidden />}
      </div>
      {empty ? (
        <div className="text-[11px] font-medium text-red-600">Ingen aktivitet</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Budget" value={fmt(cell.budgetQty)} color="text-slate-700" />
          <Stat label="Ordre" value={fmt(cell.orderQty)} color="text-emerald-700" />
          <Stat label="Arbejdsbudget" value={fmt(cell.workingQty)} color="text-sky-700" />
        </div>
      )}
    </button>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      <span className={cn("text-base font-semibold leading-tight", color)}>{value}</span>
    </div>
  );
}
