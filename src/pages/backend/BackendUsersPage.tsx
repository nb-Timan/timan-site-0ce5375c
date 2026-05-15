/**
 * Timan Backend → Brugere (Users administration).
 *
 * Route: /portal/backend/users
 * Access: only Timan Backend (perms.canManageUsers).
 *
 * Lists all backend users with edit panel. Persists to localStorage in
 * preview; the same shape is ready to swap to a Supabase `backend_users`
 * table without changes to the page.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, KeyRound, Mail, Pencil, RotateCcw, Users as UsersIcon, X } from "lucide-react";
import { callAdminUserAction } from "@/lib/adminUserActions";
import { clearSellerIdCache } from "@/lib/resolveSellerId";
import { clearViewAsCache } from "@/lib/viewAsUser";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import {
  derivePortalRole,
  getPortalPermissions,
  PORTAL_ROLES,
  PORTAL_ROLE_LABELS,
  PortalRole,
  ModuleAccessKey,
} from "@/lib/portalAccess";
import {
  ALL_AREAS,
  ALL_MODULES,
  AreaKey,
  BACKEND_META_MODULES,
  BackendMetaModule,
  BackendUser,
  UserStatus,
} from "@/lib/backend-users-store";
import {
  fetchBackendUsers,
  saveBackendUser,
  type BackendUsersSource,
} from "@/lib/backendUsersService";
import { PORTAL_LANGUAGES } from "@/lib/portalLanguages";
import { fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";

const STATUS_LABEL: Record<UserStatus, string> = {
  active: "Active",
  pending: "Pending",
  blocked: "Blocked",
};

const STATUS_PILL: Record<UserStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  blocked: "bg-rose-100 text-rose-800",
};

const AREA_LABEL: Record<AreaKey, string> = {
  teknik_service: "Teknik & Service",
  salg_marketing: "Salg & Marketing",
  timan_backend: "Timan Backend",
};

const MODULE_LABEL: Record<ModuleAccessKey, string> = {
  teknik_service: "Teknik & Service",
  salg_marketing: "Salg & Marketing",
  timan_backend: "Timan Backend",
  timan_crm: "Timan CRM",
  claims: "Claims",
  tsb: "TSB",
  warranty: "Warranty",
  service_information: "Serviceinformation",
  byg_din_timan: "Configurator",
  resources: "Ressourcer",
  sales_tools: "Diverse",
  tilbud: "Tilbud",
  ordre: "Ordrer",
};

const BACKEND_MODULE_LABEL: Record<BackendMetaModule, string> = {
  users: "Users",
  roles: "Roles",
  module_access: "Module Access",
  audit_log: "Audit Log",
};

const VIDEOS_LABEL = "Video Galleri";

function formatLastLogin(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("da-DK"); } catch { return "—"; }
}

export default function BackendUsersPage() {
  const { appUser, loading, logout, refreshAppUser } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [source, setSource] = useState<BackendUsersSource>("supabase");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);

  const reload = useMemo(
    () => async () => {
      setLoadingUsers(true);
      const [uRes, dRes] = await Promise.all([fetchBackendUsers(), fetchDealerAccounts()]);
      setUsers(uRes.users);
      setSource(uRes.source);
      setLoadError(uRes.error ?? null);
      setDealers(dRes.rows);
      setLoadingUsers(false);
    },
    [],
  );

  useEffect(() => { void reload(); }, [reload]);

  // Expose snapshot for the edit modal's Account Owner select (avoids prop drilling).
  useEffect(() => {
    (window as unknown as { __timanUsersSnapshot?: BackendUser[] }).__timanUsersSnapshot = users;
  }, [users]);

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === "slutkunde") return <Navigate to="/configurator" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

  const editing = editingId ? users.find((u) => u.id === editingId) : null;

  async function runAdminAction(u: BackendUser, action: "invite" | "reset") {
    setActionMsg(null);
    setPendingAction(`${u.id}:${action}`);
    const res = await callAdminUserAction(action, u.email, u.id);
    setPendingAction(null);
    if (!res.ok) {
      setActionMsg({ kind: "err", text: res.error ?? "Handlingen fejlede." });
      return;
    }
    setActionMsg({ kind: "ok", text: `${u.email}: ${res.message ?? "Sendt."}` });
    await reload();
  }

  function authBadge(u: BackendUser) {
    const s = u.auth_status ?? "app_only";
    if (s === "auth_exists") {
      const reset = u.last_password_reset_at
        ? `Reset sendt ${new Date(u.last_password_reset_at).toLocaleDateString("da-DK")}`
        : "Auth bruger findes";
      return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800" title={reset}>{reset}</span>;
    }
    if (s === "invited") {
      const inv = u.last_invited_at
        ? `Invitation sendt ${new Date(u.last_invited_at).toLocaleDateString("da-DK")}`
        : "Invitation sendt";
      return <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-800" title={inv}>{inv}</span>;
    }
    return <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700" title="Kun i app_users — ingen Supabase Auth bruger endnu">Kun app_users</span>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <main className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-10 flex-grow w-full">
        <Link to="/portal/backend" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage til Timan Backend
        </Link>

        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
              <UsersIcon className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                Brugere
                {users.filter((u) => !u.approved).length > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800"
                    title="Antal brugere der venter på godkendelse"
                  >
                    {users.filter((u) => !u.approved).length} afventer godkendelse
                  </span>
                )}
              </h1>
              <p className="text-slate-500 mt-1 text-sm">Administrer brugere, roller, områder og modul-adgang.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Genindlæs
          </button>
        </div>

        {(loadError || saveError) && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {loadError && <div>{loadError}</div>}
            {saveError && <div className="mt-1">{saveError}</div>}
          </div>
        )}
        {actionMsg && (
          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            actionMsg.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}>
            {actionMsg.text}
          </div>
        )}
        {loadingUsers && (
          <div className="mb-4 text-xs text-slate-500">Henter brugere…</div>
        )}

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Dealer</Th>
                <Th>Type</Th>
                <Th>Tildelt sælger</Th>
                <Th>Country</Th>
                <Th>Sprog</Th>
                <Th>Status</Th>
                <Th>Approved</Th>
                <Th>Active</Th>
                <Th>Role</Th>
                <Th>Auth</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const langOpt = PORTAL_LANGUAGES.find((l) => l.code === u.language);
                const dealer = u.dealer_number ? dealers.find((d) => d.account_number === u.dealer_number) : undefined;
                const dealerType = dealer?.customer_type_label || dealer?.customer_type || null;
                const inheritedSellerInitials = dealer?.assigned_seller_initials || u.seller_initials || null;
                const inheritedSellerName = dealer?.assigned_seller_name || null;
                return (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <Td className="font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white text-[10px] font-bold">
                        {u.initials}
                      </span>
                      {u.name}
                    </div>
                  </Td>
                  <Td className="text-slate-600">{u.email}</Td>
                  <Td>
                    {u.dealer_number ? (
                      <div className="text-xs">
                        <div className="font-semibold text-slate-900">{dealer?.company_name || u.company_dealer || u.company || "—"}</div>
                        <div className="text-slate-500">{u.dealer_number}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400 text-xs">— ikke tilknyttet —</span>
                    )}
                  </Td>
                  <Td>
                    {dealerType
                      ? <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{dealerType}</span>
                      : <span className="text-slate-400 text-xs">—</span>}
                  </Td>
                  <Td>
                    {inheritedSellerInitials ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-[10px] font-bold">{inheritedSellerInitials}</span>
                        <span className="text-xs text-slate-700">{inheritedSellerName || ""}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </Td>
                  <Td>{u.country || "—"}</Td>
                  <Td>{langOpt ? `${langOpt.flag}` : u.language?.toUpperCase()}</Td>
                  <Td>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_PILL[u.status]}`}>
                      {STATUS_LABEL[u.status]}
                    </span>
                  </Td>
                  <Td>
                    {u.approved
                      ? <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Yes</span>
                      : <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">No</span>}
                  </Td>
                  <Td>
                    {u.is_active
                      ? <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">Yes</span>
                      : <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">No</span>}
                  </Td>
                  <Td>{PORTAL_ROLE_LABELS[u.role]?.da ?? u.role}</Td>
                  <Td>{authBadge(u)}</Td>
                  <Td>
                    <div className="flex items-center gap-2 flex-wrap">
                      {!u.approved && (
                        <button
                          type="button"
                          onClick={async () => {
                            setSaveError(null);
                            const patch: BackendUser = { ...u, approved: true, is_active: true, status: "active" };
                            const res = await saveBackendUser(u.id, patch);
                            if (!res.ok) setSaveError(res.error ?? "Kunne ikke godkende.");
                            // Bust any cached sellerId for this email and refresh the
                            // logged-in app user if the approved row is the current user.
                            clearSellerIdCache(u.email);
                            clearViewAsCache(u.email);
                            window.dispatchEvent(new CustomEvent('timan:active-mode-changed'));
                            if (appUser && appUser.email.toLowerCase() === u.email.toLowerCase()) {
                              await refreshAppUser();
                            }
                            await reload();
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pendingAction === `${u.id}:invite`}
                        onClick={() => void runAdminAction(u, "invite")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                        title="Opret/inviter Supabase Auth bruger og send invitationsemail"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {pendingAction === `${u.id}:invite` ? "Sender…" : "Inviter"}
                      </button>
                      <button
                        type="button"
                        disabled={pendingAction === `${u.id}:reset`}
                        onClick={() => void runAdminAction(u, "reset")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-60"
                        title="Send password reset email"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                        {pendingAction === `${u.id}:reset` ? "Sender…" : "Reset password"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(u.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                    </div>
                  </Td>
                </tr>
              );})}
              {users.length === 0 && !loadingUsers && (
                <tr><td colSpan={13} className="px-3 py-10 text-center text-sm text-slate-500">Ingen brugere fundet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          {source === "supabase"
            ? "Kilde: Supabase public.app_users — ændringer gemmes direkte i databasen."
            : "Kilde: lokal preview-fallback (Supabase ikke tilgængelig). Ændringer gemmes kun i denne browser."}
        </p>
      </main>

      <PortalFooter language={lang} />

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditingId(null)}
          onSave={async (patch) => {
            setSaveError(null);
            const res = await saveBackendUser(editing.id, patch);
            clearSellerIdCache(editing.email);
            clearViewAsCache(editing.email);
            if (patch.email && patch.email.toLowerCase() !== editing.email.toLowerCase()) {
              clearSellerIdCache(patch.email);
              clearViewAsCache(patch.email);
            }
            window.dispatchEvent(new CustomEvent('timan:active-mode-changed'));
            if (
              appUser &&
              (appUser.email.toLowerCase() === editing.email.toLowerCase() ||
                (patch.email && appUser.email.toLowerCase() === patch.email.toLowerCase()))
            ) {
              await refreshAppUser();
            }
            await reload();
            if (!res.ok) {
              // Keep modal open so user can fix the issue and retry. The
              // saveError banner above the table shows the readback details.
              setSaveError(res.error ?? "Kunne ikke gemme — readback fejlede.");
              return { ok: false, error: res.error };
            }
            setSaveError(null);
            setEditingId(null);
            return { ok: true };
          }}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
}

// ---------------- Edit Modal ----------------

function EditUserModal({
  user,
  onClose,
  onSave,
}: {
  user: BackendUser;
  onClose: () => void;
  onSave: (patch: BackendUser) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [draft, setDraft] = useState<BackendUser>(user);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealerQuery, setDealerQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchDealerAccounts();
      if (!cancelled) setDealers(res.rows);
    })();
    return () => { cancelled = true; };
  }, []);

  function applyDealer(dealerId: string) {
    if (!dealerId) {
      setDraft({ ...draft, dealer_number: null, company_dealer: null, seller_initials: null, seller_email: null });
      return;
    }
    const d = dealers.find((x) => x.id === dealerId);
    if (!d) return;
    setDraft({
      ...draft,
      dealer_number: d.account_number,
      company_dealer: d.company_name,
      company: draft.company || d.company_name,
      country: draft.country || (d.country ?? ""),
      postal_code: draft.postal_code || d.postal_code,
      seller_initials: d.assigned_seller_initials,
      seller_email: d.assigned_seller_email,
    });
  }

  const matchingDealer = dealers.find((d) => d.account_number === draft.dealer_number);
  const filteredDealers = dealerQuery
    ? dealers.filter((d) => `${d.company_name} ${d.account_number} ${d.city ?? ""}`.toLowerCase().includes(dealerQuery.toLowerCase())).slice(0, 100)
    : dealers.slice(0, 100);

  function toggle<T extends string>(arr: T[], value: T): T[] {
    return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
  }

  // Sellers list (from currently loaded users) — pulled from window.__timanUsersSnapshot
  // populated by BackendUsersPage to avoid prop drilling.
  const sellers = (typeof window !== "undefined"
    ? ((window as unknown as { __timanUsersSnapshot?: BackendUser[] }).__timanUsersSnapshot ?? [])
    : []
  ).filter((u) => u.role === "timan_seller" || u.role === "timan_backend");

  function applyOwner(ownerId: string) {
    if (!ownerId) {
      setDraft({
        ...draft,
        account_owner_user_id: null,
        account_owner_name: null,
        account_owner_initials: null,
        account_owner_email: null,
      });
      return;
    }
    const owner = sellers.find((s) => s.id === ownerId);
    if (!owner) return;
    setDraft({
      ...draft,
      account_owner_user_id: owner.id,
      account_owner_name: owner.name,
      account_owner_initials: owner.initials,
      account_owner_email: owner.email,
    });
  }

  // Owner only applies to dealer-side accounts (non-internal roles).
  const ownerApplicable = !["timan_backend", "timan_seller", "timan_service"].includes(draft.role);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Rediger bruger</h2>
            <p className="text-xs text-slate-500">{user.email}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Basic */}
          <Section title="Basic">
            <Grid>
              <Input label="Initials" value={draft.initials} onChange={(v) => setDraft({ ...draft, initials: v.toUpperCase().slice(0, 4) })} />
              <Input label="Name" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
              <Input label="Email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} />
              <Input label="Company" value={draft.company} onChange={(v) => setDraft({ ...draft, company: v })} />
              <Input label="Country" value={draft.country} onChange={(v) => setDraft({ ...draft, country: v.toUpperCase().slice(0, 2) })} />
              <Input label="Postal code" value={draft.postal_code ?? ""} onChange={(v) => setDraft({ ...draft, postal_code: v || null })} />
              <Select
                label="Preferred language"
                value={draft.language}
                onChange={(v) => setDraft({ ...draft, language: v as BackendUser["language"] })}
                options={PORTAL_LANGUAGES.map((l) => ({ value: l.code, label: `${l.flag} — ${l.label}` }))}
              />
              <Input label="Dealer number" value={draft.dealer_number ?? ""} onChange={(v) => setDraft({ ...draft, dealer_number: v || null })} />
              <Input label="Notes" value={draft.notes ?? ""} onChange={(v) => setDraft({ ...draft, notes: v || null })} />
            </Grid>
          </Section>

          {/* Dealer account link — copies dealer info into app_users */}
          <Section title="Dealer account (forhandler)">
            <p className="text-[11px] text-slate-500 mb-2">
              Vælg en forhandler fra <code>dealer_accounts</code>. Flere brugere kan tilhøre samme forhandler.
              Felterne nedenfor (kontonr, firma, sælger) bliver kopieret til brugerens profil.
            </p>
            <input
              type="text"
              placeholder="Søg på firma, kontonr eller by…"
              value={dealerQuery}
              onChange={(e) => setDealerQuery(e.target.value)}
              className="w-full mb-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <select
              value={matchingDealer?.id ?? ""}
              onChange={(e) => applyDealer(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— ingen forhandler tilknyttet —</option>
              {filteredDealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.account_number} · {d.company_name}{d.country ? ` (${d.country})` : ""}
                  {d.assigned_seller_initials ? ` — sælger: ${d.assigned_seller_initials}` : " — uden sælger"}
                </option>
              ))}
            </select>
            {(draft.dealer_number || draft.company_dealer || draft.seller_initials) && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div><span className="font-semibold text-slate-500">Kontonr:</span> {draft.dealer_number || "—"}</div>
                <div><span className="font-semibold text-slate-500">Firma:</span> {draft.company_dealer || "—"}</div>
                <div><span className="font-semibold text-slate-500">Sælger initialer:</span> {draft.seller_initials || "—"}</div>
                <div><span className="font-semibold text-slate-500">Sælger email:</span> {draft.seller_email || "—"}</div>
              </div>
            )}
          </Section>

          <Section title="Role">
            <Select
              label="Portal role"
              value={draft.role}
              onChange={(v) => setDraft({ ...draft, role: v as PortalRole })}
              options={PORTAL_ROLES.map((r) => ({ value: r, label: PORTAL_ROLE_LABELS[r].da }))}
            />
          </Section>

          {/* Status */}
          <Section title="Status">
            <div className="flex flex-wrap gap-2">
              {(["active", "pending", "blocked"] as UserStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (s === "active") setDraft({ ...draft, status: s, approved: true, is_active: true });
                    else if (s === "pending") setDraft({ ...draft, status: s, approved: false, is_active: false });
                    else setDraft({ ...draft, status: s, is_active: false });
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold border ${
                    draft.status === s
                      ? `${STATUS_PILL[s]} border-transparent`
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.approved}
                  onChange={(e) => setDraft({ ...draft, approved: e.target.checked })}
                  className="h-4 w-4"
                />
                Approved
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
                  className="h-4 w-4"
                />
                Active
              </label>
            </div>
          </Section>

          {/* Account Owner (CRM) — only meaningful for dealer-side accounts. */}
          {ownerApplicable && (
            <Section title="Account Owner (Timan Sælger)">
              <Select
                label="Tildelt sælger"
                value={draft.account_owner_user_id ?? ""}
                onChange={(v) => applyOwner(v)}
                options={[
                  { value: "", label: "— ingen tildelt —" },
                  ...sellers.map((s) => ({ value: s.id, label: `${s.initials} · ${s.name}` })),
                ]}
              />
              {draft.account_owner_user_id && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Ejer: {draft.account_owner_name} ({draft.account_owner_email})
                </p>
              )}
              <p className="mt-2 text-[11px] text-slate-500">
                Brugt af kommende CRM/Sales Portal til at filtrere dealers, importører,
                service partnere, dealer users og tilbud/ordrer.
              </p>
            </Section>
          )}

          {/* Allowed Areas */}
          <Section title="Allowed Areas">
            <CheckboxGroup
              items={ALL_AREAS.map((a) => ({ value: a, label: AREA_LABEL[a] }))}
              checked={draft.allowed_areas}
              onChange={(v) => setDraft({ ...draft, allowed_areas: toggle(draft.allowed_areas, v as AreaKey) })}
            />
          </Section>

          {/* Allowed Modules */}
          <Section title="Allowed Modules">
            <CheckboxGroup
              items={[
                ...ALL_MODULES.map((m) => ({ value: m, label: MODULE_LABEL[m] || m })),
                { value: "videos", label: VIDEOS_LABEL, disabled: true },
              ]}
              checked={draft.allowed_modules}
              onChange={(v) => setDraft({ ...draft, allowed_modules: toggle(draft.allowed_modules, v as ModuleAccessKey) })}
            />
            <p className="mt-2 text-[11px] text-slate-500">Backend-meta moduler:</p>
            <CheckboxGroup
              items={BACKEND_META_MODULES.map((m) => ({ value: m, label: BACKEND_MODULE_LABEL[m] }))}
              checked={draft.backend_modules}
              onChange={(v) => setDraft({ ...draft, backend_modules: toggle(draft.backend_modules, v as BackendMetaModule) })}
            />
          </Section>

          {/* Permissions */}
          <Section title="Permissions">
            <CheckboxGroup
              items={[
                { value: "can_create_claims", label: "Can create claims" },
                { value: "can_approve_claims", label: "Can approve claims" },
                { value: "can_create_tsb", label: "Can create TSB" },
                { value: "can_manage_users", label: "Can manage users" },
                { value: "can_manage_payment_terms", label: "Kan vælge betalingsbetingelser" },
              ]}
              checked={(Object.entries(draft.perms) as [keyof BackendUser["perms"], boolean][])
                .filter(([, v]) => v)
                .map(([k]) => k)}
              onChange={(key) =>
                setDraft({
                  ...draft,
                  perms: { ...draft.perms, [key]: !draft.perms[key as keyof BackendUser["perms"]] },
                })
              }
            />
          </Section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4 sticky bottom-0 bg-white">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Annuller
          </button>
          <button
            onClick={() => onSave(draft)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
          >
            Gem ændringer
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Modal helpers ----------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      {children}
    </div>
  );
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}
function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
      />
    </label>
  );
}
function Select({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function CheckboxGroup({
  items, checked, onChange,
}: {
  items: { value: string; label: string; disabled?: boolean }[];
  checked: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map((it) => {
        const isChecked = checked.includes(it.value);
        return (
          <label
            key={it.value}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
              it.disabled ? "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              checked={isChecked}
              disabled={it.disabled}
              onChange={() => !it.disabled && onChange(it.value)}
              className="h-3.5 w-3.5"
            />
            <span className="font-semibold">{it.label}</span>
          </label>
        );
      })}
    </div>
  );
}
