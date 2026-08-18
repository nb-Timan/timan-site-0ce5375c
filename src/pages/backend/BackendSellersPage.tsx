/**
 * Timan Backend → Timan sellers.
 * Route: /portal/backend/sellers
 *
 * Filter by Timan seller; show all dealer accounts assigned to that seller
 * with combined statistics aggregated by dealer (not by individual user).
 *
 * Source: public.dealer_account_stats (view) + public.app_users.
 */

import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { RotateCcw, UserCircle2 } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { derivePortalRole, getPortalPermissions } from "@/lib/portalAccess";
import { fetchDealerAccountStats, type DealerAccountStats } from "@/lib/dealerAccountsService";
import { fetchBackendUsers } from "@/lib/backendUsersService";
import type { BackendUser } from "@/lib/backend-users-store";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return "—"; }
}

export default function BackendSellersPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [stats, setStats] = useState<DealerAccountStats[]>([]);
  const [sellers, setSellers] = useState<BackendUser[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useMemo(() => async () => {
    setLoadingData(true);
    const [sRes, uRes] = await Promise.all([fetchDealerAccountStats(), fetchBackendUsers()]);
    setStats(sRes.rows);
    setLoadError(sRes.error ?? null);
    setSellers(uRes.users.filter((u) => u.role === "timan_seller" || u.role === "timan_backend"));
    setLoadingData(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

  // Build seller buckets keyed by initials (the dealer link).
  const sellerInitialsList = Array.from(
    new Set(stats.map((s) => s.assigned_seller_initials).filter(Boolean) as string[])
  ).sort();

  const visibleStats = selected
    ? stats.filter((s) => s.assigned_seller_initials === selected)
    : stats;

  const totals = visibleStats.reduce(
    (acc, s) => {
      acc.dealers += 1;
      acc.users += s.user_count;
      acc.quotes += s.quote_count;
      acc.orders += s.order_count;
      acc.activity += s.activity_count;
      if (s.last_activity_at && (!acc.last || s.last_activity_at > acc.last)) acc.last = s.last_activity_at;
      return acc;
    },
    { dealers: 0, users: 0, quotes: 0, orders: 0, activity: 0, last: null as string | null },
  );

  const selectedSeller = selected
    ? sellers.find((s) => s.initials === selected)
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-10 flex-grow w-full">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
              <UserCircle2 className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Timan sælgere</h1>
              <p className="text-slate-500 mt-1 text-sm">
                Vælg en sælger og se alle forhandlere, service partnere og importører
                der er tildelt — samt aggregeret aktivitet per forhandler.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5" /> Genindlæs
          </button>
        </div>

        {loadError && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{loadError}</div>
        )}

        <div className="mb-4 flex items-center gap-3 flex-wrap bg-white border border-slate-200 rounded-xl p-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Sælger:</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">— Alle sælgere —</option>
            {sellerInitialsList.map((ini) => {
              const seller = sellers.find((u) => u.initials === ini);
              return <option key={ini} value={ini}>{ini}{seller ? ` · ${seller.name}` : ""}</option>;
            })}
          </select>
          {selectedSeller && (
            <span className="text-xs text-slate-500">{selectedSeller.email}</span>
          )}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Stat label="Forhandlere" value={totals.dealers} />
          <Stat label="Tilknyttede brugere" value={totals.users} />
          <Stat label="Tilbud" value={totals.quotes} />
          <Stat label="Ordrer" value={totals.orders} />
          <Stat label="Sidste aktivitet" value={fmtDate(totals.last)} />
        </div>

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <Th>Firmanavn</Th>
                <Th>Kontonr</Th>
                <Th>Type</Th>
                <Th>Land</Th>
                <Th>Sælger</Th>
                <Th>Brugere</Th>
                <Th>Tilbud</Th>
                <Th>Ordrer</Th>
                <Th>Sidste aktivitet</Th>
              </tr>
            </thead>
            <tbody>
              {visibleStats.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <Td className="font-semibold text-slate-900">{s.company_name}</Td>
                  <Td>{s.account_number}</Td>
                  <Td>{s.customer_type_label || s.customer_type || "—"}</Td>
                  <Td>{s.country || "—"}</Td>
                  <Td>{s.assigned_seller_initials || <span className="text-rose-600 text-xs font-semibold">Ikke tildelt</span>}</Td>
                  <Td>{s.user_count}</Td>
                  <Td>{s.quote_count}</Td>
                  <Td>{s.order_count}</Td>
                  <Td className="text-slate-500 text-xs whitespace-nowrap">{fmtDate(s.last_activity_at)}</Td>
                </tr>
              ))}
              {!loadingData && visibleStats.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">Ingen forhandlere fundet for denne sælger.</td></tr>
              )}
              {loadingData && (
                <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">Henter…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
}
function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
