/**
 * Seller-facing dealer overview — "Mine forhandlere".
 * Route: /portal/crm/my-dealers
 *
 * Visible to:
 *   • timan_seller (Timan Sælger)
 *   • Backend users in seller mode (derivePortalRole already maps them)
 *
 * Filtering rule:
 *   dealer_accounts.assigned_seller_initials === current user initials
 *   OR dealer_accounts.assigned_seller_email === current user email
 *
 * Filtering happens in fetchDealerAccountStatsForSeller, so seller-mode
 * users only ever receive their own dealers.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Building2, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import CrmLayout from "@/components/crm/CrmLayout";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isScopedSeller } from "@/lib/crmScope";
import { DealerAccountStats, fetchDealerAccountStatsForSeller, fetchDealerAccountStats } from "@/lib/dealerAccountsService";
import { fetchBackendUsers } from "@/lib/backendUsersService";
import { BackendUser } from "@/lib/backend-users-store";
import { Language } from "@/types/configurator";
import { getEffectiveSellerEmail, getEffectiveSellerInitials } from "@/lib/activeMode";

const T: Record<string, Record<Language, string>> = {
  title:        { da: "Mine forhandlere", en: "My dealers", de: "Meine Händler", it: "I miei rivenditori", hu: "Kereskedőim" },
  subtitle:     { da: "Forhandlere tildelt dig som Timan sælger.", en: "Dealers assigned to you as Timan seller.", de: "Ihnen zugewiesene Händler.", it: "Rivenditori assegnati a te.", hu: "Hozzád rendelt kereskedők." },
  search:       { da: "Søg på navn, kontonr, by…", en: "Search name, account no, city…", de: "Name, Konto-Nr, Stadt…", it: "Nome, numero conto, città…", hu: "Név, számlaszám, város…" },
  empty:        { da: "Ingen forhandlere tildelt dig endnu.", en: "No dealers assigned to you yet.", de: "Keine Händler zugewiesen.", it: "Nessun rivenditore assegnato.", hu: "Nincs hozzád rendelt kereskedő." },
  loading:      { da: "Henter forhandlere…", en: "Loading dealers…", de: "Lade Händler…", it: "Caricamento…", hu: "Betöltés…" },
  c_company:    { da: "Firmanavn", en: "Company", de: "Firma", it: "Azienda", hu: "Cég" },
  c_account:    { da: "Kontonr", en: "Account no", de: "Konto-Nr", it: "Conto", hu: "Számlaszám" },
  c_type:       { da: "Type", en: "Type", de: "Typ", it: "Tipo", hu: "Típus" },
  c_country:    { da: "Land", en: "Country", de: "Land", it: "Paese", hu: "Ország" },
  c_users:      { da: "Brugere", en: "Users", de: "Nutzer", it: "Utenti", hu: "Felh." },
  c_quotes:     { da: "Tilbud", en: "Quotes", de: "Angebote", it: "Preventivi", hu: "Ajánlat" },
  c_orders:     { da: "Ordrer", en: "Orders", de: "Orders", it: "Ordini", hu: "Rendelés" },
  c_last:       { da: "Sidste aktivitet", en: "Last activity", de: "Letzte Aktivität", it: "Ultima attività", hu: "Utolsó akt." },
  scope_note:   { da: "Du ser kun forhandlere tildelt dig.", en: "You only see dealers assigned to you.", de: "Nur Ihre zugewiesenen Händler.", it: "Solo i tuoi rivenditori.", hu: "Csak a hozzád rendelt kereskedők." },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return "—"; }
}

export default function CrmMyDealersPage() {
  const { appUser, loading } = useAppUser();
  const { language: lang } = useLanguage();
  const [rows, setRows] = useState<DealerAccountStats[]>([]);
  const [allUsers, setAllUsers] = useState<BackendUser[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const admin = isCrmAdmin(portalRole);
  const seller = isScopedSeller(portalRole);

  useEffect(() => {
    if (!appUser) return;
    let cancelled = false;
    (async () => {
      setLoadingRows(true);
      try {
        // Use effective seller (honors backend "view as <seller>" mode).
        const initials = getEffectiveSellerInitials(appUser);
        const effEmail = getEffectiveSellerEmail(appUser);

        const dealersRes = admin
          ? await fetchDealerAccountStats()
          : await fetchDealerAccountStatsForSeller({ initials, email: effEmail });
        const usersRes = await fetchBackendUsers();
        if (cancelled) return;
        setRows(dealersRes.rows);
        setError(dealersRes.error ?? null);
        setAllUsers(usersRes.users);
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appUser, admin]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!admin && !seller) return <Navigate to="/portal" replace />;

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return `${r.company_name} ${r.account_number} ${r.country ?? ""}`.toLowerCase().includes(needle);
  });

  return (
    <CrmLayout pageTitle={T.title[lang]}>
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[#2d5a27]/10 rounded-xl flex items-center justify-center">
            <Building2 className="h-5 w-5 text-[#2d5a27]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">{T.title[lang]}</h2>
            <p className="text-slate-500 text-sm">{T.subtitle[lang]}</p>
          </div>
        </div>
        {!admin && (
          <span className="text-xs px-3 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
            {T.scope_note[lang]}
          </span>
        )}
      </div>

      <div className="mb-4 bg-white border border-slate-200 rounded-xl p-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.search[lang]}
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm" />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      )}

      <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <Th />
              <Th>{T.c_company[lang]}</Th>
              <Th>{T.c_account[lang]}</Th>
              <Th>{T.c_type[lang]}</Th>
              <Th>{T.c_country[lang]}</Th>
              <Th>{T.c_users[lang]}</Th>
              <Th>{T.c_quotes[lang]}</Th>
              <Th>{T.c_orders[lang]}</Th>
              <Th>{T.c_last[lang]}</Th>
            </tr>
          </thead>
          <tbody>
            {loadingRows && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">{T.loading[lang]}</td></tr>
            )}
            {!loadingRows && filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">{T.empty[lang]}</td></tr>
            )}
            {filtered.map((r) => {
              const isOpen = expanded.has(r.id);
              const linkedUsers = r.user_ids?.length
                ? allUsers.filter((u) => r.user_ids.includes(u.id))
                : allUsers.filter((u) => u.dealer_number === r.account_number);
              return (
                <React.Fragment key={r.id}>
                  <tr className="border-t border-slate-100 hover:bg-slate-50/60">
                    <Td>
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                          return next;
                        })}
                        className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        disabled={r.user_count === 0 && linkedUsers.length === 0}
                        aria-label={isOpen ? "Skjul" : "Vis"}
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </Td>
                    <Td className="font-semibold text-slate-900">{r.company_name}</Td>
                    <Td>{r.account_number}</Td>
                    <Td>{r.customer_type_label || r.customer_type || "—"}</Td>
                    <Td>{r.country || "—"}</Td>
                    <Td>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${(r.user_count > 0 || linkedUsers.length > 0) ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-500"}`}>
                        {Math.max(r.user_count, linkedUsers.length)}
                      </span>
                    </Td>
                    <Td className="text-slate-700">{r.quote_count}</Td>
                    <Td className="text-slate-700">{r.order_count}</Td>
                    <Td className="text-slate-500 text-xs whitespace-nowrap">{fmtDate(r.last_activity_at)}</Td>
                  </tr>
                  {isOpen && linkedUsers.length > 0 && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={9} className="px-6 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                          {linkedUsers.length} bruger{linkedUsers.length === 1 ? "" : "e"} — {r.company_name}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {linkedUsers.map((u) => (
                            <div key={u.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs">
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
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        {filtered.length} / {rows.length} · <Link to="/portal/crm/dashboard" className="underline">CRM dashboard</Link>
      </p>
    </CrmLayout>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
}
