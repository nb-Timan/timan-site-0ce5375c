import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin } from '@/lib/crmScope';
import { resolveSellerId } from '@/lib/resolveSellerId';
import {
  listLeads, listDemoLeads, resolveSeedOwners, updateLead, getLead,
  CrmLead, CrmDemoLead,
  formatLeadNo, formatDemoNo,
  LOST_COMPETITOR_OPTIONS, LOST_REASON_OPTIONS,
} from '@/lib/crmLeadsService';
import {
  effectiveLeadStatus,
  LEAD_DISPLAY_STATUSES,
  type LeadDisplayStatus,
  NEXT_ACTIVITY_WON,
  NEXT_ACTIVITY_LOST,
  deriveLegacyPipelineStage,
} from '@/lib/leadStatus';
import { Plus, Search, Sparkles, TrendingUp, ChevronRight, XCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// ---- i18n. English fallback. ----
type TKey =
  | 'page_title' | 'sub_admin' | 'sub_seller' | 'pcs'
  | 'unassigned' | 'new_demo' | 'new_lead'
  | 'tab_all' | 'tab_open' | 'tab_demo' | 'tab_mine' | 'tab_mine_demo'
  | 'search_ph' | 'all_status' | 'loading' | 'empty_title' | 'empty_sub'
  | 'col_type' | 'col_title' | 'col_dealer' | 'col_owner' | 'col_machine'
  | 'col_equipment' | 'col_date' | 'col_followup' | 'col_status' | 'col_action'
  | 'open_lbl' | 'demo_lbl' | 'unassigned_chip' | 'open_link'
  | 'close_btn' | 'close_title' | 'close_sub' | 'won_label' | 'lost_label'
  | 'lost_analysis_title' | 'lost_to' | 'lost_other' | 'lost_reason' | 'lost_comment'
  | 'save' | 'cancel' | 'pick' | 'closed_ok' | 'close_err' | 'verify_err'
  | 'st_Lead' | 'st_Demo' | 'st_Tilbud' | 'st_Followup' | 'st_Vundet' | 'st_Tabt';

const T: Record<TKey, Record<Language, string>> = {
  page_title:    { da: 'Leads', en: 'Leads', de: 'Leads', it: 'Lead', hu: 'Leadek' },
  sub_admin:     { da: 'Alle leads og demoer i organisationen', en: 'All leads and demos in the organisation', de: 'Alle Leads und Demos in der Organisation', it: 'Tutti i lead e demo dell\'organizzazione', hu: 'Az összes lead és demo a szervezetben' },
  sub_seller:    { da: 'Dine tildelte leads og demoer', en: 'Your assigned leads and demos', de: 'Deine zugewiesenen Leads und Demos', it: 'I tuoi lead e demo assegnati', hu: 'A neked rendelt leadek és demók' },
  pcs:           { da: 'stk', en: 'pcs', de: 'Stk', it: 'pz', hu: 'db' },
  unassigned:    { da: 'utildelt', en: 'unassigned', de: 'nicht zugewiesen', it: 'non assegnati', hu: 'kiosztatlan' },
  new_demo:      { da: 'Ny demo-registrering', en: 'New demo registration', de: 'Neue Demo-Registrierung', it: 'Nuova registrazione demo', hu: 'Új demo regisztráció' },
  new_lead:      { da: 'Nyt lead', en: 'New lead', de: 'Neuer Lead', it: 'Nuovo lead', hu: 'Új lead' },
  tab_all:       { da: 'Alle leads', en: 'All leads', de: 'Alle Leads', it: 'Tutti i lead', hu: 'Összes lead' },
  tab_open:      { da: 'Åbne leads', en: 'Open leads', de: 'Offene Leads', it: 'Lead aperti', hu: 'Nyitott leadek' },
  tab_demo:      { da: 'Demo leads', en: 'Demo leads', de: 'Demo-Leads', it: 'Demo lead', hu: 'Demo leadek' },
  tab_mine:      { da: 'Mine leads', en: 'My leads', de: 'Meine Leads', it: 'I miei lead', hu: 'Saját leadek' },
  tab_mine_demo: { da: 'Mine demoer', en: 'My demos', de: 'Meine Demos', it: 'Le mie demo', hu: 'Saját demók' },
  search_ph:     { da: 'Søg titel, kunde, forhandler, sælger eller maskine…', en: 'Search title, customer, dealer, seller or machine…', de: 'Titel, Kunde, Händler, Verkäufer oder Maschine suchen…', it: 'Cerca titolo, cliente, rivenditore, venditore o macchina…', hu: 'Keresés: cím, ügyfél, kereskedő, értékesítő vagy gép…' },
  all_status:    { da: 'Alle statusser', en: 'All statuses', de: 'Alle Status', it: 'Tutti gli stati', hu: 'Összes státusz' },
  loading:       { da: 'Indlæser…', en: 'Loading…', de: 'Lädt…', it: 'Caricamento…', hu: 'Betöltés…' },
  empty_title:   { da: 'Ingen leads i dette filter', en: 'No leads in this filter', de: 'Keine Leads in diesem Filter', it: 'Nessun lead in questo filtro', hu: 'Nincs lead ebben a szűrőben' },
  empty_sub:     { da: 'Skift fane eller opret et nyt lead.', en: 'Switch tab or create a new lead.', de: 'Tab wechseln oder neuen Lead erstellen.', it: 'Cambia scheda o crea un nuovo lead.', hu: 'Váltson fület vagy hozzon létre új leadet.' },
  col_type:      { da: 'Type', en: 'Type', de: 'Typ', it: 'Tipo', hu: 'Típus' },
  col_title:     { da: 'Titel / Kunde', en: 'Title / Customer', de: 'Titel / Kunde', it: 'Titolo / Cliente', hu: 'Cím / Ügyfél' },
  col_dealer:    { da: 'Forhandler', en: 'Dealer', de: 'Händler', it: 'Rivenditore', hu: 'Kereskedő' },
  col_owner:     { da: 'Ejer', en: 'Owner', de: 'Eigentümer', it: 'Proprietario', hu: 'Tulajdonos' },
  col_machine:   { da: 'Maskine', en: 'Machine', de: 'Maschine', it: 'Macchina', hu: 'Gép' },
  col_equipment: { da: 'Udstyr', en: 'Equipment', de: 'Zubehör', it: 'Attrezzatura', hu: 'Felszerelés' },
  col_date:      { da: 'Dato', en: 'Date', de: 'Datum', it: 'Data', hu: 'Dátum' },
  col_followup:  { da: 'Næste opf.', en: 'Next f/u', de: 'Nächste NV', it: 'Prossimo f/u', hu: 'Köv. utánk.' },
  col_status:    { da: 'Status', en: 'Status', de: 'Status', it: 'Stato', hu: 'Státusz' },
  col_action:    { da: 'Handling', en: 'Action', de: 'Aktion', it: 'Azione', hu: 'Művelet' },
  open_lbl:      { da: 'Åben', en: 'Open', de: 'Offen', it: 'Aperto', hu: 'Nyitott' },
  demo_lbl:      { da: 'Demo', en: 'Demo', de: 'Demo', it: 'Demo', hu: 'Demo' },
  unassigned_chip:{ da: 'Utildelt', en: 'Unassigned', de: 'Nicht zugewiesen', it: 'Non assegnato', hu: 'Kiosztatlan' },
  open_link:     { da: 'Åbn', en: 'Open', de: 'Öffnen', it: 'Apri', hu: 'Megnyitás' },
  close_btn:     { da: 'Luk', en: 'Close', de: 'Schließen', it: 'Chiudi', hu: 'Lezárás' },
  close_title:   { da: 'Luk lead', en: 'Close lead', de: 'Lead schließen', it: 'Chiudi lead', hu: 'Lead lezárása' },
  close_sub:     { da: 'Markér leadet som vundet eller tabt.', en: 'Mark the lead as won or lost.', de: 'Lead als gewonnen oder verloren markieren.', it: 'Segna il lead come vinto o perso.', hu: 'Jelölje a leadet nyertesnek vagy elveszettnek.' },
  won_label:     { da: 'Ordre vundet', en: 'Order won', de: 'Auftrag gewonnen', it: 'Ordine vinto', hu: 'Megrendelés nyertes' },
  lost_label:    { da: 'Ordre tabt', en: 'Order lost', de: 'Auftrag verloren', it: 'Ordine perso', hu: 'Megrendelés elveszett' },
  lost_analysis_title: { da: 'Lost Deal Analysis', en: 'Lost Deal Analysis', de: 'Lost-Deal-Analyse', it: 'Analisi affare perso', hu: 'Elveszített üzlet elemzése' },
  lost_to:       { da: 'Tabt til konkurrent', en: 'Lost to competitor', de: 'An Wettbewerber verloren', it: 'Perso a concorrente', hu: 'Versenytársnak veszítve' },
  lost_other:    { da: 'Anden konkurrent', en: 'Other competitor', de: 'Anderer Wettbewerber', it: 'Altro concorrente', hu: 'Más versenytárs' },
  lost_reason:   { da: 'Hvorfor mistede vi ordren', en: 'Why we lost the order', de: 'Warum verloren', it: 'Perché abbiamo perso', hu: 'Miért vesztettük el' },
  lost_comment:  { da: 'Kommentar', en: 'Comment', de: 'Kommentar', it: 'Commento', hu: 'Megjegyzés' },
  save:          { da: 'Gem', en: 'Save', de: 'Speichern', it: 'Salva', hu: 'Mentés' },
  cancel:        { da: 'Annuller', en: 'Cancel', de: 'Abbrechen', it: 'Annulla', hu: 'Mégse' },
  pick:          { da: 'Vælg…', en: 'Select…', de: 'Wählen…', it: 'Seleziona…', hu: 'Válasszon…' },
  closed_ok:     { da: 'Leadet er lukket.', en: 'Lead closed.', de: 'Lead geschlossen.', it: 'Lead chiuso.', hu: 'Lead lezárva.' },
  close_err:     { da: 'Kunne ikke lukke leadet.', en: 'Could not close lead.', de: 'Lead konnte nicht geschlossen werden.', it: 'Impossibile chiudere il lead.', hu: 'Nem sikerült lezárni a leadet.' },
  verify_err:    { da: 'Lukning kunne ikke bekræftes.', en: 'Could not verify close.', de: 'Schließen konnte nicht bestätigt werden.', it: 'Impossibile verificare la chiusura.', hu: 'A lezárás nem erősíthető meg.' },
  st_Lead:       { da: 'Lead', en: 'Lead', de: 'Lead', it: 'Lead', hu: 'Lead' },
  st_Demo:       { da: 'Demo planlagt', en: 'Demo planned', de: 'Demo geplant', it: 'Demo pianificata', hu: 'Demo tervezve' },
  st_Tilbud:     { da: 'Tilbud sendt', en: 'Offer sent', de: 'Angebot gesendet', it: 'Offerta inviata', hu: 'Ajánlat elküldve' },
  st_Followup:   { da: 'Follow-up', en: 'Follow-up', de: 'Follow-up', it: 'Follow-up', hu: 'Utánkövetés' },
  st_Vundet:     { da: 'Vundet', en: 'Won', de: 'Gewonnen', it: 'Vinto', hu: 'Nyertes' },
  st_Tabt:       { da: 'Tabt', en: 'Lost', de: 'Verloren', it: 'Perso', hu: 'Elveszett' },
};
function tt(k: TKey, lang: Language): string { return T[k][lang] || T[k].en; }

// ---------- Unified row ----------
type LeadType = 'open' | 'demo';
interface UnifiedLead {
  id: string;
  /** Human-readable number, e.g. "L-1000" or "D-8000". */
  display_no: string;
  type: LeadType;
  title: string;
  customer: string | null;
  dealer: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  responsible_name: string | null;
  machine: string | null;
  equipment: string | null;
  date: string | null;
  next_followup: string | null;
  status: string | null;
  value: number | null;
  detail_href: string | null;
}

const STAGE_CLR: Record<string, string> = {
  Lead:        'bg-sky-50 text-sky-700 border-sky-200',
  Qualified:   'bg-violet-50 text-violet-700 border-violet-200',
  'Offer sent':'bg-amber-50 text-amber-800 border-amber-200',
  Negotiation: 'bg-orange-50 text-orange-700 border-orange-200',
  Won:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  Lost:        'bg-rose-50 text-rose-700 border-rose-200',
  'Hot lead':  'bg-rose-50 text-rose-700 border-rose-200',
  'Warm lead': 'bg-amber-50 text-amber-800 border-amber-200',
  'Cold lead': 'bg-sky-50 text-sky-700 border-sky-200',
  'Offer requested': 'bg-violet-50 text-violet-700 border-violet-200',
  'No fit':    'bg-gray-100 text-gray-700 border-gray-200',
};

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null | undefined, lang: Language): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const localeMap: Record<Language, string> = { da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU' };
  return d.toLocaleDateString(localeMap[lang] || 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mapOpen(l: CrmLead): UnifiedLead {
  return {
    id: l.id,
    display_no: formatLeadNo(l.lead_no),
    type: 'open',
    title: l.title,
    customer: l.contact_information || null,
    dealer: l.linked_dealer_id || null,
    owner_user_id: l.owner_user_id,
    owner_name: l.owner_name,
    owner_email: l.owner_email || null,
    responsible_name: l.owner_name,
    machine: (l.machine_types || []).join(', ') || null,
    equipment: null,
    date: l.first_contact_date || l.created_at,
    next_followup: l.next_followup_date,
    status: l.pipeline_stage,
    value: l.estimated_value,
    detail_href: `/portal/crm/leads/${l.id}`,
  };
}

function mapDemo(d: CrmDemoLead): UnifiedLead {
  return {
    id: d.id,
    display_no: formatDemoNo(d.demo_no),
    type: 'demo',
    title: d.title,
    customer: d.customer_name,
    dealer: d.dealer_company,
    owner_user_id: d.owner_user_id,
    owner_name: d.owner_name,
    owner_email: d.owner_email || null,
    responsible_name: d.owner_name,
    machine: d.demo_machine,
    equipment: (d.demo_equipment || []).join(', ') || null,
    date: d.demo_date || d.created_at,
    next_followup: d.followup_date,
    status: d.result_status,
    value: d.estimated_value,
    detail_href: `/portal/crm/demo-leads/${d.id}`,
  };
}

type TabKey = 'all' | 'open' | 'demo' | 'mine' | 'mine_demo';

export default function CrmLeadsPage() {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const navigate = useNavigate();
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'all',       label: tt('tab_all', lang) },
    { key: 'open',      label: tt('tab_open', lang) },
    { key: 'demo',      label: tt('tab_demo', lang) },
    { key: 'mine',      label: tt('tab_mine', lang) },
    { key: 'mine_demo', label: tt('tab_mine_demo', lang) },
  ];

  const [openLeads, setOpenLeads] = useState<CrmLead[]>([]);
  const [demoLeads, setDemoLeads] = useState<CrmDemoLead[]>([]);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<TabKey>(isAdmin ? 'all' : 'mine');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<string>('');

  useEffect(() => { setTab(isAdmin ? 'all' : 'mine'); }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sid = await resolveSellerId(appUser?.email);
      const [openAll, demoAll] = await Promise.all([
        listLeads({}),
        listDemoLeads({}),
      ]);
      const [openResolved, demoResolved] = await Promise.all([
        resolveSeedOwners(openAll),
        resolveSeedOwners(demoAll),
      ]);
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.log('[CRM Leads] counts', {
        crm_open_leads: openResolved.length,
        crm_demo_leads: demoResolved.length,
        sellerId: sid,
        email: appUser?.email,
      });
      setSellerId(sid);
      setOpenLeads(openResolved);
      setDemoLeads(demoResolved);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email]);

  const allRows: UnifiedLead[] = useMemo(() => {
    const open = openLeads.map(mapOpen);
    const demo = demoLeads.map(mapDemo);
    let merged = [...open, ...demo];
    if (!isAdmin) {
      const myEmail = (appUser?.email || '').toLowerCase();
      merged = merged.filter(r =>
        (sellerId && r.owner_user_id === sellerId) ||
        (myEmail && r.owner_email && r.owner_email.toLowerCase() === myEmail) ||
        (myEmail && (r.responsible_name || '').toLowerCase() === myEmail)
      );
    }
    merged.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return merged;
  }, [openLeads, demoLeads, isAdmin, sellerId, appUser?.email]);

  const counts = useMemo(() => ({
    all:       allRows.length,
    open:      allRows.filter(r => r.type === 'open').length,
    demo:      allRows.filter(r => r.type === 'demo').length,
    mine:      allRows.filter(r => r.type === 'open' && (
                  (sellerId && r.owner_user_id === sellerId) ||
                  (!!appUser?.email && (r.owner_email || '').toLowerCase() === appUser.email.toLowerCase())
                )).length,
    mine_demo: allRows.filter(r => r.type === 'demo' && (
                  (sellerId && r.owner_user_id === sellerId) ||
                  (!!appUser?.email && (r.owner_email || '').toLowerCase() === appUser.email.toLowerCase())
                )).length,
  }), [allRows, sellerId, appUser?.email]);

  const visible = useMemo(() => {
    let r = allRows;
    if (tab === 'open') r = r.filter(x => x.type === 'open');
    else if (tab === 'demo') r = r.filter(x => x.type === 'demo');
    else if (tab === 'mine') r = r.filter(x =>
      x.type === 'open' && (
        (sellerId && x.owner_user_id === sellerId) ||
        (!!appUser?.email && (x.owner_email || '').toLowerCase() === appUser.email.toLowerCase())
      ));
    else if (tab === 'mine_demo') r = r.filter(x =>
      x.type === 'demo' && (
        (sellerId && x.owner_user_id === sellerId) ||
        (!!appUser?.email && (x.owner_email || '').toLowerCase() === appUser.email.toLowerCase())
      ));

    if (stage) r = r.filter(x => x.status === stage);
    if (q.trim()) {
      const s = q.toLowerCase();
      r = r.filter(x =>
        (x.title || '').toLowerCase().includes(s) ||
        (x.customer || '').toLowerCase().includes(s) ||
        (x.dealer || '').toLowerCase().includes(s) ||
        (x.owner_name || '').toLowerCase().includes(s) ||
        (x.machine || '').toLowerCase().includes(s)
      );
    }
    return r;
  }, [allRows, tab, stage, q, sellerId, appUser?.email]);

  const totalValue = useMemo(() => visible.reduce((s, x) => s + (x.value || 0), 0), [visible]);
  const unassignedCount = useMemo(
    () => allRows.filter(x => !x.owner_user_id).length,
    [allRows]
  );

  return (
    <CrmLayout pageTitle={tt('page_title', lang)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#2d5a27]" /> {tt('page_title', lang)}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isAdmin ? tt('sub_admin', lang) : tt('sub_seller', lang)}
            {' · '}{visible.length} {tt('pcs', lang)}{totalValue > 0 ? ` · ${formatKr(totalValue)}` : ''}
            {isAdmin && unassignedCount > 0 && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-amber-50 text-amber-800 border border-amber-200">
                {unassignedCount} {tt('unassigned', lang)}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/portal/crm/demo-leads/new"
            className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-gray-50 text-[#2d5a27] border border-[#2d5a27]/30 hover:border-[#2d5a27] text-sm font-medium px-4 py-2.5 shadow-sm transition">
            <Plus className="h-4 w-4" /> {tt('new_demo', lang)}
          </Link>
          <Link to="/portal/crm/leads/new"
            className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] hover:bg-[#234820] text-white text-sm font-medium px-4 py-2.5 shadow-sm transition">
            <Plus className="h-4 w-4" /> {tt('new_lead', lang)}
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map(t => {
          const active = tab === t.key;
          const c = counts[t.key];
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-2 text-sm px-3.5 py-2 rounded-xl border transition',
                active
                  ? 'bg-[#2d5a27] border-[#2d5a27] text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              )}>
              {t.label}
              <span className={cn(
                'inline-flex min-w-[20px] justify-center items-center text-[11px] px-1.5 py-0.5 rounded-md tabular-nums',
                active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              )}>{c}</span>
            </button>
          );
        })}
      </div>

      {/* Filter strip */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 mb-5 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder={tt('search_ph', lang)}
            className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-[#2d5a27] focus:ring-2 focus:ring-[#2d5a27]/10 outline-none" />
        </div>
        <select value={stage} onChange={e=>setStage(e.target.value)}
          className="rounded-xl border border-gray-200 text-sm px-3 py-2.5 bg-white">
          <option value="">{tt('all_status', lang)}</option>
          {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          <option disabled>──────────</option>
          {['Hot lead','Warm lead','Cold lead','Offer requested','No fit'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-8 text-sm text-gray-500">{tt('loading', lang)}</p>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
              <TrendingUp className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-900">{tt('empty_title', lang)}</p>
            <p className="text-xs text-gray-500 mt-1">{tt('empty_sub', lang)}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/70 text-[11px] uppercase tracking-[0.06em] text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3">{tt('col_type', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_title', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_dealer', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_owner', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_machine', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_equipment', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_date', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_followup', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_status', lang)}</th>
                  <th className="text-right px-4 py-3">{tt('col_action', lang)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(r => {
                  const clickable = !!r.detail_href;
                  return (
                    <tr key={`${r.type}-${r.id}`}
                      onClick={() => { if (r.detail_href) navigate(r.detail_href); }}
                      className={cn('transition-colors', clickable ? 'cursor-pointer hover:bg-gray-50/60' : 'hover:bg-gray-50/40')}>
                      <td className="px-4 py-3.5">
                        <span className={cn('inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border',
                          r.type === 'demo'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200')}>
                          {r.type === 'demo' ? tt('demo_lbl', lang) : tt('open_lbl', lang)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-[11px] tabular-nums text-slate-500 shrink-0">{r.display_no}</span>
                          <span className="font-medium text-gray-900 truncate max-w-[260px]">{r.title}</span>
                        </div>
                        {r.customer && r.customer !== r.title && (
                          <div className="text-xs text-gray-500 truncate max-w-[260px]">{r.customer}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 max-w-[180px] truncate">{r.dealer || '—'}</td>
                      <td className="px-4 py-3.5">
                        {r.owner_name ? (
                          <span className="text-gray-700">{r.owner_name}</span>
                        ) : (
                          <span className="inline-flex text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            {tt('unassigned_chip', lang)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600 max-w-[160px] truncate">{r.machine || '—'}</td>
                      <td className="px-4 py-3.5 text-gray-600 max-w-[180px] truncate">{r.equipment || '—'}</td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{fmtDate(r.date, lang)}</td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{fmtDate(r.next_followup, lang)}</td>
                      <td className="px-4 py-3.5">
                        {r.status ? (
                          <span className={cn('inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border',
                            STAGE_CLR[r.status] || 'bg-gray-100 text-gray-700 border-gray-200')}>
                            {r.status}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {r.detail_href ? (
                          <Link to={r.detail_href} onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[12px] text-[#2d5a27] hover:underline">
                            {tt('open_link', lang)} <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          <span className="text-[12px] text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
