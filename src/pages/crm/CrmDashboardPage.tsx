import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import SellerPerformanceSection from '@/components/crm/SellerPerformanceSection';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { listCrmAccounts, CrmAccount, accountDisplayName } from '@/lib/crmAccountsService';
import { listActivities, CrmActivity, CrmActivityType } from '@/lib/crmActivitiesService';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { isCrmAdmin } from '@/lib/crmScope';
import { Language } from '@/types/configurator';
import {
  Activity, ArrowDownRight, ArrowUpRight, Building2, CheckCircle2,
  Clock, FileText, Layers, ShoppingCart, Sparkles, Target, TrendingDown,
  Trophy, Users, XCircle,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────
// Translations
// ────────────────────────────────────────────────────────────
const T: Record<string, Record<Language, string>> = {
  // KPIs
  kpi_pipeline:   { da: 'Pipeline værdi',          en: 'Pipeline value',         de: 'Pipeline-Wert',       it: 'Valore pipeline',     hu: 'Pipeline érték' },
  kpi_leads:      { da: 'Aktive leads',             en: 'Active leads',           de: 'Aktive Leads',        it: 'Lead attivi',         hu: 'Aktív leadek' },
  kpi_won:        { da: 'Vundne ordrer',            en: 'Won orders',             de: 'Gewonnene Aufträge',  it: 'Ordini vinti',        hu: 'Megnyert rendelések' },
  kpi_winrate:    { da: 'Win rate',                 en: 'Win rate',               de: 'Win-Rate',            it: 'Win rate',            hu: 'Win rate' },
  kpi_avgtime:    { da: 'Gns. salgstid',            en: 'Avg. sales cycle',       de: 'Ø Verkaufszyklus',    it: 'Ciclo medio',         hu: 'Átl. értékesítési idő' },
  kpi_closed:     { da: 'Lukkede ordrer',           en: 'Closed orders',          de: 'Abgeschlossene Aufträge', it: 'Ordini chiusi',   hu: 'Lezárt rendelések' },
  vs_last_month:  { da: 'vs. samme tid sidste måned', en: 'vs. same time last month', de: 'vs. Vormonat',    it: 'vs stesso periodo',   hu: 'vs előző hónap' },

  // Sections
  pipeline_dist:  { da: 'Pipeline Fordeling',       en: 'Pipeline distribution',  de: 'Pipeline-Verteilung', it: 'Distribuzione pipeline', hu: 'Pipeline eloszlás' },
  recent:         { da: 'Seneste Aktivitet',        en: 'Recent activity',        de: 'Letzte Aktivität',    it: 'Attività recente',    hu: 'Legutóbbi tevékenység' },
  lost_reasons:   { da: 'Hvorfor taber vi ordrer?', en: 'Why do we lose orders?', de: 'Warum verlieren wir Aufträge?', it: 'Perché perdiamo ordini?', hu: 'Miért veszítünk?' },
  seller_perf:    { da: 'Sælger Performance (Aktuel måned)', en: 'Seller performance (current month)', de: 'Verkäufer-Performance', it: 'Performance venditori', hu: 'Értékesítői teljesítmény' },
  followups:      { da: 'Kommende opfølgninger',    en: 'Upcoming follow-ups',    de: 'Anstehende Follow-ups', it: 'Follow-up imminenti', hu: 'Közelgő követések' },
  inactive:       { da: 'Inaktive konti',           en: 'Inactive accounts',      de: 'Inaktive Konten',     it: 'Account inattivi',    hu: 'Inaktív fiókok' },
  best:           { da: 'Bedst præsterende konti',  en: 'Best performing accounts', de: 'Top-Konten',        it: 'Account migliori',    hu: 'Legjobb fiókok' },
  open_all:       { da: 'Se alle',                  en: 'View all',               de: 'Alle anzeigen',       it: 'Vedi tutto',          hu: 'Összes' },
  empty:          { da: 'Ingen data endnu.',        en: 'No data yet.',           de: 'Noch keine Daten.',   it: 'Nessun dato.',        hu: 'Még nincs adat.' },

  // Pipeline stages
  stage_lead:     { da: 'Lead',          en: 'Lead',          de: 'Lead',          it: 'Lead',          hu: 'Lead' },
  stage_demo:     { da: 'Demo planlagt', en: 'Demo planned',  de: 'Demo geplant',  it: 'Demo pianificata', hu: 'Demó tervezve' },
  stage_quote:    { da: 'Tilbud sendt',  en: 'Quote sent',    de: 'Angebot gesendet', it: 'Preventivo inviato', hu: 'Árajánlat elküldve' },
  stage_neg:      { da: 'Forhandling',   en: 'Negotiation',   de: 'Verhandlung',   it: 'Negoziazione',  hu: 'Tárgyalás' },
  stage_won:      { da: 'Vundet',        en: 'Won',           de: 'Gewonnen',      it: 'Vinto',         hu: 'Megnyert' },
  stage_lost:     { da: 'Tabt',          en: 'Lost',          de: 'Verloren',      it: 'Perso',         hu: 'Elveszett' },

  // Lost reasons
  reason_price:   { da: 'Pris',          en: 'Price',         de: 'Preis',         it: 'Prezzo',        hu: 'Ár' },
  reason_lead:    { da: 'Leveringstid',  en: 'Lead time',     de: 'Lieferzeit',    it: 'Tempo consegna',hu: 'Szállítási idő' },
  reason_comp:    { da: 'Konkurrent',    en: 'Competitor',    de: 'Wettbewerb',    it: 'Concorrente',   hu: 'Versenytárs' },
  reason_other:   { da: 'Andet',         en: 'Other',         de: 'Sonstiges',     it: 'Altro',         hu: 'Egyéb' },

  // Table
  col_seller:     { da: 'Sælger',        en: 'Seller',        de: 'Verkäufer',     it: 'Venditore',     hu: 'Értékesítő' },
  col_pipeline:   { da: 'Pipeline',      en: 'Pipeline',      de: 'Pipeline',      it: 'Pipeline',      hu: 'Pipeline' },
  col_sales:      { da: 'Salg',          en: 'Sales',         de: 'Umsatz',        it: 'Vendite',       hu: 'Eladás' },
  col_active:     { da: 'Aktive leads',  en: 'Active leads',  de: 'Aktive Leads',  it: 'Lead attivi',   hu: 'Aktív leadek' },
  col_won:        { da: 'Vundet',        en: 'Won',           de: 'Gewonnen',      it: 'Vinti',         hu: 'Megnyert' },
  col_winrate:    { da: 'Win rate',      en: 'Win rate',      de: 'Win-Rate',      it: 'Win rate',      hu: 'Win rate' },

  days:           { da: 'dage',          en: 'days',          de: 'Tage',          it: 'giorni',        hu: 'nap' },
  orders:         { da: 'ordrer',        en: 'orders',        de: 'Aufträge',      it: 'ordini',        hu: 'rendelés' },
};

const PIPELINE_STAGES: Array<{ key: 'lead'|'demo'|'quote'|'neg'|'won'|'lost'; tKey: string; color: string }> = [
  { key: 'lead',  tKey: 'stage_lead',  color: 'bg-slate-400' },
  { key: 'demo',  tKey: 'stage_demo',  color: 'bg-sky-500' },
  { key: 'quote', tKey: 'stage_quote', color: 'bg-amber-500' },
  { key: 'neg',   tKey: 'stage_neg',   color: 'bg-violet-500' },
  { key: 'won',   tKey: 'stage_won',   color: 'bg-[#2d5a27]' },
  { key: 'lost',  tKey: 'stage_lost',  color: 'bg-rose-500' },
];

// ────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────
function fmtKr(n: number): string {
  return `${Math.round(n).toLocaleString('da-DK')} kr.`;
}
function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1); }
function startOfPrevMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() - 1, 1); }
function sameTimePrevMonth(now: Date): { from: Date; to: Date } {
  const from = startOfPrevMonth(now);
  const to = new Date(from.getFullYear(), from.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  return { from, to };
}

function classifyStage(a: CrmActivity): typeof PIPELINE_STAGES[number]['key'] | null {
  const status = (a.status || '').toLowerCase();
  switch (a.activity_type) {
    case 'lead_created':
    case 'lead_viewed':
    case 'lead_accepted':
      return 'lead';
    case 'lead_rejected':
      return 'lost';
    case 'quote_created':
    case 'quote_revised':
      return 'quote';
    case 'quote_sent':
      return status === 'negotiating' ? 'neg' : 'quote';
    case 'order_created':
      return 'neg';
    case 'order_sent':
      return status === 'lost' ? 'lost' : 'won';
    default:
      return null;
  }
}

function classifyLostReason(a: CrmActivity): 'price' | 'lead' | 'comp' | 'other' {
  const meta = (a.meta || {}) as Record<string, unknown>;
  const r = String(meta.lost_reason || a.description || '').toLowerCase();
  if (/pris|price/.test(r)) return 'price';
  if (/lever|delivery|lead\s*time/.test(r)) return 'lead';
  if (/konkur|competitor|comp/.test(r)) return 'comp';
  return 'other';
}

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────
export default function CrmDashboardPage() {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);

  const [accounts, setAccounts] = useState<CrmAccount[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sellerId = await resolveSellerId(appUser?.email);
        const acc = await listCrmAccounts({ role: portalRole, sellerId });
        const act = await listActivities({
          ownerUserId: isAdmin ? null : sellerId,
          limit: 500,
        });
        if (cancelled) return;
        setAccounts(acc.accounts);
        setActivities(act);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, portalRole, isAdmin]);

  // ── Derived metrics ─────────────────────────────────────
  const metrics = useMemo(() => deriveMetrics(activities, isAdmin), [activities, isAdmin]);

  return (
    <CrmLayout pageTitle="Dashboard">
      {/* TOP KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <Kpi
          icon={Target} label={T.kpi_pipeline[lang]}
          value={fmtKr(metrics.pipelineValue)}
          to="/portal/crm/quotes"
        />
        <Kpi
          icon={Sparkles} label={T.kpi_leads[lang]}
          value={String(metrics.activeLeads)}
          to="/portal/crm/leads"
        />
        <Kpi
          icon={Trophy} label={T.kpi_won[lang]}
          value={String(metrics.wonOrdersCount)}
          to="/portal/crm/orders"
        />
        <Kpi
          icon={CheckCircle2} label={T.kpi_winrate[lang]}
          value={`${metrics.winRate}%`}
        />
        <Kpi
          icon={Clock} label={T.kpi_avgtime[lang]}
          value={`${metrics.avgSalesDays} ${T.days[lang]}`}
        />
        <KpiClosedOrders
          lang={lang}
          valueThisMonth={metrics.closedValueThisMonth}
          countThisMonth={metrics.closedCountThisMonth}
          pctChange={metrics.closedPctChange}
        />
      </div>

      {/* PIPELINE FORDELING */}
      <Section
        icon={Layers}
        title={T.pipeline_dist[lang]}
        empty={metrics.pipelineByStage.every(s => s.value === 0) && metrics.pipelineByStage.every(s => s.count === 0)}
        emptyText={T.empty[lang]}
      >
        <div className="space-y-3">
          {(() => {
            const max = Math.max(1, ...metrics.pipelineByStage.map(s => s.value));
            return metrics.pipelineByStage.map(s => (
              <div key={s.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-800">{T[`stage_${s.key}`][lang]}</span>
                  <span className="text-gray-500">{fmtKr(s.value)} · {s.count}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div className={`${s.color} h-full rounded-full`} style={{ width: `${(s.value / max) * 100}%` }} />
                </div>
              </div>
            ));
          })()}
        </div>
      </Section>

      {/* TWO-COLUMN: Recent activity + Lost reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <Section
            icon={Activity}
            title={T.recent[lang]}
            actions={<Link className="text-sm text-[#2d5a27] hover:underline" to="/portal/crm/activities">{T.open_all[lang]}</Link>}
            empty={activities.length === 0}
            emptyText={T.empty[lang]}
          >
            <ul className="divide-y divide-gray-100">
              {activities.slice(0, 10).map(a => (
                <li key={a.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {a.title || prettyType(a.activity_type)}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {(isAdmin ? (a.created_by_name || a.assigned_owner_name || '—') : '—')} · {a.account_name || '—'} · {prettyType(a.activity_type)}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{new Date(a.activity_date).toLocaleDateString('da-DK')}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section
          icon={TrendingDown}
          title={T.lost_reasons[lang]}
          empty={metrics.lostReasons.total === 0}
          emptyText={T.empty[lang]}
        >
          <div className="space-y-3">
            {(['price','lead','comp','other'] as const).map(key => {
              const item = metrics.lostReasons.items[key];
              const total = Math.max(1, metrics.lostReasons.total);
              const pct = Math.round((item.count / total) * 100);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-gray-800">{T[`reason_${key}`][lang]}</span>
                    <span className="text-gray-500">{item.count} · {pct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* SELLER PERFORMANCE — backend only */}
      {isAdmin && (
        <SellerPerformanceSection activities={activities} language={lang} />
      )}

      {/* BOTTOM ROW: Follow-ups · Inactive accounts · Best accounts (admin) / My accounts (seller) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <Section icon={Clock} title={T.followups[lang]} empty emptyText={T.empty[lang]} />
        <Section
          icon={XCircle}
          title={T.inactive[lang]}
          empty={metrics.inactiveAccounts(accounts).length === 0}
          emptyText={T.empty[lang]}
        >
          <ul className="divide-y divide-gray-100">
            {metrics.inactiveAccounts(accounts).slice(0, 6).map(a => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                <span className="text-sm text-gray-800 truncate">{accountDisplayName(a)}</span>
                <span className="text-xs text-gray-400 whitespace-nowrap">{a.country || '—'}</span>
              </li>
            ))}
          </ul>
        </Section>
        <Section
          icon={Building2}
          title={isAdmin ? T.best[lang] : T.kpi_pipeline[lang]}
          empty={metrics.bestAccounts(accounts).length === 0}
          emptyText={T.empty[lang]}
        >
          <ul className="divide-y divide-gray-100">
            {metrics.bestAccounts(accounts).slice(0, 6).map(b => (
              <li key={b.account.id} className="py-2 flex items-center justify-between gap-3">
                <span className="text-sm text-gray-800 truncate">{accountDisplayName(b.account)}</span>
                <span className="text-xs font-semibold text-[#2d5a27] whitespace-nowrap">{fmtKr(b.value)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </CrmLayout>
  );
}

// ────────────────────────────────────────────────────────────
// Components
// ────────────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, to }: { icon: typeof Building2; label: string; value: string; to?: string }) {
  const inner = (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-[#2d5a27]/30 transition flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-[#2d5a27]/10 text-[#2d5a27] flex items-center justify-center">
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-xl font-semibold text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function KpiClosedOrders({ lang, valueThisMonth, countThisMonth, pctChange }: {
  lang: Language; valueThisMonth: number; countThisMonth: number; pctChange: number;
}) {
  const up = pctChange >= 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-10 w-10 rounded-xl bg-[#2d5a27]/10 text-[#2d5a27] flex items-center justify-center">
          <ShoppingCart className="h-5 w-5" />
        </div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{T.kpi_closed[lang]}</p>
      </div>
      <p className="text-xl font-semibold text-gray-900">{fmtKr(valueThisMonth)}</p>
      <p className="text-xs text-gray-500 mt-0.5">{countThisMonth} {T.orders[lang]}</p>
      <p className={`text-xs mt-2 inline-flex items-center gap-1 font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
        {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
        {Math.abs(pctChange)}% {T.vs_last_month[lang]}
      </p>
    </div>
  );
}

function Section({
  icon: Icon, title, children, actions, empty, emptyText, className,
}: {
  icon: typeof Building2; title: string; children?: React.ReactNode; actions?: React.ReactNode;
  empty?: boolean; emptyText?: string; className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 ${className || ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 inline-flex items-center gap-2"><Icon className="h-5 w-5" />{title}</h2>
        {actions}
      </div>
      {empty ? <p className="text-sm text-gray-500">{emptyText || '—'}</p> : children}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Metric derivation
// ────────────────────────────────────────────────────────────
interface DerivedMetrics {
  pipelineValue: number;
  activeLeads: number;
  wonOrdersCount: number;
  winRate: number;
  avgSalesDays: number;
  closedValueThisMonth: number;
  closedCountThisMonth: number;
  closedPctChange: number;
  pipelineByStage: Array<{ key: typeof PIPELINE_STAGES[number]['key']; color: string; value: number; count: number }>;
  lostReasons: { total: number; items: Record<'price'|'lead'|'comp'|'other', { count: number }> };
  sellerPerf: Array<{ name: string; pipeline: number; sales: number; activeLeads: number; won: number; winRate: number }>;
  inactiveAccounts: (accounts: CrmAccount[]) => CrmAccount[];
  bestAccounts: (accounts: CrmAccount[]) => Array<{ account: CrmAccount; value: number }>;
}

function deriveMetrics(activities: CrmActivity[], isAdmin: boolean): DerivedMetrics {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevWindow = sameTimePrevMonth(now);

  // Map activity → stage
  const staged = activities.map(a => ({ a, stage: classifyStage(a) }));

  // Pipeline distribution (open stages only contribute to "pipeline value")
  const byStage = PIPELINE_STAGES.map(meta => {
    const rows = staged.filter(s => s.stage === meta.key);
    const value = rows.reduce((sum, s) => sum + (s.a.value || 0), 0);
    return { key: meta.key, color: meta.color, value, count: rows.length };
  });

  const openStages: Array<typeof PIPELINE_STAGES[number]['key']> = ['lead','demo','quote','neg'];
  const pipelineValue = byStage.filter(s => openStages.includes(s.key)).reduce((sum, s) => sum + s.value, 0);

  const activeLeads = staged.filter(s => s.stage === 'lead' || s.stage === 'demo').length;
  const won = staged.filter(s => s.stage === 'won');
  const lost = staged.filter(s => s.stage === 'lost');
  const wonOrdersCount = won.length;
  const winRate = (won.length + lost.length) === 0 ? 0 : Math.round((won.length / (won.length + lost.length)) * 100);

  // Avg sales days — gap between first quote_created and matching order_sent per configuration
  const quoteDates = new Map<string, number>();
  for (const a of activities) {
    if (a.activity_type === 'quote_created' && a.configuration_id) {
      const t = new Date(a.activity_date).getTime();
      const prev = quoteDates.get(a.configuration_id);
      if (prev === undefined || t < prev) quoteDates.set(a.configuration_id, t);
    }
  }
  const cycles: number[] = [];
  for (const a of activities) {
    if (a.activity_type === 'order_sent' && a.configuration_id) {
      const start = quoteDates.get(a.configuration_id);
      if (start !== undefined) {
        const days = (new Date(a.activity_date).getTime() - start) / (1000 * 60 * 60 * 24);
        if (days >= 0 && days < 365) cycles.push(days);
      }
    }
  }
  const avgSalesDays = cycles.length === 0 ? 0 : Math.round(cycles.reduce((s, n) => s + n, 0) / cycles.length);

  // Closed orders this month vs same period last month
  const closedThisMonth = won.filter(s => new Date(s.a.activity_date) >= monthStart);
  const closedPrev = won.filter(s => {
    const d = new Date(s.a.activity_date);
    return d >= prevWindow.from && d <= prevWindow.to;
  });
  const closedValueThisMonth = closedThisMonth.reduce((sum, s) => sum + (s.a.value || 0), 0);
  const closedCountThisMonth = closedThisMonth.length;
  const closedValuePrev = closedPrev.reduce((sum, s) => sum + (s.a.value || 0), 0);
  const closedPctChange = pctChange(closedValueThisMonth, closedValuePrev);

  // Lost reasons
  const reasonCounts = { price: 0, lead: 0, comp: 0, other: 0 };
  for (const s of lost) {
    reasonCounts[classifyLostReason(s.a)] += 1;
  }
  const lostReasons = {
    total: lost.length,
    items: {
      price: { count: reasonCounts.price },
      lead:  { count: reasonCounts.lead },
      comp:  { count: reasonCounts.comp },
      other: { count: reasonCounts.other },
    },
  };

  // Seller performance — admin only
  const sellerPerf = isAdmin ? buildSellerPerf(staged) : [];

  // Best accounts by total won value
  const bestByAccount = new Map<string, { value: number; account?: CrmAccount }>();
  for (const s of won) {
    const id = s.a.account_id;
    if (!id) continue;
    const cur = bestByAccount.get(id) || { value: 0 };
    cur.value += s.a.value || 0;
    bestByAccount.set(id, cur);
  }

  return {
    pipelineValue,
    activeLeads,
    wonOrdersCount,
    winRate,
    avgSalesDays,
    closedValueThisMonth,
    closedCountThisMonth,
    closedPctChange,
    pipelineByStage: byStage,
    lostReasons,
    sellerPerf,
    inactiveAccounts: (accounts) => {
      const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 60; // 60 days
      const lastByAccount = new Map<string, number>();
      for (const a of activities) {
        if (!a.account_id) continue;
        const t = new Date(a.activity_date).getTime();
        const prev = lastByAccount.get(a.account_id);
        if (prev === undefined || t > prev) lastByAccount.set(a.account_id, t);
      }
      return accounts.filter(acc => {
        const last = lastByAccount.get(acc.id);
        return last === undefined || last < cutoff;
      });
    },
    bestAccounts: (accounts) => {
      const list: Array<{ account: CrmAccount; value: number }> = [];
      for (const acc of accounts) {
        const entry = bestByAccount.get(acc.id);
        if (entry && entry.value > 0) list.push({ account: acc, value: entry.value });
      }
      return list.sort((a, b) => b.value - a.value);
    },
  };
}

function buildSellerPerf(staged: Array<{ a: CrmActivity; stage: ReturnType<typeof classifyStage> }>) {
  const by = new Map<string, { name: string; pipeline: number; sales: number; activeLeads: number; won: number; lost: number }>();
  const openStages = new Set(['lead','demo','quote','neg']);
  for (const s of staged) {
    const name = s.a.assigned_owner_name || s.a.created_by_name;
    if (!name) continue;
    const cur = by.get(name) || { name, pipeline: 0, sales: 0, activeLeads: 0, won: 0, lost: 0 };
    if (s.stage && openStages.has(s.stage)) cur.pipeline += s.a.value || 0;
    if (s.stage === 'lead' || s.stage === 'demo') cur.activeLeads += 1;
    if (s.stage === 'won') { cur.won += 1; cur.sales += s.a.value || 0; }
    if (s.stage === 'lost') cur.lost += 1;
    by.set(name, cur);
  }
  return Array.from(by.values()).map(r => ({
    name: r.name,
    pipeline: r.pipeline,
    sales: r.sales,
    activeLeads: r.activeLeads,
    won: r.won,
    winRate: (r.won + r.lost) === 0 ? 0 : Math.round((r.won / (r.won + r.lost)) * 100),
  })).sort((a, b) => b.sales - a.sales);
}

function prettyType(t: CrmActivityType): string {
  return t.replace(/_/g, ' ');
}
