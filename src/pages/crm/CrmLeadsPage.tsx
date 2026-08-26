import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import CrmLayout from '@/components/crm/CrmLayout';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { Language } from '@/types/configurator';
import { derivePortalRole } from '@/lib/portalAccess';
import { isCrmAdmin } from '@/lib/crmScope';
import { getActiveSellerView } from '@/lib/activeMode';
import { resolveSellerId } from '@/lib/resolveSellerId';
import {
  listLeads, listDemoLeads, resolveSeedOwners, updateLead, getLead, deleteLead, deleteDemoLead,
  CrmLead, CrmDemoLead, type CrmLeadAttachment, type CrmLeadAttachmentPreview,
  formatLeadNo, formatDemoNo,
  LOST_COMPETITOR_OPTIONS, LOST_REASON_OPTIONS,
  getLeadAttachmentSignedUrls, getLeadImageAttachments,
} from '@/lib/crmLeadsService';
import {
  effectiveLeadStatus,
  effectiveLeadProbability,
  LEAD_DISPLAY_STATUSES,
  type LeadDisplayStatus,
  NEXT_ACTIVITY_WON,
  NEXT_ACTIVITY_LOST,
  deriveLegacyPipelineStage,
} from '@/lib/leadStatus';
import { ArrowDownAZ, Plus, Search, Sparkles, TrendingUp, ChevronRight, XCircle, CheckCircle2, AlertTriangle, Trash2, FileText, Image as ImageIcon, X, DatabaseZap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchDealerAccounts } from '@/lib/dealerAccountsService';
import { listScopedConfigurations } from '@/lib/crmRelationsService';
import { listSharedLeadIdsForUser } from '@/lib/crmLeadSharingService';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

// ---- i18n. English fallback. ----
type TKey =
  | 'page_title' | 'sub_admin' | 'sub_seller' | 'pcs'
  | 'unassigned' | 'new_demo' | 'new_lead'
  | 'tab_all' | 'tab_open' | 'tab_demo' | 'tab_mine' | 'tab_mine_demo'
  | 'search_ph' | 'all_status' | 'loading' | 'empty_title' | 'empty_sub'
  | 'col_type' | 'col_title' | 'col_dealer' | 'col_owner' | 'col_machine'
  | 'col_date' | 'col_followup' | 'col_status' | 'col_action'
  | 'open_lbl' | 'demo_lbl' | 'unassigned_chip' | 'open_link'
  | 'close_btn' | 'close_title' | 'close_sub' | 'won_label' | 'lost_label'
  | 'lost_analysis_title' | 'lost_to' | 'lost_other' | 'lost_reason' | 'lost_comment'
  | 'save' | 'cancel' | 'pick' | 'closed_ok' | 'close_err' | 'verify_err'
  | 'convert_to_demo' | 'convert_to_quote' | 'go_to_quote'
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
  convert_to_demo:{ da: 'Konverter til demo', en: 'Convert to demo', de: 'In Demo umwandeln', it: 'Converti in demo', hu: 'Konvertálás demóvá' },
  convert_to_quote:{ da: 'Konverter til tilbud', en: 'Convert to quote', de: 'In Angebot umwandeln', it: 'Converti in offerta', hu: 'Konvertálás ajánlattá' },
  go_to_quote:    { da: 'Gå til tilbud', en: 'Go to quote', de: 'Zum Angebot', it: 'Vai all\'offerta', hu: 'Ugrás az ajánlathoz' },
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
  probability: number | null;
  value: number | null;
  detail_href: string | null;
  attachments?: CrmLeadAttachment[];
  has_demo?: boolean;
  quote_id?: string | null;
  /** Phase 40 — true when the lead was created via the configurator's
   *  "Save as lead" shortcut and still needs completion in CRM. */
  incomplete?: boolean;
  shared?: boolean;
}

const STAGE_CLR: Record<string, string> = {
  // New canonical lead-status buckets (effectiveLeadStatus output).
  Lead:           'bg-sky-50 text-sky-700 border-sky-200',
  'Demo planlagt':'bg-violet-50 text-violet-700 border-violet-200',
  'Tilbud sendt': 'bg-amber-50 text-amber-800 border-amber-200',
  'Follow-up':    'bg-orange-50 text-orange-700 border-orange-200',
  Vundet:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  Tabt:           'bg-rose-50 text-rose-700 border-rose-200',
  // Legacy pipeline_stage labels (still rendered for demos / legacy strings).
  Qualified:      'bg-violet-50 text-violet-700 border-violet-200',
  'Offer sent':   'bg-amber-50 text-amber-800 border-amber-200',
  Negotiation:    'bg-orange-50 text-orange-700 border-orange-200',
  Won:            'bg-emerald-50 text-emerald-700 border-emerald-200',
  Lost:           'bg-rose-50 text-rose-700 border-rose-200',
  // Demo result statuses.
  'Hot lead':     'bg-rose-50 text-rose-700 border-rose-200',
  'Warm lead':    'bg-amber-50 text-amber-800 border-amber-200',
  'Cold lead':    'bg-sky-50 text-sky-700 border-sky-200',
  'Offer requested': 'bg-violet-50 text-violet-700 border-violet-200',
  'No fit':       'bg-gray-100 text-gray-700 border-gray-200',
};

const ST_TKEY: Record<LeadDisplayStatus, TKey> = {
  Lead: 'st_Lead',
  'Demo planlagt': 'st_Demo',
  'Tilbud sendt': 'st_Tilbud',
  'Follow-up': 'st_Followup',
  Vundet: 'st_Vundet',
  Tabt: 'st_Tabt',
};
function localizeStatus(s: string | null | undefined, lang: Language): string {
  if (!s) return '—';
  const k = ST_TKEY[s as LeadDisplayStatus];
  return k ? tt(k, lang) : s;
}

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

function looksLikeUuid(value: string | null | undefined): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapOpen(l: CrmLead, dealerNameById: Map<string, string>): UnifiedLead {
  const linkedDealer = l.linked_dealer_id || null;
  const dealer = linkedDealer && looksLikeUuid(linkedDealer)
    ? dealerNameById.get(linkedDealer) || null
    : linkedDealer;
  return {
    id: l.id,
    display_no: formatLeadNo(l.lead_no),
    type: 'open',
    title: l.title,
    customer: l.contact_information || null,
    dealer,
    owner_user_id: l.owner_user_id,
    owner_name: l.owner_name,
    owner_email: l.owner_email || null,
    responsible_name: l.owner_name,
    machine: (l.machine_types || []).join(', ') || null,
    equipment: null,
    date: l.first_contact_date || l.created_at,
    next_followup: l.next_followup_date,
    status: effectiveLeadStatus(l),
    probability: effectiveLeadProbability(l),
    value: l.estimated_value,
    detail_href: `/portal/crm/leads/${l.id}`,
    attachments: l.attachments || [],
    has_demo: l.demo_has_run === 'yes',
    incomplete: l.incomplete_from_configurator === true,
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
    probability: null,
    value: d.estimated_value,
    detail_href: `/portal/crm/demo-leads/${d.id}`,
    attachments: d.attachments || [],
  };
}

type TabKey = 'open' | 'open_demo' | 'won' | 'closed' | 'all';
type SortKey = 'default' | 'title_asc' | 'title_desc' | 'date_desc' | 'date_asc' | 'prob_desc' | 'prob_asc';

function isWonRow(row: UnifiedLead): boolean {
  return row.status === 'Vundet' || row.status === 'Won';
}

function isClosedRow(row: UnifiedLead): boolean {
  return row.status === 'Tabt' || row.status === 'Lost' || row.status === 'No fit';
}

function isOpenRow(row: UnifiedLead): boolean {
  return !isWonRow(row) && !isClosedRow(row);
}

function isDemoLikeRow(row: UnifiedLead): boolean {
  return row.type === 'demo' || row.has_demo === true || row.status === 'Demo planlagt';
}

function compareRows(a: UnifiedLead, b: UnifiedLead, sort: SortKey): number {
  if (sort === 'title_asc') return (a.title || '').localeCompare(b.title || '', 'da');
  if (sort === 'title_desc') return (b.title || '').localeCompare(a.title || '', 'da');
  if (sort === 'date_desc') return (b.date || '').localeCompare(a.date || '');
  if (sort === 'date_asc') return (a.date || '').localeCompare(b.date || '');
  if (sort === 'prob_desc') return (b.probability ?? -1) - (a.probability ?? -1);
  if (sort === 'prob_asc') return (a.probability ?? 999) - (b.probability ?? 999);
  const aLegacy = /^G-/.test(a.display_no || '');
  const bLegacy = /^G-/.test(b.display_no || '');
  if (aLegacy !== bLegacy) return aLegacy ? 1 : -1;
  return (b.date || '').localeCompare(a.date || '');
}

export default function CrmLeadsPage() {
  const { appUser } = useAppUser();
  const { language: lang } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const dealerParam = searchParams.get('dealer') || '';
  const portalRole = derivePortalRole(appUser);
  const isAdmin = isCrmAdmin(portalRole);
  const canDelete = portalRole === 'timan_backend' && !getActiveSellerView(appUser?.email);

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'open',      label: 'Åbne leads' },
    { key: 'open_demo', label: 'Åbne demo leads' },
    { key: 'won',       label: 'Vundet leads' },
    { key: 'closed',    label: 'Lukkede leads' },
    { key: 'all',       label: 'Alle leads' },
  ];

  const [openLeads, setOpenLeads] = useState<CrmLead[]>([]);
  const [demoLeads, setDemoLeads] = useState<CrmDemoLead[]>([]);
  const [quoteIdByLeadId, setQuoteIdByLeadId] = useState<Map<string, string>>(() => new Map());
  const [dealerNameById, setDealerNameById] = useState<Map<string, string>>(() => new Map());
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [sharedLeadIds, setSharedLeadIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<TabKey>(dealerParam ? 'all' : 'open');
  const [q, setQ] = useState(dealerParam);
  const [stage, setStage] = useState<string>('');
  const [sort, setSort] = useState<SortKey>('default');
  const [closeTarget, setCloseTarget] = useState<CrmLead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnifiedLead | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [quoteConvertBusyId, setQuoteConvertBusyId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ title: string; images: CrmLeadAttachmentPreview[] } | null>(null);

  useEffect(() => { if (dealerParam) { setQ(dealerParam); setTab('all'); } }, [dealerParam]);

  const refreshLeads = async () => {
    const openAll = await listLeads({ limit: 5000 });
    const openResolved = await resolveSeedOwners(openAll);
    setOpenLeads(openResolved);
  };

  async function handleConvertToQuote(leadId: string) {
    const lead = openLeads.find(l => l.id === leadId);
    if (!lead || quoteConvertBusyId) return;
    setQuoteConvertBusyId(leadId);
    try {
      const nextActivity = 'Offer sent to the customer';
      await updateLead(leadId, {
        next_activity: nextActivity,
        probability: 70,
        pipeline_stage: deriveLegacyPipelineStage(nextActivity),
      });
      navigate(`/configurator?fromLeadQuote=${encodeURIComponent(leadId)}`);
    } catch (e) {
      console.error(e);
      toast.error(lang === 'da' ? 'Kunne ikke konvertere leadet til tilbud' : 'Could not convert lead to quote');
      setQuoteConvertBusyId(null);
    }
  }

  useEffect(() => { if (!dealerParam) setTab('open'); }, [dealerParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchDealerAccounts({ includeDeleted: true });
      if (cancelled) return;
      setDealerNameById(new Map(res.rows.map((d) => [d.id, d.company_name || d.account_number])));
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const sid = await resolveSellerId(appUser?.email);
      const [openAll, demoAll, quoteResult, nextSharedLeadIds] = await Promise.all([
        listLeads({ limit: 5000 }),
        listDemoLeads({ limit: 5000 }),
        listScopedConfigurations({ role: portalRole, sellerId: sid, documentType: 'quote' }),
        listSharedLeadIdsForUser(sid),
      ]);
      const [openResolved, demoResolved] = await Promise.all([
        resolveSeedOwners(openAll),
        resolveSeedOwners(demoAll),
      ]);
      if (cancelled) return;
      const nextQuoteIdByLeadId = new Map<string, { id: string; date: string }>();
      for (const quote of quoteResult.rows) {
        if (!quote.lead_id) continue;
        const date = quote.quote_sent_at || quote.last_saved_at || quote.created_at || '';
        const existing = nextQuoteIdByLeadId.get(quote.lead_id);
        if (!existing || date.localeCompare(existing.date) > 0) {
          nextQuoteIdByLeadId.set(quote.lead_id, { id: quote.id, date });
        }
      }
      if (quoteResult.error) {
        console.warn('[CRM Leads] quote lookup failed:', quoteResult.error);
      }
      // eslint-disable-next-line no-console
      console.log('[CRM Leads] counts', {
        crm_open_leads: openResolved.length,
        crm_demo_leads: demoResolved.length,
        shared_open_leads: nextSharedLeadIds.size,
        sellerId: sid,
        email: appUser?.email,
      });
      setSellerId(sid);
      setSharedLeadIds(nextSharedLeadIds);
      setOpenLeads(openResolved);
      setDemoLeads(demoResolved);
      setQuoteIdByLeadId(new Map(Array.from(nextQuoteIdByLeadId, ([leadId, quote]) => [leadId, quote.id])));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [appUser?.email]);

  const allRows: UnifiedLead[] = useMemo(() => {
    const demoSourceLeadIds = new Set(demoLeads.map((demo) => demo.source_lead_id).filter(Boolean) as string[]);
    const open = openLeads.map((lead) => {
      const row = mapOpen(lead, dealerNameById);
      row.has_demo = Boolean(row.has_demo || lead.converted_demo_lead_id || demoSourceLeadIds.has(lead.id));
      row.quote_id = quoteIdByLeadId.get(lead.id) || null;
      row.shared = sharedLeadIds.has(lead.id);
      return row;
    });
    const demo = demoLeads.map(mapDemo);
    let merged = [...open, ...demo];
    if (!isAdmin) {
      const myEmail = (appUser?.email || '').toLowerCase();
      merged = merged.filter(r =>
        (sellerId && r.owner_user_id === sellerId) ||
        (r.type === 'open' && sharedLeadIds.has(r.id)) ||
        (myEmail && r.owner_email && r.owner_email.toLowerCase() === myEmail) ||
        (myEmail && (r.responsible_name || '').toLowerCase() === myEmail)
      );
    }
    merged.sort((a, b) => compareRows(a, b, 'default'));
    return merged;
  }, [openLeads, demoLeads, dealerNameById, quoteIdByLeadId, isAdmin, sellerId, appUser?.email, sharedLeadIds]);

  const counts = useMemo(() => ({
    all:       allRows.length,
    open:      allRows.filter(r => r.type === 'open' && !isDemoLikeRow(r) && isOpenRow(r)).length,
    open_demo: allRows.filter(r => isDemoLikeRow(r) && isOpenRow(r)).length,
    won:       allRows.filter(isWonRow).length,
    closed:    allRows.filter(r => isClosedRow(r) && !isWonRow(r)).length,
  }), [allRows]);

  const visible = useMemo(() => {
    let r = allRows;
    if (tab === 'open') r = r.filter(x => x.type === 'open' && !isDemoLikeRow(x) && isOpenRow(x));
    else if (tab === 'open_demo') r = r.filter(x => isDemoLikeRow(x) && isOpenRow(x));
    else if (tab === 'won') r = r.filter(isWonRow);
    else if (tab === 'closed') r = r.filter(x => isClosedRow(x) && !isWonRow(x));

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
    return [...r].sort((a, b) => compareRows(a, b, sort));
  }, [allRows, tab, stage, q, sort]);

  const totalValue = useMemo(() => visible.reduce((s, x) => s + (x.value || 0), 0), [visible]);
  const unassignedCount = useMemo(
    () => allRows.filter(x => !x.owner_user_id).length,
    [allRows]
  );

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const result = deleteTarget.type === 'demo'
        ? await deleteDemoLead(deleteTarget.id, {
            ...deleteTarget,
            deleted_by_name: appUser?.display_name || appUser?.email || null,
            deleted_by_email: appUser?.email || null,
            deleted_by_role: portalRole,
          })
        : await deleteLead(deleteTarget.id, {
            ...deleteTarget,
            deleted_by_name: appUser?.display_name || appUser?.email || null,
            deleted_by_email: appUser?.email || null,
            deleted_by_role: portalRole,
          });
      if (result.error) {
        toast.error('Kunne ikke slette leadet.');
        return;
      }
      if (deleteTarget.type === 'demo') {
        setDemoLeads((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      } else {
        setOpenLeads((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      }
      toast.success(deleteTarget.type === 'demo' ? 'Demo-lead er slettet.' : 'Lead er slettet.');
      setDeleteTarget(null);
    } finally {
      setDeleteBusy(false);
    }
  }

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
          {isAdmin && (
            <Link to="/portal/crm/leads/import-preview"
              className="inline-flex items-center gap-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 hover:border-amber-300 text-sm font-medium px-4 py-2.5 shadow-sm transition">
              <DatabaseZap className="h-4 w-4" /> Historisk import-preview
            </Link>
          )}
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
          {LEAD_DISPLAY_STATUSES.map(s => <option key={s} value={s}>{localizeStatus(s, lang)}</option>)}
          <option disabled>──────────</option>
          {['Hot lead','Warm lead','Cold lead','Offer requested','No fit'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="relative min-w-[230px]">
          <ArrowDownAZ className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <select value={sort} onChange={e=>setSort(e.target.value as SortKey)}
            className="w-full rounded-xl border border-gray-200 text-sm pl-10 pr-3 py-2.5 bg-white">
            <option value="default">Sortér: standard</option>
            <option value="title_asc">Titel: A-Å</option>
            <option value="title_desc">Titel: Å-A</option>
            <option value="date_desc">Dato: nyeste først</option>
            <option value="date_asc">Dato: ældste først</option>
            <option value="prob_desc">Status %: høj til lav</option>
            <option value="prob_asc">Status %: lav til høj</option>
          </select>
        </div>
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
                  <th className="text-left px-4 py-3">{tt('col_date', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_followup', lang)}</th>
                  <th className="text-left px-4 py-3">{tt('col_status', lang)}</th>
                  <th className="text-right px-4 py-3">{tt('col_action', lang)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map(r => {
                  const clickable = !!r.detail_href;
                  const imageAttachments = getLeadImageAttachments(r.attachments);
                  const canActOnOpenLead = r.type === 'open' && r.status !== 'Vundet' && r.status !== 'Tabt';
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
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-mono text-[11px] tabular-nums text-slate-500 shrink-0">{r.display_no}</span>
                          <span className="font-medium text-gray-900 truncate max-w-[260px]">{r.title}</span>
                          {r.incomplete && (
                            <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border bg-amber-50 text-amber-800 border-amber-200">
                              {({ da: 'Ikke færdig oprettet', en: 'Incomplete lead', de: 'Unvollständiger Lead', it: 'Lead incompleto', hu: 'Hiányos lead' } as Record<Language, string>)[lang]}
                            </span>
                          )}
                          {r.shared && (
                            <span className="inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border bg-emerald-50 text-emerald-700 border-emerald-200">
                              {lang === 'da' ? 'Delt med dig' : 'Shared with you'}
                            </span>
                          )}
                          {imageAttachments.length > 0 && (
                            <button
                              type="button"
                              title="Se vedhæftede billeder"
                              onClick={async (e) => {
                                e.stopPropagation();
                                const previews = await getLeadAttachmentSignedUrls(imageAttachments);
                                if (previews.length === 0) {
                                  toast.error('Kunne ikke åbne vedhæftede billeder');
                                  return;
                                }
                                setImagePreview({ title: r.title, images: previews });
                              }}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            >
                              <ImageIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
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
                      <td className="px-4 py-3.5 text-gray-600 max-w-[260px] truncate">{r.machine || '—'}</td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{fmtDate(r.date, lang)}</td>
                      <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{fmtDate(r.next_followup, lang)}</td>
                      <td className="px-4 py-3.5">
                        {r.status ? (
                          <div className="flex items-center gap-2">
                            <span className={cn('inline-flex text-[11px] font-medium px-2 py-0.5 rounded-md border',
                              STAGE_CLR[r.status] || 'bg-gray-100 text-gray-700 border-gray-200')}>
                              {localizeStatus(r.status, lang)}
                            </span>
                            {r.probability != null && (
                              <span className="text-[11px] font-medium text-gray-600 tabular-nums">{r.probability}%</span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {canActOnOpenLead && (
                            <>
                              {!r.has_demo && (
                                <Link
                                  to={`/portal/crm/demo-leads/new?fromLead=${encodeURIComponent(r.id)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[12px] text-violet-700 hover:underline"
                                >
                                  <Sparkles className="h-3.5 w-3.5" /> {tt('convert_to_demo', lang)}
                                </Link>
                              )}
                              {r.quote_id ? (
                                <Link
                                  to={`/configurator?configId=${encodeURIComponent(r.quote_id)}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[12px] text-emerald-700 hover:underline"
                                >
                                  <FileText className="h-3.5 w-3.5" /> {tt('go_to_quote', lang)}
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  disabled={quoteConvertBusyId === r.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleConvertToQuote(r.id);
                                  }}
                                  className="inline-flex items-center gap-1 text-[12px] text-emerald-700 hover:underline disabled:opacity-50"
                                >
                                  <FileText className="h-3.5 w-3.5" /> {tt('convert_to_quote', lang)}
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const lead = openLeads.find(l => l.id === r.id);
                                  if (lead) setCloseTarget(lead);
                                }}
                                className="inline-flex items-center gap-1 text-[12px] text-rose-700 hover:underline"
                              >
                                <XCircle className="h-3.5 w-3.5" /> {tt('close_btn', lang)}
                              </button>
                            </>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(r);
                              }}
                              className="inline-flex items-center gap-1 text-[12px] text-rose-700 hover:underline"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Slet
                            </button>
                          )}
                          {r.detail_href ? (
                            <Link to={r.detail_href} onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[12px] text-[#2d5a27] hover:underline">
                              {tt('open_link', lang)} <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          ) : (
                            <span className="text-[12px] text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {imagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setImagePreview(null)}>
          <div
            className="w-full max-w-3xl max-h-[88vh] overflow-auto rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Vedhæftede billeder</h2>
                <p className="text-xs text-slate-500 truncate">{imagePreview.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setImagePreview(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className={cn('grid gap-3', imagePreview.images.length > 1 ? 'sm:grid-cols-2' : 'grid-cols-1')}>
              {imagePreview.images.map((image, index) => {
                return (
                  <a key={`${image.name}-${index}`} href={image.signed_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <img src={image.signed_url} alt={image.name} className="max-h-[70vh] w-full object-contain" />
                    <div className="truncate px-3 py-2 text-xs font-medium text-slate-700">{image.name}</div>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <WonLostDialog
        lead={closeTarget}
        lang={lang}
        onOpenChange={(open) => { if (!open) setCloseTarget(null); }}
        onSaved={async () => { setCloseTarget(null); await refreshLeads(); }}
      />
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open && !deleteBusy) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Er du sikker på, at du vil slette dette lead? Det fjernes fra CRM-listen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuller</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmDelete(); }}
              disabled={deleteBusy}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteBusy ? '…' : 'Ja, slet'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CrmLayout>
  );
}

// ============================================================================
// Won/Lost close dialog
// ============================================================================
function WonLostDialog({
  lead, lang, onOpenChange, onSaved,
}: {
  lead: CrmLead | null;
  lang: Language;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<'won' | 'lost' | null>(null);
  const [competitor, setCompetitor] = useState('');
  const [competitorOther, setCompetitorOther] = useState('');
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMode(null);
    setCompetitor(''); setCompetitorOther(''); setReason(''); setComment('');
  }, [lead?.id]);

  if (!lead) return null;

  async function handleSave() {
    if (!lead) return;
    setSaving(true);
    try {
      const isWon = mode === 'won';
      const nextActivity = isWon ? NEXT_ACTIVITY_WON : NEXT_ACTIVITY_LOST;
      const closedAt = new Date().toISOString();
      await updateLead(lead.id, {
        next_activity: nextActivity,
        probability: isWon ? 100 : 0,
        pipeline_stage: deriveLegacyPipelineStage(nextActivity),
        status: 'closed',
        ...(isWon ? {} : {
          lost_competitor: competitor === 'Andre' ? (competitorOther || 'Andre') : (competitor || null),
          lost_reason: reason || null,
          lost_comment: comment || null,
        }),
        updated_at: closedAt,
      } as any);
      // Verify before showing success.
      const fresh = await getLead(lead.id);
      const ok = !!fresh && fresh.next_activity === nextActivity;
      if (!ok) { toast.error(tt('verify_err', lang)); return; }
      toast.success(tt('closed_ok', lang));
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error(tt('close_err', lang));
    } finally {
      setSaving(false);
    }
  }

  const isLost = mode === 'lost';
  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tt('close_title', lang)}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600 -mt-2">{tt('close_sub', lang)}</p>

        {mode === null && (
          <div className="grid grid-cols-1 gap-2 mt-1">
            <button
              type="button"
              onClick={() => setMode('won')}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-sm font-medium transition"
            >
              <CheckCircle2 className="h-4 w-4" /> {tt('won_label', lang)}
            </button>
            <button
              type="button"
              onClick={() => setMode('lost')}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-sm font-medium transition"
            >
              <XCircle className="h-4 w-4" /> {tt('lost_label', lang)}
            </button>
          </div>
        )}

        {isLost && (
          <div className="space-y-3 mt-1">
            <div className="flex items-center gap-2 text-rose-800 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" /> {tt('lost_analysis_title', lang)}
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-700">{tt('lost_to', lang)}</label>
              <select className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                value={competitor} onChange={e => setCompetitor(e.target.value)}>
                <option value="">{tt('pick', lang)}</option>
                {LOST_COMPETITOR_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {competitor === 'Andre' && (
              <div>
                <label className="text-[12px] font-medium text-gray-700">{tt('lost_other', lang)}</label>
                <input className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                  value={competitorOther} onChange={e => setCompetitorOther(e.target.value)} />
              </div>
            )}
            <div>
              <label className="text-[12px] font-medium text-gray-700">{tt('lost_reason', lang)}</label>
              <select className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
                value={reason} onChange={e => setReason(e.target.value)}>
                <option value="">{tt('pick', lang)}</option>
                {LOST_REASON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-700">{tt('lost_comment', lang)}</label>
              <textarea className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white min-h-[80px]"
                value={comment} onChange={e => setComment(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {tt('cancel', lang)}
          </Button>
          {mode !== null && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '…' : tt('save', lang)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
