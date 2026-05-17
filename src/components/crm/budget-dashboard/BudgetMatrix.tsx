import { cn } from "@/lib/utils";
import { useLanguage } from "@/context/LanguageContext";
import type { Language } from "@/types/configurator";
import {
  DASHBOARD_MACHINES,
  MACHINE_SHORT_LABEL,
  type CellAgg,
  type DealerRow,
  type MachineKey,
  type Quarter,
} from "./useBudgetDashboardData";

const LT: Record<string, Record<Language, string>> = {
  dealer:       { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
  quarter:      { da: 'kvartal',    en: 'quarter', de: 'Quartal', it: 'trimestre',  hu: 'negyedév' },
  no_dealers:   { da: 'Ingen forhandlere tilknyttet denne sælger.', en: 'No dealers assigned to this seller.', de: 'Keine Händler zugewiesen.', it: 'Nessun rivenditore.', hu: 'Nincs hozzárendelt kereskedő.' },
  no_activity:  { da: 'Ingen aktivitet', en: 'No activity', de: 'Keine Aktivität', it: 'Nessuna attività', hu: 'Nincs tevékenység' },
  cell_format:  { da: 'Format pr. celle:', en: 'Cell format:', de: 'Zellenformat:', it: 'Formato cella:', hu: 'Cellaformátum:' },
  budget_order: { da: 'Budget / Ordre', en: 'Budget / Order', de: 'Budget / Auftrag', it: 'Budget / Ordine', hu: 'Terv / Rendelés' },
  bottom_label: { da: 'nederste tal =', en: 'bottom number =', de: 'unten =', it: 'numero in basso =', hu: 'alsó szám =' },
  working:      { da: 'Arbejdsbudget', en: 'Working forecast', de: 'Arbeitsprognose', it: 'Previsione lavoro', hu: 'Munka-előrejelzés' },
};


interface Props {
  dealers: DealerRow[];
  cells: Record<string, Record<Quarter, Record<MachineKey, CellAgg>>>;
  onCellClick: (dealerKey: string, quarter: Quarter, machine: MachineKey) => void;
  /** When set, dealer rows whose countryIso matches get a subtle highlight. */
  hoveredCountryIso?: string | null;
}

const QUARTERS: Quarter[] = [1, 2, 3, 4];

function fmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export default function BudgetMatrix({ dealers, cells, onCellClick, hoveredCountryIso }: Props) {
  const { language: lang } = useLanguage();
  if (dealers.length === 0) {
    return (
      <div className="px-5 py-6 text-sm text-slate-500">
        {LT.no_dealers[lang]}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 z-20 bg-slate-100 text-left px-3 py-2 font-semibold text-slate-700 border-b border-r border-slate-200 min-w-[220px]"
            >
              {LT.dealer[lang]}
            </th>
            {QUARTERS.map((q, i) => (
              <th
                key={q}
                colSpan={DASHBOARD_MACHINES.length}
                className={cn(
                  "bg-slate-100 text-center px-2 py-1.5 font-semibold text-slate-700 border-b border-slate-200",
                  i < QUARTERS.length - 1 && "border-r-2 border-r-slate-300",
                )}
              >
                {q}. {LT.quarter[lang]}
              <th
                key={q}
                colSpan={DASHBOARD_MACHINES.length}
                className={cn(
                  "bg-slate-100 text-center px-2 py-1.5 font-semibold text-slate-700 border-b border-slate-200",
                  i < QUARTERS.length - 1 && "border-r-2 border-r-slate-300",
                )}
              >
                {q}. kvartal
              </th>
            ))}
          </tr>
          <tr>
            {QUARTERS.map((q) =>
              DASHBOARD_MACHINES.map((m, j) => (
                <th
                  key={`${q}-${m}`}
                  className={cn(
                    "bg-slate-50 text-center px-2 py-1.5 font-medium text-[11px] text-slate-600 border-b border-slate-200 min-w-[88px]",
                    j === DASHBOARD_MACHINES.length - 1 && "border-r-2 border-r-slate-300",
                  )}
                >
                  {MACHINE_SHORT_LABEL[m]}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {dealers.map((d, idx) => {
            const row = cells[d.key];
            const highlighted = !!hoveredCountryIso && d.countryIso === hoveredCountryIso;
            const baseBg = idx % 2 ? "bg-slate-50/40" : "bg-white";
            const stickyBg = idx % 2 ? "bg-slate-50/95" : "bg-white";
            return (
              <tr
                key={d.key}
                className={cn(baseBg, highlighted && "bg-slate-200/60")}
              >
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 text-left px-3 py-2 font-medium text-slate-800 border-b border-r border-slate-200 align-top",
                    stickyBg,
                    highlighted && "bg-slate-200/80",
                    d.unassigned && "italic text-slate-500",
                  )}
                >
                  <div className="truncate max-w-[260px]" title={d.name}>{d.name}</div>
                  {d.account_number && (
                    <div className="text-[10px] text-slate-400 mt-0.5">{d.account_number}</div>
                  )}
                </th>
                {QUARTERS.map((q) =>
                  DASHBOARD_MACHINES.map((m, j) => {
                    const cell = row?.[q]?.[m] ?? { budgetQty: 0, orderQty: 0, workingQty: 0, items: [] };
                    const empty =
                      cell.budgetQty === 0 &&
                      cell.orderQty === 0 &&
                      cell.workingQty === 0 &&
                      cell.items.length === 0;
                    return (
                      <td
                        key={`${d.key}-${q}-${m}`}
                        className={cn(
                          "border-b border-slate-200 p-0",
                          j === DASHBOARD_MACHINES.length - 1 && "border-r-2 border-r-slate-300",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onCellClick(d.key, q, m)}
                          title={empty ? "Ingen aktivitet" : undefined}
                          className={cn(
                            "w-full h-full text-center px-2 py-1.5 leading-tight transition-colors hover:bg-[#2d5a27]/10 focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/40",
                            empty && "ring-1 ring-inset ring-red-200/70",
                          )}
                        >
                          <div className="flex items-center justify-center gap-1 text-[11px] text-slate-700">
                            {empty && (
                              <span
                                aria-hidden
                                className="inline-block h-1.5 w-1.5 rounded-full bg-red-400"
                              />
                            )}
                            <span className="font-semibold tabular-nums">
                              {fmt(cell.budgetQty)}
                              <span className="text-slate-400"> / </span>
                              <span className="text-emerald-700">{fmt(cell.orderQty)}</span>
                            </span>
                          </div>
                          <div className="text-[10px] tabular-nums text-sky-700 mt-0.5">
                            {fmt(cell.workingQty)}
                          </div>
                        </button>
                      </td>
                    );
                  }),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-200 bg-slate-50">
        Format pr. celle: <span className="font-medium text-slate-700">Budget / Ordre</span>
        <span className="mx-2">·</span>
        nederste tal = <span className="font-medium text-sky-700">Arbejdsbudget</span>
      </div>
    </div>
  );
}
