/**
 * Timan Backend → Portal Analytics
 * Route: /portal/backend/portal-analytics
 * Access: portal_role === 'timan_backend' only.
 *
 * Reads from guest_visitors, guest_sessions, portal_activity_log.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { derivePortalRole } from "@/lib/portalAccess";

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

function startOfTodayISO() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
}
function daysAgoISO(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString();
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

export default function BackendPortalAnalyticsPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const since = daysAgoISO(30);
        const [v, s, a] = await Promise.all([
          supabase.from("guest_visitors").select("*").order("last_visit_at", { ascending: false }).limit(2000),
          supabase.from("guest_sessions").select("*").gte("started_at", since).order("started_at", { ascending: false }).limit(5000),
          supabase.from("portal_activity_log").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
        ]);
        if (cancelled) return;
        if (v.error) throw v.error;
        if (s.error) throw s.error;
        if (a.error) throw a.error;
        setVisitors((v.data || []) as VisitorRow[]);
        setSessions((s.data || []) as SessionRow[]);
        setActivity((a.data || []) as ActivityRow[]);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const portalRole = appUser ? derivePortalRole(appUser) : null;

  const metrics = useMemo(() => {
    const today = startOfTodayISO();
    const d7 = daysAgoISO(7);
    const d30 = daysAgoISO(30);

    const sessionsToday = sessions.filter(s => s.started_at >= today).length;
    const sessions7 = sessions.filter(s => s.started_at >= d7).length;
    const sessions30 = sessions.filter(s => s.started_at >= d30).length;

    const firstTime = visitors.filter(v => v.visit_count <= 1).length;
    const returning = visitors.filter(v => v.visit_count > 1).length;

    const durations = sessions.map(s => s.duration_seconds || 0).filter(d => d > 0);
    const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

    const guestSessions = sessions.filter(s => s.user_type === "guest").length;
    const authSessions = sessions.filter(s => s.user_type === "authenticated").length;

    const topModules = topN(activity.map(a => a.module || "?"), 6);
    const topCountries = topN(visitors.map(v => v.country || "?"), 8);
    const topPostals = topN(visitors.map(v => v.postal_code || "?"), 8);
    const topLangs = topN(visitors.map(v => v.language || "?"), 6);

    return { sessionsToday, sessions7, sessions30, firstTime, returning, avgDur, guestSessions, authSessions, topModules, topCountries, topPostals, topLangs };
  }, [sessions, visitors, activity]);

  const recent = useMemo(() => {
    return sessions.slice(0, 50).map(s => {
      const acts = activity.filter(a => a.session_id_match === s.id);
      // session_id is on activity.session_id but typed loosely above; do separate match:
      return s;
    });
  }, [sessions, activity]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (portalRole !== "timan_backend") return <Navigate to="/portal" replace />;

  const fmtDuration = (s: number) => {
    if (!s) return "–";
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        <Link to="/portal/backend" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Link>

        <div className="mb-8 flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-emerald-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Portal Analytics</h1>
            <p className="text-gray-600 text-sm">Besøgende, sessioner og modulbrug — sidste 30 dage.</p>
          </div>
        </div>

        {err && <div className="mb-4 p-3 rounded-md bg-rose-50 text-rose-700 text-sm">Fejl: {err}. Sørg for at SQL-migrationen er kørt.</div>}
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

            {/* Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <BreakdownCard title="Mest brugte moduler" rows={metrics.topModules} />
              <BreakdownCard title="Lande" rows={metrics.topCountries} />
              <BreakdownCard title="Postnumre" rows={metrics.topPostals} />
              <BreakdownCard title="Sprog" rows={metrics.topLangs} />
            </div>

            {/* Recent visitors */}
            <Card>
              <CardHeader><CardTitle className="text-base">Seneste besøgende</CardTitle></CardHeader>
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
                    {sessions.slice(0, 50).map(s => (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2 pr-3 text-gray-700">{new Date(s.started_at).toLocaleString()}</td>
                        <td className="py-2 pr-3">{s.email || <span className="text-gray-400">Gæst</span>}</td>
                        <td className="py-2 pr-3">{s.country || "–"}</td>
                        <td className="py-2 pr-3">{s.postal_code || "–"}</td>
                        <td className="py-2 pr-3">{s.language || "–"}</td>
                        <td className="py-2 pr-3">{fmtDuration(s.duration_seconds || 0)}</td>
                        <td className="py-2 pr-3">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${s.user_type === "authenticated" ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"}`}>
                            {s.user_type === "authenticated" ? "Registreret" : "Gæst"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {sessions.length === 0 && (
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
