/**
 * Timan Backend → Portal Analytics
 * Route: /portal/backend/portal-analytics
 * Access: portal_role === 'timan_backend' only.
 *
 * Reads from guest_visitors, guest_sessions, portal_activity_log, app_users.
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { derivePortalRole } from "@/lib/portalAccess";
import { formatDateTime } from "@/lib/format-date";

interface SessionRow {
  id: string;
  visitor_uid: string;
  user_type: string;
  email: string | null;
  country: string | null;
  postal_code: string | null;
  language: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  last_seen: string | null;
}

interface ActivityRow {
  id: string;
  visitor_uid: string;
  user_type: string;
  email: string | null;
  country: string | null;
  postal_code: string | null;
  language: string | null;
  path: string;
  module: string | null;
  created_at: string;
}

interface VisitorRow {
  visitor_uid: string;
  email: string | null;
  country: string | null;
  postal_code: string | null;
  language: string | null;
  first_visit_at: string;
  last_visit_at: string;
  visit_count: number;
  converted_to_user: boolean;
}

interface AppUserLite {
  email: string;
  display_name: string | null;
  initials: string | null;
  role: string | null;
  portal_role: string | null;
}

function userDisplayName(u: AppUserLite | undefined, fallbackEmail?: string | null): string {
  return (u?.display_name?.trim() || u?.initials?.trim() || fallbackEmail || u?.email || "").trim();
}

function startOfTodayISO() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function daysAgoISO(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString();
}

function effectiveDuration(s: SessionRow): number | null {
  if (s.duration_seconds && s.duration_seconds > 0) return s.duration_seconds;
  const endStr = s.last_seen || s.ended_at;
  if (!endStr) return null;
  const start = new Date(s.started_at).getTime();
  const end = new Date(endStr).getTime();
  if (!isFinite(start) || !isFinite(end) || end <= start) return null;
  return Math.round((end - start) / 1000);
}

function fmtDuration(sec: number | null): string {
  if (sec == null || sec < 60) return "Under 1 min";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} min ${s} sek`;
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function topN<T extends string>(items: (T | null | undefined)[], n = 5): { key: T; count: number }[] {
  const map = new Map<T, number>();
  items.forEach(i => { if (!i) return; map.set(i, (map.get(i) || 0) + 1); });
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

function lc(e: string | null | undefined): string {
  return (e || "").trim().toLowerCase();
}

export default function BackendPortalAnalyticsPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [users, setUsers] = useState<AppUserLite[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all"); // 'all' | 'sellers' | email

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const since = daysAgoISO(30);
        const [v, s, a, u] = await Promise.all([
          supabase.from("guest_visitors").select("*").order("last_visit_at", { ascending: false }).limit(2000),
          supabase.from("guest_sessions").select("*").gte("started_at", since).order("started_at", { ascending: false }).limit(5000),
          supabase.from("portal_activity_log").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
          supabase.from("app_users").select("email,display_name,initials,role,portal_role"),
        ]);
        if (cancelled) return;
        if (v.error) throw v.error;
        if (s.error) throw s.error;
        if (a.error) throw a.error;
        if (u.error) throw u.error;
        setVisitors((v.data || []) as VisitorRow[]);
        setSessions((s.data || []) as SessionRow[]);
        setActivity((a.data || []) as ActivityRow[]);
        setUsers((u.data || []) as AppUserLite[]);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const portalRole = appUser ? derivePortalRole(appUser) : null;

  // Email → user lookup
  const userByEmail = useMemo(() => {
    const m = new Map<string, AppUserLite>();
    users.forEach(u => { if (u.email) m.set(lc(u.email), u); });
    return m;
  }, [users]);

  const sellerEmails = useMemo(
    () => new Set(users.filter(u => u.portal_role === "timan_seller").map(u => lc(u.email))),
    [users]
  );

  // Apply filter
  const fSessions = useMemo(() => {
    if (filter === "all") return sessions;
    if (filter === "sellers") return sessions.filter(s => sellerEmails.has(lc(s.email)));
    return sessions.filter(s => lc(s.email) === filter);
  }, [sessions, filter, sellerEmails]);

  const fActivity = useMemo(() => {
    if (filter === "all") return activity;
    if (filter === "sellers") return activity.filter(a => sellerEmails.has(lc(a.email)));
    return activity.filter(a => lc(a.email) === filter);
  }, [activity, filter, sellerEmails]);

  const fVisitors = useMemo(() => {
    if (filter === "all") return visitors;
    if (filter === "sellers") return visitors.filter(v => sellerEmails.has(lc(v.email)));
    return visitors.filter(v => lc(v.email) === filter);
  }, [visitors, filter, sellerEmails]);

  const metrics = useMemo(() => {
    const today = startOfTodayISO();
    const d7 = daysAgoISO(7);
    const d30 = daysAgoISO(30);

    const sessionsToday = fSessions.filter(s => s.started_at >= today).length;
    const sessions7 = fSessions.filter(s => s.started_at >= d7).length;
    const sessions30 = fSessions.filter(s => s.started_at >= d30).length;

    const firstTime = fVisitors.filter(v => v.visit_count <= 1).length;
    const returning = fVisitors.filter(v => v.visit_count > 1).length;

    const durs = fSessions.map(effectiveDuration).filter((d): d is number => d != null && d > 0);
    const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;

    const guestSessions = fSessions.filter(s => s.user_type === "guest").length;
    const authSessions = fSessions.filter(s => s.user_type === "authenticated").length;

    const topModules = topN(fActivity.map(a => a.module || "?"), 6);
    const topCountries = topN(fVisitors.map(v => v.country || "?"), 8);
    const topPostals = topN(fVisitors.map(v => v.postal_code || "?"), 8);
    const topLangs = topN(fVisitors.map(v => v.language || "?"), 6);

    return { sessionsToday, sessions7, sessions30, firstTime, returning, avgDur, guestSessions, authSessions, topModules, topCountries, topPostals, topLangs };
  }, [fSessions, fVisitors, fActivity]);

  // Per-user aggregation (authenticated only)
  const perUser = useMemo(() => {
    const today = startOfTodayISO();
    const d7 = daysAgoISO(7);
    const map = new Map<string, {
      email: string;
      name: string;
      role: string;
      portalRole: string;
      visitsToday: number;
      visits7: number;
      visits30: number;
      visits: number;
      lastVisit: string | null;
      durations: number[];
      modules: Map<string, number>;
    }>();
    const ensure = (email: string) => {
      const key = lc(email);
      if (!map.has(key)) {
        const u = userByEmail.get(key);
        map.set(key, {
          email,
          name: userDisplayName(u, email),
          role: u?.role || "—",
          portalRole: u?.portal_role || "—",
          visitsToday: 0, visits7: 0, visits30: 0, visits: 0,
          lastVisit: null, durations: [], modules: new Map(),
        });
      }
      return map.get(key)!;
    };

    sessions.filter(s => s.user_type === "authenticated" && s.email).forEach(s => {
      const e = ensure(s.email!);
      e.visits += 1;
      if (s.started_at >= today) e.visitsToday += 1;
      if (s.started_at >= d7) e.visits7 += 1;
      e.visits30 += 1; // already filtered to last 30d
      if (!e.lastVisit || s.started_at > e.lastVisit) e.lastVisit = s.started_at;
      const d = effectiveDuration(s);
      if (d != null && d > 0) e.durations.push(d);
    });
    activity.filter(a => a.user_type === "authenticated" && a.email).forEach(a => {
      const e = ensure(a.email!);
      const m = a.module || "?";
      e.modules.set(m, (e.modules.get(m) || 0) + 1);
    });

    return Array.from(map.values()).map(u => {
      const avg = u.durations.length ? Math.round(u.durations.reduce((a, b) => a + b, 0) / u.durations.length) : null;
      const total = u.durations.reduce((a, b) => a + b, 0);
      let topMod: string = "—"; let topCount = 0;
      u.modules.forEach((c, m) => { if (c > topCount) { topCount = c; topMod = m; } });
      return { ...u, avg, total, topMod };
    }).sort((a, b) => (b.lastVisit || "").localeCompare(a.lastVisit || ""));
  }, [sessions, activity, userByEmail]);

  const perUserFiltered = useMemo(() => {
    if (filter === "all") return perUser;
    if (filter === "sellers") return perUser.filter(u => u.portalRole === "timan_seller");
    return perUser.filter(u => lc(u.email) === filter);
  }, [perUser, filter]);

  const sellerRows = useMemo(
    () => perUser.filter(u => u.portalRole === "timan_seller")
      .filter(u => filter === "all" || filter === "sellers" || lc(u.email) === filter),
    [perUser, filter]
  );

  // Build user options for filter dropdown
  const userOptions = useMemo(() => {
    return perUser
      .map(u => ({ value: lc(u.email), label: `${u.name} (${u.email})` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [perUser]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (portalRole !== "timan_backend") return <Navigate to="/portal" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />

      <main className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-10 flex-grow w-full">
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-emerald-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Portal Analytics</h1>
              <p className="text-gray-600 text-sm">Besøgende, sessioner og modulbrug — sidste 30 dage.</p>
            </div>
          </div>
          <div className="min-w-[280px]">
            <label className="block text-xs text-gray-500 mb-1">Filtrér</label>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle brugere</SelectItem>
                <SelectItem value="sellers">Sælgere</SelectItem>
                {userOptions.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {err && <div className="mb-4 p-3 rounded-md bg-rose-50 text-rose-700 text-sm">Fejl: {err}. Sørg for at SQL-migrationen er kørt (phase29).</div>}
        {busy && <div className="text-sm text-gray-500">Indlæser…</div>}

        {!busy && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Kpi label="Besøg i dag" value={metrics.sessionsToday} />
              <Kpi label="Sidste 7 dage" value={metrics.sessions7} />
              <Kpi label="Sidste 30 dage" value={metrics.sessions30} />
              <Kpi label="Gns. session" value={fmtDuration(metrics.avgDur)} />
              <Kpi label="Førstegangsbesøg" value={metrics.firstTime} />
              <Kpi label="Tilbagevendende" value={metrics.returning} />
              <Kpi label="Gæster" value={metrics.guestSessions} />
              <Kpi label="Loggede ind" value={metrics.authSessions} />
            </div>

            {/* Sælgeraktivitet */}
            <Card className="mb-8">
              <CardHeader><CardTitle className="text-base">Sælgeraktivitet</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-gray-500 border-b">
                    <tr>
                      <th className="py-2 pr-3">Sælger</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">I dag</th>
                      <th className="py-2 pr-3">7 dage</th>
                      <th className="py-2 pr-3">30 dage</th>
                      <th className="py-2 pr-3">Seneste besøg</th>
                      <th className="py-2 pr-3">Gns. session</th>
                      <th className="py-2 pr-3">Mest brugte modul</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellerRows.map(r => (
                      <tr key={r.email} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-medium">{r.name}</td>
                        <td className="py-2 pr-3 text-gray-600">{r.email}</td>
                        <td className="py-2 pr-3">{r.visitsToday}</td>
                        <td className="py-2 pr-3">{r.visits7}</td>
                        <td className="py-2 pr-3">{r.visits30}</td>
                        <td className="py-2 pr-3">{r.lastVisit ? formatDateTime(r.lastVisit) : "—"}</td>
                        <td className="py-2 pr-3">{fmtDuration(r.avg)}</td>
                        <td className="py-2 pr-3">{r.topMod}</td>
                      </tr>
                    ))}
                    {sellerRows.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-gray-400">Ingen sælgeraktivitet endnu.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Brugeraktivitet */}
            <Card className="mb-8">
              <CardHeader><CardTitle className="text-base">Brugeraktivitet</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-gray-500 border-b">
                    <tr>
                      <th className="py-2 pr-3">Bruger</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3">Rolle</th>
                      <th className="py-2 pr-3">Antal besøg</th>
                      <th className="py-2 pr-3">Seneste besøg</th>
                      <th className="py-2 pr-3">Samlet tid</th>
                      <th className="py-2 pr-3">Gns. session</th>
                      <th className="py-2 pr-3">Mest brugte modul</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perUserFiltered.map(r => (
                      <tr key={r.email} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-medium">{r.name}</td>
                        <td className="py-2 pr-3 text-gray-600">{r.email}</td>
                        <td className="py-2 pr-3">{r.portalRole}</td>
                        <td className="py-2 pr-3">{r.visits}</td>
                        <td className="py-2 pr-3">{r.lastVisit ? formatDateTime(r.lastVisit) : "—"}</td>
                        <td className="py-2 pr-3">{fmtDuration(r.total || null)}</td>
                        <td className="py-2 pr-3">{fmtDuration(r.avg)}</td>
                        <td className="py-2 pr-3">{r.topMod}</td>
                      </tr>
                    ))}
                    {perUserFiltered.length === 0 && (
                      <tr><td colSpan={8} className="py-8 text-center text-gray-400">Ingen brugeraktivitet endnu.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <BreakdownCard title="Mest brugte moduler" rows={metrics.topModules} />
              <BreakdownCard title="Lande" rows={metrics.topCountries} />
              <BreakdownCard title="Postnumre" rows={metrics.topPostals} />
              <BreakdownCard title="Sprog" rows={metrics.topLangs} />
            </div>

            {/* Recent sessions */}
            <Card>
              <CardHeader><CardTitle className="text-base">Seneste sessioner</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-gray-500 border-b">
                    <tr>
                      <th className="py-2 pr-3">Tidspunkt</th>
                      <th className="py-2 pr-3">Bruger</th>
                      <th className="py-2 pr-3">Land</th>
                      <th className="py-2 pr-3">Postnr.</th>
                      <th className="py-2 pr-3">Sprog</th>
                      <th className="py-2 pr-3">Varighed</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fSessions.slice(0, 50).map(s => {
                      const u = s.email ? userByEmail.get(lc(s.email)) : null;
                      return (
                        <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 pr-3 text-gray-700">{formatDateTime(s.started_at)}</td>
                          <td className="py-2 pr-3">{userDisplayName(u ?? undefined, s.email) || <span className="text-gray-400">Gæst</span>}</td>
                          <td className="py-2 pr-3">{s.country || "—"}</td>
                          <td className="py-2 pr-3">{s.postal_code || "—"}</td>
                          <td className="py-2 pr-3">{s.language || "—"}</td>
                          <td className="py-2 pr-3">{fmtDuration(effectiveDuration(s))}</td>
                          <td className="py-2 pr-3">
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${s.user_type === "authenticated" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>
                              {s.user_type === "authenticated" ? "Registreret" : "Gæst"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {fSessions.length === 0 && (
                      <tr><td colSpan={7} className="py-8 text-center text-gray-400">Ingen sessioner endnu.</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  const max = rows[0]?.count || 1;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-gray-400">Ingen data.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map(r => (
              <li key={r.key}>
                <div className="flex justify-between text-xs text-gray-700">
                  <span className="truncate">{r.key}</span>
                  <span className="text-gray-500">{r.count}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded mt-1">
                  <div className="h-1.5 bg-emerald-500 rounded" style={{ width: `${(r.count / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
