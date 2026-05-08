import MachineCell from "./MachineCell";
import { DASHBOARD_MACHINES, type CellAgg, type MachineKey, type Quarter } from "./useBudgetDashboardData";

interface Props {
  quarter: Quarter;
  cells: Record<MachineKey, CellAgg>;
  onCellClick: (machine: MachineKey) => void;
}

const QUARTER_LABEL: Record<Quarter, string> = {
  1: "1. kvartal",
  2: "2. kvartal",
  3: "3. kvartal",
  4: "4. kvartal",
};

export default function QuarterRow({ quarter, cells, onCellClick }: Props) {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur px-3 py-1.5 mb-2 rounded-md border border-slate-200">
        <span className="text-xs font-semibold text-slate-700">{QUARTER_LABEL[quarter]}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {DASHBOARD_MACHINES.map((m) => (
          <MachineCell key={m} cell={cells[m]} machineLabel={m} onClick={() => onCellClick(m)} />
        ))}
      </div>
    </div>
  );
}
