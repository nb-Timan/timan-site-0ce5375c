/**
 * Shared dashboard body for the Warranty Registration module.
 * Migrated 1:1 from the old Timan TSB Hub.
 * Used by both the Timan Admin scope (/portal/service/warranty) and the
 * Dealer scope (same route, different role). Records are filtered by
 * `dealerName` for the dealer scope.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarRange,
  ClipboardList,
  Factory,
  PlusCircle,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  dealerOverview,
  mostUsedMachineType,
  thisMonthCount,
  totalCount,
  yearlyOverview,
} from "@/lib/warranty-store";
import { useWarrantyRegistrationsDb } from "@/lib/warrantyRegistrationsService";
import { formatDate } from "@/lib/format-date";

export type WarrantyScope = "admin" | "dealer";

interface Props {
  scope: WarrantyScope;
  /** When scope === "dealer", limit records to this dealer name. */
  dealerName?: string;
}

export function WarrantyDashboardIntro({
  scope,
  showCreate = false,
}: {
  scope: WarrantyScope;
  /** Show the "Ny registrering" CTA (dealer scope only, not in read-only). */
  showCreate?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {scope === "admin"
            ? "Overblik over garantiregistreringer og forhandleraktivitet."
            : "Overblik over dine garantiregistreringer."}
        </p>
      </div>
      {scope === "dealer" && showCreate && (
        <Link
          to="/portal/service/warranty/new"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
        >
          <PlusCircle className="h-4 w-4" /> Ny registrering
        </Link>
      )}
    </div>
  );
}

export function WarrantyDashboardBody({ scope, dealerName }: Props) {
  const { records: all } = useWarrantyRegistrationsDb();

  const records = useMemo(() => {
    if (scope === "admin") return all;
    if (!dealerName) return [];
    const needle = dealerName.toLowerCase();
    return all.filter((r) => r.dealerName.toLowerCase() === needle);
  }, [all, scope, dealerName]);

  const stats = useMemo(() => {
    return {
      total: totalCount(records),
      thisMonth: thisMonthCount(records),
      topMachine: mostUsedMachineType(records),
      latest: records.slice(0, 5),
      dealers: dealerOverview(records).slice(0, 8),
      yearly: yearlyOverview(records),
    };
  }, [records]);

  const allLink = "/portal/service/warranty/registrations";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={scope === "admin" ? "Total registreringer" : "Mine registreringer"}
          value={stats.total}
          icon={ClipboardList}
          accent="text-indigo-600"
        />
        <Kpi
          label="Denne måned"
          value={stats.thisMonth}
          icon={TrendingUp}
          accent="text-emerald-600"
        />
        <Kpi
          label="Mest brugte maskine"
          value={stats.topMachine.type}
          sub={`${stats.topMachine.count} registreringer`}
          icon={Factory}
          accent="text-amber-600"
        />
        {scope === "admin" ? (
          <Kpi
            label="Aktive forhandlere"
            value={stats.dealers.length}
            icon={Factory}
            accent="text-sky-600"
          />
        ) : (
          <Kpi
            label="Seneste levering"
            value={formatDate(stats.latest[0]?.deliveryDate)}
            icon={Factory}
            accent="text-sky-600"
          />
        )}
      </div>

      {scope === "dealer" && <YearlyOverviewCard data={stats.yearly} />}

      <div
        className={`grid grid-cols-1 gap-6 ${
          scope === "admin" ? "xl:grid-cols-3" : ""
        }`}
      >
        <div
          className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${
            scope === "admin" ? "xl:col-span-2" : ""
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-black">Seneste registreringer</h2>
            <Link
              to={allLink}
              className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-700"
            >
              Se alle <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {stats.latest.length === 0 ? (
            <EmptyState text="Der er endnu ingen garantiregistreringer." />
          ) : (
            <div className="divide-y divide-slate-100">
              {stats.latest.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-6 py-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-black tracking-widest text-slate-500">
                        {r.certificateNumber}
                      </span>
                      <span className="truncate font-bold">{r.customer}</span>
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-500">
                      {r.machineType} • {r.machineSerial}
                      {scope === "admin" ? ` • ${r.dealerName}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-500">
                    <div>{formatDate(r.deliveryDate)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {scope === "admin" && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-lg font-black">Forhandlere</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Top forhandlere efter antal registreringer
              </p>
            </div>
            {stats.dealers.length === 0 ? (
              <EmptyState text="Ingen forhandleraktivitet endnu." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {stats.dealers.map((d) => (
                  <li
                    key={d.dealer}
                    className="flex items-center justify-between px-6 py-3 text-sm"
                  >
                    <span className="truncate font-bold text-slate-700">
                      {d.dealer}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-700">
                      {d.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          {label}
        </p>
        <Icon className={`h-5 w-5 ${accent}`} />
      </div>
      <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-6 py-10 text-center text-sm text-slate-500">{text}</div>;
}

function YearlyOverviewCard({
  data,
}: {
  data?: { year: number; count: number }[];
}) {
  const rows = data ?? [];
  const max = rows.reduce((m, d) => Math.max(m, d.count), 0);
  const total = rows.reduce((s, d) => s + d.count, 0);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-black">Registreringer pr. år</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-black text-slate-700">
          {total} i alt
        </span>
      </div>
        {rows.length === 0 ? (
          <EmptyState text="Du har endnu ingen registreringer." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((d) => {
            const pct = max > 0 ? Math.round((d.count / max) * 100) : 0;
            return (
              <li key={d.year} className="px-6 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-black text-slate-700">{d.year}</span>
                  <span className="text-slate-600">
                    <span className="font-black text-slate-900">{d.count}</span>{" "}
                    registreringer
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-violet-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
