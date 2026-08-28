/**
 * Timan Backend -> Portal Analytics
 * Route: /portal/backend/portal-analytics
 *
 * Reads aggregated module usage through get_backend_user_activity_analytics().
 * Raw portal_module_usage rows stay in Supabase.
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock3,
  MonitorUp,
  RefreshCw,
  UserRound,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { formatDateTime } from "@/lib/format-date";
import { isBackendActor } from "@/lib/portalAccess";
import {
  fetchPortalUsageAnalytics,
  type PortalUsageAnalytics,
  type PortalUsageComparisonPeriod,
  type PortalUsageModuleSummary,
} from "@/lib/portalModuleUsageAnalyticsService";

const ALL = "__all__";
const PERIODS = [
  { value: "7", label: "7 dage" },
  { value: "30", label: "30 dage" },
  { value: "90", label: "90 dage" },
  { value: "365", label: "12 mdr." },
];

const MODULE_COLORS = ["#047857", "#2563eb", "#7c3aed", "#f59e0b", "#e11d48", "#0891b2", "#65a30d"];

function formatSeconds(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds || 0));
  if (total < 60) return total ? `${total} sek.` : "0 min.";
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} t ${rest} min.` : `${hours} t`;
}

function formatModuleKey(key: string | null | undefined): string {
  if (!key) return "Ingen modul";
  const labels: Record<string, string> = {
    backend_portal_analytics: "Backend: Portal Analytics",
    backend_users: "Backend: Brugere",
    backend_roles: "Backend: Roller",
    backend_module_access: "Backend: Moduladgang",
    backend_audit_log: "Backend: Audit log",
    crm_dashboard: "CRM Dashboard",
    crm_leads: "Leads",
    crm_demo_leads: "Demo-leads",
    crm_quotes: "Tilbud",
    crm_orders: "Ordrer",
    crm_activities: "Aktiviteter",
    crm_calendar: "Kalender",
    crm_budget: "Budget",
    crm_budget_dashboard: "Budget Dashboard",
    crm_dealers: "Mine forhandlere",
    marketing: "Marketing",
    marketing_news: "Marketing: Nyheder",
    marketing_site_features: "Marketing: Nye features",
    dealer_data: "Forhandlerdata",
    configurator: "Konfigurator",
    partner_map: "Partnerkort",
    messe: "Messe",
    messe_partner_map: "Messe: Partnerkort",
    service: "Teknik & Service",
    service_tsb: "TSB",
  };
  if (labels[key]) return labels[key];
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function displayUserName(user: { display_name?: string | null; email?: string | null }): string {
  return (user.display_name?.trim() || user.email || "Ukendt bruger").trim();
}

function comparisonLabel(period: PortalUsageComparisonPeriod | undefined): string {
  if (!period) return "Ingen data";
  const current = period.current_visits || 0;
  const previous = period.previous_visits || 0;
  if (previous === 0) return current > 0 ? `${current} vs. 0 · Ny aktivitet` : "0 vs. 0";
  const pct = Math.round(((current - previous) / previous) * 100);
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</CardTitle>
        <Icon className="h-4 w-4 text-emerald-600" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-slate-950">{value}</div>
        {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return <div className="flex h-full items-center justify-center text-sm text-slate-400">Ingen data endnu.</div>;
}

function ModuleBars({ rows, valueKey = "visit_count" }: { rows: PortalUsageModuleSummary[]; valueKey?: "visit_count" | "active_seconds" }) {
  const data = rows.slice(0, 8).map((row) => ({
    name: formatModuleKey(row.module_key),
    value: row[valueKey] || 0,
  }));
  if (!data.some((row) => row.value > 0)) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 18 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={54} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} />
        <Tooltip formatter={(value: number) => valueKey === "active_seconds" ? formatSeconds(value) : value} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, index) => <Cell key={index} fill={MODULE_COLORS[index % MODULE_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ActiveDaysChart({ rows }: { rows: PortalUsageAnalytics["active_days_over_time"] }) {
  const data = rows.map((row) => ({
    day: new Date(row.day).toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit" }),
    active_users: row.active_users,
    visits: row.visit_count,
  }));
  if (!data.some((row) => row.active_users > 0 || row.visits > 0)) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} minTickGap={24} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} />
        <Tooltip />
        <Line type="monotone" dataKey="active_users" name="Aktive brugere" stroke="#047857" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="visits" name="Besøg" stroke="#2563eb" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function DataTable({ analytics }: { analytics: PortalUsageAnalytics }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Brugere</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2 pr-4">Bruger</th>
              <th className="py-2 pr-4">Rolle</th>
              <th className="py-2 pr-4">Forhandler</th>
              <th className="py-2 pr-4">Seneste login</th>
              <th className="py-2 pr-4">Aktive dage 7/30/90</th>
              <th className="py-2 pr-4">Sessioner</th>
              <th className="py-2 pr-4">Besøg</th>
              <th className="py-2 pr-4">Aktiv tid</th>
              <th className="py-2 pr-4">Mest brugte modul</th>
            </tr>
          </thead>
          <tbody>
            {analytics.users.map((user) => (
              <tr key={`${user.user_id || user.email}`} className="border-b last:border-0">
                <td className="py-3 pr-4">
                  <div className="font-semibold text-slate-950">{displayUserName(user)}</div>
                  <div className="text-xs text-slate-500">{user.email}</div>
                </td>
                <td className="py-3 pr-4 text-slate-700">{user.portal_role || "-"}</td>
                <td className="py-3 pr-4 text-slate-700">{user.dealer_number || "-"}</td>
                <td className="py-3 pr-4 text-slate-700">{user.last_login ? formatDateTime(user.last_login) : "-"}</td>
                <td className="py-3 pr-4 font-medium text-slate-800">
                  {user.active_days_7} / {user.active_days_30} / {user.active_days_90}
                </td>
                <td className="py-3 pr-4 text-slate-700">{user.session_count}</td>
                <td className="py-3 pr-4 text-slate-700">{user.visit_count}</td>
                <td className="py-3 pr-4 text-slate-700">{formatSeconds(user.active_seconds)}</td>
                <td className="py-3 pr-4 text-slate-700">{formatModuleKey(user.top_module)}</td>
              </tr>
            ))}
            {analytics.users.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-400">Ingen brugeraktivitet matcher filtrene.</td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default function BackendPortalAnalyticsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const isBackend = isBackendActor(appUser);

  const [userId, setUserId] = useState(ALL);
  const [role, setRole] = useState(ALL);
  const [dealerNumber, setDealerNumber] = useState(ALL);
  const [moduleKey, setModuleKey] = useState(ALL);
  const [days, setDays] = useState("30");
  const [analytics, setAnalytics] = useState<PortalUsageAnalytics | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isBackend) return;
    let cancelled = false;
    setBusy(true);
    setErr(null);

    fetchPortalUsageAnalytics({
      userId: userId === ALL ? null : userId,
      role: role === ALL ? null : role,
      dealerNumber: dealerNumber === ALL ? null : dealerNumber,
      moduleKey: moduleKey === ALL ? null : moduleKey,
      days: Number(days),
    })
      .then((data) => {
        if (!cancelled) setAnalytics(data);
      })
      .catch((error: any) => {
        if (!cancelled) setErr(error?.message || String(error));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dealerNumber, days, isBackend, moduleKey, refreshKey, role, userId]);

  const selectedUser = useMemo(() => analytics?.users[0] || null, [analytics]);
  const filterOptions = analytics?.filters;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Indlæser...</div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate("/portal", { replace: true });
        }}
      />

      <main className="mx-auto w-full max-w-[1700px] flex-grow px-4 py-8 sm:px-6 lg:px-8 xl:px-12">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50">
              <BarChart3 className="h-6 w-6 text-emerald-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-950">Portal Analytics</h1>
              <p className="text-sm text-slate-600">Brugeraktivitet pr. modul, bygget på server-side summeringer.</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setRefreshKey((key) => key + 1)} disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Genindlæs
          </Button>
        </div>

        <Card className="mb-6 rounded-lg">
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Bruger" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle brugere</SelectItem>
                {(filterOptions?.users || []).map((user) => (
                  <SelectItem key={user.user_id || user.email} value={user.user_id || user.email}>
                    {displayUserName(user)} · {user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Rolle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle roller</SelectItem>
                {(filterOptions?.roles || []).map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dealerNumber} onValueChange={setDealerNumber}>
              <SelectTrigger><SelectValue placeholder="Forhandler" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle forhandlere</SelectItem>
                {(filterOptions?.dealer_numbers || []).map((value) => (
                  <SelectItem key={value} value={value}>{value}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={moduleKey} onValueChange={setModuleKey}>
              <SelectTrigger><SelectValue placeholder="Modul" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Alle moduler</SelectItem>
                {(filterOptions?.modules || []).map((value) => (
                  <SelectItem key={value} value={value}>{formatModuleKey(value)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={days} onValueChange={setDays}>
              <SelectTrigger><SelectValue placeholder="Periode" /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((period) => (
                  <SelectItem key={period.value} value={period.value}>{period.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {err && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Fejl: {err}
          </div>
        )}

        {busy || !analytics ? (
          <div className="rounded-lg border bg-white p-8 text-center text-sm text-slate-500">Henter brugeraktivitet...</div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard icon={Users} label="Aktive brugere" value={analytics.totals.user_count} sub={`Periode: ${analytics.period.days} dage`} />
              <KpiCard icon={MonitorUp} label="Sessioner" value={analytics.totals.session_count} sub={`${analytics.totals.visit_count} modulbesøg`} />
              <KpiCard icon={Clock3} label="Samlet aktiv tid" value={formatSeconds(analytics.totals.active_seconds)} sub={`Senest: ${analytics.totals.last_active_at ? formatDateTime(analytics.totals.last_active_at) : "-"}`} />
              <KpiCard icon={CalendarDays} label="Aktive dage 7/30/90" value={`${analytics.totals.active_days_7}/${analytics.totals.active_days_30}/${analytics.totals.active_days_90}`} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <KpiCard icon={Activity} label="Denne uge vs. sidste uge" value={comparisonLabel(analytics.comparisons.week)} sub={`${analytics.comparisons.week.current_visits} vs. ${analytics.comparisons.week.previous_visits} besøg`} />
              <KpiCard icon={Activity} label="Denne måned vs. sidste måned" value={comparisonLabel(analytics.comparisons.month)} sub={`${analytics.comparisons.month.current_visits} vs. ${analytics.comparisons.month.previous_visits} besøg`} />
              <KpiCard icon={Activity} label="Samme periode sidste år" value={comparisonLabel(analytics.comparisons.same_period_last_year)} sub={`${analytics.comparisons.same_period_last_year.current_visits} vs. ${analytics.comparisons.same_period_last_year.previous_visits} besøg`} />
            </div>

            {selectedUser && userId !== ALL && (
              <Card className="rounded-lg border-emerald-100 bg-emerald-50/40">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <UserRound className="h-4 w-4 text-emerald-700" />
                    Valgt bruger
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm md:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase text-slate-500">Navn</div>
                    <div className="font-semibold text-slate-950">{displayUserName(selectedUser)}</div>
                    <div className="text-xs text-slate-500">{selectedUser.email}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-500">Seneste login</div>
                    <div className="font-semibold text-slate-950">{selectedUser.last_login ? formatDateTime(selectedUser.last_login) : "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-500">Sessioner / aktiv tid</div>
                    <div className="font-semibold text-slate-950">{selectedUser.session_count} · {formatSeconds(selectedUser.active_seconds)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-slate-500">Mest brugte modul</div>
                    <div className="font-semibold text-slate-950">{formatModuleKey(selectedUser.top_module)}</div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="rounded-lg">
                <CardHeader><CardTitle className="text-base">Modulbrug denne uge</CardTitle></CardHeader>
                <CardContent className="h-[280px]"><ModuleBars rows={analytics.module_usage_this_week} /></CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader><CardTitle className="text-base">Modulbrug sidste 30 dage</CardTitle></CardHeader>
                <CardContent className="h-[280px]"><ModuleBars rows={analytics.module_usage_last_30_days} /></CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader><CardTitle className="text-base">Aktive dage over tid</CardTitle></CardHeader>
                <CardContent className="h-[280px]"><ActiveDaysChart rows={analytics.active_days_over_time} /></CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader><CardTitle className="text-base">Aktiv tid pr. modul</CardTitle></CardHeader>
                <CardContent className="h-[280px]"><ModuleBars rows={analytics.modules} valueKey="active_seconds" /></CardContent>
              </Card>
            </div>

            <Card className="rounded-lg">
              <CardHeader><CardTitle className="text-base">Moduler</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Modul</th>
                      <th className="py-2 pr-4">Brugere</th>
                      <th className="py-2 pr-4">Sessioner</th>
                      <th className="py-2 pr-4">Besøg</th>
                      <th className="py-2 pr-4">Aktiv tid</th>
                      <th className="py-2 pr-4">Senest aktiv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.modules.map((module) => (
                      <tr key={module.module_key} className="border-b last:border-0">
                        <td className="py-3 pr-4 font-semibold text-slate-950">{formatModuleKey(module.module_key)}</td>
                        <td className="py-3 pr-4 text-slate-700">{module.user_count || 0}</td>
                        <td className="py-3 pr-4 text-slate-700">{module.session_count || 0}</td>
                        <td className="py-3 pr-4 text-slate-700">{module.visit_count}</td>
                        <td className="py-3 pr-4 text-slate-700">{formatSeconds(module.active_seconds)}</td>
                        <td className="py-3 pr-4 text-slate-700">{module.last_active_at ? formatDateTime(module.last_active_at) : "-"}</td>
                      </tr>
                    ))}
                    {analytics.modules.length === 0 && (
                      <tr><td colSpan={6} className="py-10 text-center text-slate-400">Ingen modulbrug endnu.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <DataTable analytics={analytics} />
          </div>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
