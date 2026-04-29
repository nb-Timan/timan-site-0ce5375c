import { Fragment, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Lock, Unlock, Plus, Trash2, Save, X, ShieldAlert, Calendar,
  Wallet, Sparkles, Edit3, Minus,
} from "lucide-react";
import CrmLayout from "@/components/crm/CrmLayout";
import { useAppUser } from "@/context/AppUserContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isScopedSeller } from "@/lib/crmScope";
import { resolveSellerId } from "@/lib/resolveSellerId";
import { cn } from "@/lib/utils";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BUDGET_PRODUCTS, BUDGET_SELLERS, BUDGET_BACKEND_USERS, MONTHS_DA, availableYears, fmtDKK,
  listBudgetLines, listForecasts, listSalesActuals,
  createBudgetLine, deleteBudgetLine, setLineLock, upsertForecast, upsertBudgetLine,
  type BudgetLine, type BudgetForecast, type SalesActual, findProduct,
} from "@/lib/crmBudgetService";

const EVEN: number[] = Array.from({ length: 12 }, () => 1 / 12);

// ---------- Pipeline (sent offers) mock ----------
interface PipelineOffer {
  offer_no: string;
  dealer: string;
  machine_key: string;
  attachment: string;
  customer: string;
  value: number;
  sent_date: string; // ISO
  status: string;
}

// Deterministic pseudo-random per machine/month so values are stable across renders.
function seedRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_DEALERS = [
  "Nordsjællands Maskinforretning", "Sydjysk Have & Park", "Kirschner Maschinen GmbH",
  "Fyn Park Service", "Aarhus Grøn Pleje", "Odense Kommunale Værksted",
];
const SAMPLE_CUSTOMERS = [
  "Køge Kommune", "Roskilde Park", "Vejle Vejvæsen", "Stadt München",
  "Hamburg Grünflächen", "Hillerød Drift", "Aalborg Park & Natur",
];
const SAMPLE_ATTACHMENTS = ["Slagleklipper 1500", "Krat-skærer", "Buskrydder XL", "Kost", "Sneskraber", "Saltspreder"];
const SAMPLE_STATUSES = ["Sendt", "Sendt", "Sendt", "I dialog", "Forhandling"];

function generatePipeline(line: BudgetLine, year: number): PipelineOffer[][] {
  const months: PipelineOffer[][] = Array.from({ length: 12 }, () => []);
  const rnd = seedRand(`${line.id}|${year}|pipe`);
  // Roughly 0..2 sent offers per machine per month, weighted by season.
  const split = (line.monthly_split && line.monthly_split.length === 12) ? line.monthly_split : EVEN;
  const unit = line.qty_budget > 0 ? line.value_budget / line.qty_budget : 0;
  let counter = 1;
  for (let m = 0; m < 12; m++) {
    const intensity = split[m] * 12; // ~1 on average
    const draw = rnd();
    let count = 0;
    if (draw < 0.15 * intensity) count = 0;
    else if (draw < 0.55 * intensity) count = 1;
    else if (draw < 0.85 * intensity) count = 2;
    else count = rnd() < 0.4 ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const dealer = SAMPLE_DEALERS[Math.floor(rnd() * SAMPLE_DEALERS.length)];
      const customer = SAMPLE_CUSTOMERS[Math.floor(rnd() * SAMPLE_CUSTOMERS.length)];
      const attachment = SAMPLE_ATTACHMENTS[Math.floor(rnd() * SAMPLE_ATTACHMENTS.length)];
      const status = SAMPLE_STATUSES[Math.floor(rnd() * SAMPLE_STATUSES.length)];
      const variance = 0.85 + rnd() * 0.3;
      months[m].push({
        offer_no: `T-${year}-${String(line.id.slice(-3)).toUpperCase()}-${String(counter).padStart(3, "0")}`,
        dealer,
        machine_key: line.product_key,
        attachment,
        customer,
        value: Math.round(unit * variance),
        sent_date: new Date(year, m, 5 + Math.floor(rnd() * 22)).toISOString(),
        status,
      });
      counter++;
    }
  }
  return months;
}

// ---------- Helpers ----------
function splitToMonthly(qty: number, split: number[]): number[] {
  const safe = split.length === 12 ? split : EVEN;
  // Distribute qty across months by share, then round so totals stay close to qty.
  const raw = safe.map(s => qty * s);
  const floors = raw.map(v => Math.floor(v));
  let remainder = qty - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    result[order[k].i]++; remainder--;
  }
  return result;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ---------- KPI ----------
function KpiCard({ label, value, sub, icon: Icon, tone = "neutral" }: { label: string; value: string; sub?: string; icon: typeof Wallet; tone?: "neutral" | "primary" | "ok" | "warn" }) {
  const toneMap = {
    neutral: "from-slate-50 to-white text-slate-900",
    primary: "from-emerald-50 to-white text-emerald-900",
    ok:      "from-emerald-50 to-white text-emerald-900",
    warn:    "from-amber-50 to-white text-amber-900",
  } as const;
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-gradient-to-b shadow-sm p-5", toneMap[tone])}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-slate-500 mt-1">{sub}</div> : null}
    </div>
  );
}

interface NewRowState {
  product_key: string;
  seller_name: string;
  country: string;
  qty_budget: number;
  notes: string;
}

// Per-machine working forecast monthly draft.
type WorkingDraft = Record<string, number[]>; // budget_line_id -> 12 numbers

export default function CrmBudgetPage() {
  const { appUser, loading } = useAppUser();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);
  const isSeller = isScopedSeller(portalRole);
  const allowed = isAdmin || isSeller;

  const [year, setYear] = useState<number>(availableYears()[0]);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [forecasts, setForecasts] = useState<BudgetForecast[]>([]);
  const [actuals, setActuals] = useState<SalesActual[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editWorking, setEditWorking] = useState(false);
  const [workingDraft, setWorkingDraft] = useState<WorkingDraft>({});
  const [showAdd, setShowAdd] = useState(false);
  // Backend-only filter: "all" | seller email (e.g. "em@timan.dk").
  const [backendFilter, setBackendFilter] = useState<string>("all");
  const [newRow, setNewRow] = useState<NewRowState>({
    product_key: BUDGET_PRODUCTS[0].key, seller_name: "", country: "DK", qty_budget: 1, notes: "",
  });

  useEffect(() => {
    if (appUser?.email) resolveSellerId(appUser.email).then(setSellerId);
  }, [appUser?.email]);

  useEffect(() => {
    if (!allowed) return;
    setBusy(true);
    Promise.all([listBudgetLines({ year }), listForecasts(year), listSalesActuals(year)])
      .then(([l, f, a]) => { setLines(l); setForecasts(f); setActuals(a); })
      .finally(() => setBusy(false));
  }, [year, allowed]);

  // Resolve the current user's identity for scoping. We support multiple
  // matching strategies because seed rows may have been created before the
  // user's auth_user_id was linked, and because the preview-role switcher
  // produces synthetic display_names like "[Preview] Timan Sælger".
  const myEmail = (appUser?.email || "").toLowerCase().trim();
  const myInitialsFromName = (appUser?.display_name || "").replace(/^\[Preview\]\s*/i, "").trim();

  const visibleLines = useMemo(() => {
    function belongsToMe(l: BudgetLine): boolean {
      if (sellerId && l.seller_id === sellerId) return true;
      if (myEmail && l.seller_email && l.seller_email.toLowerCase() === myEmail) return true;
      if (myInitialsFromName && l.seller_initials && l.seller_initials.toLowerCase() === myInitialsFromName.toLowerCase()) return true;
      if (myInitialsFromName && l.seller_name && l.seller_name.toLowerCase() === myInitialsFromName.toLowerCase()) return true;
      return false;
    }
    if (isAdmin) {
      if (backendFilter === "all") return lines;
      if (backendFilter === "mine") return lines.filter(belongsToMe);
      return lines.filter(l => (l.seller_email || "").toLowerCase() === backendFilter.toLowerCase());
    }
    return lines.filter(belongsToMe);
  }, [lines, isAdmin, sellerId, myEmail, myInitialsFromName, backendFilter]);

  // Pipeline per line.
  const pipelineByLine = useMemo(() => {
    const map: Record<string, PipelineOffer[][]> = {};
    visibleLines.forEach(l => { map[l.id] = generatePipeline(l, year); });
    return map;
  }, [visibleLines, year]);

  // Group lines by product (machine model).
  const grouped = useMemo(() => {
    const m = new Map<string, { product_key: string; product_name: string; item_number: string | null; lines: BudgetLine[] }>();
    visibleLines.forEach(l => {
      const prev = m.get(l.product_key) || { product_key: l.product_key, product_name: l.product_name, item_number: l.item_number, lines: [] };
      prev.lines.push(l);
      m.set(l.product_key, prev);
    });
    return Array.from(m.values());
  }, [visibleLines]);

  // KPI totals
  const totals = useMemo(() => {
    const annualBudget = visibleLines.reduce((s, l) => s + l.value_budget, 0);
    const annualQty = visibleLines.reduce((s, l) => s + l.qty_budget, 0);
    const sold = actuals
      .filter(a => visibleLines.some(l => l.id === a.budget_line_id))
      .reduce((acc, a) => ({ qty: acc.qty + a.qty_sold, value: acc.value + a.value_sold }), { qty: 0, value: 0 });
    const fc = forecasts
      .filter(f => visibleLines.some(l => l.id === f.budget_line_id))
      .reduce((acc, f) => ({ qty: acc.qty + f.qty_forecast, value: acc.value + f.value_forecast }), { qty: 0, value: 0 });
    const score = annualQty > 0 ? Math.round((sold.qty / annualQty) * 100) : 0;
    return { annualBudget, annualQty, sold, fc, score };
  }, [visibleLines, actuals, forecasts]);

  if (loading) return <CrmLayout pageTitle="Budget"><div className="text-sm text-slate-500">Indlæser…</div></CrmLayout>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!allowed) {
    return (
      <CrmLayout pageTitle="Budget">
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-900">Ingen adgang</h2>
          <p className="text-sm text-slate-500 mt-1">Budgetmodulet er kun tilgængeligt for Timan Backend og Timan Sælger.</p>
        </div>
      </CrmLayout>
    );
  }

  // ---- Per-line monthly derivations ----
  function lineMonthly(line: BudgetLine) {
    const split = (line.monthly_split && line.monthly_split.length === 12) ? line.monthly_split : EVEN;
    const ac = actuals.find(a => a.budget_line_id === line.id);
    const fc = forecasts.find(f => f.budget_line_id === line.id);
    const budgetMonthly = splitToMonthly(line.qty_budget, split);
    const ordersMonthly = splitToMonthly(ac?.qty_sold ?? 0, split);
    const draft = workingDraft[line.id];
    const workingMonthly = draft ?? splitToMonthly(fc?.qty_forecast ?? line.qty_budget, split);
    return { budgetMonthly, ordersMonthly, workingMonthly, ac, fc, split };
  }

  // ---- Working forecast handlers ----
  function adjustWorking(lineId: string, monthIdx: number, delta: number) {
    setWorkingDraft(prev => {
      const cur = prev[lineId] ?? (() => {
        const l = visibleLines.find(x => x.id === lineId)!;
        const fc = forecasts.find(f => f.budget_line_id === lineId);
        const split = (l.monthly_split && l.monthly_split.length === 12) ? l.monthly_split : EVEN;
        return splitToMonthly(fc?.qty_forecast ?? l.qty_budget, split);
      })();
      const next = [...cur];
      next[monthIdx] = Math.max(0, (next[monthIdx] ?? 0) + delta);
      return { ...prev, [lineId]: next };
    });
  }

  async function saveWorkingForecast() {
    const updates: BudgetForecast[] = [];
    for (const line of visibleLines) {
      const draft = workingDraft[line.id];
      if (!draft) continue;
      const fc = forecasts.find(f => f.budget_line_id === line.id);
      const qty = draft.reduce((a, b) => a + b, 0);
      const unit = line.qty_budget > 0 ? line.value_budget / line.qty_budget : 0;
      const next: BudgetForecast = {
        id: fc?.id || ("f_" + line.id),
        budget_line_id: line.id,
        qty_forecast: qty,
        value_forecast: Math.round(qty * unit),
        comments: fc?.comments ?? null,
        expected_timing: fc?.expected_timing ?? null,
        risk_level: fc?.risk_level ?? null,
        probability: fc?.probability ?? null,
        updated_at: new Date().toISOString(),
      };
      const saved = await upsertForecast(next);
      updates.push(saved);
    }
    if (updates.length) {
      setForecasts(prev => {
        const map = new Map(prev.map(f => [f.budget_line_id, f]));
        updates.forEach(u => map.set(u.budget_line_id, u));
        return Array.from(map.values());
      });
    }
    setWorkingDraft({});
    setEditWorking(false);
  }

  async function toggleLock(line: BudgetLine) {
    if (!isAdmin) return;
    const updated = await setLineLock(line.id, !line.locked, appUser?.display_name || appUser?.email || "Backend");
    if (updated) setLines(prev => prev.map(l => l.id === line.id ? updated : l));
  }

  async function removeLine(id: string) {
    if (!isAdmin) return;
    if (!confirm("Slet denne budgetlinje?")) return;
    await deleteBudgetLine(id);
    setLines(prev => prev.filter(l => l.id !== id));
  }

  async function addLine() {
    const product = findProduct(newRow.product_key);
    if (!product) return;
    if (product.status === "coming_soon") {
      if (!confirm(`${product.name} er markeret som "Kommer snart". Tilføj alligevel?`)) return;
    }
    const unit = product.priceDKK || 0;
    const qty = Math.max(0, Number(newRow.qty_budget) || 0);
    const created = await createBudgetLine({
      year,
      product_key: product.key,
      product_name: product.name,
      item_number: product.varenr,
      category: product.category,
      seller_id: !isAdmin && sellerId ? sellerId : null,
      seller_name: newRow.seller_name || (appUser?.display_name ?? null),
      country: newRow.country || null,
      qty_budget: qty,
      value_budget: qty * unit,
      monthly_split: EVEN,
      notes: newRow.notes || null,
    });
    setLines(prev => [...prev, created]);
    setShowAdd(false);
    setNewRow({ product_key: BUDGET_PRODUCTS[0].key, seller_name: "", country: "DK", qty_budget: 1, notes: "" });
  }

  // void to silence unused warning for upsertBudgetLine import (kept for future inline edits)
  void upsertBudgetLine;

  // ---- Render ----
  const monthCols = MONTHS_DA;

  return (
    <CrmLayout pageTitle="Budget">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-600" /> Årligt budget {year}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin ? "Administrer officielle budgetter, lås og se forecast på tværs af sælgere." : "Se dit eget budget og opdater dit working forecast."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <Calendar className="h-4 w-4 text-slate-500" />
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="text-sm bg-transparent outline-none"
            >
              {availableYears().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {!editWorking ? (
            <button
              onClick={() => setEditWorking(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 shadow-sm"
            >
              <Edit3 className="h-4 w-4" /> Rediger arbejdsbudget
            </button>
          ) : (
            <>
              <button
                onClick={() => { setWorkingDraft({}); setEditWorking(false); }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2 shadow-sm"
              >
                <X className="h-4 w-4" /> Annuller
              </button>
              <button
                onClick={saveWorkingForecast}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 shadow-sm"
              >
                <Save className="h-4 w-4" /> Gem arbejdsbudget
              </button>
            </>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 shadow-sm"
            >
              <Plus className="h-4 w-4" /> Ny budgetlinje
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <KpiCard label="Budget (stk.)" value={`${totals.annualQty}`} sub={fmtDKK(totals.annualBudget)} icon={Wallet} tone="primary" />
        <KpiCard label="Ordrer (stk.)" value={`${totals.sold.qty}`} sub={fmtDKK(totals.sold.value)} icon={Wallet} tone="ok" />
        <KpiCard label="Arbejdsbudget" value={`${totals.fc.qty}`} sub={fmtDKK(totals.fc.value)} icon={Wallet} tone="warn" />
        <KpiCard label="Score" value={`${totals.score}%`} sub={`${totals.sold.qty} / ${totals.annualQty} stk.`} icon={Wallet} />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-300" /> Budget</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> Ordrer</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-400" /> Pipeline / tilbud</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-900" /> Arbejdsbudget</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-500" /> Performance −</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> Performance +</span>
      </div>

      {/* Matrix */}
      <TooltipProvider delayDuration={150}>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-900 text-slate-100">
                  <th className="sticky left-0 z-10 bg-slate-900 text-left px-3 py-2.5 font-semibold w-56 min-w-[14rem]">Model & Kategori</th>
                  {monthCols.map(m => (
                    <th key={m} className="px-2 py-2.5 font-medium text-center w-16">{m}</th>
                  ))}
                  <th className="px-2 py-2.5 font-semibold text-center w-20">Total</th>
                  <th className="px-2 py-2.5 font-semibold text-center w-16">Score</th>
                </tr>
              </thead>
              <tbody>
                {busy && (
                  <tr><td colSpan={15} className="px-3 py-10 text-center text-slate-500">Indlæser budget…</td></tr>
                )}
                {!busy && grouped.length === 0 && (
                  <tr><td colSpan={15} className="px-3 py-10 text-center text-slate-500">Ingen budgetlinjer for dette år.</td></tr>
                )}

                {grouped.map(group => {
                  // Aggregate per group across its lines (same machine, possibly multiple sellers).
                  const agg = (key: "budgetMonthly" | "ordersMonthly" | "workingMonthly") => {
                    const arr = Array.from({ length: 12 }, () => 0);
                    group.lines.forEach(l => {
                      const m = lineMonthly(l)[key];
                      m.forEach((v, i) => { arr[i] += v; });
                    });
                    return arr;
                  };
                  const budgetMonthly = agg("budgetMonthly");
                  const ordersMonthly = agg("ordersMonthly");
                  const workingMonthly = agg("workingMonthly");

                  const pipelineMonthly: PipelineOffer[][] = Array.from({ length: 12 }, () => []);
                  group.lines.forEach(l => {
                    const p = pipelineByLine[l.id] || [];
                    p.forEach((arr, i) => { pipelineMonthly[i].push(...arr); });
                  });

                  const totalBudget = budgetMonthly.reduce((a, b) => a + b, 0);
                  const totalOrders = ordersMonthly.reduce((a, b) => a + b, 0);
                  const totalWorking = workingMonthly.reduce((a, b) => a + b, 0);
                  const totalPipeline = pipelineMonthly.reduce((s, x) => s + x.length, 0);
                  const totalPerf = totalOrders - totalBudget;
                  const scorePct = totalBudget > 0 ? Math.round((totalOrders / totalBudget) * 100) : 0;
                  const scoreTone =
                    scorePct >= 100 ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                    scorePct >= 70  ? "bg-amber-100 text-amber-800 border-amber-200" :
                                      "bg-rose-100 text-rose-800 border-rose-200";

                  // Group title row (machine name + lock controls per line below)
                  const product = findProduct(group.product_key);
                  const comingSoon = product?.status === "coming_soon";
                  const anyLocked = group.lines.some(l => l.locked);

                  return (
                    <Fragment key={group.product_key}>
                      {/* Machine title row */}
                      <tr key={`title-${group.product_key}`}>
                        <td colSpan={15} className="bg-slate-50 border-t border-slate-200 px-3 py-2">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{group.product_name}</span>
                              {group.item_number && <span className="text-xs text-slate-500 tabular-nums">· {group.item_number}</span>}
                              {comingSoon && <span className="inline-flex items-center text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">Kommer snart</span>}
                              {anyLocked && <span className="inline-flex items-center gap-1 text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200"><Lock className="h-3 w-3" /> Låst</span>}
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1">
                                {group.lines.map(l => (
                                  <span key={l.id} className="inline-flex items-center gap-1 text-xs text-slate-600">
                                    <span className="text-slate-500">{l.seller_name || "—"}</span>
                                    <button onClick={() => toggleLock(l)} className="p-1 rounded hover:bg-slate-200" title={l.locked ? "Lås op" : "Lås"}>
                                      {l.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                                    </button>
                                    <button onClick={() => removeLine(l.id)} className="p-1 rounded hover:bg-rose-100 text-rose-600" title="Slet linje">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* BUDGET / ORDRER */}
                      <tr key={`bo-${group.product_key}`} className="bg-slate-50/60">
                        <td className="sticky left-0 z-10 bg-slate-50/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">BUDGET / ORDRER</td>
                        {budgetMonthly.map((b, i) => {
                          const o = ordersMonthly[i];
                          return (
                            <td key={i} className="px-2 py-2 text-center tabular-nums text-xs">
                              <span className="text-slate-500">{b}</span>
                              <span className="text-slate-400 mx-0.5">/</span>
                              <span className={cn("font-semibold", o > 0 ? "text-emerald-600" : "text-emerald-600/40")}>{o}</span>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center tabular-nums text-xs font-semibold">
                          <span className="text-slate-600">{totalBudget}</span>
                          <span className="text-slate-400 mx-0.5">/</span>
                          <span className="text-emerald-700">{totalOrders}</span>
                        </td>
                        <td className="px-2 py-2"></td>
                      </tr>

                      {/* PIPELINE */}
                      <tr key={`pipe-${group.product_key}`} className="bg-amber-50/40">
                        <td className="sticky left-0 z-10 bg-amber-50/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">PIPELINE (TILBUD)</td>
                        {pipelineMonthly.map((offers, i) => {
                          const count = offers.length;
                          const sum = offers.reduce((a, b) => a + b.value, 0);
                          if (count === 0) {
                            return <td key={i} className="px-2 py-2 text-center text-amber-700/40 text-xs">−</td>;
                          }
                          return (
                            <td key={i} className="px-1 py-2 text-center">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-200 hover:bg-amber-200 transition">
                                    {count}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-sm">
                                  <div className="text-xs space-y-2">
                                    <div className="font-semibold border-b border-slate-200 pb-1">
                                      {count} tilbud · {fmtDKK(sum)}
                                    </div>
                                    {offers.map((o, idx) => (
                                      <div key={idx} className="space-y-0.5 pb-1.5 border-b border-slate-100 last:border-0">
                                        <div className="font-medium">{o.offer_no} · {o.status}</div>
                                        <div className="text-slate-600">{o.dealer}</div>
                                        <div className="text-slate-600">Kunde: {o.customer}</div>
                                        <div className="text-slate-600">Maskine: {group.product_name}</div>
                                        <div className="text-slate-600">Redskab: {o.attachment}</div>
                                        <div className="flex justify-between">
                                          <span className="text-slate-500">Sendt: {fmtDate(o.sent_date)}</span>
                                          <span className="font-semibold tabular-nums">{fmtDKK(o.value)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center text-xs font-semibold text-amber-800 tabular-nums">{totalPipeline}</td>
                        <td className="px-2 py-2"></td>
                      </tr>

                      {/* ARBEJDSBUDGET */}
                      <tr key={`work-${group.product_key}`} className="bg-slate-900 text-slate-100">
                        <td className="sticky left-0 z-10 bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-200">ARBEJDSBUDGET</td>
                        {workingMonthly.map((w, i) => (
                          <td key={i} className="px-1 py-1.5 text-center tabular-nums text-xs">
                            {editWorking ? (
                              <div className="inline-flex items-center gap-0.5 bg-slate-800 rounded px-0.5">
                                <button
                                  onClick={() => {
                                    // Decrement on the first line of the group (simple model).
                                    const target = group.lines[0];
                                    adjustWorking(target.id, i, -1);
                                  }}
                                  className="p-0.5 hover:bg-slate-700 rounded"
                                  title="−1"
                                ><Minus className="h-3 w-3" /></button>
                                <span className="min-w-[16px] text-center font-semibold">{w}</span>
                                <button
                                  onClick={() => {
                                    const target = group.lines[0];
                                    adjustWorking(target.id, i, +1);
                                  }}
                                  className="p-0.5 hover:bg-slate-700 rounded"
                                  title="+1"
                                ><Plus className="h-3 w-3" /></button>
                              </div>
                            ) : (
                              <span className="font-semibold">{w}</span>
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center tabular-nums text-xs font-semibold">{totalWorking}</td>
                        <td className="px-2 py-2"></td>
                      </tr>

                      {/* PERFORMANCE */}
                      <tr key={`perf-${group.product_key}`} className="border-b-2 border-slate-200">
                        <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">PERFORMANCE</td>
                        {ordersMonthly.map((o, i) => {
                          const diff = o - budgetMonthly[i];
                          let cls = "text-slate-400";
                          let label: string = "•";
                          if (diff > 0) { cls = "text-emerald-600 font-semibold"; label = `+${diff}`; }
                          else if (diff < 0) { cls = "text-rose-600 font-semibold"; label = `${diff}`; }
                          return (
                            <td key={i} className={cn("px-2 py-2 text-center tabular-nums text-xs", cls)}>{label}</td>
                          );
                        })}
                        <td className={cn("px-2 py-2 text-center tabular-nums text-xs font-bold",
                          totalPerf > 0 ? "text-emerald-700" : totalPerf < 0 ? "text-rose-700" : "text-slate-500")}>
                          {totalPerf > 0 ? `+${totalPerf}` : totalPerf}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className={cn("inline-flex items-center justify-center min-w-[44px] px-2 py-0.5 rounded-full border text-xs font-semibold tabular-nums", scoreTone)}>
                            {scorePct}%
                          </span>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </TooltipProvider>

      {/* Add modal */}
      {showAdd && isAdmin && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Ny budgetlinje · {year}</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-slate-100 rounded"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-slate-600">Produkt</span>
                <select className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.product_key} onChange={(e) => setNewRow(r => ({ ...r, product_key: e.target.value }))}>
                  {BUDGET_PRODUCTS.map(p => (
                    <option key={p.key} value={p.key}>
                      {p.name} {p.varenr ? `· ${p.varenr}` : ""} {p.status === "coming_soon" ? "(kommer snart)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-slate-600">Sælger</span>
                  <input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.seller_name} onChange={(e) => setNewRow(r => ({ ...r, seller_name: e.target.value }))} placeholder="Navn" />
                </label>
                <label className="block">
                  <span className="text-xs text-slate-600">Land</span>
                  <input className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.country} onChange={(e) => setNewRow(r => ({ ...r, country: e.target.value }))} />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-slate-600">Antal (qty budget)</span>
                <input type="number" min={0} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.qty_budget} onChange={(e) => setNewRow(r => ({ ...r, qty_budget: Number(e.target.value) }))} />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">Noter</span>
                <textarea rows={2} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" value={newRow.notes} onChange={(e) => setNewRow(r => ({ ...r, notes: e.target.value }))} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Annuller</button>
              <button onClick={addLine} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-2"><Plus className="h-4 w-4" /> Opret</button>
            </div>
          </div>
        </div>
      )}
    </CrmLayout>
  );
}
