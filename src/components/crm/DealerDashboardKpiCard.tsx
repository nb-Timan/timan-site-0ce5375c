import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone?: "emerald" | "blue" | "amber";
  valueStyle?: "numeric" | "text";
};

const tones = {
  emerald: "border-emerald-100 bg-emerald-50/40 text-emerald-700",
  blue: "border-blue-100 bg-blue-50/40 text-blue-700",
  amber: "border-amber-100 bg-amber-50/50 text-amber-700",
};

export function DealerDashboardKpiCard({ icon: Icon, label, value, note, tone = "emerald", valueStyle = "numeric" }: Props) {
  return (
    <section data-testid="dealer-dashboard-kpi" className="grid h-full min-h-[176px] min-w-0 grid-rows-[54px_minmax(48px,1fr)_auto] gap-2 rounded-lg border bg-white p-4 shadow-sm">
      <div data-testid="dealer-dashboard-kpi-header" className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)] items-center gap-2.5">
        <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-md ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="min-w-0 text-[13px] font-semibold leading-[18px] tracking-normal text-slate-600 [overflow-wrap:anywhere]">{label}</h3>
      </div>
      <div data-testid="dealer-dashboard-kpi-value" className={`min-w-0 font-bold tracking-normal text-slate-950 [overflow-wrap:anywhere] ${valueStyle === "text" ? "text-lg leading-6" : "text-2xl leading-7 tabular-nums"}`}>{value}</div>
      <p className="min-w-0 text-xs leading-4 tracking-normal text-slate-500 [overflow-wrap:anywhere]">{note}</p>
    </section>
  );
}
