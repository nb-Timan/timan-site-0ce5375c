/**
 * Backend → Importér CRM Budget (preview only).
 * Route: /portal/backend/budget-import
 * Access: Timan Backend only.
 *
 * Phase 35 — Step 3: dry-run preview UI for crm_budget_dealer_lines.
 * Backend pastes rows, this page shows seller/month/dealer matching and
 * status. No commit yet — the commit button is intentionally disabled.
 *
 * Does not modify existing budget rows, orders, pipeline, configurator,
 * pricing, PDF, email, n8n or auth. Only reads from dealer_accounts and
 * crm_budget_dealer_lines.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, AlertTriangle, CheckCircle2, HelpCircle, Lock, Loader2 } from "lucide-react";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { derivePortalRole, getPortalPermissions } from "@/lib/portalAccess";
import { fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";
import {
  BUDGET_SELLERS,
  listBudgetDealerLines,
  normalizeDealerName,
  upsertBudgetDealerLines,
  type BudgetDealerLine,
  type BudgetDealerLineInput,
} from "@/lib/crmBudgetService";
import { normalizeSellerInitials } from "@/lib/sellerInitials";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// ── Configuration ──────────────────────────────────────────────────────
const KNOWN_PRODUCTS = ["RC-751", "RC-1000s", "Timan 3330", "Timan 2620"] as const;

const SAMPLE = `# seller, year, month (1-12), dealer name, product, qty
JTN, 2026, 5, Wilmers, RC-751, 1
JTN, 2026, 5, Wilmers, RC-1000s, 3
JTN, 2026, 5, Wilmers, Timan 3330, 0
BP,  2026, 6, Avistech, RC-1000s, 1`;

type RowStatus = "matched" | "needs_mapping" | "error" | "duplicate";

interface ParsedRow {
  rowIndex: number;
  raw: string;
  seller_initials: string | null;
  seller_email: string | null;
  year: number | null;
  month_idx: number | null; // 0..11
  dealer_input: string;
  dealer_match: DealerAccount | null;
  dealer_candidates: DealerAccount[];
  product_key: string | null;
  product_input: string;
  qty: number;
  excluded_from_total: boolean;
  status: RowStatus;
  errors: string[];
  /** True when an existing crm_budget_dealer_lines row already covers this identity. */
  duplicateOfExisting?: boolean;
}

function normProduct(s: string): string | null {
  const t = s.trim().toLowerCase().replace(/\s+/g, "");
  for (const p of KNOWN_PRODUCTS) {
    if (p.toLowerCase().replace(/\s+/g, "") === t) return p;
  }
  return null;
}

function findSeller(input: string) {
  const ini = normalizeSellerInitials(input.trim());
  return BUDGET_SELLERS.find((s) => normalizeSellerInitials(s.initials) === ini) || null;
}

function buildDealerCandidates(name: string, sellerInitials: string | null, dealers: DealerAccount[]): DealerAccount[] {
  const norm = normalizeDealerName(name);
  if (!norm) return [];
  const target = sellerInitials ? normalizeSellerInitials(sellerInitials) : null;
  const scored = dealers
    .map((d) => {
      const n = normalizeDealerName(d.company_name);
      if (!n) return null;
      let score = 0;
      if (n === norm) score = 100;
      else if (n.startsWith(norm) || norm.startsWith(n)) score = 80;
      else if (n.includes(norm) || norm.includes(n)) score = 60;
      else return null;
      // Prefer dealers assigned to this seller.
      if (target && normalizeSellerInitials(d.assigned_seller_initials) === target) score += 5;
      return { dealer: d, score };
    })
    .filter((x): x is { dealer: DealerAccount; score: number } => !!x)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 5).map((s) => s.dealer);
}

function parseInput(text: string, dealers: DealerAccount[], existing: BudgetDealerLine[]): ParsedRow[] {
  const out: ParsedRow[] = [];
  const lines = text.split(/\r?\n/);
  let idx = 0;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    idx++;
    // Split by tab or comma or semicolon.
    const parts = line.split(/\t|,|;/).map((p) => p.trim());
    const errors: string[] = [];

    const sellerInput = parts[0] || "";
    const seller = findSeller(sellerInput);
    if (!seller) errors.push(`Ukendt sælger "${sellerInput}"`);

    const yearNum = Number(parts[1]);
    const year = Number.isFinite(yearNum) && yearNum >= 2000 && yearNum < 2100 ? yearNum : null;
    if (year == null) errors.push(`Ugyldigt år "${parts[1] ?? ""}"`);

    const monthNum = Number(parts[2]);
    const month_idx = Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12 ? monthNum - 1 : null;
    if (month_idx == null) errors.push(`Måned skal være 1-12 ("${parts[2] ?? ""}")`);

    const dealerInput = parts[3] || "";
    if (!dealerInput) errors.push("Forhandler mangler");

    const productInput = parts[4] || "";
    const product_key = normProduct(productInput);
    if (!product_key) errors.push(`Ukendt produkt "${productInput}"`);

    const qtyNum = Number(parts[5]);
    const qty = Number.isFinite(qtyNum) ? Math.trunc(qtyNum) : NaN;
    if (!Number.isFinite(qty) || qty < 0) errors.push(`Ugyldig qty "${parts[5] ?? ""}"`);

    const excluded_from_total = qty === 0;

    const candidates = buildDealerCandidates(dealerInput, seller?.initials ?? null, dealers);
    const top = candidates[0] || null;
    const dealer_match = top && (top.company_name || "").toLowerCase() === dealerInput.toLowerCase()
      ? top
      : (candidates.length === 1 ? candidates[0] : null);

    let status: RowStatus = "matched";
    if (errors.length) status = "error";
    else if (!dealer_match) status = "needs_mapping";

    // Duplicate detection against existing dealer-line rows.
    let duplicateOfExisting = false;
    if (status === "matched" && seller && year != null && month_idx != null && product_key) {
      const sellerEmail = seller.email.toLowerCase();
      duplicateOfExisting = existing.some((r) =>
        r.year === year
        && r.month_idx === month_idx
        && (r.seller_email || "").toLowerCase() === sellerEmail
        && r.product_key === product_key
        && (
          (dealer_match && r.dealer_account_id === dealer_match.id)
          || (!dealer_match && r.dealer_name_norm === normalizeDealerName(dealerInput))
        ),
      );
      if (duplicateOfExisting) status = "duplicate";
    }

    out.push({
      rowIndex: idx,
      raw,
      seller_initials: seller?.initials ?? null,
      seller_email: seller?.email ?? null,
      year,
      month_idx,
      dealer_input: dealerInput,
      dealer_match,
      dealer_candidates: candidates,
      product_key,
      product_input: productInput,
      qty: Number.isFinite(qty) ? qty : 0,
      excluded_from_total,
      status,
      errors,
      duplicateOfExisting,
    });
  }
  return out;
}

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

const STATUS_BADGE: Record<RowStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  matched: { label: "Matchet", className: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  needs_mapping: { label: "Mangler mapping", className: "bg-amber-50 text-amber-800 border-amber-200", icon: HelpCircle },
  error: { label: "Fejl", className: "bg-red-50 text-red-700 border-red-200", icon: AlertTriangle },
  duplicate: { label: "Allerede importeret", className: "bg-slate-100 text-slate-700 border-slate-200", icon: CheckCircle2 },
};

export default function BackendBudgetImportPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  const [text, setText] = useState<string>(SAMPLE);
  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [existing, setExisting] = useState<BudgetDealerLine[]>([]);
  const [busyLoad, setBusyLoad] = useState(true);
  const [filter, setFilter] = useState<"all" | RowStatus>("all");
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const perms = portalRole ? getPortalPermissions(portalRole) : null;

  useEffect(() => {
    if (!appUser || !perms?.isBackend) return;
    let cancelled = false;
    (async () => {
      setBusyLoad(true);
      const [d, e] = await Promise.all([
        fetchDealerAccounts({ includeDeleted: false }),
        listBudgetDealerLines(year),
      ]);
      if (cancelled) return;
      setDealers(d.rows);
      setExisting(e);
      setBusyLoad(false);
    })();
    return () => { cancelled = true; };
  }, [appUser, perms?.isBackend, year]);

  const rows = useMemo(() => parseInput(text, dealers, existing), [text, dealers, existing]);
  const visible = useMemo(() => filter === "all" ? rows : rows.filter((r) => r.status === filter), [rows, filter]);

  const counts = useMemo(() => {
    const c = { matched: 0, needs_mapping: 0, error: 0, duplicate: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!perms?.isBackend) return <Navigate to="/portal/backend" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader user={appUser} language={lang} onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }} />

      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
        <Link to="/portal/backend" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage til Timan Backend
        </Link>

        <div className="mb-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Upload className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Importér CRM Budget</h1>
            <p className="text-slate-500 mt-1 text-sm">
              Phase 35 — preview/dry-run. Skriver intet endnu. Ingen eksisterende budgetrækker
              ændres. Mål: <code>crm_budget_dealer_lines</code>.
            </p>
          </div>
        </div>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <h2 className="font-bold text-slate-900">1. Indsæt budgetrækker</h2>
            <label className="text-xs text-slate-600 inline-flex items-center gap-2">
              Importeres mod år
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)}
                className="border border-slate-300 rounded px-2 py-1 w-24 text-sm" />
            </label>
          </div>
          <p className="text-xs text-slate-600 mb-2">
            Format pr. linje (komma, semikolon eller tab):
            <code className="ml-1">seller, year, month (1-12), dealer, product, qty</code>.
            Linjer der starter med <code>#</code> ignoreres. <strong>qty 0</strong> markeres
            automatisk som <em>excluded_from_total</em> (medregnes ikke i totaler).
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="w-full h-48 border border-slate-300 rounded-lg p-3 font-mono text-xs"
          />
          {busyLoad && <p className="text-xs text-slate-500 mt-2">Indlæser forhandlere og eksisterende dealer-rækker…</p>}
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="font-bold text-slate-900">2. Forhåndsvisning</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              {(["all", "matched", "needs_mapping", "error", "duplicate"] as const).map((k) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={`px-2.5 py-1 rounded-md border ${filter === k ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`}>
                  {k === "all" ? `Alle (${rows.length})`
                    : k === "matched" ? `Matchet (${counts.matched})`
                    : k === "needs_mapping" ? `Mangler mapping (${counts.needs_mapping})`
                    : k === "error" ? `Fejl (${counts.error})`
                    : `Allerede importeret (${counts.duplicate})`}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Sælger</th>
                  <th className="py-2 pr-2">År</th>
                  <th className="py-2 pr-2">Måned</th>
                  <th className="py-2 pr-2">Forhandler (input)</th>
                  <th className="py-2 pr-2">Matchet forhandler</th>
                  <th className="py-2 pr-2">Produkt</th>
                  <th className="py-2 pr-2 text-right">Qty</th>
                  <th className="py-2 pr-2">Excl.</th>
                  <th className="py-2 pr-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const Badge = STATUS_BADGE[r.status];
                  return (
                    <tr key={r.rowIndex} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-2 text-slate-400">{r.rowIndex}</td>
                      <td className="py-2 pr-2 font-medium">{r.seller_initials || <span className="text-red-600">—</span>}</td>
                      <td className="py-2 pr-2">{r.year ?? <span className="text-red-600">—</span>}</td>
                      <td className="py-2 pr-2">{r.month_idx != null ? MONTH_LABEL[r.month_idx] : <span className="text-red-600">—</span>}</td>
                      <td className="py-2 pr-2">{r.dealer_input || <span className="text-red-600">—</span>}</td>
                      <td className="py-2 pr-2">
                        {r.dealer_match ? (
                          <span className="text-slate-900">
                            {r.dealer_match.company_name}
                            <span className="text-slate-400 ml-1">#{r.dealer_match.account_number}</span>
                          </span>
                        ) : r.dealer_candidates.length > 0 ? (
                          <span className="text-amber-700">
                            Forslag: {r.dealer_candidates.slice(0, 3).map((d) => d.company_name).join(", ")}
                          </span>
                        ) : (
                          <span className="text-slate-400">Ingen forslag</span>
                        )}
                      </td>
                      <td className="py-2 pr-2">{r.product_key || <span className="text-red-600">{r.product_input || "—"}</span>}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{r.qty}</td>
                      <td className="py-2 pr-2">{r.excluded_from_total ? "Ja" : ""}</td>
                      <td className="py-2 pr-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${Badge.className}`}>
                          <Badge.icon className="h-3 w-3" /> {Badge.label}
                        </span>
                        {r.errors.length > 0 && (
                          <ul className="mt-1 text-red-600 list-disc pl-4">
                            {r.errors.map((e, i) => <li key={i}>{e}</li>)}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={10} className="py-6 text-center text-slate-500">Ingen rækker.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5">
          <h2 className="font-bold text-slate-900 mb-2">3. Bekræft og importér</h2>
          <p className="text-xs text-slate-600 mb-3">
            Commit er deaktiveret i denne fase. Trin 4 (Step 4) tilføjer commit + audit-logning og
            mapping-løsning for "Mangler mapping"-rækker. Indtil da skriver denne side intet til
            Supabase.
          </p>
          <button
            type="button"
            disabled
            title="Commit er ikke aktiveret endnu (Step 3 er preview-only)"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-200 text-slate-500 cursor-not-allowed text-sm"
          >
            <Lock className="h-4 w-4" /> Importér ({counts.matched} klar)
          </button>
        </section>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
