/**
 * Timan Backend → Modul-adgang (Module Access matrix).
 * Route: /portal/backend/module-access
 * Access: only Timan Backend.
 */

import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { RotateCcw, Save, Grid3x3 } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { derivePortalRole, getPortalPermissions, PORTAL_ROLES, PORTAL_ROLE_LABELS } from "@/lib/portalAccess";
import {
  AccessMatrix, MATRIX_MODULES, PERMISSION_LEVELS, PermissionLevel,
  getAccessMatrix, setAccessMatrix, resetAccessMatrix, subscribeAccessMatrix,
} from "@/lib/module-access-store";

const LEVEL_PILL: Record<PermissionLevel, string> = {
  none:    "bg-slate-100 text-slate-400",
  view:    "bg-slate-100 text-slate-700",
  create:  "bg-blue-100 text-blue-800",
  edit:    "bg-indigo-100 text-indigo-800",
  approve: "bg-amber-100 text-amber-800",
  manage:  "bg-emerald-100 text-emerald-800",
};

export default function BackendModuleAccessPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [matrix, setMatrix] = useState<AccessMatrix>(() => getAccessMatrix());
  const [dirty, setDirty] = useState(false);

  useEffect(() => subscribeAccessMatrix(() => { setMatrix(getAccessMatrix()); setDirty(false); }), []);

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

  function setCell(role: typeof PORTAL_ROLES[number], key: typeof MATRIX_MODULES[number]["key"], lvl: PermissionLevel) {
    setMatrix((prev) => {
      const next = { ...prev, [role]: { ...prev[role], [key]: lvl } };
      return next;
    });
    setDirty(true);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-10 flex-grow w-full">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Grid3x3 className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Modul-adgang</h1>
              <p className="text-slate-500 mt-1 text-sm">Matrix: roller × moduler. Klik en celle og vælg adgangsniveau.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (confirm("Nulstil matrix til standard?")) { const r = resetAccessMatrix(); setMatrix(r); setDirty(false); } }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Nulstil
            </button>
            <button
              disabled={!dirty}
              onClick={() => { setAccessMatrix(matrix); setDirty(false); }}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" /> Gem ændringer
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mr-1">Niveauer:</span>
          {PERMISSION_LEVELS.map((l) => (
            <span key={l} className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${LEVEL_PILL[l]}`}>{l}</span>
          ))}
        </div>

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="px-3 py-3 text-left font-semibold sticky left-0 bg-slate-50 z-10">Modul</th>
                {PORTAL_ROLES.map((r) => (
                  <th key={r} className="px-2 py-3 text-left font-semibold whitespace-nowrap">{PORTAL_ROLE_LABELS[r].da}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX_MODULES.map((mod) => (
                <tr key={mod.key} className="border-t border-slate-100 hover:bg-slate-50/40">
                  <td className="px-3 py-2 font-semibold text-slate-900 whitespace-nowrap sticky left-0 bg-white z-10">{mod.label}</td>
                  {PORTAL_ROLES.map((r) => {
                    const lvl = (matrix[r]?.[mod.key] ?? "none") as PermissionLevel;
                    return (
                      <td key={r} className="px-2 py-1.5">
                        <select
                          value={lvl}
                          onChange={(e) => setCell(r, mod.key, e.target.value as PermissionLevel)}
                          className={`rounded-md border-0 px-2 py-1 text-[11px] font-bold cursor-pointer ${LEVEL_PILL[lvl]}`}
                        >
                          {PERMISSION_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Ændringer gemmes lokalt i preview (localStorage). Når Supabase-tabellen <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">role_module_access</code> er klar, kan store-laget skiftes uden ændringer i denne side.
        </p>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
