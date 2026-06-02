/**
 * Dealer detail dashboard for CRM → Mine forhandlere.
 * Route: /portal/crm/my-dealers/:accountNumber
 *
 * Shows:
 *  • Dealer master data + main/branch relation
 *  • Linked portal users (read-only for sellers)
 *  • KPI cards (open activities, this week, last/next, leads, quotes, orders)
 *  • Notehistorik (internal Timan-only)
 *  • Næste opfølgning at the top
 *
 * INTERNAL ONLY — external dealer/service-partner/importer roles cannot
 * reach this route (see access guard below). Notes never leak.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Building2, Mail, MapPin, Phone, GitBranch, Star,
  Calendar as CalendarIcon, FileText, ClipboardList, TrendingUp,
  CheckCircle2, AlertCircle, Plus, Pencil,
  Globe, CalendarPlus, PlusCircle, Smartphone, UserCircle2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listDealerContacts, type DealerContact } from "@/lib/dealerContactsService";
import type { Language } from "@/types/configurator";
import { toast } from "sonner";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import CrmLayout from "@/components/crm/CrmLayout";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isScopedSeller } from "@/lib/crmScope";
import {
  DealerAccount, DealerAccountStats,
  fetchDealerAccounts, fetchDealerAccountStats,
  updateDealerAccount, type UpdateDealerAccountPatch,
} from "@/lib/dealerAccountsService";
import { fetchBackendUsers } from "@/lib/backendUsersService";
import type { BackendUser } from "@/lib/backend-users-store";
import {
  listActivities as listCalendarActivities,
  createActivity as createCalendarActivity,
  ACTIVITY_TYPES, activityTypeMeta,
  type CalendarActivity, type CalendarActivityType,
} from "@/lib/crmCalendarService";
import {
  createDealerNote, listDealerNotesForNumbers,
  type DealerNote, type DealerNoteType,
} from "@/lib/dealerNotesService";
import {
  getEffectiveSellerInitials, getEffectiveSellerEmail,
  getActiveSellerView, getActiveMode,
} from "@/lib/activeMode";
import {
  listScopedOrdersWithValue,
  type CrmOrderWithValue,
} from "@/lib/crmConfigurationsService";
import {
  listScopedOpenQuotes,
  dealerKeyOf,
  quoteMonthIso,
  type ScopedConfiguration,
} from "@/lib/crmRelationsService";
import { resolveSellerId } from "@/lib/resolveSellerId";
import {
  listLeads, listDemoLeads, formatLeadNo, formatDemoNo,
  type CrmLead, type CrmDemoLead,
} from "@/lib/crmLeadsService";
import {
  buildDealerBudgetIndex,
  aggregateDealerBudget,
  classifyBudgetStatus,
  type DealerBudgetIndex,
} from "@/lib/crmDealerBudget";
import DealerBudgetHistory from "@/components/crm/DealerBudgetHistory";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const T = {
  back:        { da: "Tilbage til Mine forhandlere" },
  next_followup: { da: "Næste opfølgning" },
  none_followup: { da: "Ingen planlagt opfølgning" },
  contact:     { da: "Kontaktinformation" },
  master:      { da: "Stamdata" },
  users:       { da: "Tilknyttede brugere" },
  no_users:    { da: "Ingen brugere tilknyttet endnu." },
  notes:       { da: "Notehistorik (intern)" },
  no_notes:    { da: "Ingen interne noter endnu." },
  add_note:    { da: "Tilføj note" },
  note_type:   { da: "Notetype" },
  note_text:   { da: "Notetekst" },
  followup:    { da: "Opfølgningsdato" },
  also_cal:    { da: "Opret også kalenderaktivitet" },
  cal_title:   { da: "Aktivitetstitel" },
  cal_type:    { da: "Aktivitetstype" },
  cal_when:    { da: "Dato/tid" },
  save:        { da: "Gem" },
  cancel:      { da: "Annullér" },
  branch_only: { da: "Kun denne filial" },
  group_total: { da: "Hele forhandlergruppen" },
  kpi_open:    { da: "Åbne aktiviteter" },
  kpi_week:    { da: "Aktiviteter denne uge" },
  kpi_last:    { da: "Sidste aktivitet" },
  kpi_next:    { da: "Næste opfølgning" },
  kpi_leads:   { da: "Åbne leads" },
  kpi_quotes:  { da: "Tilbud" },
  kpi_orders:  { da: "Ordrer" },
  kpi_pipeline:{ da: "Pipeline-værdi" },
  kpi_won:     { da: "Vundne ordrer" },
};
const t = (k: keyof typeof T) => T[k].da;

/** New multilang strings for redesigned dealer detail. */
const L: Record<string, Record<Language, string>> = {
  primary_contact:  { da: "Primær kontaktperson", en: "Primary contact", de: "Hauptansprechpartner", it: "Contatto principale", hu: "Elsődleges kapcsolat" },
  no_primary:       { da: "Primær kontaktperson mangler", en: "Primary contact missing", de: "Hauptansprechpartner fehlt", it: "Contatto principale mancante", hu: "Hiányzó elsődleges kapcsolat" },
  call:             { da: "Ring", en: "Call", de: "Anrufen", it: "Chiama", hu: "Hívás" },
  send_mail:        { da: "Send mail", en: "Email", de: "E-Mail", it: "Email", hu: "Email" },
  directions:       { da: "Rutevejledning", en: "Directions", de: "Route", it: "Indicazioni", hu: "Útvonal" },
  website:          { da: "Hjemmeside", en: "Website", de: "Webseite", it: "Sito web", hu: "Weboldal" },
  new_activity:     { da: "Opret aktivitet", en: "New activity", de: "Aktivität anlegen", it: "Nuova attività", hu: "Új tevékenység" },
  schedule_meeting: { da: "Planlæg møde", en: "Schedule meeting", de: "Termin planen", it: "Pianifica riunione", hu: "Találkozó ütemezése" },
  tab_overview:     { da: "Overblik", en: "Overview", de: "Übersicht", it: "Panoramica", hu: "Áttekintés" },
  tab_contacts:     { da: "Kontakter", en: "Contacts", de: "Kontakte", it: "Contatti", hu: "Kapcsolatok" },
  tab_activities:   { da: "Aktiviteter", en: "Activities", de: "Aktivitäten", it: "Attività", hu: "Tevékenységek" },
  tab_notes:        { da: "Noter", en: "Notes", de: "Notizen", it: "Note", hu: "Jegyzetek" },
  tab_documents:    { da: "Dokumenter", en: "Documents", de: "Dokumente", it: "Documenti", hu: "Dokumentumok" },
  tab_company:      { da: "Firmaoplysninger", en: "Company info", de: "Firmendaten", it: "Dati azienda", hu: "Cégadatok" },
  no_documents:     { da: "Ingen dokumenter endnu.", en: "No documents yet.", de: "Noch keine Dokumente.", it: "Nessun documento.", hu: "Még nincsenek dokumentumok." },
  role:             { da: "Rolle", en: "Role", de: "Rolle", it: "Ruolo", hu: "Szerep" },
  phone:            { da: "Telefon", en: "Phone", de: "Telefon", it: "Telefono", hu: "Telefon" },
  mobile:           { da: "Mobil", en: "Mobile", de: "Mobil", it: "Cellulare", hu: "Mobil" },
  email:            { da: "E-mail", en: "Email", de: "E-Mail", it: "Email", hu: "Email" },
  language:         { da: "Sprog", en: "Language", de: "Sprache", it: "Lingua", hu: "Nyelv" },
  status_active:    { da: "Aktiv", en: "Active", de: "Aktiv", it: "Attivo", hu: "Aktív" },
  area_sales:       { da: "Salg", en: "Sales", de: "Vertrieb", it: "Vendite", hu: "Értékesítés" },
  area_workshop:    { da: "Værksted", en: "Workshop", de: "Werkstatt", it: "Officina", hu: "Műhely" },
  area_parts:       { da: "Reservedele", en: "Parts", de: "Ersatzteile", it: "Ricambi", hu: "Alkatrész" },
  area_marketing:   { da: "Marketing", en: "Marketing", de: "Marketing", it: "Marketing", hu: "Marketing" },
  area_finance:     { da: "Økonomi", en: "Finance", de: "Finanzen", it: "Finanza", hu: "Pénzügy" },
  area_primary:     { da: "Primær", en: "Primary", de: "Hauptkontakt", it: "Principale", hu: "Elsődleges" },
  company_details:  { da: "Virksomhedsoplysninger", en: "Company details", de: "Firmendaten", it: "Dettagli azienda", hu: "Cégadatok" },
  recent_activities:{ da: "Seneste aktiviteter", en: "Recent activities", de: "Letzte Aktivitäten", it: "Attività recenti", hu: "Legutóbbi tevékenységek" },
  recent_quotes:    { da: "Seneste tilbud", en: "Recent quotes", de: "Letzte Angebote", it: "Ultimi preventivi", hu: "Legutóbbi árajánlatok" },
  none:             { da: "Ingen", en: "None", de: "Keine", it: "Nessuno", hu: "Nincs" },
};
const tl = (k: keyof typeof L, lang: Language): string => L[k][lang] ?? L[k].da;


const NOTE_TYPE_LABEL: Record<DealerNoteType, string> = {
  general: "Generel note", call: "Opkald", visit: "Besøg",
  follow_up: "Opfølgning", demo: "Demo", offer: "Tilbud", service: "Service",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("da-DK"); } catch { return "—"; }
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" }); } catch { return "—"; }
}
function startOfIsoWeek(d: Date): Date {
  const x = new Date(d); x.setHours(0,0,0,0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export default function CrmDealerDetailPage() {
  const { accountNumber = "" } = useParams<{ accountNumber: string }>();
  const { appUser, loading } = useAppUser();
  const { language: lang } = useLanguage();
  const navigate = useNavigate();
  void lang;

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [stats, setStats] = useState<Record<string, DealerAccountStats>>({});
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [calendar, setCalendar] = useState<CalendarActivity[]>([]);
  const [notes, setNotes] = useState<DealerNote[]>([]);
  const [scope, setScope] = useState<"branch" | "group">("branch");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showEditDealer, setShowEditDealer] = useState(false);
  const [busy, setBusy] = useState(true);
  // Live CRM configurations (same source as CRM → Tilbud / Ordrer).
  // Used for accurate Tilbud / Ordrer / Vundne ordrer / Pipeline-værdi KPIs
  // — instead of dealer_account_stats which can lag for newly-created orders
  // and only counts via created_by_user_id (misses backend/seller-created ones).
  const [dealerQuotes, setDealerQuotes] = useState<ScopedConfiguration[]>([]);
  const [dealerOrders, setDealerOrders] = useState<CrmOrderWithValue[]>([]);
  const [allLeads, setAllLeads] = useState<CrmLead[]>([]);
  const [allDemos, setAllDemos] = useState<CrmDemoLead[]>([]);
  const [budgetIndex, setBudgetIndex] = useState<DealerBudgetIndex | null>(null);
  const budgetYear = new Date().getFullYear();

  const portalRole = useMemo(() => derivePortalRole(appUser), [appUser]);
  const admin = isCrmAdmin(portalRole);
  const seller = isScopedSeller(portalRole);
  const canAccess = admin || seller;

  const [activeMode, setActiveMode] = useState<string>(() => getActiveMode(appUser?.email));
  useEffect(() => {
    const h = () => setActiveMode(getActiveMode(appUser?.email));
    window.addEventListener("timan:active-mode-changed", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("timan:active-mode-changed", h);
      window.removeEventListener("storage", h);
    };
  }, [appUser?.email]);
  void activeMode;

  useEffect(() => {
    if (!appUser || !accountNumber) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      const [dRes, sRes, uRes] = await Promise.all([
        fetchDealerAccounts({ includeDeleted: false }),
        fetchDealerAccountStats(),
        fetchBackendUsers(),
      ]);
      if (cancelled) return;
      setDealers(dRes.rows);
      const map: Record<string, DealerAccountStats> = {};
      for (const s of sRes.rows) map[s.id] = s;
      setStats(map);
      setUsers(uRes.users);
      const cal = await listCalendarActivities({});
      if (cancelled) return;
      setCalendar(cal);
      // Fetch live quotes + orders for ALL accessible scopes — backend admin
      // fetches everything (no scoping), seller fetches their own. We then
      // filter client-side by dealer_number so branch/group toggle works.
      try {
        const sellerView = getActiveSellerView(appUser?.email);
        const sellerId = await resolveSellerId(sellerView?.email ?? appUser?.email);
        const sellerInitials = sellerView?.initials
          ?? (seller && appUser?.display_name ? appUser.display_name.match(/^([A-ZÆØÅ]{2,4})/)?.[1] ?? null : null);
        const sellerEmail = sellerView?.email ?? (seller ? appUser?.email?.toLowerCase() ?? null : null);
        const filterBase = {
          role: portalRole,
          sellerId,
          sellerInitials,
          sellerEmail,
          dealerNumber: appUser?.dealer_number ?? null,
        } as const;
        const [qRes, oRes, leadsRes, demosRes] = await Promise.all([
          listScopedOpenQuotes(filterBase),
          listScopedOrdersWithValue(filterBase),
          listLeads({ limit: 500 }),
          listDemoLeads({ limit: 500 }),
        ]);
        if (!cancelled) {
          setDealerQuotes(qRes.rows);
          setDealerOrders(oRes.rows);
          setAllLeads(leadsRes);
          setAllDemos(demosRes);
        }
        // Dealer budget index (year-scoped) using same data as Budget Dashboard.
        try {
          const idx = await buildDealerBudgetIndex({
            year: budgetYear,
            dealers: dRes.rows,
            filter: filterBase,
          });
          if (!cancelled) setBudgetIndex(idx);
        } catch (e) {
          console.warn('[CrmDealerDetailPage] budget index failed:', e);
        }
      } catch (e) {
        console.warn('[CrmDealerDetailPage] failed to fetch CRM configurations:', e);
      }
      setBusy(false);
    })();
    return () => { cancelled = true; };
  }, [appUser, accountNumber, portalRole, budgetYear, seller]);

  const dealer = useMemo(
    () => dealers.find(d => d.account_number === accountNumber) ?? null,
    [dealers, accountNumber]
  );

  // Determine main + branches grouping
  const mainAccountNumber = dealer?.parent_account_number || dealer?.account_number || "";
  const branchNumbers = useMemo(() => {
    if (!dealer) return [] as string[];
    const main = dealers.find(d => d.account_number === mainAccountNumber);
    const children = dealers.filter(d => d.parent_account_number === mainAccountNumber).map(d => d.account_number);
    return [main?.account_number, ...children].filter((x): x is string => Boolean(x));
  }, [dealers, dealer, mainAccountNumber]);

  const scopeNumbers = scope === "branch" || branchNumbers.length <= 1
    ? [accountNumber]
    : branchNumbers;

  // Load notes (whenever scope changes)
  useEffect(() => {
    if (!dealer) return;
    let cancelled = false;
    (async () => {
      const n = await listDealerNotesForNumbers(scopeNumbers);
      if (!cancelled) setNotes(n);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealer?.id, scope, branchNumbers.join(",")]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!canAccess) return <Navigate to="/portal" replace />;

  if (!busy && !dealer) {
    return (
      <CrmLayout pageTitle="Forhandler ikke fundet">
        <div className="bg-white border rounded-xl p-6">
          <p className="text-slate-700 mb-4">Forhandler {accountNumber} blev ikke fundet eller er ikke tildelt dig.</p>
          <Link to="/portal/crm/my-dealers" className="text-emerald-700 underline text-sm">{t("back")}</Link>
        </div>
      </CrmLayout>
    );
  }

  if (!dealer) return <CrmLayout pageTitle="…"><div className="text-slate-500 text-sm">Henter…</div></CrmLayout>;

  const linkedUsers = users.filter(u =>
    scopeNumbers.includes(u.dealer_number || "")
  );

  const activitiesForScope = calendar.filter(a =>
    scopeNumbers.includes(a.dealer_account_number || "")
  );

  const now = new Date();
  const weekStart = startOfIsoWeek(now);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

  const openActs = activitiesForScope.filter(a => a.status === "planned");
  const thisWeekActs = activitiesForScope.filter(a => {
    const d = new Date(a.start_datetime);
    return d >= weekStart && d < weekEnd;
  });
  const lastDoneAct = activitiesForScope
    .filter(a => a.status === "done")
    .sort((a, b) => b.start_datetime.localeCompare(a.start_datetime))[0];

  // Next follow-up = next planned activity OR earliest future note follow-up
  const upcomingPlanned = openActs
    .filter(a => new Date(a.start_datetime) >= now)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))[0];
  const upcomingNote = notes
    .filter(n => n.follow_up_date && new Date(n.follow_up_date) >= now)
    .sort((a, b) => (a.follow_up_date || "").localeCompare(b.follow_up_date || ""))[0];

  const nextFollowup =
    upcomingPlanned && (!upcomingNote || upcomingPlanned.start_datetime <= (upcomingNote.follow_up_date || ""))
      ? { date: upcomingPlanned.start_datetime, title: upcomingPlanned.title, seller: upcomingPlanned.seller_initials, status: upcomingPlanned.status, kind: "activity" as const }
      : upcomingNote
        ? { date: upcomingNote.follow_up_date!, title: NOTE_TYPE_LABEL[upcomingNote.note_type], seller: upcomingNote.seller_initials, status: "planned", kind: "note" as const }
        : null;

  // Stats from dealer_account_stats view (legacy fallback only).
  const ownStats = stats[dealer.id];

  // Live counts from CRM → Tilbud / Ordrer source (crm_configurations_view).
  // Match by dealer_number across the in-scope numbers (branch or group).
  // This is the SAME source as CRM → Ordrer, so any visible row there is
  // counted here too — including new orders not yet picked up by the
  // dealer_account_stats aggregation view.
  const scopeNumberSet = new Set(scopeNumbers.map((n) => String(n)));
  // Canonical dealer keys for this dealer (id + numbers + normalized name).
  // Mirrors crmRelationsService.dealerKeyOf so any quote whose dealer resolves
  // to one of these keys is counted here.
  const normName = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const dealerKeySet = new Set<string>();
  if (dealer.id) dealerKeySet.add(`id:${dealer.id}`);
  for (const num of scopeNumbers) if (num) dealerKeySet.add(`num:${String(num).trim()}`);
  for (const d of dealers) {
    if (scopeNumberSet.has(String(d.account_number))) {
      const n = normName(d.company_name);
      if (n) dealerKeySet.add(`name:${n}`);
      const bn = normName(d.branch_name);
      if (bn) dealerKeySet.add(`name:${bn}`);
    }
  }
  const matchesDealer = (key: string | null) => !!key && dealerKeySet.has(key);

  const dealerQuotesInScope = dealerQuotes.filter((r) => matchesDealer(r.dealer_key ?? dealerKeyOf(r)));
  // Orders: match using the SAME canonical dealer-key resolution as quotes
  // (dealer_account_id → dealer_number/account_number → normalized name).
  // Previously this only checked dealer_number, which missed orders where
  // dealer_number was blank/stale after a quote→order conversion even though
  // dealer_account_id or dealer_company_name still pointed at the right dealer.
  const dealerOrdersInScope = dealerOrders.filter((r) => matchesDealer(dealerKeyOf(r)));
  const wonOrdersInScope = dealerOrdersInScope.filter((r) => {
    const s = (r.case_status || '').toLowerCase();
    return s === 'ordre_afgivet' || !!r.order_sent_at || !!r.submitted_at;
  });
  const liveQuoteCount = dealerQuotesInScope.length;
  const liveOrderCount = dealerOrdersInScope.length;
  const liveWonCount = wonOrdersInScope.length;
  // Pipeline value = open configurator quotes (computed from state_json via
  // crmRelationsService) + open orders.
  const openQuotesValue = dealerQuotesInScope.reduce((s, r) => s + (r.total_value || 0), 0);
  const livePipelineValue = dealerOrdersInScope.reduce((s, r) => s + (r.total_value || 0), 0) + openQuotesValue;
  // Latest activity from quotes (used to enrich "Sidste aktivitet" if no
  // calendar activity is more recent).
  const latestQuoteIso = dealerQuotesInScope
    .map((r) => quoteMonthIso(r))
    .filter(Boolean)
    .sort()
    .reverse()[0] || null;
  const lastDoneIso = lastDoneAct?.start_datetime || null;
  const latestActivityIso = [latestQuoteIso, lastDoneIso].filter(Boolean).sort().reverse()[0] || null;
  const fmtKr = (v: number) => `${Math.round(v).toLocaleString('da-DK')} kr.`;

  const mainDealer = dealers.find(d => d.account_number === mainAccountNumber);
  const isBranch = !!dealer.parent_account_number;
  const hasGroup = branchNumbers.length > 1;

  const sellerCtx = getActiveSellerView(appUser.email);
  const effInitials = getEffectiveSellerInitials(appUser);
  const effEmail = getEffectiveSellerEmail(appUser);

  async function handleAddNote(input: NewNoteForm) {
    if (!dealer) return;
    const note = await createDealerNote({
      dealer_number: dealer.account_number,
      dealer_name: dealer.branch_name || dealer.company_name,
      created_by_user_id: null,
      created_by_email: appUser?.email ?? null,
      seller_initials: effInitials || null,
      note_type: input.note_type,
      note_text: input.note_text,
      follow_up_date: input.follow_up_date || null,
    });
    let linkedActivityId: string | null = null;
    if (input.create_calendar) {
      const created = await createCalendarActivity({
        title: input.cal_title || `${NOTE_TYPE_LABEL[input.note_type]} — ${dealer.branch_name || dealer.company_name}`,
        start_datetime: input.cal_when || new Date().toISOString(),
        activity_type: input.cal_type,
        account_id: dealer.id,
        dealer_name: dealer.branch_name || dealer.company_name,
        dealer_account_number: dealer.account_number,
        dealer_assigned_seller_initials: dealer.assigned_seller_initials,
        dealer_assigned_seller_email: dealer.assigned_seller_email,
        seller_initials: effInitials || null,
        seller_name: sellerCtx?.label || appUser?.display_name || null,
        created_by_user_id: null,
        created_by_email: effEmail || appUser?.email || null,
        note: input.note_text,
        status: "planned",
      });
      linkedActivityId = created.id;
      // Also auto-create a mirroring note describing the calendar activity
      await createDealerNote({
        dealer_number: dealer.account_number,
        dealer_name: dealer.branch_name || dealer.company_name,
        created_by_user_id: null,
        created_by_email: appUser?.email ?? null,
        seller_initials: effInitials || null,
        note_type: "follow_up",
        note_text: `Kalenderaktivitet oprettet: ${created.title} (${activityTypeMeta(created.activity_type).label.da}) — ${fmtDateTime(created.start_datetime)} · sælger ${created.seller_initials || "—"}`,
        linked_activity_id: created.id,
        follow_up_date: created.start_datetime,
      });
      const cal = await listCalendarActivities({});
      setCalendar(cal);
    }
    setNotes(prev => [{ ...note, linked_activity_id: linkedActivityId ?? note.linked_activity_id }, ...prev]);
    setShowNoteModal(false);
  }

  async function handleSaveDealer(patch: UpdateDealerAccountPatch): Promise<{ ok: boolean; error?: string }> {
    if (!dealer) return { ok: false, error: "Ingen forhandler valgt." };
    const res = await updateDealerAccount(dealer.id, patch);
    if (!res.ok) {
      toast.error(res.error || "Kunne ikke opdatere forhandleren.");
      return res;
    }
    // Refresh dealer list (and detail derives from it)
    const dRes = await fetchDealerAccounts({ includeDeleted: false });
    setDealers(dRes.rows);
    toast.success("Forhandleren er opdateret.");
    setShowEditDealer(false);
    return { ok: true };
  }

  return (
    <CrmLayout pageTitle={dealer.branch_name || dealer.company_name}>
      {/* Back nav */}
      <button onClick={() => navigate("/portal/crm/my-dealers")}
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> {t("back")}
      </button>

      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
        {(() => {
          // derive scope-aware data
          const dealerIdSet = new Set(scopeNumbers
            .map((n) => dealers.find((d) => d.account_number === n)?.id)
            .filter((x): x is string => !!x));
          const dealerNameSet = new Set(scopeNumbers
            .map((n) => (dealers.find((d) => d.account_number === n)?.company_name || "").toLowerCase().trim())
            .filter(Boolean));
          const scopeLeads = allLeads.filter((l) =>
            (l.linked_dealer_id && (dealerIdSet.has(l.linked_dealer_id) || scopeNumberSet.has(l.linked_dealer_id)))
          );
          const openLeads = scopeLeads.filter((l) => l.pipeline_stage !== "Won" && l.pipeline_stage !== "Lost");
          const scopeDemos = allDemos.filter((d) => dealerNameSet.has((d.dealer_company || "").toLowerCase().trim()));
          const openDemos = scopeDemos.filter((d) => !d.result_status);
          const budgetTotals = budgetIndex ? aggregateDealerBudget(budgetIndex, scopeNumbers) : null;

          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          const monthActs = activitiesForScope.filter((a) => {
            const d = new Date(a.start_datetime); return d >= monthStart && d < monthEnd;
          });
          const monthTypeCounts: Record<string, number> = {};
          for (const a of monthActs) monthTypeCounts[a.activity_type] = (monthTypeCounts[a.activity_type] || 0) + 1;
          const monthTypeStr = Object.entries(monthTypeCounts)
            .map(([k, n]) => `${n}x ${activityTypeMeta(k as CalendarActivityType).label.da.toLowerCase()}`)
            .join(", ");

          return (
            <>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <div className="w-14 h-14 bg-[#2d5a27]/10 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="h-6 w-6 text-[#2d5a27]" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-bold text-slate-900">{dealer.branch_name || dealer.company_name}</h2>
                    <div className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                      <span className="font-mono">#{dealer.account_number}</span>
                      <span>·</span>
                      <span>{dealer.customer_type_label || dealer.customer_type || "—"}</span>
                      {dealer.country && <><span>·</span><span>{dealer.country}</span></>}
                      {isBranch && mainDealer && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                          <GitBranch className="h-3 w-3" /> Filial under{" "}
                          <Link to={`/portal/crm/my-dealers/${mainDealer.account_number}`} className="underline">
                            {mainDealer.company_name}
                          </Link>
                        </span>
                      )}
                      {dealer.is_main_account && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                          <Star className="h-3 w-3" /> Hovedkonto
                        </span>
                      )}
                    </div>
                    {/* Compact KPI line */}
                    <div className="mt-3 flex items-center gap-x-3 gap-y-2 flex-wrap text-sm">
                      <CompactKpiPopover icon={<FileText className="h-3.5 w-3.5" />} label="Ordrer" value={liveOrderCount}
                        items={dealerOrdersInScope.map((o) => ({ id: o.id, title: o.title || o.order_number || o.id, subtitle: fmtDate(o.closed_at), href: `/portal/crm/orders` }))}
                        emptyLabel="Ingen ordrer" />
                      <Divider />
                      <CompactKpiPopover icon={<FileText className="h-3.5 w-3.5" />} label="Tilbud" value={liveQuoteCount}
                        items={dealerQuotesInScope.map((q) => ({ id: q.id, title: q.title || q.quote_number || q.id, subtitle: fmtDate(quoteMonthIso(q)), href: `/portal/crm/quotes` }))}
                        emptyLabel="Ingen tilbud" />
                      <Divider />
                      <CompactKpi icon={<TrendingUp className="h-3.5 w-3.5" />} label="Pipeline" value={livePipelineValue > 0 ? fmtKr(livePipelineValue) : "—"} />
                      <Divider />
                      <CompactKpiPopover icon={<TrendingUp className="h-3.5 w-3.5" />} label="Åbne leads" value={openLeads.length}
                        items={openLeads.map((l) => ({ id: l.id, title: `${l.lead_no ? formatLeadNo(l.lead_no) + " · " : ""}${l.title}`, subtitle: l.pipeline_stage || "—", href: `/portal/crm/leads/${l.id}` }))}
                        emptyLabel="Ingen åbne leads" />
                      <Divider />
                      <CompactKpiPopover icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Åbne demoer" value={openDemos.length}
                        items={openDemos.map((d) => ({ id: d.id, title: `${d.demo_no ? formatDemoNo(d.demo_no) + " · " : ""}${d.title || d.customer_name || "Demo"}`, subtitle: fmtDate(d.demo_date), href: `/portal/crm/demo-leads/${d.id}` }))}
                        emptyLabel="Ingen åbne demoer" />
                      <Divider />
                      <CompactKpiPopover icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Total demoer" value={scopeDemos.length}
                        items={scopeDemos.map((d) => ({ id: d.id, title: `${d.demo_no ? formatDemoNo(d.demo_no) + " · " : ""}${d.title || d.customer_name || "Demo"}`, subtitle: fmtDate(d.demo_date), href: `/portal/crm/demo-leads/${d.id}` }))}
                        emptyLabel="Ingen demoer" />
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {admin && (
                      <button onClick={() => setShowEditDealer(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-bold"
                        title="Rediger forhandleroplysninger">
                        <Pencil className="h-3.5 w-3.5" /> Rediger forhandler
                      </button>
                    )}
                    {hasGroup && (
                      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-xs">
                        <button onClick={() => setScope("branch")}
                          className={`px-3 py-1.5 rounded-md font-semibold ${scope==="branch" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
                          {t("branch_only")}
                        </button>
                        <button onClick={() => setScope("group")}
                          className={`px-3 py-1.5 rounded-md font-semibold ${scope==="group" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
                          {t("group_total")} ({branchNumbers.length})
                        </button>
                      </div>
                    )}
                  </div>
                  {budgetTotals && <HeaderBudgetMini totals={budgetTotals} year={budgetYear} />}
                </div>
              </div>

              {/* Compact activity strip */}
              <div className="mt-4 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-slate-600 border-t border-slate-100 pt-3">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5 text-emerald-700" />
                  <span className="text-slate-500">Næste opfølgning:</span>
                  <span className="font-semibold text-slate-800">
                    {nextFollowup ? `${fmtDate(nextFollowup.date)} · ${nextFollowup.title}` : t("none_followup")}
                  </span>
                </span>
                <Divider />
                <span>
                  <span className="text-slate-500">Aktiviteter denne måned:</span>{" "}
                  <span className="font-semibold text-slate-800">{monthActs.length}</span>
                  {monthTypeStr && <span className="text-slate-500"> ({monthTypeStr})</span>}
                </span>
                <Divider />
                <span>
                  <span className="text-slate-500">Seneste aktivitet:</span>{" "}
                  <span className="font-semibold text-slate-800">{fmtDate(latestActivityIso ?? ownStats?.last_activity_at ?? null)}</span>
                </span>
                <Divider />
                <CompactKpiPopover icon={<ClipboardList className="h-3.5 w-3.5" />} label="Åbne aktiviteter" value={openActs.length}
                  items={openActs.slice(0, 50).map((a) => ({
                    id: a.id,
                    title: a.title || activityTypeMeta(a.activity_type).label.da,
                    subtitle: fmtDateTime(a.start_datetime),
                    href: "/portal/crm/calendar",
                  }))}
                  emptyLabel="Ingen åbne aktiviteter" />
              </div>
            </>
          );
        })()}
      </div>

      {/* Budget + history */}
      {(() => {
        const budgetTotals = budgetIndex ? aggregateDealerBudget(budgetIndex, scopeNumbers) : null;
        if (!budgetTotals) return null;
        return (
          <>
            <DealerBudgetCard totals={budgetTotals} year={budgetYear} />
            {!budgetTotals.noBudget && (
              <DealerBudgetHistory
                year={budgetYear}
                scopeNumbers={scopeNumbers}
                dealersInScope={dealers.filter((d) => scopeNumberSet.has(String(d.account_number)))}
                wonOrdersInScope={wonOrdersInScope}
              />
            )}
          </>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Master + contact */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">{t("contact")}</h3>
          <ul className="text-sm space-y-2">
            <Row icon={<MapPin className="h-3.5 w-3.5" />} label="Adresse" value={[dealer.address, [dealer.postal_code, dealer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "—"} />
            <Row icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={dealer.email || "—"} />
            <Row icon={<Phone className="h-3.5 w-3.5" />} label="Telefon" value={dealer.phone || "—"} />
          </ul>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mt-5 mb-3">{t("master")}</h3>
          <ul className="text-sm space-y-1.5">
            <li><span className="text-slate-500">Kontonr:</span> <span className="font-mono">{dealer.account_number}</span></li>
            <li><span className="text-slate-500">Type:</span> {dealer.customer_type_label || dealer.customer_type || "—"}</li>
            <li><span className="text-slate-500">Land:</span> {dealer.country || "—"}</li>
            <li><span className="text-slate-500">Tildelt sælger:</span> {dealer.assigned_seller_initials || "—"}{dealer.assigned_seller_name ? ` (${dealer.assigned_seller_name})` : ""}</li>
          </ul>
        </div>

        {/* Linked users */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{t("users")} ({linkedUsers.length})</h3>
            {!admin && <span className="text-[10px] text-slate-400">Skrivebeskyttet for sælger</span>}
          </div>
          {linkedUsers.length === 0 ? (
            <p className="text-sm text-slate-500">{t("no_users")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left py-2">Navn</th>
                    <th className="text-left py-2">Email</th>
                    <th className="text-left py-2">Rolle</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">Sidste login</th>
                    <th className="text-left py-2">Sprog</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedUsers.map(u => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="py-2 font-semibold">{u.name}</td>
                      <td className="py-2 text-slate-600">{u.email}</td>
                      <td className="py-2 text-slate-600">{u.role}</td>
                      <td className="py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${u.approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {u.approved ? "Godkendt" : "Afventer"}
                        </span>
                      </td>
                      <td className="py-2 text-slate-500 text-xs">{fmtDate(u.last_login_at)}</td>
                      <td className="py-2 text-slate-500 uppercase text-xs">{u.language}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Notehistorik */}
      <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            {t("notes")} ({notes.length})
          </h3>
          <button onClick={() => setShowNoteModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold">
            <Plus className="h-3.5 w-3.5" /> {t("add_note")}
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-500">{t("no_notes")}</p>
        ) : (
          <ul className="space-y-2">
            {notes.map(n => (
              <li key={n.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">{NOTE_TYPE_LABEL[n.note_type]}</span>
                    <span>·</span>
                    <span>{fmtDateTime(n.created_at)}</span>
                    <span>·</span>
                    <span>sælger {n.seller_initials || "—"}</span>
                    {n.created_by_email && <><span>·</span><span>{n.created_by_email}</span></>}
                  </div>
                  {n.follow_up_date && (
                    <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                      Opfølgning: {fmtDateTime(n.follow_up_date)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{n.note_text}</p>
                {n.linked_activity_id && (
                  <Link to="/portal/crm/calendar" className="text-[11px] text-emerald-700 underline mt-1 inline-block">
                    Se tilknyttet kalenderaktivitet →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showNoteModal && (
        <NoteModal
          dealerLabel={dealer.branch_name || dealer.company_name}
          onCancel={() => setShowNoteModal(false)}
          onSave={handleAddNote}
        />
      )}

      {showEditDealer && admin && (
        <EditDealerModal
          dealer={dealer}
          onCancel={() => setShowEditDealer(false)}
          onSave={handleSaveDealer}
        />
      )}
    </CrmLayout>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {icon}{label}
      </div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      {hint && <div className="text-[10px] text-slate-400 mt-0.5">{hint}</div>}
    </div>
  );
}

interface KpiItem { id: string; title: string; subtitle?: string; href?: string }
function KpiPopover({ icon, label, value, items, emptyLabel }: {
  icon: React.ReactNode; label: string; value: React.ReactNode;
  items: KpiItem[]; emptyLabel: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-left bg-white border border-slate-200 rounded-xl p-3 hover:bg-emerald-50/40 cursor-pointer">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
            {icon}{label}
          </div>
          <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="px-3 py-2 border-b text-[11px] uppercase font-bold tracking-wide text-slate-500">{label}</div>
        {items.length === 0 ? (
          <div className="px-3 py-4 text-sm text-slate-500">{emptyLabel}</div>
        ) : (
          <ul className="max-h-80 overflow-auto divide-y">
            {items.map((it) => {
              const content = (
                <div className="px-3 py-2 hover:bg-slate-50">
                  <div className="text-sm font-semibold text-slate-900 truncate">{it.title}</div>
                  {it.subtitle && <div className="text-xs text-slate-500">{it.subtitle}</div>}
                </div>
              );
              return (
                <li key={it.id}>
                  {it.href ? <Link to={it.href}>{content}</Link> : content}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DealerBudgetCard({ totals, year }: { totals: ReturnType<typeof aggregateDealerBudget>; year: number }) {
  const { pct } = classifyBudgetStatus(totals);
  const expected = totals.ytdRealisedQty + totals.pipelineQty;
  const missingYtd = Math.max(0, totals.ytdBudgetQty - totals.ytdRealisedQty);
  const missingExpected = Math.max(0, totals.yearBudgetQty - expected);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Budget {year}</h3>
        {!totals.noBudget && <span className="text-xs font-bold text-slate-700">{pct}%</span>}
      </div>
      {totals.noBudget ? (
        <p className="text-sm text-slate-500">Intet budget registreret for {year}.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 text-sm">
            <Metric label="Årsbudget" value={`${Math.round(totals.yearBudgetQty)} stk.`} />
            <Metric label="Budget YTD" value={`${Math.round(totals.ytdBudgetQty)} stk.`} />
            <Metric label="Realiseret YTD" value={`${Math.round(totals.ytdRealisedQty)} stk.`} />
            <Metric label="Pipeline" value={`${Math.round(totals.pipelineQty)} stk.`} />
            <Metric label="Forventet" value={`${Math.round(expected)} stk.`} />
            <Metric label="Mangler YTD" value={`${missingYtd} stk.`} />
            <Metric label="Mangler forventet" value={`${missingExpected} stk.`} />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Pipeline tælles ikke som realiseret.</p>
        </>
      )}
    </div>
  );
}

function HeaderBudgetMini({ totals, year }: { totals: ReturnType<typeof aggregateDealerBudget>; year: number }) {
  const { status, pct } = classifyBudgetStatus(totals);
  const barColor = status === "green" ? "bg-emerald-500" : status === "yellow" ? "bg-amber-500" : status === "red" ? "bg-rose-500" : "bg-slate-300";
  const widthPct = Math.min(100, Math.max(0, pct));
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 min-w-[200px]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Budget YTD {year}</span>
        {!totals.noBudget && <span className="text-[11px] font-bold text-slate-700">{pct}%</span>}
      </div>
      {totals.noBudget ? (
        <div className="text-xs text-slate-500 mt-0.5">Intet budget</div>
      ) : (
        <>
          <div className="text-sm font-bold text-slate-900 mt-0.5">
            {Math.round(totals.ytdRealisedQty)} / {Math.round(totals.ytdBudgetQty)} stk.
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${widthPct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}

function Divider() {
  return <span className="h-4 w-px bg-slate-200 hidden sm:inline-block" aria-hidden />;
}

function CompactKpi({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {icon && <span className="text-slate-400">{icon}</span>}
      <span className="text-slate-500">{label}:</span>
      <span className="font-bold text-slate-900">{value}</span>
    </span>
  );
}

function CompactKpiPopover({ icon, label, value, items, emptyLabel }: {
  icon?: React.ReactNode; label: string; value: React.ReactNode;
  items: KpiItem[]; emptyLabel: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-emerald-50/60 transition">
          {icon && <span className="text-slate-400">{icon}</span>}
          <span className="text-slate-500">{label}:</span>
          <span className="font-bold text-slate-900">{value}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="px-3 py-2 border-b text-[11px] uppercase font-bold tracking-wide text-slate-500">{label}</div>
        {items.length === 0 ? (
          <div className="px-3 py-4 text-sm text-slate-500">{emptyLabel}</div>
        ) : (
          <ul className="max-h-80 overflow-auto divide-y">
            {items.map((it) => {
              const content = (
                <div className="px-3 py-2 hover:bg-slate-50">
                  <div className="text-sm font-semibold text-slate-900 truncate">{it.title}</div>
                  {it.subtitle && <div className="text-xs text-slate-500">{it.subtitle}</div>}
                </div>
              );
              return (
                <li key={it.id}>
                  {it.href ? <Link to={it.href}>{content}</Link> : content}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase font-bold tracking-wide text-slate-400">{label}</div>
      <div className="text-slate-900 font-semibold">{value}</div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5">{icon}</span>
      <div>
        <div className="text-[10px] uppercase font-bold tracking-wide text-slate-400">{label}</div>
        <div className="text-slate-800">{value}</div>
      </div>
    </li>
  );
}

interface NewNoteForm {
  note_type: DealerNoteType;
  note_text: string;
  follow_up_date: string;
  create_calendar: boolean;
  cal_title: string;
  cal_type: CalendarActivityType;
  cal_when: string;
}

function NoteModal({ dealerLabel, onCancel, onSave }: {
  dealerLabel: string;
  onCancel: () => void;
  onSave: (input: NewNoteForm) => void | Promise<void>;
}) {
  const [form, setForm] = useState<NewNoteForm>({
    note_type: "general",
    note_text: "",
    follow_up_date: "",
    create_calendar: false,
    cal_title: "",
    cal_type: "demo",
    cal_when: "",
  });
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 mt-12">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Tilføj note</h2>
        <p className="text-xs text-slate-500 mb-4">Forhandler: {dealerLabel} · intern note (vises ikke for eksterne)</p>

        <label className="block text-xs font-bold text-slate-600 mb-1">Notetype</label>
        <select value={form.note_type}
          onChange={(e) => setForm(f => ({ ...f, note_type: e.target.value as DealerNoteType }))}
          className="w-full mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          {(Object.keys(NOTE_TYPE_LABEL) as DealerNoteType[]).map(k => (
            <option key={k} value={k}>{NOTE_TYPE_LABEL[k]}</option>
          ))}
        </select>

        <label className="block text-xs font-bold text-slate-600 mb-1">Notetekst</label>
        <textarea value={form.note_text}
          onChange={(e) => setForm(f => ({ ...f, note_text: e.target.value }))}
          rows={4}
          className="w-full mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm" />

        <label className="block text-xs font-bold text-slate-600 mb-1">Opfølgningsdato (valgfri)</label>
        <input type="datetime-local" value={form.follow_up_date}
          onChange={(e) => setForm(f => ({ ...f, follow_up_date: e.target.value }))}
          className="w-full mb-3 rounded-lg border border-slate-200 px-3 py-2 text-sm" />

        <label className="flex items-center gap-2 mb-3 text-sm">
          <input type="checkbox" checked={form.create_calendar}
            onChange={(e) => setForm(f => ({ ...f, create_calendar: e.target.checked }))} />
          Opret også kalenderaktivitet
        </label>

        {form.create_calendar && (
          <div className="border border-slate-200 rounded-lg p-3 mb-3 bg-slate-50">
            <label className="block text-xs font-bold text-slate-600 mb-1">Aktivitetstitel</label>
            <input value={form.cal_title}
              onChange={(e) => setForm(f => ({ ...f, cal_title: e.target.value }))}
              placeholder={`Aktivitet — ${dealerLabel}`}
              className="w-full mb-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <label className="block text-xs font-bold text-slate-600 mb-1">Aktivitetstype</label>
            <select value={form.cal_type}
              onChange={(e) => setForm(f => ({ ...f, cal_type: e.target.value as CalendarActivityType }))}
              className="w-full mb-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {ACTIVITY_TYPES.map(a => <option key={a.key} value={a.key}>{a.label.da}</option>)}
            </select>
            <label className="block text-xs font-bold text-slate-600 mb-1">Dato/tid</label>
            <input type="datetime-local" value={form.cal_when}
              onChange={(e) => setForm(f => ({ ...f, cal_when: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Annullér</button>
          <button
            disabled={saving || !form.note_text.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                // Convert datetime-local to ISO if present
                const iso = (s: string) => s ? new Date(s).toISOString() : "";
                await onSave({
                  ...form,
                  follow_up_date: iso(form.follow_up_date),
                  cal_when: iso(form.cal_when),
                });
              } finally { setSaving(false); }
            }}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
            {saving ? "Gemmer…" : "Gem note"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditDealerModal({
  dealer,
  onCancel,
  onSave,
}: {
  dealer: DealerAccount;
  onCancel: () => void;
  onSave: (patch: UpdateDealerAccountPatch) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [form, setForm] = useState({
    company_name: dealer.company_name || "",
    account_number: dealer.account_number || "",
    country: dealer.country || "",
    address: dealer.address || "",
    postal_code: dealer.postal_code || "",
    city: dealer.city || "",
    email: dealer.email || "",
    phone: dealer.phone || "",
    assigned_seller_initials: dealer.assigned_seller_initials || "",
    customer_type_label: dealer.customer_type_label || "",
  });
  const [saving, setSaving] = useState(false);

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const fields: Array<{ label: string; k: keyof typeof form; type?: string }> = [
    { label: "Firmanavn", k: "company_name" },
    { label: "Kontonummer", k: "account_number" },
    { label: "Land", k: "country" },
    { label: "Adresse", k: "address" },
    { label: "Postnr.", k: "postal_code" },
    { label: "By", k: "city" },
    { label: "Email", k: "email", type: "email" },
    { label: "Telefon", k: "phone" },
    { label: "Tildelt sælger (initialer)", k: "assigned_seller_initials" },
    { label: "Forhandlertype", k: "customer_type_label" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 mt-12">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Rediger forhandler</h2>
        <p className="text-xs text-slate-500 mb-4">
          Kun backend kan rette forhandleroplysninger. Ændringer påvirker kun denne forhandlerkonto.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map((f) => (
            <label key={f.k} className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">{f.label}</span>
              <input
                type={f.type || "text"}
                value={form[f.k]}
                onChange={upd(f.k)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100"
          >
            Annullér
          </button>
          <button
            disabled={saving || !form.company_name.trim() || !form.account_number.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                const trim = (s: string) => (s.trim() === "" ? null : s.trim());
                await onSave({
                  company_name: form.company_name.trim(),
                  account_number: form.account_number.trim(),
                  country: trim(form.country),
                  address: trim(form.address),
                  postal_code: trim(form.postal_code),
                  city: trim(form.city),
                  email: trim(form.email),
                  phone: trim(form.phone),
                  assigned_seller_initials: trim(form.assigned_seller_initials),
                  customer_type_label: trim(form.customer_type_label),
                });
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
          >
            {saving ? "Gemmer…" : "Gem ændringer"}
          </button>
        </div>
      </div>
    </div>
  );
}
