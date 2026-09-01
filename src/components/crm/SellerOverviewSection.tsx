/**
 * Sælgeroverblik — Timan Backend only.
 *
 * One row per seller (BP, EM, JTN, AKR) with:
 *   Aktive leads · Varme leads · Demoer · Tilbud sendt · Tilbud værdi
 *   Ordre · Ordre værdi · Sidste måned · Denne måned · Næste måned · Total %
 *
 * Reuses existing data sources:
 *   - listLeads / listDemoLeads        (CRM leads + demos)
 *   - listActivities                   (offers/orders activity feed)
 *   - listBudgetLines / listForecasts / listSalesActuals (budget module)
 *   - BUDGET_SELLERS                   (seller registry — single source of truth)
 *
 * Backend-only filter: All / BP / EM / JTN / AKR.
 * Click a row → calls onSelectSeller(initials | null) so the parent dashboard
 * can scope itself to that seller (or back to "All").
 */
import { useEffect, useMemo, useState } from "react";
import { Crown, Filter, Flame, Users } from "lucide-react";
import { listActivities, type CrmActivity } from "@/lib/crmActivitiesService";
import { listLeads, listDemoLeads, type CrmLead, type CrmDemoLead } from "@/lib/crmLeadsService";
import { isOpenLead as isOpenLeadShared, isOfferLead, isDemoLead } from "@/lib/leadStatus";
import {
  listBudgetLines, listForecasts, listSalesActuals,
  BUDGET_SELLERS, availableYears,
  type BudgetLine, type BudgetForecast, type SalesActual,
} from "@/lib/crmBudgetService";

interface Props {
  selectedInitials: string | null;
  onSelectSeller: (initials: string | null) => void;
}

interface SellerRow {
  initials: string;
  name: string;
  country: string;
  activeLeads: number;
  hotLeads: number;
  demos: number;
  offersSent: number;
  offersValue: number;
  orders: number;
  ordersValue: number;
  lastMonth: PeriodCell;
  thisMonth: PeriodCell;
  nextMonth: PeriodCell;
  totalScorePct: number;       // ordersValue / annualBudget
  totalWithPipelinePct: number; // (ordersValue + offersValue) / annualBudget
  annualBudget: number;
}

interface PeriodCell {
  budget: number;
  orders: number;
  pipeline: number;
  forecast: number;
  scorePct: number; // (orders+pipeline) vs budget
}

function fmtKr(n: number): string {
  if (!Number.isFinite(n)) return "0 kr.";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${Math.round(n)}`;
}
function fmtFull(n: number): string {
  return `${Math.round(n).toLocaleString("da-DK")} kr.`;
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

function ownerMatchesSeller(
  ownerName: string | null | undefined,
  ownerEmail: string | null | undefined,
  sellerInitials: string,
  sellerEmail: string,
): boolean {
  const target = sellerInitials.toLowerCase();
  const tEmail = sellerEmail.toLowerCase();
  if (ownerEmail && ownerEmail.toLowerCase() === tEmail) return true;
  if (!ownerName) return false;
  const n = ownerName.toLowerCase().trim();
  if (n === target) return true;
  // If the owner_name is a full name, take initials.
  const ini = ownerName.split(/\s+/).filter(Boolean).slice(0, 3).map(s => s[0]?.toUpperCase() || "").join("");
  return ini.toLowerCase() === target;
}

function isOpenLead(lead: CrmLead): boolean {
  return isOpenLeadShared(lead);
}
function isHotLead(lead: CrmLead): boolean {
  // Hot lead = (demo has run AND offer sent) OR active demo / offer stages
  // following a held demo. Source of truth is next_activity (with legacy
  // pipeline_stage fallback) via the shared status helper.
  const demoRan = lead.demo_has_run === "yes";
  const inLateStage = isOfferLead(lead) || isDemoLead(lead);
  return demoRan && inLateStage;
}

function isOfferSentActivity(a: CrmActivity): boolean {
  return a.activity_type === "quote_sent" || a.activity_type === "quote_created" || a.activity_type === "quote_revised";
}
function isWonOrderActivity(a: CrmActivity): boolean {
  return a.activity_type === "order_sent" && (a.status || "").toLowerCase() !== "lost";
}

function pctClasses(pct: number): { text: string; bg: string; ring: string } {
  if (pct >= 90)  return { text: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200" };
  if (pct >= 60)  return { text: "text-amber-700",   bg: "bg-amber-50",   ring: "ring-amber-200" };
  if (pct > 0)    return { text: "text-rose-700",    bg: "bg-rose-50",    ring: "ring-rose-200" };
  return            { text: "text-slate-500",   bg: "bg-slate-50",   ring: "ring-slate-200" };
}

function avatarGradient(initials: string): string {
  const palette = [
    "from-emerald-500 to-emerald-700",
    "from-sky-500 to-indigo-600",
    "from-violet-500 to-fuchsia-600",
    "from-amber-500 to-rose-500",
  ];
  let h = 0;
  for (let i = 0; i < initials.length; i++) h = (h * 31 + initials.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export default function SellerOverviewSection({ selectedInitials, onSelectSeller }: Props) {
  const [year] = useState<number>(availableYears()[0]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [demoLeads, setDemoLeads] = useState<CrmDemoLead[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [forecasts, setForecasts] = useState<BudgetForecast[]>([]);
  const [actuals, setActuals] = useState<SalesActual[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [l, d, a, bl, fc, ac] = await Promise.all([
        listLeads({ limit: 500, payload: "summary" }),
        listDemoLeads({ limit: 500, payload: "summary" }),
        listActivities({ ownerUserId: null, limit: 1000 }),
        listBudgetLines({ year }),
        listForecasts(year),
        listSalesActuals(year),
      ]);
      if (cancelled) return;
      setLeads(l); setDemoLeads(d); setActivities(a);
      setBudgetLines(bl); setForecasts(fc); setActuals(ac);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [year]);

  const rows: SellerRow[] = useMemo(() => {
    const now = new Date();
    const monthIdx = now.getMonth();
    const monthStart = startOfMonth(now);
    const lastMonthStart = addMonths(monthStart, -1);
    const nextMonthStart = addMonths(monthStart, 1);
    const nextMonthEnd = addMonths(monthStart, 2);

    return BUDGET_SELLERS.map(seller => {
      const matchLead = (l: CrmLead) =>
        ownerMatchesSeller(l.owner_name, l.owner_email, seller.initials, seller.email);
      const matchDemo = (l: CrmDemoLead) =>
        ownerMatchesSeller(l.owner_name, l.owner_email, seller.initials, seller.email);
      const matchActivity = (a: CrmActivity) =>
        ownerMatchesSeller(a.assigned_owner_name || a.created_by_name, null, seller.initials, seller.email);
      const matchBudget = (b: BudgetLine) =>
        (b.seller_initials || "").toLowerCase() === seller.initials.toLowerCase()
        || (b.seller_email || "").toLowerCase() === seller.email.toLowerCase();

      // Leads
      const myLeads = leads.filter(matchLead);
      const activeLeads = myLeads.filter(isOpenLead).length;
      const hotLeads = myLeads.filter(isHotLead).length;

      // Demos (both demo leads and leads with demo_has_run)
      const myDemos = demoLeads.filter(matchDemo);
      const demos = myDemos.length + myLeads.filter(l => l.demo_has_run === "yes").length;

      // Offers + orders from activities
      const myActivities = activities.filter(matchActivity);
      const offers = myActivities.filter(isOfferSentActivity);
      const orders = myActivities.filter(isWonOrderActivity);
      const offersSent = offers.length;
      const offersValue = offers.reduce((s, a) => s + (a.value || 0), 0);
      const ordersCount = orders.length;
      const ordersValue = orders.reduce((s, a) => s + (a.value || 0), 0);

      // Budget per period (last/this/next month)
      const myBudget = budgetLines.filter(matchBudget);
      const annualBudget = myBudget.reduce((s, b) => s + b.value_budget, 0);
      const myBudgetIds = new Set(myBudget.map(b => b.id));

      // Helper: monthly slice from a budget line
      function monthShare(line: BudgetLine, m: number): number {
        const split = (line.monthly_split && line.monthly_split.length === 12)
          ? line.monthly_split
          : Array.from({ length: 12 }, () => 1 / 12);
        return split[m] ?? (1 / 12);
      }
      function budgetForMonth(m: number): number {
        return myBudget.reduce((s, b) => s + b.value_budget * monthShare(b, m), 0);
      }
      function forecastForMonth(m: number): number {
        return forecasts
          .filter(f => myBudgetIds.has(f.budget_line_id))
          .reduce((s, f) => {
            const line = myBudget.find(b => b.id === f.budget_line_id);
            if (!line) return s;
            return s + f.value_forecast * monthShare(line, m);
          }, 0);
      }
      function actualsForMonth(m: number): number {
        // Actuals don't carry a month — distribute by the same monthly_split.
        return actuals
          .filter(a => myBudgetIds.has(a.budget_line_id))
          .reduce((s, a) => {
            const line = myBudget.find(b => b.id === a.budget_line_id);
            if (!line) return s;
            return s + a.value_sold * monthShare(line, m);
          }, 0);
      }
      function pipelineForRange(from: Date, to: Date): number {
        return offers
          .filter(o => {
            const d = new Date(o.activity_date);
            return d >= from && d < to;
          })
          .reduce((s, o) => s + (o.value || 0), 0);
      }

      const buildPeriod = (m: number, from: Date, to: Date): PeriodCell => {
        const budget = budgetForMonth(m);
        const ordersInPeriod = orders
          .filter(o => { const d = new Date(o.activity_date); return d >= from && d < to; })
          .reduce((s, o) => s + (o.value || 0), 0);
        // For past months, prefer recorded actuals share. For future use forecast.
        const ord = ordersInPeriod || actualsForMonth(m);
        const pipeline = pipelineForRange(from, to);
        const fc = forecastForMonth(m);
        const scorePct = budget > 0 ? Math.round(((ord + pipeline) / budget) * 100) : 0;
        return { budget, orders: ord, pipeline, forecast: fc, scorePct };
      };

      const lastMonth = buildPeriod(
        (monthIdx + 11) % 12,
        lastMonthStart,
        monthStart,
      );
      const thisMonth = buildPeriod(monthIdx, monthStart, nextMonthStart);
      const nextMonth = buildPeriod((monthIdx + 1) % 12, nextMonthStart, nextMonthEnd);

      const totalScorePct = annualBudget > 0 ? Math.round((ordersValue / annualBudget) * 100) : 0;
      const totalWithPipelinePct = annualBudget > 0
        ? Math.round(((ordersValue + offersValue) / annualBudget) * 100)
        : 0;

      return {
        initials: seller.initials,
        name: seller.full_name,
        country: seller.country,
        activeLeads, hotLeads, demos,
        offersSent, offersValue,
        orders: ordersCount, ordersValue,
        lastMonth, thisMonth, nextMonth,
        totalScorePct, totalWithPipelinePct,
        annualBudget,
      };
    });
  }, [leads, demoLeads, activities, budgetLines, forecasts, actuals]);

  const filteredRows = selectedInitials
    ? rows.filter(r => r.initials === selectedInitials)
    : rows;

  // Top performer based on combined orders+pipeline vs budget
  const leaderInitials = useMemo(() => {
    let best: SellerRow | null = null;
    for (const r of rows) {
      if (!best || r.totalWithPipelinePct > best.totalWithPipelinePct) best = r;
    }
    return best?.initials || null;
  }, [rows]);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] p-6 mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 inline-flex items-center justify-center ring-1 ring-emerald-200/70">
            <Users className="h-4 w-4" />
          </span>
          Sælgeroverblik
          <span className="text-xs text-gray-400 font-normal">{year}</span>
        </h2>
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-gray-100/80 border border-gray-200">
          <Filter className="h-3.5 w-3.5 text-gray-400 ml-1.5 mr-0.5" />
          <button
            onClick={() => onSelectSeller(null)}
            className={
              "px-3 py-1.5 rounded-lg text-xs font-medium transition " +
              (!selectedInitials
                ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                : "text-gray-600 hover:text-gray-900")
            }
          >Alle</button>
          {BUDGET_SELLERS.map(s => (
            <button
              key={s.initials}
              onClick={() => onSelectSeller(s.initials === selectedInitials ? null : s.initials)}
              className={
                "px-3 py-1.5 rounded-lg text-xs font-medium transition " +
                (selectedInitials === s.initials
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-600 hover:text-gray-900")
              }
            >{s.initials}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500 py-6">Indlæser…</div>
      ) : filteredRows.length === 0 ? (
        <div className="text-sm text-gray-500 py-6">Ingen sælgerdata.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="py-2.5 pr-4 font-medium">Sælger</th>
                <th className="py-2.5 px-2 font-medium text-center">Aktive leads</th>
                <th className="py-2.5 px-2 font-medium text-center">Varme leads</th>
                <th className="py-2.5 px-2 font-medium text-center">Demoer</th>
                <th className="py-2.5 px-2 font-medium text-center">Tilbud sendt</th>
                <th className="py-2.5 px-2 font-medium text-right">Tilbud værdi</th>
                <th className="py-2.5 px-2 font-medium text-center">Ordre</th>
                <th className="py-2.5 px-2 font-medium text-right">Ordre værdi</th>
                <th className="py-2.5 px-2 font-medium text-center">Sidste måned</th>
                <th className="py-2.5 px-2 font-medium text-center">Denne måned</th>
                <th className="py-2.5 px-2 font-medium text-center">Næste måned</th>
                <th className="py-2.5 pl-2 pr-1 font-medium text-center">Total %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map(r => {
                const isLeader = r.initials === leaderInitials && r.totalWithPipelinePct > 0;
                const totalC = pctClasses(r.totalScorePct);
                return (
                  <tr
                    key={r.initials}
                    onClick={() => onSelectSeller(r.initials === selectedInitials ? null : r.initials)}
                    className={
                      "cursor-pointer hover:bg-emerald-50/40 transition-colors " +
                      (selectedInitials === r.initials ? "bg-emerald-50/60 " : "") +
                      (isLeader ? "bg-gradient-to-r from-amber-50/50 to-transparent " : "")
                    }
                    title="Klik for at filtrere dashboardet til denne sælger"
                  >
                    <td className="py-3.5 pr-4">
                      <div className="inline-flex items-center gap-3">
                        <div className="relative">
                          <div className={`h-9 w-9 rounded-full bg-gradient-to-br ${avatarGradient(r.initials)} text-white text-xs font-semibold flex items-center justify-center shadow-sm ring-2 ring-white`}>
                            {r.initials}
                          </div>
                          {isLeader && (
                            <Crown className="absolute -top-1.5 -right-1.5 h-4 w-4 text-amber-500 fill-amber-300 drop-shadow-sm" />
                          )}
                        </div>
                        <div className="leading-tight">
                          <div className="font-semibold text-gray-900">{r.name}</div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-500">{r.country}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-2 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold tabular-nums">{r.activeLeads}</span>
                    </td>

                    <td className="py-3.5 px-2 text-center">
                      <span className="inline-flex items-center gap-1 px-2 h-6 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold tabular-nums ring-1 ring-rose-200/70">
                        <Flame className="h-3 w-3" />{r.hotLeads}
                      </span>
                    </td>

                    <td className="py-3.5 px-2 text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-6 rounded-full bg-sky-50 text-sky-700 text-xs font-semibold tabular-nums ring-1 ring-sky-200/70">{r.demos}</span>
                    </td>

                    <td className="py-3.5 px-2 text-center text-amber-700 font-semibold tabular-nums">{r.offersSent}</td>
                    <td className="py-3.5 px-2 text-right text-amber-700 font-medium tabular-nums" title={fmtFull(r.offersValue)}>{fmtKr(r.offersValue)}</td>

                    <td className="py-3.5 px-2 text-center text-emerald-700 font-semibold tabular-nums">{r.orders}</td>
                    <td className="py-3.5 px-2 text-right text-emerald-700 font-medium tabular-nums" title={fmtFull(r.ordersValue)}>{fmtKr(r.ordersValue)}</td>

                    <PeriodTd cell={r.lastMonth} />
                    <PeriodTd cell={r.thisMonth} highlight />
                    <PeriodTd cell={r.nextMonth} forecast />

                    <td className="py-3.5 pl-2 pr-1 text-center">
                      <div className={`inline-flex flex-col items-center justify-center px-2.5 py-1 rounded-lg ring-1 ${totalC.bg} ${totalC.ring}`}>
                        <span className={`text-sm font-bold tabular-nums ${totalC.text}`}>{r.totalScorePct}%</span>
                        <span className="text-[10px] text-gray-500 tabular-nums">+{Math.max(0, r.totalWithPipelinePct - r.totalScorePct)}% pipe</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> ≥ 90% — på mål</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> 60–89% — opmærksomhed</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> &lt; 60% — bagud</span>
            <span className="ml-auto text-gray-400">Total % = ordre vs budget · pipe = + tilbud</span>
          </div>
        </div>
      )}
    </section>
  );
}

function PeriodTd({ cell, highlight, forecast }: { cell: PeriodCell; highlight?: boolean; forecast?: boolean }) {
  const c = pctClasses(cell.scorePct);
  return (
    <td className="py-3.5 px-2 text-center">
      <div className={
        "inline-flex flex-col items-center px-2 py-1 rounded-md " +
        (highlight ? "bg-emerald-50/60 ring-1 ring-emerald-100 " : "")
      }
      title={`Budget: ${fmtFull(cell.budget)}\nOrdre: ${fmtFull(cell.orders)}\nPipeline: ${fmtFull(cell.pipeline)}\nForecast: ${fmtFull(cell.forecast)}`}
      >
        <span className={`text-xs font-semibold tabular-nums ${c.text}`}>{cell.scorePct}%</span>
        <span className="text-[10px] text-gray-500 tabular-nums">
          {forecast ? `fc ${fmtKr(cell.forecast)}` : `${fmtKr(cell.orders)} / ${fmtKr(cell.budget)}`}
        </span>
      </div>
    </td>
  );
}
