/**
 * Timan Backend → Forhandlere (Dealer accounts).
 * Route: /portal/backend/dealer-accounts
 * Access: only Timan Backend.
 *
 * Source: public.dealer_accounts (Supabase).
 * Editable fields: assigned_seller_initials / name / email.
 */

import React, { useEffect, useMemo, useState } from "react";
import { sellerInitialsMatch, normalizeSellerInitials } from "@/lib/sellerInitials";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, Ban, Building2, CheckCircle2, ChevronDown, ChevronRight, FileText, GitBranch, Lock, Network, Pencil, Plus, RotateCcw, Search, Star, Trash2, Upload, X } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCountryFormatter, formatCountry as formatCountryFn } from "@/lib/formatCountry";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { isBackendActor } from "@/lib/portalAccess";
import {
  DealerAccount,
  DealerAccountStats,
  fetchDealerAccountStats,
  fetchDealerAccounts,
  fetchBackendAuthCheck,
  type BackendAuthCheck,
  restoreDealer,
  setDealerBlocked,
  softDeleteDealer,
  updateDealerSeller,
  createDealerAccount,
  parseCsv,
  buildCsvPreview,
  upsertDealerAccountsBulk,
  DEALER_TYPE_OPTIONS,
  dealerTypeFromCustomerType,
  type CsvParsedRow,
  type CsvImportResult,
  setDealerParent,
  setDealerMain,
  updateDealerAccount,
  updateDealerBranchName,
  groupDealersByParent,
  aggregateGroupStats,
  resolveEffectiveSeller,
  setDealerSuccessor,
  isDealerInactive,
  buildSuccessorIndex,
  type DealerGroup,
} from "@/lib/dealerAccountsService";
import { fetchBackendUsers } from "@/lib/backendUsersService";
import { BackendUser } from "@/lib/backend-users-store";
import { supabase } from "@/lib/supabase";
import SharePointSyncPanel from "@/components/backend/SharePointSyncPanel";
import GeocodeDealersPanel from "@/components/backend/GeocodeDealersPanel";
import DealerProfileImportPanel from "@/components/backend/DealerProfileImportPanel";
import AddressAutocomplete, { type ResolvedAddress } from "@/components/crm/AddressAutocomplete";
import { saveDealerGeocodingForAddress } from "@/lib/dealerGeocodingService";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return "—"; }
}

function readableError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const obj = e as { message?: unknown; error?: unknown; details?: unknown; hint?: unknown };
    const parts = [obj.message, obj.error, obj.details, obj.hint]
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (parts.length) return parts.join(" · ");
    try { return JSON.stringify(e); } catch { return "Ukendt fejl"; }
  }
  return "Ukendt fejl";
}

export default function BackendDealerAccountsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const { formatCountry } = useCountryFormatter();
  const navigate = useNavigate();

  const [rows, setRows] = useState<DealerAccount[]>([]);
  const [stats, setStats] = useState<Record<string, DealerAccountStats>>({});
  const [allUsers, setAllUsers] = useState<BackendUser[]>([]);
  const [sellers, setSellers] = useState<BackendUser[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<DealerAccount | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSupabaseSession, setHasSupabaseSession] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filters
  const [q, setQ] = useState("");
  const [country, setCountry] = useState<string>("");
  const [customerType, setCustomerType] = useState<string>("");
  const [seller, setSeller] = useState<string>("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [structureFilter, setStructureFilter] = useState<"all" | "main" | "branch">("all");
  const [confirmDelete, setConfirmDelete] = useState<DealerAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [authDiag, setAuthDiag] = useState<BackendAuthCheck | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [groupExpanded, setGroupExpanded] = useState<Set<string>>(new Set());

  // Verify a real Supabase Auth session exists (not just a cached sessionStorage user).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSupabaseSession(!!data.session);
      setAuthChecked(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSupabaseSession(!!session);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const reload = useMemo(() => async () => {
    setLoadingRows(true);
    const [dRes, uRes, sRes] = await Promise.all([
      fetchDealerAccounts({ includeDeleted: showDeleted }),
      fetchBackendUsers(),
      fetchDealerAccountStats(),
    ]);
    setRows(dRes.rows);
    setLoadError(dRes.error ?? sRes.error ?? null);
    setAllUsers(uRes.users);
    setSellers(uRes.users.filter((u) => u.role === "timan_seller" || u.role === "timan_backend"));
    const map: Record<string, DealerAccountStats> = {};
    for (const s of sRes.rows) map[s.id] = s;
    setStats(map);
    setLoadingRows(false);

    // If we got an error or 0 rows, run the diagnostic so the user can see why.
    if (dRes.error || dRes.rows.length === 0) {
      const diag = await fetchBackendAuthCheck();
      setAuthDiag(diag.check);
    } else {
      setAuthDiag(null);
    }
  }, [showDeleted]);

  useEffect(() => {
    if (authChecked && hasSupabaseSession) void reload();
    else if (authChecked) setLoadingRows(false);
  }, [authChecked, hasSupabaseSession, reload]);

  const isBackend = useMemo(() => isBackendActor(appUser), [appUser]);

  const showDealerDataButton = isBackend;

  const filtered = useMemo(() => rows.filter((r) => {
    if (country && r.country !== country) return false;
    if (customerType && (r.customer_type_label || r.customer_type) !== customerType) return false;
    if (seller && !sellerInitialsMatch(r.assigned_seller_initials, seller)) return false;
    if (unassignedOnly && r.assigned_seller_initials) return false;
    if (structureFilter === "main" && !(r.is_main_account || (!r.parent_account_number && rows.some((x) => x.parent_account_number === r.account_number)))) return false;
    if (structureFilter === "branch" && !r.parent_account_number) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = `${r.company_name} ${r.account_number} ${r.city ?? ""} ${r.email ?? ""} ${r.branch_name ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  }), [rows, country, customerType, seller, unassignedOnly, structureFilter, q]);

  // Successor index across the full row set (independent of filters), so we
  // can hide absorbed predecessors from top-level groups and render them as
  // sub-rows under their active successor.
  const { predecessorsByActiveId, absorbedIds } = useMemo(
    () => buildSuccessorIndex(rows),
    [rows],
  );
  const groups = useMemo(
    () => groupDealersByParent(filtered.filter((r) => !absorbedIds.has(r.id))),
    [filtered, absorbedIds],
  );
  const dealersByAcct = useMemo(() => {
    const m = new Map<string, DealerAccount>();
    for (const r of rows) m.set(r.account_number, r);
    return m;
  }, [rows]);
  const allMainsForPicker = useMemo(
    () => rows.filter((r) => !r.is_deleted).sort((a, b) => a.company_name.localeCompare(b.company_name, "da")),
    [rows],
  );

  // Aggregated stats over the currently filtered dealer rows. Follows the
  // seller filter automatically because `filtered` already does.
  const totals = useMemo(() => {
    const userIds = new Set<string>();
    let quotes = 0, orders = 0;
    let last: string | null = null;
    for (const r of filtered) {
      const s = stats[r.id];
      if (!s) continue;
      for (const uid of s.user_ids) userIds.add(uid);
      quotes += s.quote_count;
      orders += s.order_count;
      if (s.last_activity_at && (!last || s.last_activity_at > last)) last = s.last_activity_at;
    }
    return { dealers: filtered.length, users: userIds.size, quotes, orders, last };
  }, [filtered, stats]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!isBackend) return <Navigate to="/portal/backend" replace />;

  const countries = Array.from(new Set(rows.map((r) => r.country).filter(Boolean))).sort() as string[];
  const customerTypes = Array.from(
    new Set(rows.map((r) => r.customer_type_label || r.customer_type).filter(Boolean)),
  ).sort() as string[];
  const sellerInitials = Array.from(
    new Map(
      rows
        .map((r) => r.assigned_seller_initials)
        .filter((v): v is string => !!v)
        .map((v) => [normalizeSellerInitials(v), v]),
    ).values(),
  ).sort();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-12 py-10 flex-grow w-full">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Building2 className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Forhandlere</h1>
              <p className="text-slate-500 mt-1 text-sm">Dealer accounts — kilden til forhandler/kontodata.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
              <Plus className="h-3.5 w-3.5" /> Opret forhandler
            </button>
            <Link to="/portal/backend/dealer-import"
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
              <Upload className="h-3.5 w-3.5" /> Importér fra ERP (CSV)
            </Link>
            <button type="button" onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" /> Importér CSV (legacy)
            </button>
            <button type="button" onClick={() => void reload()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <RotateCcw className="h-3.5 w-3.5" /> Genindlæs
            </button>
          </div>
        </div>

        <SharePointSyncPanel />
        <GeocodeDealersPanel />
        <DealerProfileImportPanel dealers={rows} onReload={() => reload()} />





        {authChecked && !hasSupabaseSession && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900 flex items-start gap-3">
            <Lock className="h-5 w-5 mt-0.5 text-rose-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Supabase-login påkrævet</p>
              <p className="mt-1 text-rose-800">
                Partnerdata er beskyttet af Row Level Security og kan kun læses af godkendte
                Timan Backend brugere. Du har en lokal session, men ingen aktiv Supabase Auth session.
                Log ind igen med din email og adgangskode for at se data.
              </p>
              <button
                type="button"
                onClick={async () => { await logout(); navigate("/configurator", { replace: true }); }}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
              >
                Log ind igen
              </button>
            </div>
          </div>
        )}

        {(loadError || saveError) && hasSupabaseSession && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {loadError && <div className="font-mono whitespace-pre-wrap break-words">{loadError}</div>}
            {saveError && <div className="mt-1 font-mono whitespace-pre-wrap break-words">{saveError}</div>}
            <div className="mt-2 text-[11px] text-amber-700">
              Se browser-konsollen for fuldt fejlobjekt (message · code · details · hint).
            </div>
          </div>
        )}

        {authDiag && hasSupabaseSession && !authDiag.is_backend && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <p className="font-semibold">Adgang nægtet — du genkendes ikke som Timan Backend bruger.</p>
            <ul className="mt-2 space-y-0.5 text-xs font-mono">
              <li>session: {String(authDiag.has_session)}</li>
              <li>jwt_email: {authDiag.jwt_email || "—"}</li>
              <li>jwt_uid: {authDiag.jwt_uid || "—"}</li>
              <li>matched_app_user: {String(authDiag.matched_app_user)}</li>
              <li>app_user_email: {authDiag.app_user_email || "—"}</li>
              <li>app_user_role: {authDiag.app_user_role || "—"}</li>
              <li>is_active: {String(authDiag.is_active)}</li>
              <li>approved: {String(authDiag.approved)}</li>
              <li>is_backend: {String(authDiag.is_backend)}</li>
            </ul>
            <p className="mt-2 text-xs">
              Sørg for at <code>app_users</code>-rækken har <code>portal_role = 'timan_backend'</code>,
              <code> is_active = true</code>, <code>approved = true</code>, og at email matcher den, du logger ind med.
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-5 gap-3 bg-white border border-slate-200 rounded-xl p-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Søg på navn, kontonr, by, email…"
              className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm" />
          </div>
          <select value={country} onChange={(e) => setCountry(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Alle lande</option>
            {countries.map((c) => <option key={c} value={c}>{formatCountryFn(c, lang)}</option>)}
          </select>
          <select value={customerType} onChange={(e) => setCustomerType(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Alle kundetyper</option>
            {customerTypes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={seller} onChange={(e) => setSeller(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">Alle sælgere</option>
            {sellerInitials.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={structureFilter} onChange={(e) => setStructureFilter(e.target.value as "all" | "main" | "branch")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="all">Alle (hoved + filialer)</option>
            <option value="main">Kun hovedforhandlere</option>
            <option value="branch">Kun filialer</option>
          </select>
          <label className="md:col-span-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} className="h-4 w-4" />
            Vis kun forhandlere uden tildelt sælger
          </label>
          <label className="md:col-span-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} className="h-4 w-4" />
            Vis slettede forhandlere
          </label>
        </div>

        {/* Aggregated stats — follows the seller / country / type / search filter */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <StatCard label="Forhandlere" value={totals.dealers} />
          <StatCard label="Tilknyttede brugere" value={totals.users} />
          <StatCard label="Tilbud" value={totals.quotes} />
          <StatCard label="Ordrer" value={totals.orders} />
          <StatCard label="Sidste aktivitet" value={fmtDate(totals.last)} />
        </div>

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <Th>{""}</Th>
                <Th>Firmanavn</Th>
                <Th>Kontonr</Th>
                <Th>Kundetype</Th>
                <Th>Land</Th>
                <Th>Tildelt sælger</Th>
                <Th>Brugere</Th>
                <Th>Tilbud</Th>
                <Th>Ordrer</Th>
                <Th>Sidste aktivitet</Th>
                <Th>Handlinger</Th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Decide which entries to render. When filtering by "branch"
                // we render branches flat (no grouping). Otherwise we render
                // mains and let the user expand to see branches.
                if (structureFilter === "branch") {
                  return filtered.map((r) => renderDealerRow({
                    r, depth: 0,
                    stats, allUsers, expanded, setExpanded,
                    busyId, setBusyId, setSaveError, setEditing, setConfirmDelete,
                    appUserEmail: appUser?.email ?? null, reload,
                    dealersByAcct,
                    showDealerData: showDealerDataButton,
                    formatCountry,
                  }));
                }
                return groups.map((g) => {
                  const predecessors = predecessorsByActiveId.get(g.main.id) ?? [];
                  const hasBranches = g.branches.length > 0;
                  const hasPredecessors = predecessors.length > 0;
                  const expandable = hasBranches || hasPredecessors;
                  const isGroupOpen = groupExpanded.has(g.main.id);
                  const agg = aggregateGroupStats(g, stats);
                  return (
                    <React.Fragment key={g.main.id}>
                      {renderDealerRow({
                        r: g.main, depth: 0,
                        stats, allUsers, expanded, setExpanded,
                        busyId, setBusyId, setSaveError, setEditing, setConfirmDelete,
                        appUserEmail: appUser?.email ?? null, reload,
                        dealersByAcct,
                        isMainGroup: hasBranches || g.main.is_main_account,
                        branchCount: g.branches.length,
                        successorCount: predecessors.length,
                        groupOpen: isGroupOpen,
                        onToggleGroup: expandable ? () => setGroupExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.main.id)) next.delete(g.main.id); else next.add(g.main.id);
                          return next;
                        }) : undefined,
                        groupAgg: hasBranches ? agg : undefined,
                        showDealerData: showDealerDataButton,
                        formatCountry,
                      })}
                      {isGroupOpen && hasBranches && g.branches.map((b) => renderDealerRow({
                        r: b, depth: 1,
                        stats, allUsers, expanded, setExpanded,
                        busyId, setBusyId, setSaveError, setEditing, setConfirmDelete,
                        appUserEmail: appUser?.email ?? null, reload,
                        dealersByAcct,
                        showDealerData: showDealerDataButton,
                        formatCountry,
                      }))}
                      {isGroupOpen && hasPredecessors && predecessors.map((p) => renderDealerRow({
                        r: p, depth: 1, variant: "successor",
                        stats, allUsers, expanded, setExpanded,
                        busyId, setBusyId, setSaveError, setEditing, setConfirmDelete,
                        appUserEmail: appUser?.email ?? null, reload,
                        dealersByAcct,
                        showDealerData: showDealerDataButton,
                        formatCountry,
                      }))}
                    </React.Fragment>
                  );
                });
              })()}
              {filtered.length === 0 && !loadingRows && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-sm text-slate-500">Ingen forhandlere fundet.</td></tr>
              )}
              {loadingRows && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-sm text-slate-500">Henter forhandlere…</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Kilde: Supabase <code>public.dealer_accounts</code>. Viser {filtered.length} af {rows.length} forhandlere.
        </p>
      </main>

      <PortalFooter language={lang} />

      {editing && (
        <EditDealerModal
          dealer={editing}
          sellers={sellers}
          allDealers={allMainsForPicker}
          dealersByAcct={dealersByAcct}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reload(); }}
          onError={(msg) => setSaveError(msg)}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDealerModal
          dealer={confirmDelete}
          linkedUserCount={stats[confirmDelete.id]?.user_count ?? 0}
          onClose={() => setConfirmDelete(null)}
          onConfirm={async () => {
            setSaveError(null);
            const res = await softDeleteDealer(confirmDelete.id, appUser?.email ?? null);
            if (!res.ok) { setSaveError(res.error ?? "Kunne ikke slette."); return; }
            setConfirmDelete(null);
            await reload();
          }}
        />
      )}

      {showCreate && (
        <CreateDealerModal
          sellers={sellers}
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await reload(); }}
          onError={(msg) => setSaveError(msg)}
        />
      )}

      {showImport && (
        <ImportCsvModal
          existing={rows}
          onClose={() => setShowImport(false)}
          onDone={async () => { setShowImport(false); await reload(); }}
          onError={(msg) => setSaveError(msg)}
        />
      )}
    </div>
  );
}

function ConfirmDeleteDealerModal({
  dealer, linkedUserCount, onClose, onConfirm,
}: {
  dealer: DealerAccount;
  linkedUserCount: number;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const ok = text.trim().toUpperCase() === "DELETE" || text.trim().toUpperCase() === "SLET";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full">
        <div className="flex items-start gap-3 border-b border-slate-200 px-6 py-4">
          <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-900">Slet forhandler</h2>
            <p className="text-xs text-slate-500 mt-0.5">{dealer.company_name} · {dealer.account_number}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-slate-700">
            Are you sure you want to delete this dealer account? This will hide
            the dealer from the portal and may affect <strong>{linkedUserCount}</strong> linked
            user{linkedUserCount === 1 ? "" : "s"}. Normally you should <strong>block</strong>
            {" "}the dealer instead.
          </p>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            Soft delete only — data is preserved and can be restored from the
            "Vis slettede" filter.
          </div>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
              Skriv <code className="bg-slate-100 px-1 rounded">DELETE</code> eller <code className="bg-slate-100 px-1 rounded">SLET</code> for at bekræfte
            </span>
            <input value={text} onChange={(e) => setText(e.target.value)} autoFocus
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm uppercase tracking-wider" />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Annuller</button>
          <button
            onClick={() => { if (ok) void onConfirm(); }}
            disabled={!ok}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed">
            Slet forhandler
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
}


// ============================================================
// Render one dealer row (used both for main accounts and branches)
// ============================================================
type RenderRowOpts = {
  r: DealerAccount;
  depth: 0 | 1;
  stats: Record<string, DealerAccountStats>;
  allUsers: BackendUser[];
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  busyId: string | null;
  setBusyId: React.Dispatch<React.SetStateAction<string | null>>;
  setSaveError: React.Dispatch<React.SetStateAction<string | null>>;
  setEditing: React.Dispatch<React.SetStateAction<DealerAccount | null>>;
  setConfirmDelete: React.Dispatch<React.SetStateAction<DealerAccount | null>>;
  appUserEmail: string | null;
  reload: () => Promise<void>;
  dealersByAcct: Map<string, DealerAccount>;
  isMainGroup?: boolean;
  branchCount?: number;
  successorCount?: number;
  variant?: "branch" | "successor";
  groupOpen?: boolean;
  onToggleGroup?: () => void;
  groupAgg?: { user_count: number; quote_count: number; order_count: number; last_activity_at: string | null };
  showDealerData?: boolean;
  formatCountry?: (v: string | null | undefined) => string;
};

function renderDealerRow(opts: RenderRowOpts): React.ReactNode {
  const {
    r, depth, stats, allUsers, expanded, setExpanded, busyId, setBusyId,
    setSaveError, setEditing, setConfirmDelete, appUserEmail, reload,
    dealersByAcct, isMainGroup, branchCount, successorCount, variant,
    groupOpen, onToggleGroup, groupAgg, showDealerData, formatCountry,
  } = opts;
  const fmtCountry = formatCountry ?? ((v: string | null | undefined) => v ?? "");
  const s = stats[r.id];
  const userCount = s?.user_count ?? 0;
  const isOpen = expanded.has(r.id);
  const linkedUsers = s?.user_ids
    ? allUsers.filter((u) => s.user_ids.includes(u.id))
    : allUsers.filter((u) => u.dealer_number === r.account_number);
  const eff = resolveEffectiveSeller(r, dealersByAcct);
  const isBranch = depth === 1 || !!r.parent_account_number;

  return (
    <React.Fragment key={r.id}>
      <tr className={`border-t border-slate-100 hover:bg-slate-50/60 ${r.is_deleted ? "bg-rose-50/40" : r.is_blocked ? "bg-amber-50/40" : ""} ${isBranch ? "bg-slate-50/30" : ""}`}>
        <Td>
          <div className="flex items-center gap-1">
            {onToggleGroup && (
              <button type="button" aria-label={groupOpen ? "Skjul filialer" : "Vis filialer"}
                onClick={onToggleGroup}
                className="rounded-md p-1 text-indigo-700 hover:bg-indigo-50">
                {groupOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              aria-label={isOpen ? "Skjul brugere" : "Vis brugere"}
              onClick={() => setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                return next;
              })}
              className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
            >
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </Td>
        <Td className={`font-semibold ${(r.is_blocked || r.is_deleted) ? "text-rose-700" : "text-slate-900"}`}>
          <span className={`inline-flex items-center gap-2 ${depth === 1 ? "pl-6" : ""}`}>
            {isBranch && <GitBranch className="h-3.5 w-3.5 text-slate-400" />}
            {!isBranch && isMainGroup && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />}
            <span>
              {r.company_name}
              {r.branch_name && <span className="ml-1 text-xs font-normal text-slate-500">— {r.branch_name}</span>}
            </span>
            {!isBranch && isMainGroup && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                Hoved {branchCount ? `(${branchCount})` : ""}
              </span>
            )}
            {!isBranch && successorCount ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800"
                title="Tidligere forhandlere overtaget af denne"
              >
                Overtaget ({successorCount})
              </span>
            ) : null}
            {isBranch && variant !== "successor" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                Filial
              </span>
            )}
            {variant === "successor" && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800"
                title="Overtaget af aktiv efterfølger — historik bevares på denne konto"
              >
                Overtaget
              </span>
            )}
            {r.is_blocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                <Ban className="h-3 w-3" /> Spærret
              </span>
            )}
            {r.is_deleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                <Trash2 className="h-3 w-3" /> Slettet
              </span>
            )}
            {r.successor_dealer_id && (() => {
              const succ = r.successor_dealer_account_number
                ? dealersByAcct.get(r.successor_dealer_account_number)
                : undefined;
              const label = succ?.company_name ?? r.successor_dealer_account_number ?? "Efterfølger";
              return (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800"
                  title={`Efterfølger: ${label}${succ?.account_number ? ` (${succ.account_number})` : ""}`}
                >
                  → {label}
                </span>
              );
            })()}
          </span>
        </Td>
        <Td>{r.account_number}</Td>
        <Td>{r.customer_type_label || r.customer_type || "—"}</Td>
        <Td>{fmtCountry(r.country) || "—"}</Td>
        <Td>
          {eff.initials
            ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-[10px] font-bold">{eff.initials}</span>
                {eff.name}
                {eff.inherited && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600" title="Arvet fra hovedforhandler">Arvet</span>
                )}
              </span>
            )
            : <span className="text-rose-600 text-xs font-semibold">Ikke tildelt</span>}
        </Td>
        <Td>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${userCount > 0 || linkedUsers.length > 0 ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-500"}`}>
            {Math.max(userCount, linkedUsers.length)}
          </span>
          {groupAgg && (
            <span className="ml-1 text-[10px] text-amber-700" title="Inkl. filialer">
              (Σ {groupAgg.user_count})
            </span>
          )}
        </Td>
        <Td className="text-slate-700">
          {s?.quote_count ?? 0}
          {groupAgg && <span className="ml-1 text-[10px] text-amber-700">(Σ {groupAgg.quote_count})</span>}
        </Td>
        <Td className="text-slate-700">
          {s?.order_count ?? 0}
          {groupAgg && <span className="ml-1 text-[10px] text-amber-700">(Σ {groupAgg.order_count})</span>}
        </Td>
        <Td className="text-slate-500 text-xs whitespace-nowrap">{fmtDate((groupAgg?.last_activity_at ?? s?.last_activity_at) ?? null)}</Td>
        <Td>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => setEditing(r)}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
              <Pencil className="h-3 w-3" /> Rediger
            </button>
            {showDealerData && (
              <Link
                to={`/portal/dealer-data?accountNumber=${encodeURIComponent(r.account_number)}`}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <FileText className="h-3 w-3" /> Partnerdata
              </Link>
            )}
            {r.is_deleted ? (
              <button type="button" disabled={busyId === r.id}
                onClick={async () => {
                  setBusyId(r.id); setSaveError(null);
                  const res = await restoreDealer(r.id);
                  setBusyId(null);
                  if (!res.ok) { setSaveError(res.error ?? "Kunne ikke gendanne."); return; }
                  await reload();
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <RotateCcw className="h-3 w-3" /> Gendan
              </button>
            ) : (
              <>
                <button type="button" disabled={busyId === r.id}
                  onClick={async () => {
                    setBusyId(r.id); setSaveError(null);
                    const res = await setDealerBlocked(r.id, !r.is_blocked, appUserEmail);
                    setBusyId(null);
                    if (!res.ok) { setSaveError(res.error ?? "Kunne ikke opdatere."); return; }
                    await reload();
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold disabled:opacity-50 ${r.is_blocked ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-amber-500 text-white hover:bg-amber-600"}`}>
                  {r.is_blocked ? (<><CheckCircle2 className="h-3 w-3" /> Ophæv</>) : (<><Ban className="h-3 w-3" /> Spær</>)}
                </button>
                <button type="button" onClick={() => setConfirmDelete(r)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50">
                  <Trash2 className="h-3 w-3" /> Slet
                </button>
              </>
            )}
          </div>
        </Td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/60">
          <td colSpan={11} className="px-6 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Firmaadresse (SharePoint masterdata)
                </p>
                <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <dt className="text-slate-500">Adresse 1</dt>
                  <dd className="text-slate-800">{r.address_line_1 || "—"}</dd>
                  <dt className="text-slate-500">Adresse 2</dt>
                  <dd className="text-slate-800">{r.address_line_2 || "—"}</dd>
                  <dt className="text-slate-500">Postnummer</dt>
                  <dd className="text-slate-800">{r.postal_code || "—"}</dd>
                  <dt className="text-slate-500">By</dt>
                  <dd className="text-slate-800">{r.city || "—"}</dd>
                  <dt className="text-slate-500">Land</dt>
                  <dd className="text-slate-800">{fmtCountry(r.country) || "—"}</dd>
                  {r.zip_city_raw && (
                    <>
                      <dt className="text-slate-500">Postnr./By råtekst</dt>
                      <dd className="text-slate-500 font-mono">{r.zip_city_raw}</dd>
                    </>
                  )}
                </dl>
                {showDealerData && (
                  <div className="mt-2">
                    <Link
                      to={`/portal/dealer-data?accountNumber=${encodeURIComponent(r.account_number)}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-1.5 text-[11px] font-bold hover:bg-emerald-100"
                    >
                      <FileText className="h-3 w-3" /> Åbn Partnerdata
                    </Link>
                  </div>
                )}
              </div>
              <div>
                {linkedUsers.length > 0 ? (
                  <>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                      {linkedUsers.length} bruger{linkedUsers.length === 1 ? "" : "e"} tilknyttet
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {linkedUsers.map((u) => (
                        <Link
                          key={u.id}
                          to="/portal/backend/users"
                          className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs hover:border-slate-400"
                        >
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-[10px] font-bold">{u.initials}</span>
                            <div>
                              <div className="font-semibold text-slate-900">{u.name}</div>
                              <div className="text-slate-500">{u.email}</div>
                            </div>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {u.approved ? "Approved" : "Pending"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 italic">Ingen brugere tilknyttet.</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </React.Fragment>
  );
}

// ============================================================
// EditDealerModal — seller + parent/main/branch_name
// ============================================================
function EditDealerModal({
  dealer, sellers, allDealers, dealersByAcct, onClose, onSaved, onError,
}: {
  dealer: DealerAccount;
  sellers: BackendUser[];
  allDealers: DealerAccount[];
  dealersByAcct: Map<string, DealerAccount>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [initials, setInitials] = useState(dealer.assigned_seller_initials ?? "");
  const [name, setName] = useState(dealer.assigned_seller_name ?? "");
  const [email, setEmail] = useState(dealer.assigned_seller_email ?? "");
  const [sellerId, setSellerId] = useState(dealer.assigned_seller_id ?? "");
  const [companyName, setCompanyName] = useState<string>(dealer.company_name ?? "");
  const [dealerCustomerType, setDealerCustomerType] = useState<string>(
    dealer.customer_type_label ?? dealer.customer_type ?? "",
  );
  const [parent, setParent] = useState<string>(dealer.parent_account_number ?? "");
  const [isMain, setIsMain] = useState<boolean>(dealer.is_main_account);
  const [branchName, setBranchName] = useState<string>(dealer.branch_name ?? "");
  // Successor / efterfølger-forhandler (Phase 60). Kun aktiv hvis dealer er spærret/lukket.
  const [successorId, setSuccessorId] = useState<string>(dealer.successor_dealer_id ?? "");
  const [closedReason, setClosedReason] = useState<string>(dealer.closed_reason ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clearedDirect, setClearedDirect] = useState(false);

  function applySeller(id: string) {
    if (!id) { setSellerId(""); setInitials(""); setName(""); setEmail(""); return; }
    const s = sellers.find((u) => u.id === id);
    if (!s) return;
    setSellerId(s.id); setInitials(s.initials); setName(s.name); setEmail(s.email);
  }
  const matched = sellers.find((s) =>
    (sellerId && s.id === sellerId) ||
    (!sellerId && email && s.email.toLowerCase() === email.toLowerCase()) ||
    (!sellerId && !email && initials && s.initials.toUpperCase() === initials.toUpperCase())
  );
  const eligibleParents = allDealers.filter((d) =>
    d.account_number !== dealer.account_number &&
    d.parent_account_number !== dealer.account_number, // avoid obvious 2-cycle
  );
  const inheritedSeller = !initials && parent
    ? resolveEffectiveSeller({ ...dealer, parent_account_number: parent, assigned_seller_initials: null, assigned_seller_email: null, assigned_seller_name: null }, dealersByAcct)
    : null;
  const customerTypeOptions = useMemo(() => {
    const current = dealerCustomerType.trim();
    const options: Array<{ value: string; label: string }> = DEALER_TYPE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label }));
    if (current && !options.some((o) => o.value === current)) {
      options.push({ value: current, label: current });
    }
    return options;
  }, [dealerCustomerType]);

  async function save() {
    setErr(null); setBusy(true);
    try {
      // 1. Seller (always written so explicit clears persist as NULLs)
      const sellerRes = await updateDealerSeller(dealer.id, {
        assigned_seller_id: sellerId || null,
        assigned_seller_initials: initials.trim() || null,
        assigned_seller_name: name.trim() || null,
        assigned_seller_email: email.trim() || null,
      });
      if (!sellerRes.ok) throw new Error(sellerRes.error ?? "Kunne ikke gemme sælger");

      // 2. Company name (dealer/branch display name)
      const newCompany = companyName.trim();
      if (!newCompany) throw new Error("Forhandlernavn må ikke være tomt");
      if (newCompany !== (dealer.company_name ?? "")) {
        const r = await updateDealerAccount(dealer.id, { company_name: newCompany });
        if (!r.ok) throw new Error(r.error ?? "Kunne ikke gemme forhandlernavn");
      }

      // 3. Customer type
      const nextCustomerType = dealerCustomerType.trim();
      const currentCustomerType = (dealer.customer_type_label ?? dealer.customer_type ?? "").trim();
      if (nextCustomerType !== currentCustomerType) {
        const r = await updateDealerAccount(dealer.id, {
          dealer_type: dealerTypeFromCustomerType(nextCustomerType),
          customer_type: nextCustomerType || null,
          customer_type_label: nextCustomerType || null,
        });
        if (!r.ok) throw new Error(r.error ?? "Kunne ikke gemme kundetype");
      }

      // 4. Branch name
      if ((dealer.branch_name ?? "") !== branchName) {
        const r = await updateDealerBranchName(dealer.id, branchName.trim() || null);
        if (!r.ok) throw new Error(r.error ?? "Kunne ikke gemme branch_name");
      }

      // 4. Main flag
      if (dealer.is_main_account !== isMain) {
        const r = await setDealerMain(dealer.account_number, isMain);
        if (!r.ok) throw new Error(r.error ?? "Kunne ikke opdatere hovedstatus");
      }

      // 5. Parent
      const newParent = parent.trim() || null;
      if ((dealer.parent_account_number ?? null) !== newParent) {
        const r = await setDealerParent(dealer.account_number, newParent, true);
        if (!r.ok) throw new Error(r.error ?? "Kunne ikke opdatere hovedforhandler");
      }

      // 6. Successor / efterfølger (kun relevant når dealer er spærret/lukket).
      const currentSuccId = dealer.successor_dealer_id ?? "";
      const currentReason = dealer.closed_reason ?? "";
      const trimmedReason = closedReason.trim();
      if (currentSuccId !== successorId || currentReason !== trimmedReason) {
        const succ = successorId ? allDealers.find((d) => d.id === successorId) : null;
        const r = await setDealerSuccessor(dealer.id, {
          successorDealerId: successorId || null,
          successorDealerAccountNumber: succ?.account_number ?? null,
          closedReason: trimmedReason || null,
        });
        if (!r.ok) throw new Error(r.error ?? "Kunne ikke gemme efterfølger");
      }
      await onSaved();
    } catch (e) {
      const msg = readableError(e);
      setErr(msg); onError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-xl w-full my-8">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Rediger partner</h2>
            <p className="text-xs text-slate-500">{dealer.company_name} · {dealer.account_number}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 font-mono whitespace-pre-wrap">{err}</div>}
          {dealer.is_deleted && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              <strong>Slettet</strong> — denne forhandler er soft-deleted.
            </div>
          )}
          {dealer.is_blocked && !dealer.is_deleted && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Spærret</strong> — linkede brugere kan ikke logge på portalen.
            </div>
          )}

          {/* Status-badge + efterfølger-panel (Phase 60) */}
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wide text-slate-600">Status</span>
              {dealer.is_deleted ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800">
                  <Trash2 className="h-3 w-3" /> Lukket
                </span>
              ) : dealer.is_blocked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                  <Ban className="h-3 w-3" /> Spærret
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> Aktiv
                </span>
              )}
              {dealer.closed_at && (
                <span className="text-[11px] text-slate-500">siden {fmtDate(dealer.closed_at)}</span>
              )}
            </div>

            {isDealerInactive(dealer) ? (
              <>
                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
                    Efterfølger-forhandler (overtager ansvar fremadrettet)
                  </span>
                  <select
                    value={successorId}
                    onChange={(e) => setSuccessorId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">— ingen efterfølger —</option>
                    {allDealers
                      .filter((d) => d.id !== dealer.id && !d.is_deleted && !d.is_blocked)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.account_number} · {d.company_name}
                        </option>
                      ))}
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Historiske data på denne forhandler flyttes ikke. Warranty/service/CRM-forslag peger fremadrettet på efterfølgeren — kun efter manuel godkendelse.
                  </p>
                </label>
                {successorId && (() => {
                  const succ = allDealers.find((d) => d.id === successorId);
                  if (!succ) return null;
                  return (
                    <div className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[11px] text-indigo-900 flex items-center gap-2">
                      <GitBranch className="h-3.5 w-3.5" />
                      <span>
                        Forpligtelser overtages af{" "}
                        <Link
                          to={`/portal/crm/my-dealers/${encodeURIComponent(succ.account_number)}`}
                          className="font-bold underline"
                          onClick={onClose}
                        >
                          {succ.company_name} ({succ.account_number})
                        </Link>
                      </span>
                    </div>
                  );
                })()}
                <label className="block">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">
                    Lukkeårsag
                  </span>
                  <textarea
                    value={closedReason}
                    onChange={(e) => setClosedReason(e.target.value)}
                    rows={2}
                    placeholder="fx Overtaget af Reesink pr. juni 2026"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </>
            ) : (
              <p className="text-[11px] text-slate-500">
                Efterfølger kan først vælges når forhandleren er spærret eller lukket.
              </p>
            )}
          </div>

          {/* Dealer / branch display name */}
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Forhandlernavn</span>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              placeholder="fx Foras GmbH Schleswig"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            <p className="mt-1 text-[10px] text-slate-500">
              Vises i forhandlerlister, CRM, leads og tilbud. Forhandler-id ({dealer.account_number}) ændres ikke.
            </p>
          </label>

          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Kundetype</span>
            <select
              value={dealerCustomerType}
              onChange={(e) => setDealerCustomerType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">— ingen kundetype —</option>
              {customerTypeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-slate-500">
              Vises i kolonnen Kundetype og bruges til filtrering, kort og forhandlerdata.
            </p>
          </label>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
              <Network className="h-3.5 w-3.5" /> Forhandlerstruktur
            </div>
            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">Hovedforhandler (parent)</span>
              <select value={parent} onChange={(e) => setParent(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="">— ingen (selvstændig / hoved) —</option>
                {eligibleParents.map((d) => (
                  <option key={d.id} value={d.account_number}>
                    {d.account_number} · {d.company_name}{d.is_main_account ? " ★" : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-500">
                Vælg en anden forhandler som denne filial hører under. Vælg "ingen" for at gøre den selvstændig.
              </p>
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">Filialnavn (valgfri)</span>
              <input value={branchName} onChange={(e) => setBranchName(e.target.value)}
                placeholder="fx Hovedkontor, Nordjylland, Aarhus afd."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={isMain} onChange={(e) => setIsMain(e.target.checked)} className="h-4 w-4" />
              Markér som hovedforhandler (samler statistik for filialer)
            </label>
            {inheritedSeller && inheritedSeller.initials && (
              <p className="text-[11px] text-indigo-700">
                Hvis ingen sælger sættes, arves sælger fra hoved: <strong>{inheritedSeller.initials} · {inheritedSeller.name}</strong>
              </p>
            )}
          </div>

          {/* Seller */}
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Tildelt sælger</span>
            <select value={matched?.id ?? ""} onChange={(e) => applySeller(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">— vælg fra Timan brugere (eller arv fra hoved) —</option>
              {sellers.map((s) => <option key={s.id} value={s.id}>{s.initials} · {s.name} ({s.email})</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block col-span-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Initialer</span>
              <input value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 4))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="block col-span-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Navn</span>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button type="button"
            onClick={() => { setInitials(""); setName(""); setEmail(""); setClearedDirect(true); }}
            className="text-xs font-semibold text-rose-600 hover:underline">
            Fjern direkte tildeling (arv fra hoved)
          </button>
          {clearedDirect && !initials && !email && (
            <p className="text-[11px] text-amber-700">
              Direkte sælgertildeling fjernes ved <strong>Gem ændringer</strong>. Filialen vil herefter arve sælger fra hovedforhandleren.
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Annuller</button>
          <button onClick={() => void save()} disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
            {busy ? "Gemmer…" : "Gem ændringer"}
          </button>
        </div>
      </div>
    </div>
  );
}


function EditSellerModal({
  dealer, sellers, onClose, onSave,
}: {
  dealer: DealerAccount;
  sellers: BackendUser[];
  onClose: () => void;
  onSave: (patch: { assigned_seller_initials: string | null; assigned_seller_name: string | null; assigned_seller_email: string | null }) => void;
}) {
  const [initials, setInitials] = useState(dealer.assigned_seller_initials ?? "");
  const [name, setName] = useState(dealer.assigned_seller_name ?? "");
  const [email, setEmail] = useState(dealer.assigned_seller_email ?? "");

  function applySeller(id: string) {
    if (!id) { setInitials(""); setName(""); setEmail(""); return; }
    const s = sellers.find((u) => u.id === id);
    if (!s) return;
    setInitials(s.initials); setName(s.name); setEmail(s.email);
  }

  const matched = sellers.find((s) => s.email.toLowerCase() === email.toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Tildel sælger</h2>
            <p className="text-xs text-slate-500">{dealer.company_name} · {dealer.account_number}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {dealer.is_deleted && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              <strong>Slettet</strong> — denne forhandler er soft-deleted{dealer.deleted_at ? ` ${fmtDate(dealer.deleted_at)}` : ""}{dealer.deleted_by ? ` af ${dealer.deleted_by}` : ""}. Linkede brugere kan ikke logge på portalen.
            </div>
          )}
          {dealer.is_blocked && !dealer.is_deleted && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <strong>Spærret</strong> — denne forhandler er blokeret{dealer.blocked_at ? ` ${fmtDate(dealer.blocked_at)}` : ""}{dealer.blocked_by ? ` af ${dealer.blocked_by}` : ""}. Linkede brugere kan ikke logge på portalen.
            </div>
          )}
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Vælg sælger</span>
            <select value={matched?.id ?? ""} onChange={(e) => applySeller(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">— vælg fra Timan brugere —</option>
              {sellers.map((s) => <option key={s.id} value={s.id}>{s.initials} · {s.name} ({s.email})</option>)}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block col-span-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Initialer</span>
              <input value={initials} onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 4))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="block col-span-2">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Navn</span>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button type="button"
            onClick={() => { setInitials(""); setName(""); setEmail(""); }}
            className="text-xs font-semibold text-rose-600 hover:underline">
            Fjern tildeling
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Annuller</button>
          <button
            onClick={() => onSave({
              assigned_seller_initials: initials.trim() || null,
              assigned_seller_name: name.trim() || null,
              assigned_seller_email: email.trim() || null,
            })}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
            Gem
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Create Dealer Modal ----------------

function CreateDealerModal({
  sellers, onClose, onCreated, onError,
}: {
  sellers: BackendUser[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [d, setD] = useState({
    company_name: "",
    account_number: "",
    customer_type: "Forhandler",
    country: "",
    address: "",
    city: "",
    postal_code: "",
    email: "",
    phone: "",
    seller_id: sellers[0]?.id ?? "",
  });
  const [geo, setGeo] = useState<{ latitude: number | null; longitude: number | null; google_place_id: string | null }>({
    latitude: null, longitude: null, google_place_id: null,
  });
  const seller = sellers.find((s) => s.id === d.seller_id) ?? null;

  function applyResolved(r: ResolvedAddress) {
    setD((prev) => ({
      ...prev,
      address: r.address_line_1 || r.formatted || prev.address,
      postal_code: r.postal_code ?? prev.postal_code,
      city: r.city ?? prev.city,
      country: r.country ?? prev.country,
    }));
    setGeo({ latitude: r.latitude, longitude: r.longitude, google_place_id: r.google_place_id });
  }

  async function submit() {
    setErr(null);
    if (!d.company_name.trim() || !d.account_number.trim()) {
      setErr("Firmanavn og kontonummer er påkrævet.");
      return;
    }
    if (!seller) {
      setErr("Vælg en aktiv Timan-sælger.");
      return;
    }
    setBusy(true);
    const res = await createDealerAccount({
      account_number: d.account_number.trim(),
      company_name: d.company_name.trim(),
      customer_type: d.customer_type,
      country: d.country.trim() || null,
      address: d.address.trim() || null,
      city: d.city.trim() || null,
      postal_code: d.postal_code.trim() || null,
      email: d.email.trim() || null,
      phone: d.phone.trim() || null,
      assigned_seller_id: seller.id,
      assigned_seller_initials: seller.initials,
      assigned_seller_name: seller.name,
      assigned_seller_email: seller.email,
    });
    if (!res.ok) {
      setBusy(false);
      const msg = res.error ?? "Kunne ikke oprette forhandler.";
      setErr(msg); onError(msg);
      return;
    }
    if (res.row) {
      const geoRes = await saveDealerGeocodingForAddress({
        dealerId: res.row.id,
        geo,
        address: {
          address: d.address,
          postal_code: d.postal_code,
          city: d.city,
          country: d.country,
        },
      });
      if (!geoRes.ok) onError(`Forhandleren blev oprettet, men geokodning fejlede: ${geoRes.error}`);
    }
    setBusy(false);
    await onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full my-8">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Opret forhandler</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 font-mono whitespace-pre-wrap">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Firmanavn *"><input value={d.company_name} onChange={(e) => setD({ ...d, company_name: e.target.value })} className={inp} /></Field>
            <Field label="Kontonummer *"><input value={d.account_number} onChange={(e) => setD({ ...d, account_number: e.target.value })} className={inp} /></Field>
            <Field label="Partnertype">
              <select value={d.customer_type} onChange={(e) => setD({ ...d, customer_type: e.target.value })} className={inp}>
                {DEALER_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Land (ISO-2 eller navn)"><input value={d.country} onChange={(e) => { setD({ ...d, country: e.target.value }); setGeo({ latitude: null, longitude: null, google_place_id: null }); }} className={inp} /></Field>
            <Field label="Adresse">
              <AddressAutocomplete
                className={inp}
                value={d.address}
                onChange={(v) => {
                  setD({ ...d, address: v });
                  setGeo({ latitude: null, longitude: null, google_place_id: null });
                }}
                onResolve={applyResolved}
                onGeocodeResolved={applyResolved}
                placeholder="Begynd at skrive adressen…"
                showValidationState
                addressParts={{ address_line_1: d.address, postal_code: d.postal_code, city: d.city, country: d.country }}
              />
            </Field>
            <Field label="By"><input value={d.city} onChange={(e) => { setD({ ...d, city: e.target.value }); setGeo({ latitude: null, longitude: null, google_place_id: null }); }} className={inp} /></Field>
            <Field label="Postnr"><input value={d.postal_code} onChange={(e) => { setD({ ...d, postal_code: e.target.value }); setGeo({ latitude: null, longitude: null, google_place_id: null }); }} className={inp} /></Field>
            <Field label="Email"><input value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} className={inp} /></Field>
            <Field label="Telefon"><input value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} className={inp} /></Field>
            <Field label="Tildelt Timan sælger">
              <select value={d.seller_id} onChange={(e) => setD({ ...d, seller_id: e.target.value })} className={inp}>
                <option value="">— vælg fra aktive Timan-brugere —</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.initials} · {s.name} ({s.email})</option>)}
              </select>
            </Field>
          </div>
          <p className="text-[11px] text-slate-500">
            Sælger: {seller ? <><strong>{seller.initials} · {seller.name}</strong> ({seller.email})</> : <strong>Ikke valgt</strong>}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Annuller</button>
          <button onClick={() => void submit()} disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
            {busy ? "Opretter…" : "Opret forhandler"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inp = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

// ---------------- CSV Import Modal ----------------

function ImportCsvModal({
  existing, onClose, onDone, onError,
}: {
  existing: DealerAccount[];
  onClose: () => void;
  onDone: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const { formatCountry } = useCountryFormatter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvParsedRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErr(null); setPreview(null); setResult(null);
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const { rows } = parseCsv(text);
        const mapped = buildCsvPreview(rows, existing);
        if (mapped.length === 0) { setErr("Ingen gyldige rækker fundet i CSV (mangler kontonummer?)."); return; }
        setPreview(mapped);
      } catch (e) {
        setErr("Kunne ikke parse CSV: " + (e instanceof Error ? e.message : String(e)));
      }
    };
    reader.readAsText(f, "utf-8");
  }

  async function runImport() {
    if (!preview) return;
    setBusy(true); setErr(null);
    const res = await upsertDealerAccountsBulk(preview);
    setBusy(false);
    if (!res.ok || !res.result) {
      const msg = res.error ?? "Import fejlede.";
      setErr(msg); onError(msg);
      return;
    }
    setResult(res.result);
  }

  const willCreate = preview?.filter((r) => !r.willUpdate).length ?? 0;
  const willUpdate = preview?.filter((r) => r.willUpdate).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full my-8 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">Importér forhandlere fra CSV</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-3 overflow-y-auto">
          <div className="text-xs text-slate-600">
            <p>Forventede kolonner (case-insensitive):</p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              <li><code>title</code> / <code>Titel</code> → firmanavn</li>
              <li><code>account</code> / <code>Account</code> → kontonummer (nøgle for upsert)</li>
              <li><code>A_B_Kunde</code> / <code>A_B_KUNDE</code> → 1=Forhandler, 2=Service Partner, 3=Importør</li>
              <li><code>Country</code> / <code>COUNTRY</code> → land (bestemmer sælger)</li>
            </ul>
            <p className="mt-2">Sælger-tildeling: DK→EM · DE/CH/HU/IT/AT→AKR · alle andre→BP.</p>
          </div>

          <input type="file" accept=".csv,text/csv" onChange={onFile}
            className="block text-sm" />
          {fileName && <p className="text-[11px] text-slate-500">Fil: {fileName}</p>}

          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 font-mono whitespace-pre-wrap">{err}</div>}

          {preview && !result && (
            <>
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-indigo-900">
                Forhåndsvisning: <strong>{preview.length}</strong> rækker —
                {" "}<strong>{willCreate}</strong> oprettes,
                {" "}<strong>{willUpdate}</strong> opdateres.
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-80 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">Status</th>
                      <th className="px-2 py-1 text-left">Kontonr</th>
                      <th className="px-2 py-1 text-left">Firma</th>
                      <th className="px-2 py-1 text-left">Type</th>
                      <th className="px-2 py-1 text-left">Land</th>
                      <th className="px-2 py-1 text-left">Sælger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 200).map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1">
                          {r.willUpdate
                            ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Opdater</span>
                            : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Ny</span>}
                        </td>
                        <td className="px-2 py-1 font-mono">{r.account_number}</td>
                        <td className="px-2 py-1">{r.company_name}</td>
                        <td className="px-2 py-1">{r.customer_type ?? "—"}</td>
                        <td className="px-2 py-1">{formatCountry(r.country) || "—"}</td>
                        <td className="px-2 py-1">{r.assigned_seller_initials}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 200 && (
                  <p className="px-2 py-1 text-[11px] text-slate-500">Viser de første 200 af {preview.length} rækker.</p>
                )}
              </div>
            </>
          )}

          {result && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-3 text-sm text-emerald-900">
              <p className="font-bold">Import gennemført</p>
              <ul className="mt-1 text-xs space-y-0.5">
                <li>Oprettet: <strong>{result.created}</strong></li>
                <li>Opdateret: <strong>{result.updated}</strong></li>
                <li>Sprunget over / fejl: <strong>{result.skipped}</strong></li>
              </ul>
              {result.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold">Vis fejl ({result.errors.length})</summary>
                  <ul className="mt-1 text-[11px] font-mono max-h-40 overflow-y-auto">
                    {result.errors.map((e, i) => <li key={i}>{e.account_number ?? "—"}: {e.error}</li>)}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {result ? "Luk" : "Annuller"}
          </button>
          {!result && preview && (
            <button onClick={() => void runImport()} disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">
              {busy ? "Importerer…" : `Bekræft import (${preview.length})`}
            </button>
          )}
          {result && (
            <button onClick={() => void onDone()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
              Færdig & genindlæs
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
