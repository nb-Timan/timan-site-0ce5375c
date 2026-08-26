import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import CrmLayout from '@/components/crm/CrmLayout';
import SellerPerformanceSection from '@/components/crm/SellerPerformanceSection';
import SellerOverviewSection from '@/components/crm/SellerOverviewSection';
import SellerCockpitSection from '@/components/crm/SellerCockpitSection';
import DemoStatsSection from '@/components/crm/DemoStatsSection';
import UpcomingActivitiesWidget from '@/components/crm/UpcomingActivitiesWidget';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { derivePortalRole } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { listCrmAccounts, CrmAccount, accountDisplayName } from '@/lib/crmAccountsService';
import { listActivities, CrmActivity, CrmActivityType } from '@/lib/crmActivitiesService';
import { listScopedOrdersWithValue, CrmOrderWithValue } from '@/lib/crmConfigurationsService';
import { listScopedOpenQuotes, type ScopedConfiguration } from '@/lib/crmRelationsService';
import { listLeads, type CrmLead, formatLeadNo } from '@/lib/crmLeadsService';
import { effectiveLeadStatus } from '@/lib/leadStatus';
import { listActivities as listCalendarActivities, type CalendarActivity } from '@/lib/crmCalendarService';
import { resolveSellerId } from '@/lib/resolveSellerId';
import { getActiveSellerView } from '@/lib/activeMode';
import { BUDGET_SELLERS } from '@/lib/crmBudgetService';
import { isCrmAdmin, isExternalCrmRole } from '@/lib/crmScope';
import { buildJournalScope } from '@/lib/machineJournalScope';
import { formatDate } from '@/lib/format-date';
import { calculateMachineInterestEstimate } from '@/lib/leadToConfiguratorDraft';
import { Language } from '@/types/configurator';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Award, Building2, CheckCircle2,
  Clock, FileText, Flame, Inbox, Layers, Minus, ShoppingCart, Sparkles, Target,
  TrendingDown, Trophy, Users, XCircle, Zap,
} from 'lucide-react';

// ────────────────────────────────────────────────────────────
// Translations
// ────────────────────────────────────────────────────────────
const T: Record<string, Record<Language, string>> = {
  kpi_pipeline:   { da: 'Pipeline værdi',          en: 'Pipeline value',         de: 'Pipeline-Wert',       it: 'Valore pipeline',     hu: 'Pipeline érték' },
  kpi_leads:      { da: 'Aktive leads',             en: 'Active leads',           de: 'Aktive Leads',        it: 'Lead attivi',         hu: 'Aktív leadek' },
  kpi_won:        { da: 'Vundne ordrer',            en: 'Won orders',             de: 'Gewonnene Aufträge',  it: 'Ordini vinti',        hu: 'Megnyert rendelések' },
  kpi_winrate:    { da: 'Win rate',                 en: 'Win rate',               de: 'Win-Rate',            it: 'Win rate',            hu: 'Win rate' },
  kpi_avgtime:    { da: 'Gns. salgstid',            en: 'Avg. sales cycle',       de: 'Ø Verkaufszyklus',    it: 'Ciclo medio',         hu: 'Átl. értékesítési idő' },
  kpi_closed:     { da: 'Lukkede ordrer',           en: 'Closed orders',          de: 'Abgeschl. Aufträge',  it: 'Ordini chiusi',       hu: 'Lezárt rendelések' },
  vs_last_month:  { da: 'vs. sidste måned',         en: 'vs. last month',         de: 'vs. Vormonat',        it: 'vs mese scorso',      hu: 'vs előző hónap' },
  stable:         { da: 'Stabil',                   en: 'Stable',                 de: 'Stabil',              it: 'Stabile',             hu: 'Stabil' },

  pipeline_dist:  { da: 'Pipeline Fordeling',       en: 'Pipeline distribution',  de: 'Pipeline-Verteilung', it: 'Distribuzione pipeline', hu: 'Pipeline eloszlás' },
  pipeline_total: { da: 'Total pipeline',           en: 'Total pipeline',         de: 'Gesamt-Pipeline',     it: 'Pipeline totale',     hu: 'Teljes pipeline' },
  recent:         { da: 'Seneste Aktivitet',        en: 'Recent activity',        de: 'Letzte Aktivität',    it: 'Attività recente',    hu: 'Legutóbbi tevékenység' },
  lost_reasons:   { da: 'Hvorfor taber vi ordrer?', en: 'Why do we lose orders?', de: 'Warum verlieren wir?', it: 'Perché perdiamo?',   hu: 'Miért veszítünk?' },
  followups:      { da: 'Kommende opfølgninger',    en: 'Upcoming follow-ups',    de: 'Anstehende Follow-ups', it: 'Follow-up imminenti', hu: 'Közelgő követések' },
  no_followups:   { da: 'Ingen åbne opfølgninger – godt arbejde!', en: 'No open follow-ups – great work!', de: 'Keine offenen Follow-ups!', it: 'Nessun follow-up aperto!', hu: 'Nincs nyitott követés!' },
  inactive:       { da: 'Inaktive konti (60+ dage)', en: 'Inactive accounts (60+ days)', de: 'Inaktive Konten (60+ Tage)', it: 'Account inattivi (60+ gg)', hu: 'Inaktív fiókok (60+ nap)' },
  best:           { da: 'Bedst præsterende konti',  en: 'Best performing accounts', de: 'Top-Konten',        it: 'Account migliori',    hu: 'Legjobb fiókok' },
  open_all:       { da: 'Se alle',                  en: 'View all',               de: 'Alle anzeigen',       it: 'Vedi tutto',          hu: 'Összes' },
  empty:          { da: 'Ingen data endnu.',        en: 'No data yet.',           de: 'Noch keine Daten.',   it: 'Nessun dato.',        hu: 'Még nincs adat.' },
  empty_chart:    { da: 'Ingen data at vise.',      en: 'Nothing to show yet.',   de: 'Keine Daten.',        it: 'Nulla da mostrare.',  hu: 'Nincs megjeleníthető.' },
  trend30:        { da: 'Pipeline (sidste 30 dage)', en: 'Pipeline (last 30 days)', de: 'Pipeline (30 Tage)', it: 'Pipeline (30 gg)',   hu: 'Pipeline (30 nap)' },

  stage_lead:     { da: 'Lead',          en: 'Lead',          de: 'Lead',          it: 'Lead',          hu: 'Lead' },
  stage_demo:     { da: 'Demo planlagt', en: 'Demo planned',  de: 'Demo geplant',  it: 'Demo pianificata', hu: 'Demó tervezve' },
  stage_quote:    { da: 'Tilbud sendt',  en: 'Quote sent',    de: 'Angebot gesendet', it: 'Preventivo inviato', hu: 'Árajánlat elküldve' },
  stage_neg:      { da: 'Forhandling',   en: 'Negotiation',   de: 'Verhandlung',   it: 'Negoziazione',  hu: 'Tárgyalás' },
  stage_won:      { da: 'Vundet',        en: 'Won',           de: 'Gewonnen',      it: 'Vinto',         hu: 'Megnyert' },
  stage_lost:     { da: 'Tabt',          en: 'Lost',          de: 'Verloren',      it: 'Perso',         hu: 'Elveszett' },

  reason_price:   { da: 'Pris',          en: 'Price',         de: 'Preis',         it: 'Prezzo',        hu: 'Ár' },
  reason_lead:    { da: 'Leveringstid',  en: 'Lead time',     de: 'Lieferzeit',    it: 'Tempo consegna',hu: 'Szállítási idő' },
  reason_comp:    { da: 'Konkurrent',    en: 'Competitor',    de: 'Wettbewerb',    it: 'Concorrente',   hu: 'Versenytárs' },
  reason_other:   { da: 'Andet',         en: 'Other',         de: 'Sonstiges',     it: 'Altro',         hu: 'Egyéb' },

  days:           { da: 'dage',          en: 'days',          de: 'Tage',          it: 'giorni',        hu: 'nap' },
  orders:         { da: 'ordrer',        en: 'orders',        de: 'Aufträge',      it: 'ordini',        hu: 'rendelés' },

  latest_sold:    { da: 'Seneste solgte enheder', en: 'Latest sold units', de: 'Zuletzt verkaufte Einheiten', it: 'Ultime unità vendute', hu: 'Legutóbb eladott egységek' },
  no_closed:      { da: 'Ingen lukkede ordrer endnu.', en: 'No closed orders yet.', de: 'Noch keine abgeschlossenen Aufträge.', it: 'Nessun ordine chiuso.', hu: 'Még nincs lezárt rendelés.' },
  pipeline_dist_title: { da: 'Pipeline Fordeling', en: 'Pipeline distribution', de: 'Pipeline-Verteilung', it: 'Distribuzione pipeline', hu: 'Pipeline eloszlás' },
  no_records:     { da: 'Ingen poster fundet',   en: 'No records found',      de: 'Keine Einträge',      it: 'Nessun record',         hu: 'Nincs találat' },
  col_type:       { da: 'Type',          en: 'Type',          de: 'Typ',           it: 'Tipo',          hu: 'Típus' },
  col_number:     { da: 'Nummer',        en: 'Number',        de: 'Nummer',        it: 'Numero',        hu: 'Szám' },
  col_title_cust: { da: 'Titel / kunde', en: 'Title / customer', de: 'Titel / Kunde', it: 'Titolo / cliente', hu: 'Cím / ügyfél' },
  col_dealer:     { da: 'Forhandler',    en: 'Dealer',        de: 'Händler',       it: 'Rivenditore',   hu: 'Kereskedő' },
  col_seller:     { da: 'Sælger',        en: 'Seller',        de: 'Verkäufer',     it: 'Venditore',     hu: 'Értékesítő' },
  col_value:      { da: 'Værdi',         en: 'Value',         de: 'Wert',          it: 'Valore',        hu: 'Érték' },
  col_status:     { da: 'Status',        en: 'Status',        de: 'Status',        it: 'Stato',         hu: 'Státusz' },
  col_date:       { da: 'Dato',          en: 'Date',          de: 'Datum',         it: 'Data',          hu: 'Dátum' },
  col_open:       { da: 'Åbn',           en: 'Open',          de: 'Öffnen',        it: 'Apri',          hu: 'Megnyit' },
  total:          { da: 'Total',         en: 'Total',         de: 'Gesamt',        it: 'Totale',        hu: 'Összesen' },
};

interface StageMeta { key: 'lead'|'demo'|'quote'|'neg'|'won'|'lost'; tKey: string; bar: string; hex: string; ring: string }
const PIPELINE_STAGES: StageMeta[] = [
  { key: 'lead',  tKey: 'stage_lead',  bar: 'bg-gradient-to-r from-slate-300 to-slate-400',   hex: '#94a3b8', ring: 'bg-slate-100 text-slate-600' },
  { key: 'demo',  tKey: 'stage_demo',  bar: 'bg-gradient-to-r from-sky-400 to-sky-500',       hex: '#0ea5e9', ring: 'bg-sky-100 text-sky-700' },
  { key: 'quote', tKey: 'stage_quote', bar: 'bg-gradient-to-r from-amber-400 to-amber-500',   hex: '#f59e0b', ring: 'bg-amber-100 text-amber-700' },
  { key: 'won',   tKey: 'stage_won',   bar: 'bg-gradient-to-r from-emerald-500 to-[#2d5a27]', hex: '#2d5a27', ring: 'bg-emerald-100 text-emerald-700' },
  { key: 'lost',  tKey: 'stage_lost',  bar: 'bg-gradient-to-r from-rose-400 to-rose-500',     hex: '#f43f5e', ring: 'bg-rose-100 text-rose-700' },
];

const REASON_HEX: Record<'price'|'lead'|'comp'|'other', string> = {
  price: '#f43f5e', lead: '#f59e0b', comp: '#8b5cf6', other: '#64748b',
};

// Mini bar chart heights (%) for the Closed Orders hero card
const CLOSED_BARS: number[] = [38, 52, 44, 65, 48, 72, 60, 80, 70, 92];

// ────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────
function fmtKr(n: number): string { return `${Math.round(n).toLocaleString('da-DK')} kr.`; }
function fmtKrShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mio.`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
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

function classifyStage(a: CrmActivity): StageMeta['key'] | null {
  const status = (a.status || '').toLowerCase();
  switch (a.activity_type) {
    case 'lead_created': case 'lead_viewed': case 'lead_accepted': return 'lead';
    case 'lead_rejected': return 'lost';
    case 'quote_created': case 'quote_revised': return 'quote';
    case 'quote_sent': return status === 'negotiating' ? 'neg' : 'quote';
    case 'order_created': return 'neg';
    case 'order_sent': return status === 'lost' ? 'lost' : 'won';
    default: return null;
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

function activityDotClass(stage: StageMeta['key'] | null): string {
  switch (stage) {
    case 'won': return 'bg-emerald-500 ring-emerald-100';
    case 'lost': return 'bg-rose-500 ring-rose-100';
    case 'quote': case 'neg': return 'bg-sky-500 ring-sky-100';
    case 'demo': return 'bg-amber-500 ring-amber-100';
    case 'lead': return 'bg-violet-500 ring-violet-100';
    default: return 'bg-slate-400 ring-slate-100';
  }
}
function activityBadge(stage: StageMeta['key'] | null, lang: Language): { label: string; cls: string } | null {
  switch (stage) {
    case 'won':   return { label: T.stage_won[lang],   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'lost':  return { label: T.stage_lost[lang],  cls: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'quote': return { label: T.stage_quote[lang], cls: 'bg-amber-50 text-amber-700 border-amber-200' };
    case 'neg':   return { label: T.stage_neg[lang],   cls: 'bg-violet-50 text-violet-700 border-violet-200' };
    case 'demo':  return { label: T.stage_demo[lang],  cls: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'lead':  return { label: T.stage_lead[lang],  cls: 'bg-slate-50 text-slate-700 border-slate-200' };
    default: return null;
  }
}
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase() || '').join('') || '?';
}
function relativeTime(iso: string, lang: Language): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return lang === 'da' ? 'nu' : 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString('da-DK');
}
function prettyType(t: CrmActivityType): string { return t.replace(/_/g, ' '); }

// ────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────
export default function CrmDashboardPage() {
  const { appUser } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  const { language: lang } = useLanguage();
  const portalRole = derivePortalRole(effectiveUser);
  const isAdmin = isCrmAdmin(portalRole);
  const externalCrm = isExternalCrmRole(portalRole);

  const [accounts, setAccounts] = useState<CrmAccount[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [orders, setOrders] = useState<CrmOrderWithValue[]>([]);
  const [openQuotes, setOpenQuotes] = useState<ScopedConfiguration[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [calendar, setCalendar] = useState<CalendarActivity[]>([]);
  const [selectedSellerInitials, setSelectedSellerInitials] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [openStage, setOpenStage] = useState<StageMeta['key'] | null>(null);
  const [leadRefreshToken, setLeadRefreshToken] = useState(0);

  // Top dashboard scope filter (admin-only). null = "Alle" (combined view).
  const [topSellerInitials, setTopSellerInitials] = useState<string | null>(null);

  useEffect(() => {
    const onLeadsChanged = () => setLeadRefreshToken((n) => n + 1);
    window.addEventListener("timan:crm-leads-changed", onLeadsChanged);
    return () => window.removeEventListener("timan:crm-leads-changed", onLeadsChanged);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Resolve the active scope. For admins with a top-filter selection we
      // re-scope every dashboard fetch as that seller. "Alle" → unscoped.
      const sellerView = getActiveSellerView(appUser?.email);
      const ownInitials = sellerView?.initials
        ?? (portalRole === 'timan_seller' && appUser?.display_name
            ? appUser.display_name.match(/^([A-ZÆØÅ]{2,4})/)?.[1] ?? null
            : null);
      const ownEmail = sellerView?.email
        ?? (portalRole === 'timan_seller' ? appUser?.email?.toLowerCase() ?? null : null);

      const pickedSeller = (isAdmin && topSellerInitials)
        ? BUDGET_SELLERS.find(s => s.initials === topSellerInitials) ?? null
        : null;

      const ownSid = await resolveSellerId(appUser?.email);
      const sid = pickedSeller ? await resolveSellerId(pickedSeller.email) : ownSid;

      const sellerInitials = pickedSeller?.initials ?? ownInitials;
      const sellerEmail = pickedSeller?.email ?? ownEmail;
      const dealerNumber = effectiveUser?.dealer_number ?? null;
      const dealerNumbers = externalCrm
        ? Array.from((await buildJournalScope(effectiveUser, portalRole)).dealerNumbers)
        : null;

      // When a specific seller is picked we narrow the role to 'timan_seller'
      // so the scoped services apply seller-level filters even for admins.
      const effectiveRole = pickedSeller ? 'timan_seller' : portalRole;
      const effectiveAdmin = isAdmin && !pickedSeller;

      const scopeFilter = { role: effectiveRole, sellerId: sid, sellerInitials, sellerEmail, dealerNumber, dealerNumbers };

      const acc = await listCrmAccounts({ role: effectiveRole, sellerId: sid, dealerNumbers });
      const accountIds = new Set(acc.accounts.map((a) => a.id));
      const accountNames = new Set(
        acc.accounts.flatMap((a) => [a.company, a.full_name, a.dealer_number])
          .filter(Boolean)
          .map((v) => String(v).trim().toLowerCase()),
      );
      const rawAct = await listActivities({ ownerUserId: effectiveAdmin ? null : (externalCrm ? null : sid), limit: 500 });
      const act = externalCrm
        ? rawAct.filter((a) => (a.account_id && accountIds.has(a.account_id)) || (a.account_name && accountNames.has(a.account_name.trim().toLowerCase())))
        : rawAct;
      const ord = await listScopedOrdersWithValue(scopeFilter);
      const quo = await listScopedOpenQuotes(scopeFilter);
      const rawLeads = await listLeads({ ownerUserId: effectiveAdmin ? null : (externalCrm ? null : sid), limit: 500 });
      const lds = externalCrm
        ? rawLeads.filter((l) => {
            const linked = (l.linked_dealer_id || '').trim().toLowerCase();
            return (linked && (accountIds.has(l.linked_dealer_id || '') || accountNames.has(linked)))
              || Array.from(accountNames).some((name) => name.length >= 3 && (l.title || '').toLowerCase().includes(name));
          })
        : rawLeads;
      const rawCal = await listCalendarActivities({
        sellerInitials: effectiveAdmin ? null : (externalCrm ? null : sellerInitials),
        sellerUserId: effectiveAdmin ? null : (externalCrm ? null : sid),
      });
      const cal = externalCrm ? rawCal.filter((a) => !a.account_id || accountIds.has(a.account_id)) : rawCal;
      if (cancelled) return;
      setSellerId(sid);
      setAccounts(acc.accounts);
      setActivities(act);
      setOrders(ord.rows);
      setOpenQuotes(quo.rows);
      setLeads(lds);
      setCalendar(cal);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email, effectiveUser?.dealer_number, appUser?.display_name, portalRole, isAdmin, externalCrm, topSellerInitials, leadRefreshToken]);

  // Build pipeline-by-stage from the SHARED CRM sources used elsewhere.
  // - won  → won leads plus orders (same as CRM → Ordrer & Lukkede ordrer KPI)
  // - quote → openQuotes (same as CRM → Tilbud & Pipeline value)
  // - lead/won/lost → crm_leads status
  // - demo → crm_calendar_activities (type=demo, status=planned)
  const pipelineRows = useMemo(() => buildPipelineRows({ orders, openQuotes, leads, calendar }), [orders, openQuotes, leads, calendar]);

  const realMetrics = useMemo(() => {
    const base = deriveMetrics(activities, orders, isAdmin);
    const byStage = PIPELINE_STAGES.map(meta => {
      const items = pipelineRows[meta.key] || [];
      const value = items.reduce((s, x) => s + (x.value || 0), 0);
      return { key: meta.key, bar: meta.bar, hex: meta.hex, ring: meta.ring, value, count: items.length };
    });
    const openKeys: Array<StageMeta['key']> = ['lead','demo','quote'];
    const pipelineValue = byStage.filter(s => openKeys.includes(s.key)).reduce((s, x) => s + x.value, 0);
    const pipelineValueEur = openQuotes
      .filter(q => q.currency === 'EUR')
      .reduce((s, q) => s + (q.total_value || 0), 0);
    const activeLeadRows = [
      ...(pipelineRows.lead || []),
      ...(pipelineRows.demo || []),
    ];
    const now = new Date();
    const monthStart = startOfMonth(now);
    const prevWindow = sameTimePrevMonth(now);
    const leadsThis = activeLeadRows.filter((row) => {
      const d = new Date(row.date);
      return !Number.isNaN(d.getTime()) && d >= monthStart;
    }).length;
    const leadsPrev = activeLeadRows.filter((row) => {
      const d = new Date(row.date);
      return !Number.isNaN(d.getTime()) && d >= prevWindow.from && d <= prevWindow.to;
    }).length;
    return {
      ...base,
      activeLeads: activeLeadRows.length,
      leadsPctChange: pctChange(leadsThis, leadsPrev),
      pipelineValue,
      pipelineValueEur,
      pipelineByStage: byStage,
    };
  }, [activities, orders, isAdmin, pipelineRows, openQuotes]);

  const realTrend30 = useMemo(() => buildPipelineTrend(activities), [activities]);

  // Demo cleanup: never substitute mock data. Show real values (and the
  // built-in empty states) when there is no CRM data yet.
  const metrics = realMetrics;
  const trend30 = realTrend30;
  const previewActivities = activities;

  return (
    <CrmLayout pageTitle="Dashboard">
      {/* PREMIUM BACKDROP */}
      <div className="relative -mt-2">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-72 -z-10 opacity-60 blur-3xl"
          style={{
            background:
              'radial-gradient(60% 50% at 20% 0%, rgba(45,90,39,0.18), transparent 70%), radial-gradient(50% 50% at 90% 0%, rgba(14,165,233,0.18), transparent 70%)',
          }}
        />

        {/* TOP DASHBOARD SCOPE FILTER (backend/admin only) */}
        {isAdmin && (
          <div className="mb-3 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] font-semibold text-slate-500">
              Sælger
            </span>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setTopSellerInitials(null)}
                className={`px-3 h-7 rounded-lg text-[12px] font-semibold transition-colors ${
                  topSellerInitials === null
                    ? 'bg-[#2d5a27] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Alle
              </button>
              {BUDGET_SELLERS.map(s => (
                <button
                  key={s.initials}
                  type="button"
                  onClick={() => setTopSellerInitials(s.initials)}
                  className={`px-3 h-7 rounded-lg text-[12px] font-semibold tabular-nums transition-colors ${
                    topSellerInitials === s.initials
                      ? 'bg-[#2d5a27] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {s.initials}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TOP KPI HERO LAYOUT — 4-column grid. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,2.6fr)_minmax(0,2.2fr)_minmax(0,4fr)] gap-3 mb-4 items-stretch animate-[fadeIn_.4s_ease-out]">
          {/* COLUMN 1 — Pipeline + Closed Orders (stretch to match other columns) */}
          <div className="min-w-0 flex flex-col gap-3">
            {/* Pipeline value — compact dark green (also shows Aktive leads) */}
            <Link to="/portal/crm/quotes" className="group block w-full flex-1">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-[#0f2e1f] via-[#143a26] to-[#1f5535] text-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)] hover:shadow-[0_20px_60px_-16px_rgba(15,23,42,0.45)] hover:-translate-y-0.5 transition-all duration-300 px-4 py-3 flex items-center gap-3 h-full min-h-[88px]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-30 blur-3xl"
                  style={{ background: 'radial-gradient(closest-side, rgba(16,185,129,0.6), transparent 70%)' }}
                />
                {/* Main metric */}
                <div className="relative min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-lg bg-white/10 ring-1 ring-white/20 flex items-center justify-center backdrop-blur-sm shrink-0">
                      <Target className="h-3 w-3" strokeWidth={2} />
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-100/80 font-semibold whitespace-nowrap">
                      {T.kpi_pipeline[lang]}
                    </p>
                    <div className="ml-2">
                      <HeroTrend pct={metrics.pipelinePctChange} lang={lang} />
                    </div>
                  </div>
                  <p className="text-[1.45rem] leading-none font-bold tracking-tight tabular-nums mt-1">
                    {fmtKr(metrics.pipelineValue)}
                  </p>
                  {metrics.pipelineValueEur > 0 && (
                    <p className="text-[11px] text-emerald-100/85 tabular-nums mt-1">
                      {Math.round(metrics.pipelineValueEur).toLocaleString('da-DK')} EUR
                    </p>
                  )}
                </div>
                {/* Compact sparkline */}
                <div className="relative hidden sm:block w-16 h-8 shrink-0 opacity-90 -ml-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend30}>
                      <Line type="monotone" dataKey="value" stroke="#a7f3d0" strokeWidth={1.75} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* Embedded KPI slot — separated by a thin divider */}
                <div className="relative shrink-0 w-[112px] pl-3 ml-auto border-l border-white/15 flex flex-col items-start justify-center gap-1">
                  <div className="flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-emerald-100/80" strokeWidth={2} />
                    <p className="text-[9.5px] uppercase tracking-[0.1em] text-emerald-100/80 font-semibold whitespace-nowrap">
                      {T.kpi_leads[lang]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[1.15rem] leading-none font-bold tracking-tight tabular-nums">
                      {metrics.activeLeads}
                    </p>
                    <MiniTrend pct={metrics.leadsPctChange} lang={lang} />
                  </div>
                </div>
              </div>
            </Link>

            {/* Closed Orders — compact dark navy (also shows Vundne ordrer) */}
            <Link to="/portal/crm/orders" className="group block w-full flex-1">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-[#0b1e3a] via-[#11284a] to-[#1c3a66] text-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.35)] hover:shadow-[0_20px_60px_-16px_rgba(15,23,42,0.45)] hover:-translate-y-0.5 transition-all duration-300 px-4 py-3 flex items-center gap-3 h-full min-h-[88px]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full opacity-30 blur-3xl"
                  style={{ background: 'radial-gradient(closest-side, rgba(56,189,248,0.55), transparent 70%)' }}
                />
                {/* Main metric */}
                <div className="relative min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-lg bg-white/10 ring-1 ring-white/20 flex items-center justify-center backdrop-blur-sm shrink-0">
                      <ShoppingCart className="h-3 w-3" strokeWidth={2} />
                    </div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-sky-100/80 font-semibold whitespace-nowrap">
                      {T.kpi_closed[lang]}
                    </p>
                    <div className="ml-2">
                      <HeroTrend pct={metrics.closedPctChange} lang={lang} />
                    </div>
                  </div>
                  <p className="text-[1.45rem] leading-none font-bold tracking-tight tabular-nums mt-1">
                    {fmtKr(metrics.closedValueThisMonth)}
                  </p>
                  {metrics.closedValueThisMonthEur > 0 && (
                    <p className="text-[11px] text-sky-100/85 tabular-nums mt-1">
                      {Math.round(metrics.closedValueThisMonthEur).toLocaleString('da-DK')} EUR
                    </p>
                  )}
                </div>
                {/* Compact bar chart */}
                <div className="relative hidden sm:flex items-end gap-[2px] w-16 h-8 shrink-0 -ml-1">
                  {CLOSED_BARS.map((h, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-sm bg-sky-300/70"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
                {/* Embedded KPI slot — separated by a thin divider */}
                <div className="relative shrink-0 w-[112px] pl-3 ml-auto border-l border-white/15 flex flex-col items-start justify-center gap-1">
                  <div className="flex items-center gap-1">
                    <Trophy className="h-3 w-3 text-sky-100/80" strokeWidth={2} />
                    <p className="text-[9.5px] uppercase tracking-[0.1em] text-sky-100/80 font-semibold whitespace-nowrap">
                      {T.kpi_won[lang]}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[1.15rem] leading-none font-bold tracking-tight tabular-nums">
                      {metrics.wonOrdersCount}
                    </p>
                    <MiniTrend pct={metrics.wonPctChange} lang={lang} />
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* COLUMN 2 — Seneste solgte enheder (full height) */}
          <div className="min-w-0 flex flex-col gap-3">
            <Link to="/portal/crm/orders" className="group block flex-1">
              <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] transition-all duration-300 px-3 py-2 h-full flex flex-col">
                <div className="flex items-center gap-1.5 mb-1">
                  <Award className="h-3.5 w-3.5 text-[#2d5a27]" strokeWidth={2} />
                  <p className="text-[9.5px] uppercase tracking-[0.1em] text-slate-500 font-semibold">
                    {T.latest_sold[lang]}
                  </p>
                </div>
                {metrics.latestSoldUnits.length === 0 ? (
                  <p className="text-[11px] text-slate-400">{T.no_closed[lang]}</p>
                ) : (
                  <ul className="space-y-1 text-[11.5px] leading-tight">
                    {metrics.latestSoldUnits.map(o => (
                      <li key={o.id} className="min-w-0">
                        <span className="min-w-0 flex-1">
                          <span className="font-medium text-slate-800 truncate block" title={o.dealer}>{o.dealer}</span>
                          <span className="text-slate-500 truncate block" title={o.units.map(u => `${u.qty}× ${u.key}`).join(', ')}>
                            {o.units.map(u => `${u.qty}× ${u.key}`).join(', ')}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Link>
          </div>

          {/* COLUMN 3 — Win rate + Gns. salgstid stacked vertically */}
          <div className="min-w-0 flex flex-col gap-3">
            {/* Win rate — compact */}
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] transition-all duration-300 px-3 py-2 flex items-center gap-2 flex-1 min-h-[88px]">
              <div className="h-7 w-7 shrink-0 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
                <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9.5px] uppercase tracking-[0.1em] text-slate-500 font-semibold truncate">
                  {T.kpi_winrate[lang]}
                </p>
                <p className="text-[1.15rem] font-bold text-slate-900 tracking-tight tabular-nums leading-none mt-0.5">
                  {metrics.winRate}%
                </p>
              </div>
            </div>

            {/* Gns. salgstid — compact */}
            <div className="bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] transition-all duration-300 px-3 py-2 flex items-center gap-2 flex-1 min-h-[88px]">
              <div className="h-7 w-7 shrink-0 rounded-lg bg-sky-50 text-sky-700 border border-sky-200 flex items-center justify-center">
                <Clock className="h-3.5 w-3.5" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9.5px] uppercase tracking-[0.1em] text-slate-500 font-semibold truncate">
                  {T.kpi_avgtime[lang]}
                </p>
                <p className="text-[1.15rem] font-bold text-slate-900 tracking-tight tabular-nums leading-none mt-0.5">
                  {metrics.avgSalesDays}<span className="text-[11px] font-medium text-slate-500 ml-1">{T.days[lang]}</span>
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN — Upcoming activities with 2x2 stats grid */}
          <div className="min-w-0 flex flex-col gap-3 h-full [&>div]:h-full [&>div]:flex [&>div]:flex-col">
            <UpcomingActivitiesWidget statsLayout="grid2x2" sellerInitialsOverride={isAdmin ? topSellerInitials : undefined} />
          </div>
        </div>

        {/* SELLER COCKPIT — Lead focus + Budget focus (switcher hidden; controlled by top filter) */}
        <SellerCockpitSection
          isAdmin={isAdmin}
          sellerEmail={appUser?.email ?? null}
          sellerId={sellerId}
          controlledInitials={isAdmin ? topSellerInitials : undefined}
        />

        {/* PIPELINE — bars + horizontal stacked bar legend */}
        <Card className="mb-6">
          <CardHeader icon={Layers} title={T.pipeline_dist[lang]} />
          {metrics.pipelineByStage.every(s => s.value === 0 && s.count === 0) ? (
            <EmptyState text={T.empty[lang]} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: per-stage progress bars (clickable) */}
              <div className="lg:col-span-2 space-y-3.5">
                {(() => {
                  const max = Math.max(1, ...metrics.pipelineByStage.map(s => s.value));
                  const totalValue = metrics.pipelineByStage.reduce((s, x) => s + x.value, 0);
                  return metrics.pipelineByStage.map(s => {
                    const widthPct = Math.round((s.value / max) * 100);
                    const sharePct = totalValue === 0 ? 0 : Math.round((s.value / totalValue) * 100);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setOpenStage(s.key)}
                        className="block w-full text-left rounded-lg p-1 -m-1 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                      >
                        <div className="flex items-center justify-between text-sm mb-1.5">
                          <span className="inline-flex items-center gap-2 font-medium text-gray-800">
                            <span className={`inline-flex items-center justify-center h-5 w-5 rounded-md text-[10px] font-semibold ${s.ring}`}>
                              {s.count}
                            </span>
                            {T[`stage_${s.key}`][lang]}
                          </span>
                          <span className="text-xs text-gray-500 tabular-nums">
                            <span className="font-semibold text-gray-700">{fmtKr(s.value)}</span>
                            <span className="mx-1.5 text-gray-300">·</span>{sharePct}%
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`${s.bar} h-full rounded-full transition-[width] duration-700 ease-out`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </button>
                    );
                  });
                })()}
              </div>

              {/* Right: horizontal stacked bar + legend (replaces donut) */}
              <div className="flex flex-col">
                <div className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-50 to-white p-5">
                  <div className="flex items-baseline justify-between mb-4">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-semibold">
                      {T.pipeline_total[lang]}
                    </span>
                    <span className="text-lg font-bold text-slate-900 tabular-nums">
                      {fmtKrShort(metrics.pipelineValue)}
                    </span>
                  </div>
                  {(() => {
                    const openPipelineKeys: Array<StageMeta['key']> = ['lead', 'demo', 'quote'];
                    const openPipelineStages = metrics.pipelineByStage.filter(s => openPipelineKeys.includes(s.key));
                    const totalValue = Math.max(1, metrics.pipelineValue);
                    const segs = openPipelineStages.filter(s => s.value > 0);
                    return (
                      <>
                        <div className="flex h-3 w-full rounded-full overflow-hidden bg-slate-100 ring-1 ring-slate-200/60">
                          {segs.map((s, i) => {
                            const pct = (s.value / totalValue) * 100;
                            return (
                              <button
                                key={s.key}
                                type="button"
                                onClick={() => setOpenStage(s.key)}
                                title={`${T[`stage_${s.key}`][lang]} · ${fmtKr(s.value)}`}
                                className={`${s.bar} h-full ${i === 0 ? '' : 'border-l border-white/60'}`}
                                style={{ width: `${pct}%` }}
                              />
                            );
                          })}
                        </div>
                        <div className="mt-4 space-y-2">
                          {openPipelineStages.filter(s => s.count > 0 || s.value > 0).map(s => {
                            const pct = totalValue === 0 ? 0 : Math.round((s.value / totalValue) * 100);
                            return (
                              <button
                                key={s.key}
                                type="button"
                                onClick={() => setOpenStage(s.key)}
                                className="flex items-center gap-2 text-[11.5px] w-full text-left rounded hover:bg-slate-100/60 px-1 py-0.5"
                              >
                                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.hex }} />
                                <span className="text-slate-700 font-medium truncate">{T[`stage_${s.key}`][lang]}</span>
                                <span className="ml-auto text-slate-500 tabular-nums shrink-0">
                                  <span className="font-semibold text-slate-700">{s.count}</span>
                                  <span className="mx-1 text-slate-300">·</span>
                                  <span>{fmtKrShort(s.value)}</span>
                                  <span className="mx-1 text-slate-300">·</span>
                                  <span>{pct}%</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
          {/* Drill-down modal */}
          <PipelineStageModal
            stage={openStage}
            onClose={() => setOpenStage(null)}
            rowsByStage={pipelineRows}
            lang={lang}
          />
        </Card>

        {/* RECENT ACTIVITY + LOST REASONS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2">
            <CardHeader
              icon={Activity}
              title={T.recent[lang]}
              actions={<Link className="text-sm font-medium text-[#2d5a27] hover:underline" to="/portal/crm/activities">{T.open_all[lang]} →</Link>}
            />
            {previewActivities.length === 0 ? (
              <EmptyState text={T.empty[lang]} icon={Inbox} />
            ) : (
              <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-gradient-to-b before:from-gray-200 before:via-gray-200 before:to-transparent">
                {previewActivities.slice(0, 8).map(a => {
                  const stage = classifyStage(a);
                  const badge = activityBadge(stage, lang);
                  const owner = isAdmin ? (a.created_by_name || a.assigned_owner_name || '—') : '';
                  return (
                    <li key={a.id} className="relative pl-10 group">
                      {/* avatar / dot */}
                      {isAdmin && owner !== '—' ? (
                        <div className={`absolute left-0 top-1 h-8 w-8 rounded-full bg-gradient-to-br from-[#2d5a27] to-emerald-700 text-white text-[11px] font-semibold flex items-center justify-center ring-2 ring-white shadow-sm`}>
                          {initials(owner)}
                        </div>
                      ) : (
                        <span className={`absolute left-[10px] top-3 h-2.5 w-2.5 rounded-full ring-4 ${activityDotClass(stage)}`} />
                      )}
                      <div className="flex items-start justify-between gap-3 rounded-lg -mx-2 px-2 py-1 group-hover:bg-gray-50 transition">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{a.title || prettyType(a.activity_type)}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {isAdmin && <><span className="font-medium text-gray-700">{owner}</span> · </>}
                            {a.account_name || '—'}{a.value ? <> · <span className="text-gray-700 font-medium">{fmtKr(a.value)}</span></> : null}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {badge && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${badge.cls}`}>{badge.label}</span>
                          )}
                          <span className="text-[11px] text-gray-400 tabular-nums">{relativeTime(a.activity_date, lang)}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader icon={TrendingDown} title={T.lost_reasons[lang]} />
            {metrics.lostReasons.total === 0 ? (
              <EmptyState text={T.empty[lang]} />
            ) : (
              <>
                <div className="h-40 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={(['price','lead','comp','other'] as const)
                          .map(k => ({ name: T[`reason_${k}`][lang], value: metrics.lostReasons.items[k].count, fill: REASON_HEX[k] }))
                          .filter(d => d.value > 0)}
                        dataKey="value" innerRadius={42} outerRadius={64} paddingAngle={3}
                        stroke="white" strokeWidth={2}
                      >
                        {(['price','lead','comp','other'] as const).map(k => (
                          <Cell key={k} fill={REASON_HEX[k]} />
                        ))}
                      </Pie>
                      <RTooltip contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2.5">
                  {(['price','lead','comp','other'] as const).map(key => {
                    const item = metrics.lostReasons.items[key];
                    const total = Math.max(1, metrics.lostReasons.total);
                    const pct = Math.round((item.count / total) * 100);
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="inline-flex items-center gap-2 font-medium text-gray-700">
                            <span className="h-2 w-2 rounded-full" style={{ background: REASON_HEX[key] }} />
                            {T[`reason_${key}`][lang]}
                          </span>
                          <span className="text-gray-500 tabular-nums">{item.count} · {pct}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full transition-[width] duration-700"
                               style={{ width: `${pct}%`, background: REASON_HEX[key] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* PIPELINE TREND CHART (admins or sellers — own data) */}
        <Card className="mb-6">
          <CardHeader icon={Zap} title={T.trend30[lang]} />
          {trend30.every(p => p.value === 0) ? (
            <EmptyState text={T.empty_chart[lang]} />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend30} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="pipeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#2d5a27" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#2d5a27" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                         tickFormatter={(v: number) => fmtKrShort(v)} width={50} />
                  <RTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12 }}
                    formatter={(v: number) => fmtKr(v)}
                  />
                  <Area type="monotone" dataKey="value" stroke="#2d5a27" strokeWidth={2} fill="url(#pipeGrad)" isAnimationActive />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* SÆLGEROVERBLIK — Timan Backend only */}
        {isAdmin && (
          <SellerOverviewSection
            selectedInitials={selectedSellerInitials}
            onSelectSeller={setSelectedSellerInitials}
          />
        )}

        {/* SELLER PERFORMANCE — backend only */}
        {isAdmin && <SellerPerformanceSection activities={activities} language={lang} />}

        {/* DEMO STATISTICS — visible for admin + sellers (sellers see only own) */}
        <DemoStatsSection />

        {/* BOTTOM ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <Card>
            <CardHeader icon={Clock} title={T.followups[lang]} />
            <EmptyState text={T.no_followups[lang]} icon={CheckCircle2} tone="positive" />
          </Card>

          <Card>
            <CardHeader icon={XCircle} title={T.inactive[lang]} />
            {(() => {
              const list = metrics.inactiveAccounts(accounts).slice(0, 6);
              if (list.length === 0) return <EmptyState text={T.empty[lang]} />;
              return (
                <ul className="divide-y divide-gray-100">
                  {list.map(a => (
                    <li key={a.id} className="py-2.5 flex items-center justify-between gap-3 group">
                      <div className="inline-flex items-center gap-2 min-w-0">
                        <span className="h-7 w-7 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-semibold inline-flex items-center justify-center">
                          {initials(accountDisplayName(a))}
                        </span>
                        <span className="text-sm text-gray-800 truncate group-hover:text-gray-900">{accountDisplayName(a)}</span>
                      </div>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap">{a.country || '—'}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </Card>

          <Card>
            <CardHeader icon={Award} title={isAdmin ? T.best[lang] : T.kpi_pipeline[lang]} />
            {(() => {
              const list = metrics.bestAccounts(accounts).slice(0, 6);
              if (list.length === 0) return <EmptyState text={T.empty[lang]} />;
              return (
                <ul className="space-y-2">
                  {list.map((b, i) => (
                    <li key={b.account.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-emerald-50/50 transition">
                      <span className={`h-7 w-7 rounded-lg text-[11px] font-bold inline-flex items-center justify-center ${
                        i === 0 ? 'bg-amber-100 text-amber-700' :
                        i === 1 ? 'bg-slate-100 text-slate-600' :
                        i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'
                      }`}>{i + 1}</span>
                      <span className="text-sm text-gray-800 truncate flex-1">{accountDisplayName(b.account)}</span>
                      <span className="text-xs font-semibold text-[#2d5a27] whitespace-nowrap tabular-nums">{fmtKr(b.value)}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </Card>
        </div>

        {/* Upcoming seller activities was moved into the top-right rail (see TOP KPI HERO LAYOUT). */}
      </div>
    </CrmLayout>
  );
}

// ────────────────────────────────────────────────────────────
// Reusable UI
// ────────────────────────────────────────────────────────────
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-2xl border border-gray-100 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_16px_40px_-16px_rgba(15,23,42,0.18)] transition-shadow p-6 ${className}`}>
      {children}
    </section>
  );
}

function CardHeader({ icon: Icon, title, actions }: { icon: typeof Building2; title: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 text-gray-700 inline-flex items-center justify-center ring-1 ring-gray-200/70">
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </h2>
      {actions}
    </div>
  );
}

function EmptyState({ text, icon: Icon = Inbox, tone = 'neutral' }:
  { text: string; icon?: typeof Inbox; tone?: 'neutral' | 'positive' }) {
  const cls = tone === 'positive' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400';
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className={`h-12 w-12 rounded-2xl ${cls} inline-flex items-center justify-center mb-3`}>
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

const ACCENTS: Record<string, { ring: string; icon: string; soft: string }> = {
  emerald: { ring: 'ring-emerald-50', icon: 'bg-emerald-50 text-[#2d5a27] border border-emerald-100', soft: 'from-emerald-50/40' },
  sky:     { ring: 'ring-slate-50',   icon: 'bg-slate-50 text-slate-700 border border-slate-200',     soft: 'from-sky-50/40' },
  violet:  { ring: 'ring-slate-50',   icon: 'bg-slate-50 text-slate-700 border border-slate-200',     soft: 'from-violet-50/40' },
  amber:   { ring: 'ring-slate-50',   icon: 'bg-slate-50 text-slate-700 border border-slate-200',     soft: 'from-amber-50/40' },
};

function Kpi({
  icon: Icon, label, value, sub, trendPct, lang, accent = 'emerald', sparkline, to,
}: {
  icon: typeof Building2; label: string; value: string; sub?: string;
  trendPct?: number; lang: Language; accent?: keyof typeof ACCENTS;
  sparkline?: Array<{ label: string; value: number }>; to?: string;
}) {
  const a = ACCENTS[accent];
  const showTrend = typeof trendPct === 'number';
  const TrendIcon = !showTrend ? ArrowRight : trendPct! > 2 ? ArrowUpRight : trendPct! < -2 ? ArrowDownRight : Minus;
  const trendCls = !showTrend ? '' :
    trendPct! > 2 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    trendPct! < -2 ? 'bg-rose-50 text-rose-700 border-rose-200' :
    'bg-gray-50 text-gray-600 border-gray-200';
  const trendLabel = !showTrend ? '' :
    Math.abs(trendPct!) <= 2 ? T.stable[lang] : `${trendPct! > 0 ? '+' : ''}${trendPct}%`;

  const inner = (
    <div className={`group relative overflow-hidden bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] hover:-translate-y-0.5 hover:border-slate-300/70 transition-all duration-300 p-6 h-full min-h-[190px] flex flex-col`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className={`h-10 w-10 rounded-xl ${a.icon} flex items-center justify-center`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </div>
        {showTrend ? (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${trendCls}`}>
            <TrendIcon className="h-3 w-3" />{trendLabel}
          </span>
        ) : (
          <span className="h-[22px]" aria-hidden />
        )}
      </div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold">{label}</p>
      <p className="text-[1.65rem] md:text-[1.75rem] font-bold text-slate-900 tracking-tight tabular-nums leading-tight mt-1">{value}</p>
      <p className="text-[12px] text-slate-500 mt-1 min-h-[16px]">{sub || '\u00A0'}</p>
      <p className="text-[10px] text-slate-400 mt-1 min-h-[12px]">{showTrend ? T.vs_last_month[lang] : '\u00A0'}</p>
      <div className="mt-auto" />
      {sparkline && sparkline.length > 1 && (
        <div className="absolute inset-x-0 bottom-0 h-10 opacity-60 group-hover:opacity-90 transition pointer-events-none">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline}>
              <Line type="monotone" dataKey="value" stroke="#2d5a27" strokeWidth={1.5} dot={false} isAnimationActive />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

// Grouped KPI card — two metrics side by side, sharing one premium card frame.
interface KpiHalf {
  icon: typeof Building2;
  label: string;
  value: string;
  trendPct?: number;
  accent?: keyof typeof ACCENTS;
  to?: string;
}
function KpiDuo({ left, right, lang }: { left: KpiHalf; right: KpiHalf; lang: Language }) {
  return (
    <div className="group relative overflow-hidden bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] hover:-translate-y-0.5 hover:border-slate-300/70 transition-all duration-300 h-full min-h-[190px] flex">
      <KpiHalfBlock {...left} lang={lang} />
      <div className="w-px bg-slate-200/70 my-5" />
      <KpiHalfBlock {...right} lang={lang} />
    </div>
  );
}

function KpiHalfBlock({
  icon: Icon, label, value, trendPct, accent = 'emerald', to, lang,
}: KpiHalf & { lang: Language }) {
  const a = ACCENTS[accent];
  const showTrend = typeof trendPct === 'number';
  const TrendIcon = !showTrend ? ArrowRight : trendPct! > 2 ? ArrowUpRight : trendPct! < -2 ? ArrowDownRight : Minus;
  const trendCls = !showTrend ? '' :
    trendPct! > 2 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    trendPct! < -2 ? 'bg-rose-50 text-rose-700 border-rose-200' :
    'bg-gray-50 text-gray-600 border-gray-200';
  const trendLabel = !showTrend ? '' :
    Math.abs(trendPct!) <= 2 ? T.stable[lang] : `${trendPct! > 0 ? '+' : ''}${trendPct}%`;

  const inner = (
    <div className="flex-1 p-6 flex flex-col min-w-0 hover:bg-slate-50/40 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className={`h-9 w-9 rounded-xl ${a.icon} flex items-center justify-center`}>
          <Icon className="h-4 w-4" strokeWidth={2} />
        </div>
        {showTrend ? (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${trendCls}`}>
            <TrendIcon className="h-3 w-3" />{trendLabel}
          </span>
        ) : (
          <span className="h-[22px]" aria-hidden />
        )}
      </div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold truncate">{label}</p>
      <p className="text-[1.5rem] md:text-[1.6rem] font-bold text-slate-900 tracking-tight tabular-nums leading-tight mt-1">{value}</p>
      <p className="text-[10px] text-slate-400 mt-1.5 min-h-[12px]">{showTrend ? T.vs_last_month[lang] : '\u00A0'}</p>
      <div className="mt-auto" />
    </div>
  );
  return to ? <Link to={to} className="flex-1 flex min-w-0">{inner}</Link> : inner;
}

// Hero trend pill — used inside the dark Pipeline hero card
function HeroTrend({ pct, lang }: { pct: number; lang: Language }) {
  const TrendIcon = pct > 2 ? ArrowUpRight : pct < -2 ? ArrowDownRight : Minus;
  const cls =
    pct > 2 ? 'bg-emerald-400/20 text-emerald-50 ring-emerald-300/30' :
    pct < -2 ? 'bg-rose-400/20 text-rose-50 ring-rose-300/30' :
    'bg-white/10 text-white/80 ring-white/20';
  const label = Math.abs(pct) <= 2 ? T.stable[lang] : `${pct > 0 ? '+' : ''}${pct}%`;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 backdrop-blur-sm ${cls}`}>
      <TrendIcon className="h-3.5 w-3.5" />{label}
    </span>
  );
}

// Compact trend pill for embedded KPI slots inside dark hero cards
function MiniTrend({ pct, lang }: { pct: number; lang: Language }) {
  const cls =
    pct > 2 ? 'bg-emerald-400/20 text-emerald-50 ring-emerald-300/30' :
    pct < -2 ? 'bg-rose-400/20 text-rose-50 ring-rose-300/30' :
    'bg-white/10 text-white/80 ring-white/20';
  const label = Math.abs(pct) <= 2 ? T.stable[lang] : `${pct > 0 ? '+' : ''}${pct}%`;
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap text-[9px] font-semibold px-2 py-0.5 rounded-full ring-1 ${cls}`}
      title={T.vs_last_month[lang]}
    >
      {label}
    </span>
  );
}

// Compact horizontal KPI row card — premium, single-line layout
function KpiRow({
  icon: Icon, label, value, sub, trendPct, lang, accent = 'emerald', to, className = '',
}: {
  icon: typeof Building2; label: string; value: string; sub?: string;
  trendPct?: number; lang: Language; accent?: keyof typeof ACCENTS;
  to?: string; className?: string;
}) {
  const a = ACCENTS[accent];
  const showTrend = typeof trendPct === 'number';
  const TrendIcon = !showTrend ? ArrowRight : trendPct! > 2 ? ArrowUpRight : trendPct! < -2 ? ArrowDownRight : Minus;
  const trendCls = !showTrend ? '' :
    trendPct! > 2 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
    trendPct! < -2 ? 'bg-rose-50 text-rose-700 border-rose-200' :
    'bg-gray-50 text-gray-600 border-gray-200';
  const trendLabel = !showTrend ? '' :
    Math.abs(trendPct!) <= 2 ? T.stable[lang] : `${trendPct! > 0 ? '+' : ''}${trendPct}%`;

  const inner = (
    <div className="group h-full bg-white rounded-2xl border border-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] hover:-translate-y-0.5 hover:border-slate-300/80 transition-all duration-300 p-5 flex items-center gap-4 min-h-[96px]">
      <div className={`h-11 w-11 shrink-0 rounded-xl ${a.icon} flex items-center justify-center`}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] uppercase tracking-[0.1em] text-slate-500 font-semibold truncate">{label}</p>
        <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
          <span className="text-[1.5rem] font-bold text-slate-900 tracking-tight tabular-nums leading-none whitespace-nowrap">{value}</span>
          {sub && <span className="text-xs text-slate-500 whitespace-nowrap">{sub}</span>}
        </div>
      </div>
      {showTrend && (
        <span className={`shrink-0 inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-1 rounded-full border ${trendCls}`}>
          <TrendIcon className="h-3 w-3" />{trendLabel}
        </span>
      )}
    </div>
  );
  return to ? <Link to={to} className={`block ${className}`}>{inner}</Link> : <div className={className}>{inner}</div>;
}


// ────────────────────────────────────────────────────────────
// Metric derivation
// ────────────────────────────────────────────────────────────
interface DerivedMetrics {
  pipelineValue: number;
  pipelinePctChange: number;
  activeLeads: number;
  leadsPctChange: number;
  wonOrdersCount: number;
  wonPctChange: number;
  winRate: number;
  avgSalesDays: number;
  closedValueThisMonth: number;
  closedValueThisMonthEur: number;
  closedCountThisMonth: number;
  closedPctChange: number;
  pipelineByStage: Array<{ key: StageMeta['key']; bar: string; hex: string; ring: string; value: number; count: number }>;
  lostReasons: { total: number; items: Record<'price'|'lead'|'comp'|'other', { count: number }> };
  inactiveAccounts: (accounts: CrmAccount[]) => CrmAccount[];
  bestAccounts: (accounts: CrmAccount[]) => Array<{ account: CrmAccount; value: number }>;
  latestSoldUnits: Array<{ id: string; dealer: string; closedAt: string; units: Array<{ key: string; qty: number }>; totalUnits: number }>;
}

function deriveMetrics(activities: CrmActivity[], orders: CrmOrderWithValue[], _isAdmin: boolean): DerivedMetrics {
  void _isAdmin;
  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevWindow = sameTimePrevMonth(now);

  const staged = activities.map(a => ({ a, stage: classifyStage(a) }));

  const byStage = PIPELINE_STAGES.map(meta => {
    const rows = staged.filter(s => s.stage === meta.key);
    const value = rows.reduce((sum, s) => sum + (s.a.value || 0), 0);
    return { key: meta.key, bar: meta.bar, hex: meta.hex, ring: meta.ring, value, count: rows.length };
  });

  const openStages: Array<StageMeta['key']> = ['lead','demo','quote'];
  const pipelineValue = byStage.filter(s => openStages.includes(s.key)).reduce((sum, s) => sum + s.value, 0);

  // Pipeline pct change — value created this month vs prev same window (proxy)
  const pipeThis = staged.filter(s => s.stage && openStages.includes(s.stage) && new Date(s.a.activity_date) >= monthStart)
    .reduce((sum, s) => sum + (s.a.value || 0), 0);
  const pipePrev = staged.filter(s => {
    if (!s.stage || !openStages.includes(s.stage)) return false;
    const d = new Date(s.a.activity_date);
    return d >= prevWindow.from && d <= prevWindow.to;
  }).reduce((sum, s) => sum + (s.a.value || 0), 0);
  const pipelinePctChange = pctChange(pipeThis, pipePrev);

  // Activity rows are audit/history and must not count as active leads.
  // The dashboard overrides these from the current CRM lead/demo sources.
  const activeLeads = 0;
  const leadsPctChange = 0;

  // Closed/won orders come from the SAME source as CRM → Ordrer
  // (configurations / crm_configurations_view), so any order visible there
  // is also counted here. Old "won" activities are no longer used for
  // closed-orders KPIs to avoid double counting and seller/dealer mismatches.
  const lost = staged.filter(s => s.stage === 'lost');
  const wonOrdersCount = orders.length;
  const winRate = (wonOrdersCount + lost.length) === 0
    ? 0
    : Math.round((wonOrdersCount / (wonOrdersCount + lost.length)) * 100);

  const ordersThis = orders.filter(o => new Date(o.closed_at) >= monthStart);
  const ordersPrev = orders.filter(o => {
    const d = new Date(o.closed_at);
    return d >= prevWindow.from && d <= prevWindow.to;
  });
  const wonPctChange = pctChange(ordersThis.length, ordersPrev.length);

  // Avg sales days
  const quoteDates = new Map<string, number>();
  for (const a of activities) {
    if (a.activity_type === 'quote_created' && a.configuration_id) {
      const t = new Date(a.activity_date).getTime();
      const prev = quoteDates.get(a.configuration_id);
      if (prev === undefined || t < prev) quoteDates.set(a.configuration_id, t);
    }
  }
  const cycles: number[] = [];
  for (const o of orders) {
    const start = quoteDates.get(o.id);
    if (start !== undefined) {
      const days = (new Date(o.closed_at).getTime() - start) / (1000 * 60 * 60 * 24);
      if (days >= 0 && days < 365) cycles.push(days);
    }
  }
  const avgSalesDays = cycles.length === 0 ? 0 : Math.round(cycles.reduce((s, n) => s + n, 0) / cycles.length);

  const closedValueThisMonth = ordersThis.reduce((sum, o) => sum + (o.total_value_dkk || 0), 0);
  const closedValueThisMonthEur = ordersThis
    .filter(o => o.currency === 'EUR')
    .reduce((sum, o) => sum + (o.total_value || 0), 0);
  const closedCountThisMonth = ordersThis.length;
  const closedValuePrev = ordersPrev.reduce((sum, o) => sum + (o.total_value_dkk || 0), 0);
  const closedPctChange = pctChange(closedValueThisMonth, closedValuePrev);

  const reasonCounts = { price: 0, lead: 0, comp: 0, other: 0 };
  for (const s of lost) reasonCounts[classifyLostReason(s.a)] += 1;
  const lostReasons = {
    total: lost.length,
    items: {
      price: { count: reasonCounts.price },
      lead:  { count: reasonCounts.lead },
      comp:  { count: reasonCounts.comp },
      other: { count: reasonCounts.other },
    },
  };

  // Best-performing accounts by closed-order value (orders are the source of truth).
  const bestByAccount = new Map<string, { value: number }>();
  for (const o of orders) {
    const id = o.dealer_account_id;
    if (!id) continue;
    const cur = bestByAccount.get(id) || { value: 0 };
    cur.value += o.total_value_dkk || 0;
    bestByAccount.set(id, cur);
  }

  // Latest sold units (3 most recent closed orders) — count actual machine
  // qty from configuration line items, NOT just one per order header.
  const latestSoldUnits = [...orders]
    .sort((a, b) => (b.closed_at || '').localeCompare(a.closed_at || ''))
    .slice(0, 3)
    .map(o => {
      const units = Object.entries(o.machine_qty_by_key || {})
        .map(([key, qty]) => ({ key, qty }))
        .sort((a, b) => b.qty - a.qty);
      const totalUnits = units.reduce((s, u) => s + u.qty, 0);
      return {
        id: o.id,
        dealer: o.dealer_company_name || o.dealer_name || o.title || '—',
        closedAt: o.closed_at,
        units,
        totalUnits,
      };
    })
    .filter(x => x.totalUnits > 0);

  return {
    pipelineValue, pipelinePctChange,
    activeLeads, leadsPctChange,
    wonOrdersCount, wonPctChange,
    winRate, avgSalesDays,
    closedValueThisMonth, closedValueThisMonthEur, closedCountThisMonth, closedPctChange,
    pipelineByStage: byStage,
    lostReasons,
    latestSoldUnits,
    inactiveAccounts: (accounts) => {
      const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 60;
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

// 30-day pipeline trend (cumulative pipeline value created per day)
function buildPipelineTrend(activities: CrmActivity[]): Array<{ label: string; value: number }> {
  const days = 30;
  const buckets: number[] = new Array(days).fill(0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const open = new Set(['lead','demo','quote']);
  for (const a of activities) {
    const stage = classifyStage(a);
    if (!stage || !open.has(stage)) continue;
    const d = new Date(a.activity_date); d.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0 || diff >= days) continue;
    buckets[days - 1 - diff] += a.value || 0;
  }
  // cumulative
  let acc = 0;
  return buckets.map((v, i) => {
    acc += v;
    const d = new Date(today); d.setDate(d.getDate() - (days - 1 - i));
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, value: acc };
  });
}

// Suppress unused warnings for lucide imports kept for future widgets.
void Flame; void Users; void FileText;

// ────────────────────────────────────────────────────────────
// Pipeline Fordeling — shared CRM aggregation + drilldown modal
// ────────────────────────────────────────────────────────────

interface PipelineRow {
  id: string;
  type: 'Lead' | 'Demo' | 'Tilbud' | 'Forhandling' | 'Ordre' | 'Tabt';
  number: string;       // L-1001, Q-..., O-..., D-...
  title: string;        // customer / dealer headline
  dealer: string;
  seller: string;
  value: number;
  status: string;
  date: string;         // ISO
  href: string | null;  // open link
}

function dashboardNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const normalized = value
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function leadPipelineValue(lead: CrmLead): number {
  const savedValue = dashboardNumber(lead.estimated_value);
  if (savedValue > 0) return Math.round(savedValue);

  const machineEstimate = calculateMachineInterestEstimate(lead.machine_types, 'da').total;
  return machineEstimate > 0 ? machineEstimate : 0;
}

function buildPipelineRows(args: {
  orders: CrmOrderWithValue[];
  openQuotes: ScopedConfiguration[];
  leads: CrmLead[];
  calendar: CalendarActivity[];
}): Record<StageMeta['key'], PipelineRow[]> {
  const out: Record<StageMeta['key'], PipelineRow[]> = {
    lead: [], demo: [], quote: [], neg: [], won: [], lost: [],
  };

  // Won → orders (same source as CRM → Ordrer & Lukkede ordrer)
  for (const o of args.orders) {
    out.won.push({
      id: o.id,
      type: 'Ordre',
      number: o.order_number || o.quote_number || '—',
      title: o.title || '—',
      dealer: o.dealer_company_name || o.dealer_name || '—',
      seller: o.seller_initials || o.seller_name || '—',
      value: dashboardNumber(o.total_value_dkk),
      status: o.case_status || 'ordre_afgivet',
      date: o.closed_at,
      href: '/portal/crm/orders',
    });
  }

  // Tilbud sendt → openQuotes (same source as CRM → Tilbud & Pipeline value)
  for (const q of args.openQuotes) {
    out.quote.push({
      id: q.id,
      type: 'Tilbud',
      number: q.quote_number || '—',
      title: q.title || '—',
      dealer: q.dealer_company_name || q.dealer_name || '—',
      seller: q.seller_initials || q.seller_name || '—',
      value: dashboardNumber(q.total_value_dkk),
      status: q.case_status || 'sent',
      date: q.month_iso,
      href: '/portal/crm/quotes',
    });
  }

  // CRM leads → shared lead-status helper. Open follow-up work stays in
  // Lead/Demo; there is no separate user-facing "Forhandling" bucket here.
  for (const l of args.leads) {
    const status = effectiveLeadStatus(l);
    let bucket: StageMeta['key'] | null = null;
    if (status === 'Vundet') bucket = 'won';
    else if (status === 'Tabt') bucket = 'lost';
    else if (status === 'Tilbud sendt') continue; // handled via openQuotes
    else if (status === 'Demo planlagt') bucket = 'demo';
    else bucket = 'lead';
    const row: PipelineRow = {
      id: l.id,
      type: bucket === 'won' ? 'Lead' : bucket === 'lost' ? 'Tabt' : bucket === 'demo' ? 'Demo' : 'Lead',
      number: formatLeadNo(l.lead_no),
      title: l.title || '—',
      dealer: '—',
      seller: l.owner_name || '—',
      value: leadPipelineValue(l),
      status,
      date: l.updated_at || l.created_at,
      href: `/portal/crm/leads/${l.id}`,
    };
    out[bucket].push(row);
  }

  // Demo planlagt → crm_calendar_activities (type=demo, status=planned)
  for (const c of args.calendar) {
    if (c.activity_type !== 'demo') continue;
    if (c.status && c.status !== 'planned') continue;
    out.demo.push({
      id: c.id,
      type: 'Demo',
      number: '—',
      title: c.title || '—',
      dealer: c.dealer_name || '—',
      seller: c.seller_initials || c.seller_name || '—',
      value: 0,
      status: c.status || 'planned',
      date: c.start_datetime,
      href: '/portal/crm/calendar',
    });
  }

  return out;
}

function PipelineStageModal({
  stage, onClose, rowsByStage, lang,
}: {
  stage: StageMeta['key'] | null;
  onClose: () => void;
  rowsByStage: Record<StageMeta['key'], PipelineRow[]>;
  lang: Language;
}) {
  const open = stage !== null;
  const rows = stage ? (rowsByStage[stage] || []) : [];
  const stageLabel = stage ? T[`stage_${stage}`][lang] : '';
  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{T.pipeline_dist_title[lang]} · {stageLabel}</DialogTitle>
        </DialogHeader>
        {rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">{T.no_records[lang]}</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto -mx-6 px-6">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b">
                  <th className="py-2 pr-3">{T.col_type[lang]}</th>
                  <th className="py-2 pr-3">{T.col_number[lang]}</th>
                  <th className="py-2 pr-3">{T.col_title_cust[lang]}</th>
                  <th className="py-2 pr-3">{T.col_dealer[lang]}</th>
                  <th className="py-2 pr-3">{T.col_seller[lang]}</th>
                  <th className="py-2 pr-3 text-right">{T.col_value[lang]}</th>
                  <th className="py-2 pr-3">{T.col_status[lang]}</th>
                  <th className="py-2 pr-3">{T.col_date[lang]}</th>
                  <th className="py-2 pr-3 text-right">{T.col_open[lang]}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-b-0 hover:bg-slate-50">
                    <td className="py-2 pr-3">{r.type}</td>
                    <td className="py-2 pr-3 font-medium">{r.number}</td>
                    <td className="py-2 pr-3 max-w-[18rem] truncate" title={r.title}>{r.title}</td>
                    <td className="py-2 pr-3 max-w-[14rem] truncate" title={r.dealer}>{r.dealer}</td>
                    <td className="py-2 pr-3">{r.seller}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.value > 0 ? `${Math.round(r.value).toLocaleString('da-DK')} kr.` : '—'}</td>
                    <td className="py-2 pr-3">{r.status}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatDate(r.date)}</td>
                    <td className="py-2 pr-3 text-right">
                      {r.href ? (
                        <Link to={r.href} className="inline-flex items-center gap-1 text-[#2d5a27] hover:underline" onClick={onClose}>
                          {T.col_open[lang]} <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={5} className="py-2 pr-3 text-right text-xs text-slate-500">{T.total[lang]}</td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums">
                    {Math.round(total).toLocaleString('da-DK')} kr.
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// (Preview/mock dashboard data removed during demo cleanup — empty states
// are rendered by the existing checks above.)

