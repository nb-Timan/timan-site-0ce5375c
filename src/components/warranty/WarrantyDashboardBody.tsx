/**
 * Warranty Dashboard body — rebuilt to match the approved analytics mockup.
 *
 * Layout:
 *   Row 1: 5 KPI cards (Total / This month / Top machine / Active dealers / Match status)
 *   Row 2: Latest registrations (≈70%) + Top dealers with progress bars (≈30%)
 *   Row 3: Registrations over time (line chart, last 6 months)
 *
 * Dashboard-only redesign. SharePoint sync, RLS, navigation, registration
 * logic, and permissions are untouched.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import LastChangedLine from "@/components/portal/LastChangedLine";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Factory,
  PlusCircle,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  dealerOverview,
  mostUsedMachineType,
  thisMonthCount,
  totalCount,
} from "@/lib/warranty-store";
import {
  useWarrantyRegistrationsDb,
  type DbWarrantyRegistration,
} from "@/lib/warrantyRegistrationsService";
import { formatDate } from "@/lib/format-date";

export type WarrantyScope = "admin" | "dealer";

interface Props {
  scope: WarrantyScope;
  dealerName?: string;
}

export function WarrantyDashboardIntro({
  scope,
  showCreate = false,
}: {
  scope: WarrantyScope;
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
        <LastChangedLine moduleKey="warranty" className="mt-2" />
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

function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

function lastMonthCount(records: DbWarrantyRegistration[]): number {
  const now = new Date();
  const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ym = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  return records.filter((r) => (r.submittedAt || "").slice(0, 7) === ym).length;
}

function monthlySeries(records: DbWarrantyRegistration[], months = 6) {
  const now = new Date();
  const buckets: { key: string; label: string; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("da-DK", { month: "short" });
    buckets.push({ key, label: label.replace(".", ""), count: 0 });
  }
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const r of records) {
    const k = (r.submittedAt || r.createdAt || "").slice(0, 7);
    const i = idx.get(k);
    if (i !== undefined) buckets[i].count++;
  }
  return buckets;
}

export function WarrantyDashboardBody({ scope, dealerName }: Props) {
  const { records: all } = useWarrantyRegistrationsDb();
  const [chartRange, setChartRange] = useState<6 | 12>(6);

  const records = useMemo(() => {
    if (scope === "admin") return all;
    if (!dealerName) return [];
    const needle = dealerName.toLowerCase();
    return all.filter((r) => r.dealerName.toLowerCase() === needle);
  }, [all, scope, dealerName]);

  const stats = useMemo(() => {
    const total = totalCount(records);
    const month = thisMonthCount(records);
    const prevMonth = lastMonthCount(records);
    const top = mostUsedMachineType(records);
    const dealers = dealerOverview(records);
    const matched = records.filter((r) => r.dealerMatchStatus === "matched").length;
    const unmatched = records.filter((r) => r.dealerMatchStatus === "unmatched").length;
    const review = records.filter((r) => r.dealerMatchStatus === "needs_review").length;
    return {
      total,
      month,
      prevMonth,
      top,
      dealers,
      topDealers: dealers.slice(0, 8),
      latest: records.slice(0, 12),
      matched,
      unmatched,
      review,
      series: monthlySeries(records, chartRange),
    };
  }, [records, chartRange]);

  const monthDelta = stats.prevMonth
    ? Math.round(((stats.month - stats.prevMonth) / stats.prevMonth) * 100)
    : null;
  const topDealerMax = stats.topDealers[0]?.count ?? 0;
  const allLink = "/portal/service/warranty/registrations";

  return (
    <div className="space-y-6">
      {/* Row 1 — KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Total registreringer"
          value={stats.total}
          sub="Alle registreringer"
          icon={ClipboardList}
          accent="text-indigo-600"
          accentBg="bg-indigo-50"
        />
        <Kpi
          label="Denne måned"
          value={stats.month}
          sub={
            monthDelta === null
              ? "Registreringer"
              : `${monthDelta >= 0 ? "+" : ""}${monthDelta}% vs. sidste måned`
          }
          icon={TrendingUp}
          accent="text-emerald-600"
          accentBg="bg-emerald-50"
        />
        <Kpi
          label="Mest brugte maskine"
          value={stats.top.type}
          sub={
            stats.total
              ? `${pct(stats.top.count, stats.total)} af alle registreringer`
              : "—"
          }
          icon={Factory}
          accent="text-amber-600"
          accentBg="bg-amber-50"
          valueClass="text-2xl"
        />
        {scope === "admin" ? (
          <Kpi
            label="Aktive forhandlere"
            value={stats.dealers.length}
            sub="Med registreringer"
            icon={Users}
            accent="text-sky-600"
            accentBg="bg-sky-50"
          />
        ) : (
          <Kpi
            label="Seneste levering"
            value={formatDate(stats.latest[0]?.deliveryDate) || "—"}
            sub="Sidste registrering"
            icon={CalendarRange}
            accent="text-sky-600"
            accentBg="bg-sky-50"
            valueClass="text-2xl"
          />
        )}
        <MatchStatusKpi
          matched={stats.matched}
          unmatched={stats.unmatched}
          review={stats.review}
        />
      </div>

      {/* Row 2 — Latest + Top dealers */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-10">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-black">Seneste registreringer</h2>
            <Link
              to={allLink}
              className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-700"
            >
              Se alle registreringer <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {stats.latest.length === 0 ? (
            <EmptyState text="Der er endnu ingen garantiregistreringer." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-xs font-black uppercase tracking-widest text-slate-500">
                    <th className="px-6 py-3">Certifikat</th>
                    <th className="px-3 py-3">Kunde / Maskine</th>
                    <th className="px-3 py-3">Forhandler</th>
                    <th className="px-3 py-3">Registreret</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.latest.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-6 py-3 align-top">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-black tracking-widest text-slate-600">
                          {r.certificateNumber}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-bold text-slate-900">{r.customer || "—"}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {r.machineType}{r.machineSerial ? ` • ${r.machineSerial}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium text-slate-700">{r.dealerName}</div>
                        {r.dealerAccountNumber && (
                          <div className="mt-0.5 text-xs text-slate-500">
                            #{r.dealerAccountNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-600">
                        {formatDate(r.submittedAt)}
                      </td>
                      <td className="px-6 py-3 align-top">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                          Aktiv
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm xl:col-span-3">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h2 className="text-lg font-black">Top forhandlere</h2>
            <Link
              to={allLink}
              className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-700"
            >
              Se alle <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {stats.topDealers.length === 0 ? (
            <EmptyState text="Ingen forhandleraktivitet endnu." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.topDealers.map((d, i) => {
                const w = topDealerMax > 0 ? Math.max(6, Math.round((d.count / topDealerMax) * 100)) : 0;
                return (
                  <li key={d.dealer} className="px-6 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-600">
                          {i + 1}
                        </span>
                        <span className="truncate font-bold text-slate-700">{d.dealer}</span>
                      </div>
                      <span className="shrink-0 text-xs font-black text-slate-900">{d.count}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${w}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Row 3 — Trend chart */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-black">Registreringer over tid</h2>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
            {([6, 12] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setChartRange(n)}
                className={`rounded-md px-3 py-1 ${
                  chartRange === n ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                Sidste {n} mdr.
              </button>
            ))}
          </div>
        </div>
        <div className="px-4 py-4">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="label" stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} width={32} />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ fontWeight: 700 }}
                  formatter={(v: number) => [v, "Registreringer"]}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  strokeWidth={2.5}
                  dot={{ r: 3, stroke: "#6366f1", fill: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
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
  accentBg,
  valueClass,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  accent: string;
  accentBg: string;
  valueClass?: string;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
          {label}
        </p>
        <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${accentBg}`}>
          <Icon className={`h-4 w-4 ${accent}`} />
        </span>
      </div>
      <p className={`mt-3 truncate font-black text-slate-950 ${valueClass ?? "text-3xl"}`}>
        {value}
      </p>
      {sub && <p className="mt-auto pt-2 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function MatchStatusKpi({
  matched,
  unmatched,
  review,
}: {
  matched: number;
  unmatched: number;
  review: number;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
          Match status
        </p>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
          <ShieldCheck className="h-4 w-4 text-violet-600" />
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-slate-600">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Matched
          </span>
          <span className="font-black text-slate-900">{matched}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-slate-600">Unmatched</span>
          <span className="font-black text-rose-600">{unmatched}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="text-slate-600">Afventer</span>
          <span className="font-black text-amber-600">{review}</span>
        </li>
      </ul>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-6 py-10 text-center text-sm text-slate-500">{text}</div>;
}
