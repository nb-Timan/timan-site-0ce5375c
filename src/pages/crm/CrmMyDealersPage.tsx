/**
 * Seller-facing dealer overview — "Mine forhandlere".
 * Route: /portal/crm/my-dealers
 *
 * Visible to:
 *   • timan_seller (Timan Sælger)
 *   • Backend users in seller mode (derivePortalRole maps them to seller).
 *
 * Scope:
 *   The effective seller comes from getEffective*Seller* helpers, which
 *   honor the active-mode override. So when a backend user (e.g. NB)
 *   switches to "EM Sælger", this page shows EM's dealers. The effect
 *   re-runs whenever the active mode changes.
 *
 *   Filtering uses fetchDealerAccountsForSeller, which:
 *     • returns dealers directly assigned to the seller,
 *     • plus branches whose parent is assigned to the seller (inheritance),
 *     • plus the parent main rows needed to anchor those branches.
 *   The same parent/child grouping as Timan Backend → Forhandlere is then
 *   applied client-side so the UI structure matches.
 */

import React, { useEffect, useMemo, useState } from "react";
import { Navigate, Link, useNavigate } from "react-router-dom";
import { Building2, ChevronDown, ChevronRight, GitBranch, Search, Star } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCountryFormatter } from "@/lib/formatCountry";
import CrmLayout from "@/components/crm/CrmLayout";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isScopedSeller } from "@/lib/crmScope";
import {
  DealerAccount,
  DealerAccountStats,
  fetchDealerAccountStats,
  fetchDealerAccounts,
  fetchDealerAccountsForSeller,
  groupDealersByParent,
  aggregateGroupStats,
  resolveEffectiveSeller,
  buildSuccessorIndex,
  dealerLifecycleStatus,
  isDealerCustomerAccount,
} from "@/lib/dealerAccountsService";
import { fetchBackendUsers } from "@/lib/backendUsersService";
import { BackendUser } from "@/lib/backend-users-store";
import { Language } from "@/types/configurator";
import {
  getActiveMode,
  getActiveSellerView,
  getEffectiveSellerEmail,
  getEffectiveSellerInitials,
} from "@/lib/activeMode";
import { resolveSellerId } from "@/lib/resolveSellerId";
import {
  buildDealerBudgetIndex,
  aggregateDealerBudget,
  classifyBudgetStatus,
  type DealerBudgetIndex,
} from "@/lib/crmDealerBudget";
import {
  computeDealerProfileSeverity,
  getDealerProfileMissingLabels,
  getDealerProfileCriticalMissing,
} from "@/lib/dealerProfileBadge";




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
  c_profile:    { da: "Profilstatus", en: "Profile status", de: "Profilstatus", it: "Stato profilo", hu: "Profil állapot" },
  c_users:      { da: "Brugere", en: "Users", de: "Nutzer", it: "Utenti", hu: "Felh." },
  c_quotes:     { da: "Tilbud", en: "Quotes", de: "Angebote", it: "Preventivi", hu: "Ajánlat" },
  c_orders:     { da: "Ordrer", en: "Orders", de: "Orders", it: "Ordini", hu: "Rendelés" },
  c_last:       { da: "Sidste aktivitet", en: "Last activity", de: "Letzte Aktivität", it: "Ultima attività", hu: "Utolsó akt." },
  c_budget_ytd: { da: "Budget YTD", en: "Budget YTD", de: "Budget YTD", it: "Budget YTD", hu: "Budget YTD" },
  c_budget_status: { da: "Budget status", en: "Budget status", de: "Budget-Status", it: "Stato budget", hu: "Költségvetés-állapot" },
  scope_note:   { da: "Du ser kun forhandlere tildelt dig.", en: "You only see dealers assigned to you.", de: "Nur Ihre zugewiesenen Händler.", it: "Solo i tuoi rivenditori.", hu: "Csak a hozzád rendelt kereskedők." },
  view_as:      { da: "Vises som", en: "Viewing as", de: "Ansicht als", it: "Vista come", hu: "Nézet" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return "—"; }
}

export default function CrmMyDealersPage() {
  const { appUser, loading } = useAppUser();
  const { language: lang } = useLanguage();
  const { formatCountry } = useCountryFormatter();
  const navigate = useNavigate();
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, DealerAccountStats>>({});
  const [allUsers, setAllUsers] = useState<BackendUser[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [profileFilter, setProfileFilter] = useState<"all" | "complete" | "partial" | "critical">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "blocked">("all");

  const [groupExpanded, setGroupExpanded] = useState<Set<string>>(new Set());
  const [dealerCustomersExpanded, setDealerCustomersExpanded] = useState<Set<string>>(new Set());
  const [usersExpanded, setUsersExpanded] = useState<Set<string>>(new Set());
  const [budgetIndex, setBudgetIndex] = useState<DealerBudgetIndex | null>(null);
  const budgetYear = new Date().getFullYear();

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const admin = isCrmAdmin(portalRole);
  const seller = isScopedSeller(portalRole);

  // Re-render when the backend user switches active seller view.
  const [activeMode, setActiveMode] = useState<string>(() => getActiveMode(appUser?.email));
  useEffect(() => {
    const handler = () => setActiveMode(getActiveMode(appUser?.email));
    window.addEventListener("timan:active-mode-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("timan:active-mode-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, [appUser?.email]);

  const activeSellerView = appUser ? getActiveSellerView(appUser.email) : null;

  useEffect(() => {
    if (!appUser) return;
    let cancelled = false;
    (async () => {
      setLoadingRows(true);
      try {
        const initials = getEffectiveSellerInitials(appUser);
        const effEmail = getEffectiveSellerEmail(appUser);

        let loadedDealers: DealerAccount[] = [];
        if (admin && !activeSellerView) {
          // Pure backend view → show everything, with grouping.
          const [dRes, sRes, uRes] = await Promise.all([
            fetchDealerAccounts({ includeDeleted: true }),
            fetchDealerAccountStats(),
            fetchBackendUsers(),
          ]);
          if (cancelled) return;
          loadedDealers = dRes.rows;
          setDealers(loadedDealers);
          const map: Record<string, DealerAccountStats> = {};
          for (const s of sRes.rows) map[s.id] = s;
          setStatsMap(map);
          setAllUsers(uRes.users);
          setError(dRes.error ?? sRes.error ?? null);
        } else {
          // Seller view (real seller OR backend in "view-as <seller>" mode).
          const [scopeRes, uRes] = await Promise.all([
            fetchDealerAccountsForSeller({ initials, email: effEmail }),
            fetchBackendUsers(),
          ]);
          if (cancelled) return;
          loadedDealers = scopeRes.dealers;
          setDealers(loadedDealers);
          setStatsMap(scopeRes.stats);
          setAllUsers(uRes.users);
          setError(scopeRes.error ?? null);
        }

        // Build dealer-budget index (YTD budget + realised) — uses the same
        // crm_budget_dealer_lines + scoped orders source as Budget Dashboard.
        try {
          const sellerId = await resolveSellerId(effEmail);
          const idx = await buildDealerBudgetIndex({
            year: budgetYear,
            dealers: loadedDealers,
            filter: {
              role: portalRole,
              sellerId,
              sellerInitials: initials,
              sellerEmail: effEmail,
              dealerNumber: appUser?.dealer_number ?? null,
            },
          });
          if (!cancelled) setBudgetIndex(idx);
        } catch (e) {
          console.warn("[CrmMyDealersPage] budget index failed:", e);
        }
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appUser, admin, activeMode, activeSellerView, budgetYear, portalRole]);

  // Successor index — must be computed unconditionally before any early return
  // so the number of hooks remains stable across renders.
  const { predecessorsByActiveId, absorbedIds } = useMemo(
    () => buildSuccessorIndex(dealers ?? []),
    [dealers],
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!admin && !seller) return <Navigate to="/portal" replace />;

  const dealerPeopleCount = (d: DealerAccount): number => {
    const s = statsMap[d.id];
    const linked = allUsers.filter((u) => u.dealer_number === d.account_number).length;
    return Math.max(s?.user_count ?? 0, linked);
  };

  const filteredDealers = (dealers ?? []).filter((r) => {
    if (q) {
      const needle = q.toLowerCase();
      if (!`${r.company_name} ${r.account_number} ${r.country ?? ""} ${r.branch_name ?? ""}`
        .toLowerCase().includes(needle)) return false;
    }
    if (profileFilter !== "all") {
      const sev = computeDealerProfileSeverity(r, dealerPeopleCount(r));
      if (profileFilter === "complete" && sev !== "complete") return false;
      if (profileFilter === "partial" && sev !== "partial") return false;
      if (profileFilter === "critical" && sev !== "critical") return false;
    }
    if (statusFilter === "active" && r.is_blocked) return false;
    if (statusFilter === "blocked" && !r.is_blocked) return false;

    return true;
  });

  // When searching, ensure parent anchors of matched branches stay visible.
  const dealersByAcct = new Map<string, DealerAccount>();
  for (const d of dealers ?? []) dealersByAcct.set(d.account_number, d);
  const visibleIds = new Set(filteredDealers.map((d) => d.id));
  if (q || profileFilter !== "all" || statusFilter !== "all") {
    for (const d of filteredDealers) {
      if (d.parent_account_number) {
        const parent = dealersByAcct.get(d.parent_account_number);
        if (parent) visibleIds.add(parent.id);
      }
    }
  }
  // Hide absorbed predecessors from top-level grouping — they render as sub-rows.
  const visibleDealerCustomers = (dealers ?? []).filter((d) =>
    visibleIds.has(d.id) && !absorbedIds.has(d.id) && isDealerCustomerAccount(d)
  );
  const visibleDealers = (dealers ?? []).filter((d) =>
    visibleIds.has(d.id) && !absorbedIds.has(d.id) && !isDealerCustomerAccount(d)
  );
  const groups = groupDealersByParent(visibleDealers);
  const dealerCustomersByParent = new Map<string, DealerAccount[]>();
  for (const d of visibleDealerCustomers) {
    const parent = d.parent_account_number || "";
    if (!parent) continue;
    const list = dealerCustomersByParent.get(parent) ?? [];
    list.push(d);
    dealerCustomersByParent.set(parent, list);
  }
  for (const list of dealerCustomersByParent.values()) {
    list.sort((a, b) => (a.branch_name || a.company_name).localeCompare(b.branch_name || b.company_name, "da"));
  }
  const totalDealersCount = (dealers ?? []).filter((d) => !absorbedIds.has(d.id) && !isDealerCustomerAccount(d)).length;
  const visibleMainCount = filteredDealers.filter((d) => !isDealerCustomerAccount(d)).length;

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
        <div className="flex items-center gap-2 flex-wrap">
          {activeSellerView && (
            <span className="text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 font-semibold">
              {T.view_as[lang]}: {activeSellerView.label}
            </span>
          )}
          {!admin && (
            <span className="text-xs px-3 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
              {T.scope_note[lang]}
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={T.search[lang]}
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold uppercase tracking-wide">Profilstatus</span>
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value as typeof profileFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="all">Alle</option>
            <option value="complete">Komplet</option>
            <option value="partial">Mangler info</option>
            <option value="critical">Kritisk</option>

          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold uppercase tracking-wide">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            <option value="all">Alle</option>
            <option value="active">Aktive</option>
            <option value="blocked">Spærrede</option>
          </select>
        </label>
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
              <Th>{T.c_profile[lang]}</Th>
              <Th>{T.c_users[lang]}</Th>
              <Th>{T.c_quotes[lang]}</Th>
              <Th>{T.c_orders[lang]}</Th>
              <Th>{T.c_budget_ytd[lang]}</Th>
              <Th>{T.c_budget_status[lang]}</Th>
              <Th>{T.c_last[lang]}</Th>
            </tr>
          </thead>
          <tbody>
            {loadingRows && (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-sm text-slate-500">{T.loading[lang]}</td></tr>
            )}
            {!loadingRows && groups.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-sm text-slate-500">{T.empty[lang]}</td></tr>
            )}
            {groups.map((g) => {
              const predecessors = predecessorsByActiveId.get(g.main.id) ?? [];
              const dealerCustomers = dealerCustomersByParent.get(g.main.account_number) ?? [];
              const hasBranches = g.branches.length > 0;
              const hasDealerCustomers = dealerCustomers.length > 0;
              const hasPredecessors = predecessors.length > 0;
              const isOpen = groupExpanded.has(g.main.id);
              const dealerCustomersOpen = dealerCustomersExpanded.has(g.main.id);
              const agg = hasBranches ? aggregateGroupStats(g, statsMap) : null;
              return (
                <React.Fragment key={g.main.id}>
                  {renderRow({
                    r: g.main,
                    depth: 0,
                    variant: "main",
                    isMain: hasBranches || hasDealerCustomers || g.main.is_main_account,
                    branchCount: g.branches.length,
                    dealerCustomerCount: dealerCustomers.length,
                    successorCount: predecessors.length,
                    open: isOpen,
                    onToggle: hasPredecessors ? () => setGroupExpanded((p) => {
                      const n = new Set(p);
                      if (n.has(g.main.id)) n.delete(g.main.id); else n.add(g.main.id);
                      return n;
                    }) : undefined,
                    dealerCustomersOpen,
                    onToggleDealerCustomers: hasDealerCustomers ? () => setDealerCustomersExpanded((p) => {
                      const n = new Set(p);
                      if (n.has(g.main.id)) n.delete(g.main.id); else n.add(g.main.id);
                      return n;
                    }) : undefined,
                    agg,
                    statsMap,
                    allUsers,
                    dealersByAcct,
                    usersExpanded,
                    setUsersExpanded,
                    budgetIndex,
                    budgetAccountNumbers: hasBranches
                      ? [g.main.account_number, ...g.branches.map((b) => b.account_number)]
                      : [g.main.account_number],
                    onOpenDetail: (d) => navigate(`/portal/crm/my-dealers/${d.account_number}`),
                    formatCountry,
                  })}
                  {hasBranches && g.branches.map((b) => (
                    <React.Fragment key={b.id}>
                      {renderRow({
                        r: b, depth: 1, variant: "branch", isMain: false, branchCount: 0, dealerCustomerCount: 0, successorCount: 0,
                        dealerCustomersOpen: false,
                        statsMap, allUsers, dealersByAcct,
                        usersExpanded, setUsersExpanded,
                        budgetIndex,
                        budgetAccountNumbers: [b.account_number],
                        onOpenDetail: (d) => navigate(`/portal/crm/my-dealers/${d.account_number}`),
                        formatCountry,
                      })}
                    </React.Fragment>
                  ))}
                  {dealerCustomersOpen && hasDealerCustomers && dealerCustomers.map((c) => (
                    <React.Fragment key={c.id}>
                      {renderRow({
                        r: c, depth: 1, variant: "dealer_customer", isMain: false, branchCount: 0, dealerCustomerCount: 0, successorCount: 0,
                        dealerCustomersOpen: false,
                        statsMap, allUsers, dealersByAcct,
                        usersExpanded, setUsersExpanded,
                        budgetIndex,
                        budgetAccountNumbers: [c.account_number],
                        onOpenDetail: (d) => navigate(`/portal/crm/my-dealers/${d.account_number}`),
                        formatCountry,
                      })}
                    </React.Fragment>
                  ))}
                  {isOpen && hasPredecessors && predecessors.map((p) => (
                    <React.Fragment key={p.id}>
                      {renderRow({
                        r: p, depth: 1, variant: "successor", isMain: false, branchCount: 0, dealerCustomerCount: 0, successorCount: 0,
                        dealerCustomersOpen: false,
                        statsMap, allUsers, dealersByAcct,
                        usersExpanded, setUsersExpanded,
                        budgetIndex,
                        budgetAccountNumbers: [p.account_number],
                        onOpenDetail: (d) => navigate(`/portal/crm/my-dealers/${d.account_number}`),
                        formatCountry,
                      })}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        {visibleMainCount} / {totalDealersCount} · <Link to="/portal/crm/dashboard" className="underline">CRM dashboard</Link>
      </p>
    </CrmLayout>
  );
}

interface RowProps {
  r: DealerAccount;
  depth: 0 | 1;
  variant: "main" | "branch" | "dealer_customer" | "successor";
  isMain: boolean;
  branchCount: number;
  dealerCustomerCount: number;
  successorCount: number;
  open?: boolean;
  onToggle?: () => void;
  dealerCustomersOpen: boolean;
  onToggleDealerCustomers?: () => void;
  agg?: { user_count: number; quote_count: number; order_count: number; last_activity_at: string | null } | null;
  statsMap: Record<string, DealerAccountStats>;
  allUsers: BackendUser[];
  dealersByAcct: Map<string, DealerAccount>;
  usersExpanded: Set<string>;
  setUsersExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  budgetIndex: DealerBudgetIndex | null;
  budgetAccountNumbers: string[];
  onOpenDetail?: (d: DealerAccount) => void;
  formatCountry: (v: string | null | undefined) => string;
}

function renderRow(p: RowProps) {
  const s = p.statsMap[p.r.id];
  const own = {
    user: s?.user_count ?? 0,
    quote: s?.quote_count ?? 0,
    order: s?.order_count ?? 0,
    last: s?.last_activity_at ?? null,
  };
  const linkedUsers = s?.user_ids?.length
    ? p.allUsers.filter((u) => s.user_ids.includes(u.id))
    : p.allUsers.filter((u) => u.dealer_number === p.r.account_number);
  const eff = resolveEffectiveSeller(p.r, p.dealersByAcct);
  const usersOpen = p.usersExpanded.has(p.r.id);
  const branchBadge = p.variant === "branch" ? branchRelationBadgeLabel(p.r, p.dealersByAcct) : null;
  return (
    <>
      <tr
        className={`border-t border-slate-100 cursor-pointer ${
          p.r.is_blocked
            ? "bg-rose-50/60 hover:bg-rose-50 border-l-4 border-l-rose-500"
            : "hover:bg-emerald-50/40"
        }`}
        onClick={() => p.onOpenDetail?.(p.r)}
      >
        <Td>
          <div className="flex items-center gap-1">
            {p.onToggle ? (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); p.onToggle?.(); }}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                aria-label={p.open ? "Skjul filialer" : "Vis filialer"}>
                {p.open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <span className="inline-block w-6" />
            )}
            {linkedUsers.length > 0 && (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); p.setUsersExpanded((prev) => {
                  const n = new Set(prev); if (n.has(p.r.id)) n.delete(p.r.id); else n.add(p.r.id); return n;
                }); }}
                className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700"
                aria-label="Vis brugere">
                {usersOpen ? "−" : "+"}
              </button>
            )}
          </div>
        </Td>
        <Td className="font-semibold text-slate-900">
          <div className="flex items-center gap-2" style={{ paddingLeft: p.depth * 18 }}>
            {p.depth === 1 && <GitBranch className="h-3.5 w-3.5 text-slate-400" />}
            <span>{p.r.branch_name || p.r.company_name}</span>
            {p.r.is_blocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                Spærret
              </span>
            )}
            {p.r.is_deleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-white">
                Lukket
              </span>
            )}
            {p.isMain && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                <Star className="h-2.5 w-2.5" /> Hoved{p.branchCount > 0 ? ` (${p.branchCount})` : ""}
              </span>
            )}
            {p.variant === "main" && p.dealerCustomerCount > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); p.onToggleDealerCustomers?.(); }}
                className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold border transition-colors ${
                  p.dealerCustomersOpen
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                }`}
                aria-label={p.dealerCustomersOpen ? "Skjul forhandlerkunder" : "Vis forhandlerkunder"}
              >
                {p.dealerCustomersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Forhandlerkunder ({p.dealerCustomerCount})
              </button>
            )}
            {p.variant === "main" && p.successorCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800 border border-indigo-200"
                title="Tidligere forhandlere overtaget af denne"
              >
                Overtaget ({p.successorCount})
              </span>
            )}
            {p.variant === "branch" && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                {branchBadge}
              </span>
            )}
            {p.variant === "dealer_customer" && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                Forhandlerkunde
              </span>
            )}
            {p.variant === "successor" && (
              <span
                className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800"
                title={`Overtaget af aktiv efterfølger — historikken bliver på denne konto (${dealerLifecycleStatus(p.r)})`}
              >
                Overtaget
              </span>
            )}
          </div>
        </Td>
        <Td>{p.r.account_number}</Td>
        <Td>{p.r.customer_type_label || p.r.customer_type || "—"}</Td>
        <Td>{p.formatCountry(p.r.country) || "—"}</Td>
        <Td>
          <ProfileStatusBadge dealer={p.r} peopleCount={Math.max(own.user, linkedUsers.length)} />
        </Td>
        <Td>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${(own.user > 0 || linkedUsers.length > 0) ? "bg-indigo-100 text-indigo-800" : "bg-slate-100 text-slate-500"}`}>
            {Math.max(own.user, linkedUsers.length)}
            {p.agg && p.agg.user_count > own.user && (
              <span className="ml-1 text-[10px] text-indigo-600">(Σ {p.agg.user_count})</span>
            )}
          </span>
        </Td>
        <Td className="text-slate-700">
          {own.quote}
          {p.agg && p.agg.quote_count > own.quote && (
            <span className="ml-1 text-[10px] text-slate-500">(Σ {p.agg.quote_count})</span>
          )}
        </Td>
        <Td className="text-slate-700">
          {own.order}
          {p.agg && p.agg.order_count > own.order && (
            <span className="ml-1 text-[10px] text-slate-500">(Σ {p.agg.order_count})</span>
          )}
        </Td>
        <BudgetYtdCell budgetIndex={p.budgetIndex} accountNumbers={p.budgetAccountNumbers} />
        <BudgetStatusCell budgetIndex={p.budgetIndex} accountNumbers={p.budgetAccountNumbers} />
        <Td className="text-slate-500 text-xs whitespace-nowrap">
          {fmtDate(p.agg?.last_activity_at ?? own.last)}
          {eff.inherited && eff.initials && (
            <div className="text-[10px] text-slate-400 font-normal">Sælger arvet: {eff.initials}</div>
          )}
        </Td>
      </tr>
      {usersOpen && linkedUsers.length > 0 && (
        <tr className="bg-slate-50/60">
          <td colSpan={12} className="px-6 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
              {linkedUsers.length} bruger{linkedUsers.length === 1 ? "" : "e"} — {p.r.branch_name || p.r.company_name}
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
    </>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle ${className}`}>{children}</td>;
}

function BudgetYtdCell({
  budgetIndex,
  accountNumbers,
}: { budgetIndex: DealerBudgetIndex | null; accountNumbers: string[] }) {
  if (!budgetIndex) {
    return <Td className="text-slate-400 text-xs">…</Td>;
  }
  const t = aggregateDealerBudget(budgetIndex, accountNumbers);
  if (t.noBudget) {
    return <Td className="text-slate-400 text-xs whitespace-nowrap">Intet budget</Td>;
  }
  return (
    <Td className="text-slate-800 text-sm whitespace-nowrap font-semibold">
      {Math.round(t.ytdRealisedQty)} / {Math.round(t.ytdBudgetQty)} stk.
    </Td>
  );
}

function BudgetStatusCell({
  budgetIndex,
  accountNumbers,
}: { budgetIndex: DealerBudgetIndex | null; accountNumbers: string[] }) {
  if (!budgetIndex) return <Td><span className="text-slate-300 text-xs">…</span></Td>;
  const t = aggregateDealerBudget(budgetIndex, accountNumbers);
  const { status, pct } = classifyBudgetStatus(t);
  if (status === "none") {
    return <Td><span className="text-slate-400 text-xs">—</span></Td>;
  }
  const barColor =
    status === "green" ? "bg-emerald-500" :
    status === "yellow" ? "bg-amber-500" :
    "bg-rose-500";
  const textColor =
    status === "green" ? "text-emerald-700" :
    status === "yellow" ? "text-amber-700" :
    "text-rose-700";
  const widthPct = Math.min(100, Math.max(0, pct));
  return (
    <Td>
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
          <div className={`h-full ${barColor}`} style={{ width: `${widthPct}%` }} />
        </div>
        <span className={`text-xs font-bold tabular-nums ${textColor}`}>{pct}%</span>
      </div>
    </Td>
  );
}

function branchRelationBadgeLabel(
  dealer: DealerAccount,
  dealersByAcct: Map<string, DealerAccount>,
): string {
  const normalizedTypes = [dealer.customer_type_label, dealer.customer_type, dealer.dealer_type]
    .map((value) => (value ?? "").toLowerCase().replace(/[\s_-]+/g, ""))
    .filter(Boolean);
  if (normalizedTypes.some((type) => type.includes("servicepartner"))) return "Service Partner";
  if (normalizedTypes.some((type) => type.includes("import"))) return "Importør";
  if (normalizedTypes.some((type) => type.includes("forhandlerkunde") || type.includes("dealercustomer"))) {
    return "Forhandlerkunde";
  }

  const parent = dealer.parent_account_number ? dealersByAcct.get(dealer.parent_account_number) : null;
  if (parent && isSameCompanyBranch(parent.company_name, dealer.company_name)) return "Filial";
  return "Forhandler";
}

function isSameCompanyBranch(parentName: string | null | undefined, childName: string | null | undefined): boolean {
  const parent = normalizeCompanyBase(parentName);
  const child = normalizeCompanyBase(childName);
  return Boolean(parent && child && (child.startsWith(parent) || parent.startsWith(child)));
}

function normalizeCompanyBase(value: string | null | undefined): string {
  return (value ?? "")
    .split(/\s+[–—-]\s+|,/)[0]
    .toLowerCase()
    .replace(/\b(a\/s|aps|ab|gmbh|as|oy|bv|nv|ltd|sarl|d\.o\.o)\b/g, "")
    .replace(/[^a-z0-9æøåäöü]+/gi, "")
    .trim();
}

function ProfileStatusBadge({ dealer, peopleCount }: { dealer: DealerAccount; peopleCount: number }) {
  const severity = computeDealerProfileSeverity(dealer, peopleCount);
  const missingSections = getDealerProfileMissingLabels(dealer, peopleCount);
  const missingCritical = getDealerProfileCriticalMissing(dealer);
  const tone =
    severity === "complete" ? "bg-emerald-100 text-emerald-800 border-emerald-200"
    : severity === "partial" ? "bg-amber-100 text-amber-800 border-amber-200"
    : severity === "critical" ? "bg-rose-100 text-rose-800 border-rose-200"
    : "bg-slate-100 text-slate-700 border-slate-200";
  const dot =
    severity === "complete" ? "bg-emerald-500"
    : severity === "partial" ? "bg-amber-500"
    : severity === "critical" ? "bg-rose-500"
    : "bg-slate-400";
  const text =
    severity === "complete" ? "Komplet"
    : severity === "partial" ? "Mangler info"
    : severity === "critical" ? "Kritisk"
    : "—";
  const baseTitle =
    severity === "complete"
      ? "Profilen er komplet."
      : severity === "critical"
        ? "Kritiske stamdata mangler."
        : "Mangler øvrige profiloplysninger.";
  const parts: string[] = [baseTitle];
  if (severity === "critical" && missingCritical.length > 0) {
    parts.push(`Kritiske felter mangler:\n- ${missingCritical.join("\n- ")}`);
  }
  if (severity !== "complete" && missingSections.length > 0) {
    parts.push(`Sektioner som mangler:\n- ${missingSections.join("\n- ")}`);
  }
  const title = parts.join("\n\n");
  return (
    <span
      title={title}
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}


