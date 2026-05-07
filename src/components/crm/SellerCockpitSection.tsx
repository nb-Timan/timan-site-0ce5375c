/**
 * Seller Cockpit — drop-in section for the CRM Dashboard.
 *
 * Adds three premium pieces above the existing pipeline visuals:
 *   1. Seller switcher (Backend only) — Alle / BP / EM / JTN / AKR
 *   2. "Lead Fokus" + "Budget Fokus" cards (two columns)
 *   3. Backend extras — mini seller comparison + quick alerts
 *
 * Reuses:
 *   - listLeads()           → urgency classification by next_followup_date
 *   - listBudgetLines / listForecasts / listSalesActuals → per-machine score
 *   - listActivities()      → for orders/pipeline counts in comparison
 *   - BUDGET_SELLERS        → canonical seller list (BP/EM/JTN/AKR)
 *   - useLanguage / Language → DA/EN/DE labels
 *
 * No backend writes, no route changes, no auth changes.
 */
import { useEffect, useMemo, useState } from "react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useLanguage } from "@/context/LanguageContext";
import { Language } from "@/types/configurator";
import { listLeads, type CrmLead } from "@/lib/crmLeadsService";
import {
  listBudgetLines, listForecasts, listSalesActuals, aggregateBudget,
  BUDGET_SELLERS, type BudgetLine, type BudgetForecast, type SalesActual,
} from "@/lib/crmBudgetService";
import { listActivities, type CrmActivity } from "@/lib/crmActivitiesService";
import { AlertTriangle, Flame, Target, Users, Filter, TrendingUp, Clock } from "lucide-react";
import { Link } from "react-router-dom";

// ────────────────────────────────────────────────────────────
// Translations (DA / EN / DE — others fall back to EN)
// ────────────────────────────────────────────────────────────
const LT: Record<string, Record<Language, string>> = {
  cockpit_seller:   { da: "Sælger",                en: "Seller",            de: "Verkäufer",          it: "Venditore",          hu: "Értékesítő" },
  cockpit_all:      { da: "Alle",                  en: "All",               de: "Alle",               it: "Tutti",              hu: "Mind" },
  lead_fokus:       { da: "Lead Fokus",            en: "Lead focus",        de: "Lead-Fokus",         it: "Focus lead",         hu: "Lead fókusz" },
  lead_fokus_sub:   { da: "Hvor skal du handle nu?", en: "Where to act now?", de: "Wo handeln?",      it: "Dove agire ora?",    hu: "Hol cselekedj most?" },
  budget_fokus:     { da: "Budget Fokus",          en: "Budget focus",      de: "Budget-Fokus",       it: "Focus budget",       hu: "Költség fókusz" },
  budget_fokus_sub: { da: "Når du dit budget?",    en: "Hitting your budget?", de: "Budgetziel?",     it: "Sei in target?",     hu: "Tartod a kerted?" },
  urgency_overdue:  { da: "Forfalden",             en: "Overdue",           de: "Überfällig",         it: "Scaduto",            hu: "Lejárt" },
  urgency_soon:     { da: "Inden 20 dage",         en: "Within 20 days",    de: "In 20 Tagen",        it: "Entro 20 giorni",    hu: "20 napon belül" },
  urgency_later:    { da: "Inden 2 måneder",       en: "Within 2 months",   de: "In 2 Monaten",       it: "Entro 2 mesi",       hu: "2 hónapon belül" },
  urgency_none:     { da: "Uden opfølgning",       en: "No follow-up",      de: "Keine Nachverfolgung", it: "Senza follow-up",  hu: "Nincs követés" },
  no_leads:         { da: "Ingen åbne leads",      en: "No open leads",     de: "Keine offenen Leads", it: "Nessun lead aperto", hu: "Nincs nyitott lead" },
  budget_qty:       { da: "Budget",                en: "Budget",            de: "Budget",             it: "Budget",             hu: "Terv" },
  orders_qty:       { da: "Ordrer",                en: "Orders",            de: "Aufträge",           it: "Ordini",             hu: "Rendelés" },
  pipeline_qty:     { da: "Pipeline",              en: "Pipeline",          de: "Pipeline",           it: "Pipeline",           hu: "Pipeline" },
  forecast_qty:     { da: "Arbejdsbudget",         en: "Working forecast",  de: "Arbeitsprognose",    it: "Previsione di lavoro", hu: "Munkaterv" },
  remaining_gap:    { da: "Mangler",               en: "Remaining gap",     de: "Fehlt",              it: "Manca",              hu: "Hátralévő" },
  score_pct:        { da: "Score",                 en: "Score",             de: "Score",              it: "Score",              hu: "Pont" },
  comparison:       { da: "Sælger sammenligning",  en: "Seller comparison", de: "Verkäufer-Vergleich", it: "Confronto venditori", hu: "Értékesítő összehasonlítás" },
  alerts:           { da: "Hurtige advarsler",     en: "Quick alerts",      de: "Schnelle Hinweise",  it: "Avvisi rapidi",      hu: "Gyors figyelmeztetések" },
  alert_overdue:    { da: "{n} forfaldne leads",   en: "{n} overdue leads", de: "{n} überfällige Leads", it: "{n} lead scaduti", hu: "{n} lejárt lead" },
  alert_no_follow:  { da: "{n} leads uden opfølgning", en: "{n} leads with no follow-up", de: "{n} Leads ohne Termin", it: "{n} lead senza follow-up", hu: "{n} lead követés nélkül" },
  alert_above:      { da: "{pct}% af budget",      en: "{pct}% of budget",  de: "{pct}% vom Budget",  it: "{pct}% del budget",  hu: "{pct}% a tervből" },
  no_alerts:        { da: "Ingen advarsler — godt arbejde!", en: "No alerts — great work!", de: "Keine Hinweise — top!", it: "Nessun avviso — ottimo!", hu: "Nincs figyelmeztetés!" },
  metric_orders:    { da: "Ordrer %",              en: "Orders %",          de: "Aufträge %",         it: "Ordini %",           hu: "Rendelés %" },
  metric_pipeline:  { da: "Pipeline %",            en: "Pipeline %",        de: "Pipeline %",         it: "Pipeline %",         hu: "Pipeline %" },
  metric_health:    { da: "Lead helbred %",        en: "Lead health %",     de: "Lead-Gesundheit %",  it: "Salute lead %",      hu: "Lead-egészség %" },
  metric_budget:    { da: "Budget score %",        en: "Budget score %",    de: "Budget-Score %",     it: "Score budget %",     hu: "Költség pont %" },
  no_budget:        { da: "Intet budget",          en: "No budget",         de: "Kein Budget",        it: "Nessun budget",      hu: "Nincs terv" },
};
function t(key: string, lang: Language): string {
  const row = LT[key];
  if (!row) return key;
  return row[lang] || row.en || row.da;
}

// ────────────────────────────────────────────────────────────
// Public Types
// ────────────────────────────────────────────────────────────
export interface SellerCockpitProps {
  /** True when the current portal user is Timan Backend (or equivalent admin). */
  isAdmin: boolean;
  /** The signed-in seller's email — used to scope leads/budget when not admin. */
  sellerEmail: string | null;
  /** The signed-in seller's app_users.id — used to scope leads when available. */
  sellerId: string | null;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
type Urgency = "overdue" | "soon" | "later" | "none";
const URGENCY_META: Record<Urgency, { hex: string; bar: string; ring: string; tKey: string }> = {
  overdue: { hex: "#ef4444", bar: "bg-rose-500",    ring: "bg-rose-50 text-rose-700 border-rose-200",       tKey: "urgency_overdue" },
  soon:    { hex: "#f59e0b", bar: "bg-amber-500",   ring: "bg-amber-50 text-amber-700 border-amber-200",    tKey: "urgency_soon" },
  later:   { hex: "#10b981", bar: "bg-emerald-500", ring: "bg-emerald-50 text-emerald-700 border-emerald-200", tKey: "urgency_later" },
  none:    { hex: "#94a3b8", bar: "bg-slate-400",   ring: "bg-slate-50 text-slate-700 border-slate-200",    tKey: "urgency_none" },
};

function classifyUrgency(lead: Pick<CrmLead, "next_followup_date">, now: Date): Urgency {
  const d = lead.next_followup_date ? new Date(lead.next_followup_date) : null;
  if (!d || isNaN(d.getTime())) return "none";
  const day = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((d.getTime() - now.getTime()) / day);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 20) return "soon";
  if (diffDays <= 60) return "later";
  return "later"; // very far future still counts as on-track
}

const OPEN_STAGES: ReadonlySet<string> = new Set(["Lead", "Qualified", "Offer sent", "Negotiation"]);

const MACHINES: Array<{ key: string; label: string }> = [
  { key: "RC-751",     label: "RC-751" },
  { key: "RC-1000s",   label: "RC-1000s" },
  { key: "Timan 3330", label: "Timan 3330" },
  { key: "Timan 2620", label: "Timan 2620" },
];

function scoreColor(pct: number): { bar: string; text: string } {
  if (pct >= 100) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (pct >= 80)  return { bar: "bg-amber-500",   text: "text-amber-700" };
  return            { bar: "bg-rose-500",     text: "text-rose-700" };
}

interface MachineRow {
  key: string;
  label: string;
  budgetQty: number;
  ordersQty: number;
  pipelineQty: number;
  forecastQty: number;
  remainingGap: number;
  scorePct: number;
}

function fmtDate(iso: string | null, lang: Language): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(lang === "da" ? "da-DK" : lang === "de" ? "de-DE" : "en-GB"); }
  catch { return iso; }
}

// Map activities (orders) → per-machine count for a given seller email/id.
function ordersByMachine(activities: CrmActivity[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of activities) {
    if (a.activity_type !== "order_sent" && a.activity_type !== "order_created") continue;
    if ((a.status || "").toLowerCase() === "lost") continue;
    const meta = (a.meta || {}) as Record<string, unknown>;
    const types = Array.isArray(meta.machine_types) ? (meta.machine_types as string[]) : [];
    const haystack = [a.title || "", ...types].join(" ").toLowerCase();
    for (const m of MACHINES) {
      if (haystack.includes(m.key.toLowerCase())) {
        out[m.key] = (out[m.key] || 0) + 1;
      }
    }
  }
  return out;
}

function pipelineByMachine(leads: CrmLead[]): Record<string, number> {
  const out: Record<string, number> = {};
  const open = new Set(["Lead", "Qualified", "Offer sent", "Negotiation"]);
  for (const l of leads) {
    if (!open.has(l.pipeline_stage)) continue;
    for (const mt of l.machine_types || []) {
      for (const m of MACHINES) {
        if ((mt || "").toLowerCase().includes(m.key.toLowerCase())) {
          out[m.key] = (out[m.key] || 0) + 1;
        }
      }
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Section
// ────────────────────────────────────────────────────────────
export default function SellerCockpitSection({ isAdmin, sellerEmail, sellerId }: SellerCockpitProps) {
  const { language: lang } = useLanguage();

  // Backend can switch — sellers see only themselves. The dropdown holds the
  // INITIALS of the active seller (or null = "Alle" for backend).
  const ownInitials = useMemo(() => {
    if (!sellerEmail) return null;
    const found = BUDGET_SELLERS.find(s => s.email.toLowerCase() === sellerEmail.toLowerCase());
    return found?.initials ?? null;
  }, [sellerEmail]);

  const [activeInitials, setActiveInitials] = useState<string | null>(isAdmin ? null : ownInitials);
  useEffect(() => {
    if (!isAdmin) setActiveInitials(ownInitials);
  }, [isAdmin, ownInitials]);

  const activeSeller = activeInitials ? BUDGET_SELLERS.find(s => s.initials === activeInitials) : null;

  // ── Data fetch — keeps the page snappy by pulling once per role/seller change ──
  const [allLeads, setAllLeads] = useState<CrmLead[]>([]);
  const [allActivities, setAllActivities] = useState<CrmActivity[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [forecasts, setForecasts] = useState<BudgetForecast[]>([]);
  const [actuals, setActuals] = useState<SalesActual[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [leads, acts, lines, fc, ac] = await Promise.all([
          // Sellers fetch only their own leads; backend fetches all.
          listLeads({ ownerUserId: isAdmin ? null : sellerId, limit: 500 }),
          listActivities({ ownerUserId: isAdmin ? null : sellerId, limit: 500 }),
          listBudgetLines({ year: new Date().getFullYear() < 2026 ? 2026 : new Date().getFullYear() }),
          listForecasts(new Date().getFullYear() < 2026 ? 2026 : new Date().getFullYear()),
          listSalesActuals(new Date().getFullYear() < 2026 ? 2026 : new Date().getFullYear()),
        ]);
        if (cancelled) return;
        setAllLeads(leads);
        setAllActivities(acts);
        setBudgetLines(lines);
        setForecasts(fc);
        setActuals(ac);
      } catch (err) {
        // Defensive — never throw from a dashboard widget.
        console.warn("[SellerCockpit] data load failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, sellerId]);

  // Filter by selected seller (backend only). For sellers, data is already scoped.
  const scopedLeads = useMemo(() => {
    if (!activeSeller) return allLeads;
    const email = activeSeller.email.toLowerCase();
    return allLeads.filter(l =>
      (l.owner_email || "").toLowerCase() === email ||
      (l.owner_name || "").toUpperCase() === activeSeller.initials,
    );
  }, [allLeads, activeSeller]);

  const scopedActivities = useMemo(() => {
    if (!activeSeller) return allActivities;
    const initials = activeSeller.initials.toLowerCase();
    return allActivities.filter(a => {
      const owner = (a.assigned_owner_name || a.created_by_name || "").toLowerCase();
      return owner.includes(initials);
    });
  }, [allActivities, activeSeller]);

  // ── Per-machine budget rollup — uses the SHARED aggregator that powers
  // CRM → Budget. Seller scope: when activeSeller is set we pass that email,
  // otherwise null (= global / all sellers, used in backend "Alle" view).
  // We deliberately do NOT add a separate orders/pipeline source here so
  // dashboard numbers always match the Budget table cell-for-cell.
  const aggregated = useMemo(
    () => aggregateBudget(budgetLines, forecasts, actuals, activeSeller?.email ?? null),
    [budgetLines, forecasts, actuals, activeSeller],
  );
  const scopedBudget = useMemo(() => {
    if (!activeSeller) return { lines: budgetLines, forecasts, actuals };
    const email = activeSeller.email.toLowerCase();
    const filteredLines = budgetLines.filter(l => (l.seller_email || "").toLowerCase() === email);
    const ids = new Set(filteredLines.map(l => l.id));
    return {
      lines: filteredLines,
      forecasts: forecasts.filter(f => ids.has(f.budget_line_id)),
      actuals: actuals.filter(a => ids.has(a.budget_line_id)),
    };
  }, [budgetLines, forecasts, actuals, activeSeller]);

  // ── Lead urgency buckets ──
  const now = new Date();
  const openLeads = scopedLeads.filter(l => OPEN_STAGES.has(l.pipeline_stage));
  const buckets: Record<Urgency, CrmLead[]> = { overdue: [], soon: [], later: [], none: [] };
  for (const l of openLeads) buckets[classifyUrgency(l, now)].push(l);
  const totalLeads = openLeads.length;

  // Pipeline qty per machine still comes from leads (Budget table doesn't
  // track pipeline; this is purely a dashboard add-on, NOT actuals).
  const pipelineMap = pipelineByMachine(scopedLeads);

  // Build machine rows from the shared aggregation. Always include the
  // canonical machine list so an empty seller still sees them, plus any
  // extras that have actual orders/budget (e.g. custom Budget products).
  const aggByKey = new Map(aggregated.byMachine.map(r => [r.product_key, r]));
  const extras = aggregated.byMachine.filter(r => !MACHINES.some(m => m.key === r.product_key));
  const machineRows: MachineRow[] = [
    ...MACHINES.map(m => {
      const r = aggByKey.get(m.key);
      return {
        key: m.key,
        label: m.label,
        budgetQty: r?.budgetQty ?? 0,
        ordersQty: r?.ordersQty ?? 0,
        pipelineQty: pipelineMap[m.key] || 0,
        forecastQty: r?.forecastQty ?? 0,
        remainingGap: r?.remainingGap ?? 0,
        scorePct: r?.scorePct ?? 0,
      } as MachineRow;
    }),
    ...extras.map(r => ({
      key: r.product_key,
      label: r.product_name,
      budgetQty: r.budgetQty,
      ordersQty: r.ordersQty,
      pipelineQty: pipelineMap[r.product_key] || 0,
      forecastQty: r.forecastQty,
      remainingGap: r.remainingGap,
      scorePct: r.scorePct,
    } as MachineRow)),
  ];


  // ── Backend comparison + alerts ──
  // Reuses the SAME aggregateBudget shared with CRM → Budget for both
  // ordersQty (actuals) and budget score, so per-seller numbers always
  // match the Budget table.
  const sellerComparison = useMemo(() => {
    if (!isAdmin) return [];
    const perSeller = BUDGET_SELLERS.map(seller => {
      const agg = aggregateBudget(budgetLines, forecasts, actuals, seller.email);
      return { seller, agg };
    });
    const totals = {
      orders: Math.max(1, perSeller.reduce((s, x) => s + x.agg.totals.ordersQty, 0)),
      pipeline: Math.max(1, openLeads.length),
      budget: Math.max(1, perSeller.reduce((s, x) => s + x.agg.totals.budgetQty, 0)),
    };
    return perSeller.map(({ seller, agg }) => {
      const ownLeads = allLeads.filter(l =>
        (l.owner_email || "").toLowerCase() === seller.email.toLowerCase(),
      );
      const ownPipeline = ownLeads.filter(l => OPEN_STAGES.has(l.pipeline_stage)).length;
      const overdue = ownLeads.filter(l => OPEN_STAGES.has(l.pipeline_stage) && classifyUrgency(l, now) === "overdue").length;
      const noFollow = ownLeads.filter(l => OPEN_STAGES.has(l.pipeline_stage) && classifyUrgency(l, now) === "none").length;
      const leadHealth = (ownPipeline === 0) ? 100 : Math.max(0, Math.round(100 - ((overdue + noFollow) / ownPipeline) * 100));
      return {
        initials: seller.initials,
        ordersPct: Math.round((agg.totals.ordersQty / totals.orders) * 100),
        pipelinePct: Math.round((ownPipeline / totals.pipeline) * 100),
        leadHealthPct: leadHealth,
        budgetScorePct: agg.totals.scorePct,
        overdue,
        noFollow,
      };
    });
  }, [isAdmin, allLeads, budgetLines, forecasts, actuals, openLeads.length, now]);


  const alerts = useMemo(() => {
    if (!isAdmin) return [];
    const out: Array<{ key: string; tone: "rose" | "amber" | "emerald"; label: string }> = [];
    for (const c of sellerComparison) {
      if (c.overdue > 0) {
        out.push({
          key: `${c.initials}-overdue`,
          tone: "rose",
          label: `${c.initials}: ${t("alert_overdue", lang).replace("{n}", String(c.overdue))}`,
        });
      }
      if (c.noFollow > 0) {
        out.push({
          key: `${c.initials}-noflw`,
          tone: "amber",
          label: `${c.initials}: ${t("alert_no_follow", lang).replace("{n}", String(c.noFollow))}`,
        });
      }
      if (c.budgetScorePct >= 100) {
        out.push({
          key: `${c.initials}-above`,
          tone: "emerald",
          label: `${c.initials}: ${t("alert_above", lang).replace("{pct}", String(c.budgetScorePct))}`,
        });
      }
    }
    return out.slice(0, 6);
  }, [isAdmin, sellerComparison, lang]);

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────
  return (
    <TooltipProvider delayDuration={150}>
      <section className="mb-6 space-y-5">
        {/* Seller switcher (backend only) */}
        {isAdmin && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-500">
              <Filter className="h-3.5 w-3.5" />
              {t("cockpit_seller", lang)}
            </span>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <SellerChip active={activeInitials === null} onClick={() => setActiveInitials(null)}>
                {t("cockpit_all", lang)}
              </SellerChip>
              {BUDGET_SELLERS.map(s => (
                <SellerChip key={s.initials} active={activeInitials === s.initials} onClick={() => setActiveInitials(s.initials)}>
                  {s.initials}
                </SellerChip>
              ))}
            </div>
          </div>
        )}

        {/* Lead Fokus + Budget Fokus */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── LEAD FOKUS ── */}
          <article className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_16px_40px_-16px_rgba(15,23,42,0.18)] transition-shadow p-6">
            <header className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-rose-50 to-amber-50 text-rose-600 inline-flex items-center justify-center ring-1 ring-rose-100">
                    <Flame className="h-4 w-4" />
                  </span>
                  {t("lead_fokus", lang)}
                </h2>
                <p className="text-xs text-slate-500 mt-1 ml-[42px]">{t("lead_fokus_sub", lang)}</p>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 tabular-nums">{totalLeads}</span>
            </header>

            {totalLeads === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 inline-flex items-center justify-center mb-3">
                  <Clock className="h-6 w-6" />
                </div>
                <p className="text-sm text-slate-500">{t("no_leads", lang)}</p>
              </div>
            ) : (
              <>
                {/* Stacked urgency bar */}
                <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100 ring-1 ring-slate-200/60">
                  {(["overdue", "soon", "later", "none"] as Urgency[]).map((u, i) => {
                    const pct = (buckets[u].length / totalLeads) * 100;
                    if (pct === 0) return null;
                    return (
                      <div
                        key={u}
                        title={`${t(URGENCY_META[u].tKey, lang)} · ${buckets[u].length}`}
                        className={`${URGENCY_META[u].bar} h-full ${i === 0 ? "" : "border-l border-white/60"}`}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })}
                </div>

                {/* Per-bucket lists with tooltips */}
                <div className="mt-5 space-y-4">
                  {(["overdue", "soon", "later", "none"] as Urgency[]).map(u => {
                    const list = buckets[u];
                    if (list.length === 0) return null;
                    const meta = URGENCY_META[u];
                    return (
                      <div key={u}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.ring}`}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.hex }} />
                            {t(meta.tKey, lang)}
                          </span>
                          <span className="text-[11px] text-slate-500 tabular-nums">{list.length}</span>
                        </div>
                        <ul className="space-y-1">
                          {list.slice(0, 3).map(l => (
                            <Tooltip key={l.id}>
                              <TooltipTrigger asChild>
                                <li className="flex items-center justify-between gap-3 text-xs px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-default">
                                  <span className="truncate text-slate-800 font-medium">{l.title || "—"}</span>
                                  <span className="shrink-0 text-slate-400 tabular-nums">{fmtDate(l.next_followup_date, lang)}</span>
                                </li>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="text-xs space-y-0.5">
                                  <div className="font-semibold">{l.title || "—"}</div>
                                  {l.contact_information && <div>{l.contact_information}</div>}
                                  {l.linked_dealer_id && <div className="text-slate-500">Dealer: {l.linked_dealer_id}</div>}
                                  {l.machine_types?.length > 0 && <div>{l.machine_types.join(", ")}</div>}
                                  <div className="text-slate-500">{l.pipeline_stage} · {fmtDate(l.next_followup_date, lang)}</div>
                                  {l.estimated_value != null && <div className="font-medium">{l.estimated_value.toLocaleString("da-DK")} kr.</div>}
                                  {l.owner_name && <div className="text-slate-500">{l.owner_name}</div>}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {list.length > 3 && (
                            <li className="text-[11px] text-slate-400 pl-2">+ {list.length - 3}</li>
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </article>

          {/* ── BUDGET FOKUS ── */}
          <article className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_16px_40px_-16px_rgba(15,23,42,0.18)] transition-shadow p-6">
            <header className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-50 to-sky-50 text-emerald-700 inline-flex items-center justify-center ring-1 ring-emerald-100">
                    <Target className="h-4 w-4" />
                  </span>
                  {t("budget_fokus", lang)}
                </h2>
                <p className="text-xs text-slate-500 mt-1 ml-[42px]">{t("budget_fokus_sub", lang)}</p>
              </div>
            </header>

            <div className="space-y-4">
              {machineRows.map(row => {
                const noBudget = row.budgetQty === 0;
                const score = scoreColor(row.scorePct);
                const ordersPct = noBudget ? 0 : Math.min(100, (row.ordersQty / row.budgetQty) * 100);
                const pipelinePct = noBudget ? 0 : Math.min(100 - ordersPct, (row.pipelineQty / row.budgetQty) * 100);
                return (
                  <Tooltip key={row.key}>
                    <TooltipTrigger asChild>
                      <div className="cursor-default">
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="font-medium text-slate-800">{row.label}</span>
                          <span className="text-xs text-slate-500 tabular-nums">
                            <span className={`font-semibold ${noBudget ? "text-slate-400" : score.text}`}>
                              {noBudget ? t("no_budget", lang) : `${row.scorePct}%`}
                            </span>
                            {!noBudget && (
                              <>
                                <span className="mx-1.5 text-slate-300">·</span>
                                {row.ordersQty}/{row.budgetQty}
                              </>
                            )}
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                          {!noBudget && (
                            <>
                              <div className={`${score.bar} h-full transition-[width] duration-700`} style={{ width: `${ordersPct}%` }} />
                              <div className="h-full bg-sky-300/70 transition-[width] duration-700" style={{ width: `${pipelinePct}%` }} />
                            </>
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs space-y-0.5">
                        <div className="font-semibold">{row.label}</div>
                        <div>{t("budget_qty", lang)}: <span className="font-medium tabular-nums">{row.budgetQty}</span></div>
                        <div>{t("orders_qty", lang)}: <span className="font-medium tabular-nums">{row.ordersQty}</span></div>
                        <div>{t("pipeline_qty", lang)}: <span className="font-medium tabular-nums">{row.pipelineQty}</span></div>
                        <div>{t("forecast_qty", lang)}: <span className="font-medium tabular-nums">{row.forecastQty}</span></div>
                        <div>{t("remaining_gap", lang)}: <span className="font-medium tabular-nums">{row.remainingGap}</span></div>
                        <div>{t("score_pct", lang)}: <span className="font-medium tabular-nums">{row.scorePct}%</span></div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-5 flex items-center gap-4 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> ≥100%</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-amber-500" /> ≥80%</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-rose-500" /> &lt;80%</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-sky-300" /> {t("pipeline_qty", lang)}</span>
            </div>
          </article>
        </div>

        {/* Backend extras */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Comparison */}
            <article className="lg:col-span-2 rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] p-6">
              <header className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 text-slate-700 inline-flex items-center justify-center ring-1 ring-slate-200/70">
                    <Users className="h-4 w-4" />
                  </span>
                  {t("comparison", lang)}
                </h2>
              </header>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-slate-500">
                      <th className="px-2 py-2 font-semibold">{t("cockpit_seller", lang)}</th>
                      <th className="px-2 py-2 font-semibold">{t("metric_orders", lang)}</th>
                      <th className="px-2 py-2 font-semibold">{t("metric_pipeline", lang)}</th>
                      <th className="px-2 py-2 font-semibold">{t("metric_health", lang)}</th>
                      <th className="px-2 py-2 font-semibold">{t("metric_budget", lang)}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sellerComparison.map(c => (
                      <tr key={c.initials} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setActiveInitials(c.initials)}>
                        <td className="px-2 py-2.5 font-semibold text-slate-800">{c.initials}</td>
                        <td className="px-2 py-2.5"><MiniBar pct={c.ordersPct} hex="#0ea5e9" /></td>
                        <td className="px-2 py-2.5"><MiniBar pct={c.pipelinePct} hex="#8b5cf6" /></td>
                        <td className="px-2 py-2.5"><MiniBar pct={c.leadHealthPct} hex={c.leadHealthPct >= 75 ? "#10b981" : c.leadHealthPct >= 50 ? "#f59e0b" : "#ef4444"} /></td>
                        <td className="px-2 py-2.5"><MiniBar pct={Math.min(120, c.budgetScorePct)} hex={c.budgetScorePct >= 100 ? "#10b981" : c.budgetScorePct >= 80 ? "#f59e0b" : "#ef4444"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            {/* Alerts */}
            <article className="rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] p-6">
              <header className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2.5">
                  <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-50 to-rose-50 text-amber-700 inline-flex items-center justify-center ring-1 ring-amber-100">
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                  {t("alerts", lang)}
                </h2>
              </header>
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 inline-flex items-center justify-center mb-3">
                    <TrendingUp className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-slate-500">{t("no_alerts", lang)}</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {alerts.map(a => {
                    const cls =
                      a.tone === "rose" ? "bg-rose-50 text-rose-700 border-rose-200" :
                      a.tone === "amber" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      "bg-emerald-50 text-emerald-700 border-emerald-200";
                    return (
                      <li key={a.key} className={`text-xs font-medium px-3 py-2 rounded-lg border ${cls}`}>
                        {a.label}
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────
function SellerChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
        active
          ? "bg-gradient-to-br from-[#0f2e1f] to-[#1f5535] text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function MiniBar({ pct, hex }: { pct: number; hex: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${clamped}%`, background: hex }} />
      </div>
      <span className="text-[11px] tabular-nums text-slate-600 w-9 text-right">{Math.round(pct)}%</span>
    </div>
  );
}
