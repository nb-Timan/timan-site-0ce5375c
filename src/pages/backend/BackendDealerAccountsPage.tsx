/**
 * Timan Backend → Forhandlere (Dealer accounts).
 * Route: /portal/backend/dealer-accounts
 * Access: only Timan Backend.
 *
 * Source: public.dealer_accounts (Supabase).
 * Editable fields: assigned_seller_initials / name / email.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Ban, Building2, CheckCircle2, ChevronDown, ChevronRight, Lock, Pencil, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { derivePortalRole, getPortalPermissions } from "@/lib/portalAccess";
import {
  DealerAccount,
  DealerAccountStats,
  fetchDealerAccountStats,
  fetchDealerAccounts,
  restoreDealer,
  setDealerBlocked,
  softDeleteDealer,
  updateDealerSeller,
} from "@/lib/dealerAccountsService";
import { fetchBackendUsers } from "@/lib/backendUsersService";
import { BackendUser } from "@/lib/backend-users-store";
import { supabase } from "@/lib/supabase";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return "—"; }
}

export default function BackendDealerAccountsPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
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
  const [confirmDelete, setConfirmDelete] = useState<DealerAccount | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
      fetchDealerAccounts(),
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
  }, []);

  useEffect(() => {
    if (authChecked && hasSupabaseSession) void reload();
    else if (authChecked) setLoadingRows(false);
  }, [authChecked, hasSupabaseSession, reload]);

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === "slutkunde") return <Navigate to="/configurator" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

  const countries = Array.from(new Set(rows.map((r) => r.country).filter(Boolean))).sort() as string[];
  const customerTypes = Array.from(
    new Set(rows.map((r) => r.customer_type_label || r.customer_type).filter(Boolean)),
  ).sort() as string[];
  const sellerInitials = Array.from(new Set(rows.map((r) => r.assigned_seller_initials).filter(Boolean))).sort() as string[];

  const filtered = rows.filter((r) => {
    if (country && r.country !== country) return false;
    if (customerType && (r.customer_type_label || r.customer_type) !== customerType) return false;
    if (seller && r.assigned_seller_initials !== seller) return false;
    if (unassignedOnly && r.assigned_seller_initials) return false;
    if (q) {
      const needle = q.toLowerCase();
      const hay = `${r.company_name} ${r.account_number} ${r.city ?? ""} ${r.email ?? ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        <Link to="/portal/backend" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage til Timan Backend
        </Link>

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
          <button type="button" onClick={() => void reload()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RotateCcw className="h-3.5 w-3.5" /> Genindlæs
          </button>
        </div>

        {authChecked && !hasSupabaseSession && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900 flex items-start gap-3">
            <Lock className="h-5 w-5 mt-0.5 text-rose-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Supabase-login påkrævet</p>
              <p className="mt-1 text-rose-800">
                Forhandler-data er beskyttet af Row Level Security og kan kun læses af godkendte
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
            {loadError && <div>{loadError}</div>}
            {saveError && <div className="mt-1">{saveError}</div>}
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
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
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
          <label className="md:col-span-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} className="h-4 w-4" />
            Vis kun forhandlere uden tildelt sælger
          </label>
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
              {filtered.map((r) => {
                const s = stats[r.id];
                const userCount = s?.user_count ?? 0;
                const isOpen = expanded.has(r.id);
                const linkedUsers = s?.user_ids
                  ? allUsers.filter((u) => s.user_ids.includes(u.id))
                  : allUsers.filter((u) => u.dealer_number === r.account_number);
                return (
                  <React.Fragment key={r.id}>
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <Td>
                        <button
                          type="button"
                          aria-label={isOpen ? "Skjul brugere" : "Vis brugere"}
                          onClick={() => setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                            return next;
                          })}
                          className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                          disabled={userCount === 0 && linkedUsers.length === 0}
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </Td>
                      <Td className="font-semibold text-slate-900">{r.company_name}</Td>
                      <Td>{r.account_number}</Td>
                      <Td>{r.customer_type_label || r.customer_type || "—"}</Td>
                      <Td>{r.country || "—"}</Td>
                      <Td>
                        {r.assigned_seller_initials
                          ? <span className="inline-flex items-center gap-1.5"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white text-[10px] font-bold">{r.assigned_seller_initials}</span>{r.assigned_seller_name}</span>
                          : <span className="text-rose-600 text-xs font-semibold">Ikke tildelt</span>}
                      </Td>
                      <Td>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${userCount > 0 || linkedUsers.length > 0 ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-500"}`}>
                          {Math.max(userCount, linkedUsers.length)}
                        </span>
                      </Td>
                      <Td className="text-slate-700">{s?.quote_count ?? 0}</Td>
                      <Td className="text-slate-700">{s?.order_count ?? 0}</Td>
                      <Td className="text-slate-500 text-xs whitespace-nowrap">{fmtDate(s?.last_activity_at ?? null)}</Td>
                      <Td>
                        <button type="button" onClick={() => setEditing(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                          <Pencil className="h-3.5 w-3.5" /> Rediger
                        </button>
                      </Td>
                    </tr>
                    {isOpen && linkedUsers.length > 0 && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={11} className="px-6 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                            {linkedUsers.length} bruger{linkedUsers.length === 1 ? "" : "e"} tilknyttet {r.company_name}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
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
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
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
        <EditSellerModal
          dealer={editing}
          sellers={sellers}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            setSaveError(null);
            const res = await updateDealerSeller(editing.id, patch);
            if (!res.ok) { setSaveError(res.error ?? "Kunne ikke gemme."); return; }
            setEditing(null);
            await reload();
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
