import QuarterRow from "./QuarterRow";
import type { CellAgg, MachineKey, Quarter, SellerDisplay } from "./useBudgetDashboardData";

interface Props {
  seller: SellerDisplay;
  data: Record<Quarter, Record<MachineKey, CellAgg>>;
  onCellClick: (quarter: Quarter, machine: MachineKey) => void;
}

export default function SellerBlock({ seller, data, onCellClick }: Props) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white rounded-t-xl">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{seller.display_name}</h2>
          <p className="text-xs text-slate-500">{seller.initials} · {seller.country}</p>
        </div>
      </header>
      <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-5">
        {([1, 2, 3, 4] as Quarter[]).map((q) => (
          <QuarterRow
            key={q}
            quarter={q}
            cells={data[q]}
            onCellClick={(m) => onCellClick(q, m)}
          />
        ))}
      </div>
    </section>
  );
}
