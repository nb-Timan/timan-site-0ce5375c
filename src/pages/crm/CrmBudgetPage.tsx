import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Lock, Unlock, Plus, Trash2, Edit3, Save, X, ShieldAlert, Calendar,
  TrendingUp, Target, Wallet, BarChart3, Award, Hourglass, Sparkles,
} from "lucide-react";
import CrmLayout from "@/components/crm/CrmLayout";
import { useAppUser } from "@/context/AppUserContext";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isScopedSeller } from "@/lib/crmScope";
import { resolveSellerId } from "@/lib/resolveSellerId";
import { cn } from "@/lib/utils";
import {
  BUDGET_PRODUCTS, MONTHS_DA, availableYears, fmtDKK,
  listBudgetLines, listForecasts, listSalesActuals,
  createBudgetLine, upsertBudgetLine, deleteBudgetLine, setLineLock, upsertForecast,
  type BudgetLine, type BudgetForecast, type SalesActual, findProduct,
} from "@/lib/crmBudgetService";

const EVEN: number[] = Array.from({ length: 12 }, () => 1 / 12);

function StatusPill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "ok" | "warn" | "info" }) {
  const map = {
    muted: "bg-slate-100 text-slate-700 border-slate-200",
    ok:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn:  "bg-amber-50 text-amber-800 border-amber-200",
    info:  "bg-sky-50 text-sky-800 border-sky-200",
  } as const;
  return <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border", map[tone])}>{children}</span>;
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<BudgetLine> | null>(null);
  const [forecastDraft, setForecastDraft] = useState<Record<string, BudgetForecast>>({});
  const [showAdd, setShowAdd] = useState(false);
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

  const visibleLines = useMemo(() => {
    if (isAdmin) return lines;
    // Seller: show own assigned only (match by seller_id when present, else by display_name).
    return lines.filter(l =>
      (sellerId && l.seller_id === sellerId) ||
      (!l.seller_id && appUser?.display_name && l.seller_name === appUser.display_name)
    );
  }, [lines, isAdmin, sellerId, appUser?.display_name]);

  const totals = useMemo(() => {
    const annualBudget = visibleLines.reduce((s, l) => s + l.value_budget, 0);
    const annualQty = visibleLines.reduce((s, l) => s + l.qty_budget, 0);
    const sold = actuals
      .filter(a => visibleLines.some(l => l.id === a.budget_line_id))
      .reduce((acc, a) => ({ qty: acc.qty + a.qty_sold, value: acc.value + a.value_sold }), { qty: 0, value: 0 });
    const fc = forecasts
      .filter(f => visibleLines.some(l => l.id === f.budget_line_id))
      .reduce((acc, f) => ({ qty: acc.qty + f.qty_forecast, value: acc.value + f.value_forecast }), { qty: 0, value: 0 });
    const remaining = Math.max(0, annualBudget - sold.value);
    const achievement = annualBudget > 0 ? Math.round((sold.value / annualBudget) * 100) : 0;
    return { annualBudget, annualQty, sold, fc, remaining, achievement };
  }, [visibleLines, actuals, forecasts]);

  const monthly = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => ({ budget: 0, actual: 0, forecast: 0 }));
    visibleLines.forEach(l => {
      const split = (l.monthly_split && l.monthly_split.length === 12) ? l.monthly_split : EVEN;
      split.forEach((s, i) => { arr[i].budget += l.value_budget * s; });
      const fc = forecasts.find(f => f.budget_line_id === l.id);
      if (fc) split.forEach((s, i) => { arr[i].forecast += fc.value_forecast * s; });
    });
    return arr;
  }, [visibleLines, forecasts]);

  const sellerPerf = useMemo(() => {
    if (!isAdmin) return [];
    const m = new Map<string, { seller: string; budget: number; sold: number; forecast: number }>();
    visibleLines.forEach(l => {
      const k = l.seller_name || "Ikke tildelt";
      const prev = m.get(k) || { seller: k, budget: 0, sold: 0, forecast: 0 };
      prev.budget += l.value_budget;
      prev.sold += actuals.find(a => a.budget_line_id === l.id)?.value_sold || 0;
      prev.forecast += forecasts.find(f => f.budget_line_id === l.id)?.value_forecast || 0;
      m.set(k, prev);
    });
    return Array.from(m.values()).sort((a, b) => b.budget - a.budget);
  }, [visibleLines, actuals, forecasts, isAdmin]);

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

  // ---- Edit handlers ----
  function startEdit(line: BudgetLine) {
    if (line.locked && !isAdmin) return;
    setEditingId(line.id);
    setEditDraft({ qty_budget: line.qty_budget, value_budget: line.value_budget, notes: line.notes || "", seller_name: line.seller_name || "", country: line.country || "" });
  }
  async function saveEdit(line: BudgetLine) {
    if (!editDraft) return;
    const updated: BudgetLine = {
      ...line,
      qty_budget: Number(editDraft.qty_budget) || 0,
      value_budget: Number(editDraft.value_budget) || 0,
      notes: editDraft.notes ?? null,
      seller_name: editDraft.seller_name || null,
      country: editDraft.country || null,
    };
    await upsertBudgetLine(updated);
    setLines(prev => prev.map(l => l.id === line.id ? updated : l));
    setEditingId(null); setEditDraft(null);
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
      // Allowed but warn — show inline notice via alert for Phase 1.
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

  async function saveForecast(line: BudgetLine) {
    const draft = forecastDraft[line.id];
    if (!draft) return;
    const saved = await upsertForecast({ ...draft, updated_at: new Date().toISOString() });
    setForecasts(prev => {
      const idx = prev.findIndex(f => f.budget_line_id === line.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
    setForecastDraft(prev => { const next = { ...prev }; delete next[line.id]; return next; });
  }

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard label="Årligt budget" value={fmtDKK(totals.annualBudget)} sub={`${totals.annualQty} stk.`} icon={Wallet} tone="primary" />
        <KpiCard label="Solgt ÅTD" value={fmtDKK(totals.sold.value)} sub={`${totals.sold.qty} stk.`} icon={TrendingUp} tone="ok" />
        <KpiCard label="Resterende" value={fmtDKK(totals.remaining)} icon={Hourglass} />
        <KpiCard label="Forecast" value={fmtDKK(totals.fc.value)} sub={`${totals.fc.qty} stk.`} icon={Target} tone="warn" />
        <KpiCard label="Måluddrag" value={`${totals.achievement}%`} icon={Award} />
      </div>

      {/* Budget table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-slate-500" /> Budget tabel</h3>
          <span className="text-xs text-slate-500">{visibleLines.length} linjer</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Produkt</th>
                <th className="px-3 py-2 font-medium">Varenr</th>
                <th className="px-3 py-2 font-medium">Sælger</th>
                <th className="px-3 py-2 font-medium">Land</th>
                <th className="px-3 py-2 font-medium text-right">Off. budget qty</th>
                <th className="px-3 py-2 font-medium text-right">Off. budget værdi</th>
                <th className="px-3 py-2 font-medium text-right">Forecast qty</th>
                <th className="px-3 py-2 font-medium text-right">Forecast værdi</th>
                <th className="px-3 py-2 font-medium text-right">Solgt</th>
                <th className="px-3 py-2 font-medium text-right">Rest</th>
                <th className="px-3 py-2 font-medium text-right">Progress</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibleLines.length === 0 && (
                <tr><td colSpan={13} className="px-3 py-10 text-center text-slate-500">{busy ? "Indlæser budget…" : "Ingen budgetlinjer for dette år."}</td></tr>
              )}
              {visibleLines.map(line => {
                const fc = forecasts.find(f => f.budget_line_id === line.id);
                const ac = actuals.find(a => a.budget_line_id === line.id);
                const sold = ac?.value_sold || 0;
                const soldQty = ac?.qty_sold || 0;
                const remainingV = Math.max(0, line.value_budget - sold);
                const remainingQ = Math.max(0, line.qty_budget - soldQty);
                const pct = line.value_budget > 0 ? Math.min(100, Math.round((sold / line.value_budget) * 100)) : 0;
                const editing = editingId === line.id;
                const product = findProduct(line.product_key);
                const comingSoon = product?.status === "coming_soon";
                return (
                  <tr key={line.id} className="border-t border-slate-100 hover:bg-slate-50/40">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{line.product_name}</div>
                      {comingSoon && <StatusPill tone="warn">Kommer snart</StatusPill>}
                    </td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">{line.item_number || "—"}</td>
                    <td className="px-3 py-2">
                      {editing && isAdmin
                        ? <input className="w-32 border border-slate-200 rounded px-2 py-1 text-sm" value={editDraft?.seller_name ?? ""} onChange={(e) => setEditDraft(d => ({ ...d, seller_name: e.target.value }))} />
                        : <span className="text-slate-700">{line.seller_name || <span className="text-slate-400">Ikke tildelt</span>}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {editing && isAdmin
                        ? <input className="w-16 border border-slate-200 rounded px-2 py-1 text-sm" value={editDraft?.country ?? ""} onChange={(e) => setEditDraft(d => ({ ...d, country: e.target.value }))} />
                        : <span className="text-slate-700">{line.country || "—"}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {editing
                        ? <input type="number" className="w-20 border border-slate-200 rounded px-2 py-1 text-sm text-right" value={editDraft?.qty_budget ?? 0} onChange={(e) => setEditDraft(d => ({ ...d, qty_budget: Number(e.target.value) }))} />
                        : line.qty_budget}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {editing
                        ? <input type="number" className="w-28 border border-slate-200 rounded px-2 py-1 text-sm text-right" value={editDraft?.value_budget ?? 0} onChange={(e) => setEditDraft(d => ({ ...d, value_budget: Number(e.target.value) }))} />
                        : fmtDKK(line.value_budget)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <input
                        type="number"
                        className="w-20 border border-slate-200 rounded px-2 py-1 text-sm text-right"
                        defaultValue={fc?.qty_forecast ?? line.qty_budget}
                        onChange={(e) => setForecastDraft(prev => ({
                          ...prev,
                          [line.id]: {
                            id: fc?.id || ("f_" + line.id),
                            budget_line_id: line.id,
                            qty_forecast: Number(e.target.value),
                            value_forecast: prev[line.id]?.value_forecast ?? fc?.value_forecast ?? line.value_budget,
                            comments: prev[line.id]?.comments ?? fc?.comments ?? null,
                            expected_timing: prev[line.id]?.expected_timing ?? fc?.expected_timing ?? null,
                            risk_level: prev[line.id]?.risk_level ?? fc?.risk_level ?? null,
                            probability: prev[line.id]?.probability ?? fc?.probability ?? null,
                            updated_at: new Date().toISOString(),
                          },
                        }))}
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <input
                        type="number"
                        className="w-28 border border-slate-200 rounded px-2 py-1 text-sm text-right"
                        defaultValue={fc?.value_forecast ?? line.value_budget}
                        onChange={(e) => setForecastDraft(prev => ({
                          ...prev,
                          [line.id]: {
                            id: fc?.id || ("f_" + line.id),
                            budget_line_id: line.id,
                            qty_forecast: prev[line.id]?.qty_forecast ?? fc?.qty_forecast ?? line.qty_budget,
                            value_forecast: Number(e.target.value),
                            comments: prev[line.id]?.comments ?? fc?.comments ?? null,
                            expected_timing: prev[line.id]?.expected_timing ?? fc?.expected_timing ?? null,
                            risk_level: prev[line.id]?.risk_level ?? fc?.risk_level ?? null,
                            probability: prev[line.id]?.probability ?? fc?.probability ?? null,
                            updated_at: new Date().toISOString(),
                          },
                        }))}
                      />
                      {forecastDraft[line.id] && (
                        <button onClick={() => saveForecast(line)} className="ml-2 text-xs text-emerald-700 hover:underline">Gem</button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtDKK(sold)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{fmtDKK(remainingV)}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className={cn("h-full", pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-emerald-400" : pct >= 30 ? "bg-amber-400" : "bg-slate-300")} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-slate-600">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {line.locked
                        ? <StatusPill tone="info"><Lock className="h-3 w-3" /> Låst {line.locked_by ? `· ${line.locked_by}` : ""}</StatusPill>
                        : <StatusPill tone="ok"><Unlock className="h-3 w-3" /> Åben</StatusPill>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editing ? (
                        <div className="inline-flex gap-1">
                          <button onClick={() => saveEdit(line)} className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded" title="Gem"><Save className="h-4 w-4" /></button>
                          <button onClick={() => { setEditingId(null); setEditDraft(null); }} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Annuller"><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <div className="inline-flex gap-1">
                          {(!line.locked || isAdmin) && (
                            <button onClick={() => startEdit(line)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded" title="Rediger"><Edit3 className="h-4 w-4" /></button>
                          )}
                          {isAdmin && (
                            <button onClick={() => toggleLock(line)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded" title={line.locked ? "Lås op" : "Lås"}>
                              {line.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            </button>
                          )}
                          {isAdmin && (
                            <button onClick={() => removeLine(line.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded" title="Slet"><Trash2 className="h-4 w-4" /></button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly split + Product progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-500" /> Måned-fordeling</h3>
          <div className="space-y-2">
            {MONTHS_DA.map((m, i) => {
              const row = monthly[i];
              const max = Math.max(1, ...monthly.map(x => Math.max(x.budget, x.forecast, x.actual)));
              return (
                <div key={m} className="flex items-center gap-3 text-xs">
                  <div className="w-8 text-slate-500">{m}</div>
                  <div className="flex-1 h-2 bg-slate-100 rounded relative overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-emerald-500/70" style={{ width: `${(row.budget / max) * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-amber-400/70 mix-blend-multiply" style={{ width: `${(row.forecast / max) * 100}%` }} />
                  </div>
                  <div className="w-24 text-right text-slate-600 tabular-nums">{fmtDKK(row.budget)}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Budget</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Forecast</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300" /> Faktisk (kommer)</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><Target className="h-4 w-4 text-slate-500" /> Produkt-progression</h3>
          <div className="space-y-3">
            {BUDGET_PRODUCTS.map(p => {
              const linesP = visibleLines.filter(l => l.product_key === p.key);
              const budget = linesP.reduce((s, l) => s + l.value_budget, 0);
              const sold = linesP.reduce((s, l) => s + (actuals.find(a => a.budget_line_id === l.id)?.value_sold || 0), 0);
              const pct = budget > 0 ? Math.min(100, Math.round((sold / budget) * 100)) : 0;
              return (
                <div key={p.key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{p.name}</span>
                      {p.status === "coming_soon" && <StatusPill tone="warn">Kommer snart</StatusPill>}
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums">{fmtDKK(sold)} / {fmtDKK(budget)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className={cn("h-full", pct >= 60 ? "bg-emerald-500" : pct >= 30 ? "bg-amber-400" : "bg-slate-300")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Seller performance — admin only */}
      {isAdmin && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 mb-10">
          <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2"><Award className="h-4 w-4 text-slate-500" /> Sælger budget-performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-600">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Sælger</th>
                  <th className="px-3 py-2 font-medium text-right">Budget</th>
                  <th className="px-3 py-2 font-medium text-right">Solgt</th>
                  <th className="px-3 py-2 font-medium text-right">Forecast</th>
                  <th className="px-3 py-2 font-medium text-right">Måluddrag</th>
                </tr>
              </thead>
              <tbody>
                {sellerPerf.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Ingen sælgerdata.</td></tr>}
                {sellerPerf.map(r => {
                  const pct = r.budget > 0 ? Math.round((r.sold / r.budget) * 100) : 0;
                  return (
                    <tr key={r.seller} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{r.seller}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDKK(r.budget)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDKK(r.sold)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtDKK(r.forecast)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
