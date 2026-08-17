/**
 * Timan Backend → Roller (Roles).
 * Route: /portal/backend/roles
 * Access: only Timan Backend.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Pencil, X } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import {
  derivePortalRole, getPortalPermissions, PORTAL_ROLES, PORTAL_ROLE_LABELS,
  PortalRole, DEFAULT_MODULE_ACCESS, ModuleAccessKey,
} from "@/lib/portalAccess";
import { fetchBackendUsers } from "@/lib/backendUsersService";
import { listBackendUsers, subscribeBackendUsers, AreaKey, BackendUser } from "@/lib/backend-users-store";

const ROLE_DESCRIPTION: Record<PortalRole, string> = {
  timan_backend:         "Fuld administrativ adgang til alle moduler, brugere, roller og audit log.",
  timan_seller:          "Intern Timan Sælger — håndterer tilbud, ordrer og support til forhandlere.",
  timan_service:         "Intern Timan Service — gennemser claims, TSB og garantisager.",
  timan_importer:        "Importør — bestiller, opretter claims og garantiregistreringer for sit marked.",
  timan_dealer:          "Forhandler — bygger maskiner, indsender tilbud, ordrer og claims.",
  timan_service_partner: "Service Partner — opretter og følger op på claims og garantisager.",
  dealer_user:           "Læseadgang for forhandleransatte uden redigerings-rettigheder.",
  exhibition_user:       "Timan Messe — offentlig demo-adgang via QR-kode på messer. Ingen CRM, ordrer eller dealerdata.",
  pending:               "Ny bruger — afventer godkendelse fra Timan Backend admin.",
};

const AREA_LABEL: Record<AreaKey, string> = {
  salg_marketing: "Salg",
  marketing: "Marketing",
  teknik_service: "Teknik & Service",
  dealer_data:    "Forhandlerdata",
  timan_crm:      "Timan CRM",
  timan_backend:  "Timan Backend",
};

const MODULE_LABEL: Record<string, string> = {
  teknik_service: "Teknik & Service", salg_marketing: "Salg", marketing: "Marketing", timan_backend: "Timan Backend",
  claims: "Service / Claims", tsb: "TSB Portal", warranty: "Garantiregistrering",
  service_information: "Serviceinformation", byg_din_timan: "Byg din Timan",
  tilbud: "Tilbud", ordre: "Ordre", resources: "Beregnere & kalkulatorer", sales_tools: "Formularer", contracts: "Kontrakt",
};

const ALL_AREAS: AreaKey[] = ["teknik_service", "salg_marketing", "marketing", "timan_backend"];

export default function BackendRolesPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [users, setUsers] = useState<BackendUser[]>(() => listBackendUsers());
  const [editing, setEditing] = useState<PortalRole | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchBackendUsers();
      if (!cancelled) setUsers(res.users);
    };
    void load();
    const unsub = subscribeBackendUsers(() => { void load(); });
    return () => { cancelled = true; unsub(); };
  }, []);

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

  const counts = PORTAL_ROLES.reduce<Record<PortalRole, number>>((acc, r) => {
    acc[r] = users.filter((u) => u.role === r).length;
    return acc;
  }, {} as Record<PortalRole, number>);

  const usersByRole = PORTAL_ROLES.reduce<Record<PortalRole, BackendUser[]>>((acc, r) => {
    acc[r] = users.filter((u) => u.role === r);
    return acc;
  }, {} as Record<PortalRole, BackendUser[]>);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage} onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-10 flex-grow w-full">
        <Link to="/portal/backend" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage til Timan Backend
        </Link>

        <div className="mb-8 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Roller</h1>
            <p className="text-slate-500 mt-1 text-sm">Rolle-skabeloner: områder, moduler, rettigheder og antal brugere.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {PORTAL_ROLES.map((r) => {
            const def = DEFAULT_MODULE_ACCESS[r] || [];
            const areas = def.filter((m): m is AreaKey => (ALL_AREAS as string[]).includes(m));
            const modules = def.filter((m) => !(ALL_AREAS as string[]).includes(m)) as ModuleAccessKey[];
            const p = getPortalPermissions(r);
            return (
              <div key={r} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">{PORTAL_ROLE_LABELS[r].da}</h2>
                    <p className="text-sm text-slate-500 mt-1">{ROLE_DESCRIPTION[r]}</p>
                  </div>
                  <details className="group relative shrink-0">
                    <summary className="list-none cursor-pointer inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">
                      {counts[r]} {counts[r] === 1 ? "bruger" : "brugere"}
                    </summary>
                    <div className="absolute right-0 top-7 z-20 hidden w-80 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl group-open:block">
                      {usersByRole[r].length === 0 ? (
                        <div className="text-slate-400">Ingen brugere i denne rolle.</div>
                      ) : usersByRole[r].map((u) => (
                        <div key={u.id} className="border-b border-slate-100 py-2 last:border-0 first:pt-0 last:pb-0">
                          <div className="font-bold text-slate-900">{u.name}</div>
                          <div className="text-slate-500">{u.email}</div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span>{u.company_dealer || u.company || u.dealer_number || "—"}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{u.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>

                <div className="mt-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Tilladte områder</div>
                  <div className="flex flex-wrap gap-1.5">
                    {areas.length === 0 && <span className="text-xs text-slate-400">—</span>}
                    {areas.map((a) => (
                      <span key={a} className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{AREA_LABEL[a]}</span>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Standard moduler</div>
                  <div className="flex flex-wrap gap-1.5">
                    {modules.map((m) => (
                      <span key={m} className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">{MODULE_LABEL[m] || m}</span>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Standard rettigheder</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Perm on={p.canSubmitOrder}>Submit ordre</Perm>
                    <Perm on={p.canCreateClaim}>Opret claim</Perm>
                    <Perm on={p.canCreateWarranty}>Opret garanti</Perm>
                    <Perm on={p.canEditData}>Rediger data</Perm>
                    <Perm on={p.isBackend}>Backend admin</Perm>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button onClick={() => setEditing(r)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                    <Pencil className="h-3.5 w-3.5" /> Rediger
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-xs text-slate-500">
          Roller er skabeloner — den faktiske bruger-adgang sættes per bruger på siden Brugere og i Modul-adgang matrixen.
        </p>
      </main>

      <PortalFooter language={lang} />

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Rediger rolle</h2>
                <p className="text-xs text-slate-500">{PORTAL_ROLE_LABELS[editing].da}</p>
              </div>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-6 py-5 text-sm text-slate-600 space-y-3">
              <p>Rolle-skabelonen er styret centralt og kan tilpasses på en kommende detalje-side. Brug indtil videre <strong>Modul-adgang</strong> matrixen for at justere tilladelser per rolle, og <strong>Brugere</strong> for individuelle overrides.</p>
              <div className="flex gap-2 pt-2">
                <Link to="/portal/backend/module-access" onClick={() => setEditing(null)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Åbn Modul-adgang</Link>
                <Link to="/portal/backend/users" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Åbn Brugere</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Perm({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${on ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500 line-through"}`}>
      {children}
    </span>
  );
}
