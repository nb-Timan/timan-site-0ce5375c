/**
 * Timan Backend → Audit log.
 * Route: /portal/backend/audit-log
 * Access: only Timan Backend.
 */

import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ClipboardList, Search } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { isBackendActor } from "@/lib/portalAccess";
import { AuditEntry, fetchAuditEntries } from "@/lib/audit-log-store";

const ACTION_PILL: Record<AuditEntry["action"], string> = {
  create:  "bg-blue-100 text-blue-800",
  update:  "bg-indigo-100 text-indigo-800",
  delete:  "bg-rose-100 text-rose-800",
  approve: "bg-emerald-100 text-emerald-800",
  reject:  "bg-amber-100 text-amber-800",
  login:   "bg-slate-100 text-slate-700",
  invite:  "bg-cyan-100 text-cyan-800",
  reset:   "bg-amber-100 text-amber-800",
};

export default function BackendAuditLogPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  useEffect(() => {
    let alive = true;
    fetchAuditEntries().then((rows) => { if (alive) setEntries(rows); }).catch(() => { if (alive) setEntries([]); });
    return () => { alive = false; };
  }, []);

  const isBackend = useMemo(() => isBackendActor(appUser), [appUser]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal/backend" replace />;

  const modules = Array.from(new Set(entries.map((e) => e.module))).sort();
  const filtered = entries.filter((e) => {
    if (actionFilter !== "all" && e.action !== actionFilter) return false;
    if (moduleFilter !== "all" && e.module !== moduleFilter) return false;
    if (q) {
      const s = q.toLowerCase();
      const blob = `${e.user} ${e.module} ${e.record} ${e.old_value ?? ""} ${e.new_value ?? ""} ${e.ip}`.toLowerCase();
      if (!blob.includes(s)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-10 flex-grow w-full">
        <div className="mb-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
            <ClipboardList className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Audit log</h1>
            <p className="text-slate-500 mt-1 text-sm">Sporing af handlinger i portalen — kan filtreres og søges.</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg bruger, record, IP, værdi…"
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="all">Alle handlinger</option>
            {Object.keys(ACTION_PILL).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="all">Alle moduler</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wide">
              <tr>
                <Th>Tid</Th><Th>Bruger</Th><Th>Handling</Th><Th>Modul</Th><Th>Record</Th>
                <Th>Gammel værdi</Th><Th>Ny værdi</Th><Th>IP / enhed</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">Ingen poster matcher filteret.</td></tr>
              )}
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <Td className="text-slate-600 whitespace-nowrap">{new Date(e.ts).toLocaleString("da-DK")}</Td>
                  <Td className="font-semibold text-slate-900 whitespace-nowrap">{e.user}</Td>
                  <Td><span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${ACTION_PILL[e.action]}`}>{e.action}</span></Td>
                  <Td className="whitespace-nowrap">{e.module}</Td>
                  <Td className="text-slate-700 whitespace-nowrap">{e.record}</Td>
                  <Td className="text-slate-500">{e.old_value == null ? "—" : typeof e.old_value === "object" ? JSON.stringify(e.old_value) : String(e.old_value)}</Td>
                  <Td className="text-slate-700">{e.new_value == null ? "—" : typeof e.new_value === "object" ? JSON.stringify(e.new_value) : String(e.new_value)}</Td>
                  <Td className="text-slate-500 whitespace-nowrap">{e.ip}</Td>
                  <Td>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${e.status === "success" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                      {e.status}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Læser fra Supabase-tabellen <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">audit_log</code>. Kun Timan Backend kan se posterne.
        </p>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">{children}</th>; }
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>; }
