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
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight, Building2, Mail, MapPin, Phone, GitBranch, Star,
  FileText, ClipboardList, TrendingUp,
  CheckCircle2, AlertCircle, Plus, Pencil,
  Globe, CalendarPlus, PlusCircle, Smartphone, UserCircle2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listDealerContacts, type DealerContact } from "@/lib/dealerContactsService";
import type { Language } from "@/types/configurator";
import { toast } from "sonner";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useCountryFormatter, formatCountry as formatCountryFn } from "@/lib/formatCountry";
import CrmLayout from "@/components/crm/CrmLayout";
import AddressAutocomplete, { type ResolvedAddress } from "@/components/crm/AddressAutocomplete";
import {
  buildPendingGeocodingPatch,
  buildResolvedGeocodingPatch,
  hasUsableDealerAddress,
  requestDealerGeocoding,
} from "@/lib/dealerGeocodingService";
import { derivePortalRole } from "@/lib/portalAccess";
import { isCrmAdmin, isScopedSeller } from "@/lib/crmScope";
import {
  DealerAccount, DealerAccountStats,
  fetchDealerAccounts, fetchDealerAccountStats,
  updateDealerAccount, type UpdateDealerAccountPatch,
  isDealerInactive, dealerLifecycleStatus, resolveActiveDealer, isDealerCustomerAccount,
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
import RegisteredUsersTable from "@/components/portal/RegisteredUsersTable";
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
  open_dealer_data: { da: "Åbn Forhandlerdata", en: "Open dealer data", de: "Händlerdaten öffnen", it: "Apri dati rivenditore", hu: "Kereskedői adatok megnyitása" },
  schedule_meeting: { da: "Planlæg møde", en: "Schedule meeting", de: "Termin planen", it: "Pianifica riunione", hu: "Találkozó ütemezése" },
  tab_overview:     { da: "Overblik", en: "Overview", de: "Übersicht", it: "Panoramica", hu: "Áttekintés" },
  tab_contacts:     { da: "Kontakter", en: "Contacts", de: "Kontakte", it: "Contatti", hu: "Kapcsolatok" },
  tab_activities:   { da: "Aktiviteter", en: "Activities", de: "Aktivitäten", it: "Attività", hu: "Tevékenységek" },
  tab_notes:        { da: "Noter", en: "Notes", de: "Notizen", it: "Note", hu: "Jegyzetek" },
  tab_documents:    { da: "Dokumenter", en: "Documents", de: "Dokumente", it: "Documenti", hu: "Dokumentumok" },
  tab_company:      { da: "Firmaoplysninger", en: "Company info", de: "Firmendaten", it: "Dati azienda", hu: "Cégadatok" },
  tab_users:        { da: "Brugere", en: "Users", de: "Benutzer", it: "Utenti", hu: "Felhasználók" },
  active_portal_users: { da: "Aktive portalbrugere", en: "Active portal users", de: "Aktive Portalbenutzer", it: "Utenti portale attivi", hu: "Aktív portálfelhasználók" },
  registered_contacts: { da: "Registrerede kontaktpersoner", en: "Registered contacts", de: "Registrierte Kontakte", it: "Contatti registrati", hu: "Regisztrált kapcsolatok" },
  open_in_dealer_data: { da: "Åbn Forhandlerdata", en: "Open Dealer Data", de: "Händlerdaten öffnen", it: "Apri Dati Dealer", hu: "Kereskedői adatok megnyitása" },
  users_and_contacts: { da: "Brugere og kontaktpersoner", en: "Users and contacts", de: "Benutzer und Kontakte", it: "Utenti e contatti", hu: "Felhasználók és kapcsolatok" },
  no_contacts:      { da: "Ingen kontaktpersoner registreret.", en: "No contacts registered.", de: "Keine Kontakte registriert.", it: "Nessun contatto registrato.", hu: "Nincs regisztrált kapcsolat." },
  status:           { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Állapot" },
  last_login:       { da: "Sidste login", en: "Last login", de: "Letzter Login", it: "Ultimo accesso", hu: "Utolsó belépés" },
  area:             { da: "Område", en: "Area", de: "Bereich", it: "Area", hu: "Terület" },
  comment:          { da: "Kommentar", en: "Comment", de: "Kommentar", it: "Commento", hu: "Megjegyzés" },
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
  contact_info:     { da: "Firma information", en: "Company information", de: "Firmeninformationen", it: "Informazioni azienda", hu: "Cégadatok" },
  address_line_1:   { da: "Adresse 1", en: "Address line 1", de: "Adresse 1", it: "Indirizzo 1", hu: "Cím 1" },
  address_line_2:   { da: "Adresse 2", en: "Address line 2", de: "Adresse 2", it: "Indirizzo 2", hu: "Cím 2" },
  postal_code:      { da: "Postnummer", en: "Postal code", de: "PLZ", it: "CAP", hu: "Irányítószám" },
  city:             { da: "By", en: "City", de: "Stadt", it: "Città", hu: "Város" },
  master_data:      { da: "Stamdata", en: "Master data", de: "Stammdaten", it: "Dati anagrafici", hu: "Törzsadatok" },
  contact_person:   { da: "Kontaktperson", en: "Contact person", de: "Ansprechpartner", it: "Persona di contatto", hu: "Kapcsolattartó" },
  view_users:       { da: "Se brugere", en: "View users", de: "Benutzer anzeigen", it: "Vedi utenti", hu: "Felhasználók megtekintése" },
  address:          { da: "Adresse", en: "Address", de: "Adresse", it: "Indirizzo", hu: "Cím" },
  country:          { da: "Land", en: "Country", de: "Land", it: "Paese", hu: "Ország" },
  customer_type:    { da: "Forhandlertype", en: "Dealer type", de: "Händlertyp", it: "Tipo dealer", hu: "Kereskedő típus" },
  account_number:   { da: "Kontonummer", en: "Account number", de: "Kundennr.", it: "Numero conto", hu: "Számlaszám" },
  company_name_lbl: { da: "Firmanavn", en: "Company name", de: "Firmenname", it: "Ragione sociale", hu: "Cégnév" },
  assigned_seller:  { da: "Tildelt Timan-sælger", en: "Assigned Timan seller", de: "Zugewiesener Timan-Verkäufer", it: "Venditore Timan assegnato", hu: "Kijelölt Timan értékesítő" },
  created_at_lbl:   { da: "Oprettet", en: "Created", de: "Erstellt", it: "Creato il", hu: "Létrehozva" },
  vat:              { da: "CVR/VAT", en: "VAT", de: "USt-IdNr.", it: "P.IVA", hu: "Adószám" },
  status_lbl:       { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Állapot" },
};
const tl = (k: keyof typeof L, lang: Language): string => L[k][lang] ?? L[k].da;

const CUSTOMER_TYPE_OPTIONS = [
  "Diverse",
  "Forhandler",
  "Service Partner",
  "Importør",
  "Reservedele",
  "Forhandlerkunde",
  "Slutkunde",
  "Leverandør mv.",
  "Lukket kunde",
  "Ansat person enkel",
] as const;

function dealerTypeFromCustomerType(label: string | null): string | null {
  if (label === "Service Partner") return "service_partner";
  if (label === "Importør") return "importer";
  if (!label) return null;
  return "dealer";
}



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
  const { formatCountry } = useCountryFormatter();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [stats, setStats] = useState<Record<string, DealerAccountStats>>({});
  const [users, setUsers] = useState<BackendUser[]>([]);
  const [calendar, setCalendar] = useState<CalendarActivity[]>([]);
  const [notes, setNotes] = useState<DealerNote[]>([]);
  const [dealerContacts, setDealerContacts] = useState<DealerContact[]>([]);
  const [scope, setScope] = useState<"branch" | "group">("branch");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showEditDealer, setShowEditDealer] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("overview");
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

  // Load extra dealer_contacts (sales/workshop/parts/marketing/finance).
  useEffect(() => {
    if (!dealer?.id) { setDealerContacts([]); return; }
    let cancelled = false;
    listDealerContacts(dealer.id).then((rows) => { if (!cancelled) setDealerContacts(rows); });
    return () => { cancelled = true; };
  }, [dealer?.id]);

  useEffect(() => {
    if (!dealer || !admin || searchParams.get("edit") !== "1") return;
    setShowEditDealer(true);
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [dealer, admin, searchParams, setSearchParams]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><span className="text-sm text-slate-500">…</span></div>;
  if (!appUser) return <Navigate to="/portal" replace />;
  if (!canAccess) return <Navigate to="/portal" replace />;

  if (!busy && !dealer) {
    return (
      <CrmLayout pageTitle="Forhandler ikke fundet">
        <div className="bg-white border rounded-xl p-6">
          <p className="text-slate-700">Forhandler {accountNumber} blev ikke fundet eller er ikke tildelt dig.</p>
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
  const dealerCustomers = dealers
    .filter((d) => d.parent_account_number === mainAccountNumber && isDealerCustomerAccount(d))
    .sort((a, b) => (a.branch_name || a.company_name).localeCompare(b.branch_name || b.company_name, "da"));

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

      {isDealerInactive(dealer) && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <span className={
              "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold text-white " +
              (dealer.is_deleted ? "bg-slate-600" : "bg-rose-600")
            }>
              {dealer.is_deleted ? "Lukket" : "Spærret"}
            </span>
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-amber-900">
                Denne forhandler er {dealerLifecycleStatus(dealer) === "closed" ? "lukket" : "spærret"}.
              </p>
              {(() => {
                const byId = new Map(dealers.map((d) => [d.id, d]));
                const successor = dealer.successor_dealer_id
                  ? resolveActiveDealer(dealer.successor_dealer_id, byId)
                  : null;
                return (
                  <>
                    {successor && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="text-slate-700">
                          <span className="font-medium">Efterfølger:</span>{" "}
                          <span className="font-semibold text-slate-900">{successor.company_name}</span>
                        </span>
                        <span className="text-slate-700">
                          <span className="font-medium">Kontonr.:</span>{" "}
                          <span className="font-mono text-slate-900">{successor.account_number}</span>
                        </span>
                        <Link
                          to={`/portal/crm/my-dealers/${successor.account_number}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                        >
                          Åbn efterfølger <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    )}
                    {dealer.closed_reason && (
                      <p className="text-sm text-slate-700">
                        <span className="font-medium">Årsag:</span>{" "}
                        <span className="italic">{dealer.closed_reason}</span>
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {(() => {
        const dealerIdSet = new Set(scopeNumbers
          .map((n) => dealers.find((d) => d.account_number === n)?.id)
          .filter((x): x is string => !!x));
        const scopeLeads = allLeads.filter((l) =>
          (l.linked_dealer_id && (dealerIdSet.has(l.linked_dealer_id) || scopeNumberSet.has(l.linked_dealer_id)))
        );
        const openLeads = scopeLeads.filter((l) => l.pipeline_stage !== "Won" && l.pipeline_stage !== "Lost");
        // Demo leads: match by normalized company / branch name across scope.
        const scopeDealerNames = new Set(
          scopeNumbers
            .map((n) => dealers.find((d) => d.account_number === n))
            .flatMap((d) => d ? [normName(d.company_name), normName(d.branch_name)] : [])
            .filter(Boolean)
        );
        const scopeDemos = allDemos.filter((d) => {
          const nm = normName(d.dealer_company);
          return nm && scopeDealerNames.has(nm);
        });
        const openDemos = scopeDemos.filter((d) => {
          const s = (d.result_status || "").toLowerCase();
          return s !== "won" && s !== "lost" && s !== "closed" && s !== "vundet" && s !== "tabt" && s !== "lukket";
        });
        const budgetTotals = budgetIndex ? aggregateDealerBudget(budgetIndex, scopeNumbers) : null;

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const monthActsCount = activitiesForScope.filter((a) => {
          const d = new Date(a.start_datetime); return d >= monthStart && d < monthEnd;
        }).length;

        return (
          <>
            <ContactHero
              dealer={dealer}
              contacts={dealerContacts}
              lang={lang}
              admin={admin}
              isBranch={isBranch}
              mainDealer={mainDealer ?? null}
              hasGroup={hasGroup}
              scope={scope}
              setScope={setScope}
              branchCount={branchNumbers.length}
              budgetTotals={budgetTotals}
              budgetYear={budgetYear}
              nextFollowup={nextFollowup ? { date: nextFollowup.date, title: nextFollowup.title } : null}
              onAddActivity={() => setShowNoteModal(true)}
              onEdit={() => setShowEditDealer(true)}
            />

            <KpiStrip
              orders={liveOrderCount}
              quotes={liveQuoteCount}
              pipelineValue={livePipelineValue}
              openLeads={openLeads.length}
              openDemos={openDemos.length}
              monthActs={monthActsCount}
              fmtKr={fmtKr}
              dealerName={dealer.branch_name || dealer.company_name || ""}
            />


          </>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto bg-transparent p-0 mb-4 border-b border-slate-200 rounded-none gap-1 w-full justify-start">
          {([
            ["overview", tl("tab_overview", lang)],
            ["dealer_customers", `Forhandlerkunder (${dealerCustomers.length})`],
            ["users", `${tl("tab_users", lang)} (${linkedUsers.length + dealerContacts.length})`],
            ["documents", tl("tab_documents", lang)],
          ] as const).map(([val, label]) => (
            <TabsTrigger
              key={val}
              value={val}
              className="rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-semibold text-slate-500 shadow-none data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent data-[state=active]:text-emerald-700 data-[state=active]:shadow-none hover:text-slate-800"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>


        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* LEFT — Seneste noter (with inline add + full history) */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 flex items-center gap-2">
                  Seneste noter
                  <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal">{notes.length}</span>
                </h3>
                <button onClick={() => setShowNoteModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold">
                  <Plus className="h-3.5 w-3.5" /> {t("add_note")}
                </button>
              </div>
              {notes.length === 0 ? (
                <p className="text-sm text-slate-500">{t("no_notes")}</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {notes.slice(0, 10).map((n) => (
                      <li key={n.id} className="border border-slate-100 rounded-lg p-3 bg-slate-50/50">
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">{NOTE_TYPE_LABEL[n.note_type]}</span>
                            <span>·</span>
                            <span>{fmtDateTime(n.created_at)}</span>
                            <span>·</span>
                            <span>sælger {n.seller_initials || "—"}</span>
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
                  {notes.length > 10 && (
                    <p className="mt-3 text-[11px] text-slate-500">Viser de 10 nyeste af {notes.length} noter.</p>
                  )}
                </>
              )}
            </div>

            {/* RIGHT — Seneste tilbud + Seneste aktiviteter (stacked) */}
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">{tl("recent_quotes", lang)}</h3>
                {dealerQuotesInScope.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-slate-500">{tl("none", lang)}</p>
                ) : (
                  <ul className="text-sm space-y-1.5">
                    {dealerQuotesInScope.slice(0, 5).map(q => (
                      <li key={q.id} className="truncate"><span className="text-slate-500">{fmtDate(quoteMonthIso(q))}:</span> {q.title || q.quote_number || q.id}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">{tl("recent_activities", lang)}</h3>
                {activitiesForScope.slice(0, 5).length === 0 ? (
                  <p className="text-sm text-slate-500">{tl("none", lang)}</p>
                ) : (
                  <ul className="text-sm space-y-1.5">
                    {[...activitiesForScope].sort((a,b)=>b.start_datetime.localeCompare(a.start_datetime)).slice(0,5).map(a => (
                      <li key={a.id} className="truncate"><span className="text-slate-500">{fmtDate(a.start_datetime)}:</span> {a.title || activityTypeMeta(a.activity_type).label.da}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </TabsContent>




        {/* USERS — portal users + registered contact persons */}
        <TabsContent value="dealer_customers" className="mt-0">
          <DealerCustomersPanel
            customers={dealerCustomers}
            stats={stats}
            onOpen={(d) => navigate(`/portal/crm/my-dealers/${d.account_number}`)}
            formatCountry={formatCountry}
          />
        </TabsContent>

        <TabsContent value="users" className="mt-0">
          <UsersAndContactsPanel
            dealer={dealer}
            portalUsers={linkedUsers}
            contacts={dealerContacts}
            lang={lang}
          />
        </TabsContent>




        {/* DOCUMENTS — placeholder until document module exists */}
        <TabsContent value="documents" className="mt-0">
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
            <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">{tl("no_documents", lang)}</p>
          </div>
        </TabsContent>



      </Tabs>


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
          sellers={users.filter((u) =>
            u.is_active &&
            u.approved &&
            (u.role === "timan_seller" || u.role === "timan_backend") &&
            Boolean(u.initials && u.email)
          )}
          onCancel={() => setShowEditDealer(false)}
          onSave={handleSaveDealer}
          onGeocoded={async () => {
            const dRes = await fetchDealerAccounts({ includeDeleted: false });
            setDealers(dRes.rows);
          }}
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

function DealerCustomersPanel({
  customers,
  stats,
  onOpen,
  formatCountry,
}: {
  customers: DealerAccount[];
  stats: Record<string, DealerAccountStats>;
  onOpen: (dealer: DealerAccount) => void;
  formatCountry: (country: string | null | undefined) => string;
}) {
  if (customers.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
        <Building2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Ingen forhandlerkunder tilknyttet denne konto endnu.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Forhandlerkunder</h3>
        <p className="text-xs text-slate-500 mt-1">
          Underkonti koblet til denne hovedkonto. Klik på en kunde for at se deres tilbud, ordrer, aktiviteter og historik.
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {customers.map((customer) => {
          const customerStats = stats[customer.id];
          const location = [customer.postal_code, customer.city].filter(Boolean).join(" ");
          return (
            <button
              key={customer.id}
              type="button"
              onClick={() => onOpen(customer)}
              className="w-full px-5 py-4 text-left hover:bg-emerald-50/40 transition-colors flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900">{customer.branch_name || customer.company_name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Forhandlerkunde</span>
                  <span className="font-mono text-xs text-slate-400">#{customer.account_number}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {location || "-"}{customer.country ? ` · ${formatCountry(customer.country)}` : ""}
                </div>
              </div>
              <div className="shrink-0 grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <div className="font-bold text-slate-900">{customerStats?.quote_count ?? 0}</div>
                  <div className="text-slate-400">Tilbud</div>
                </div>
                <div>
                  <div className="font-bold text-slate-900">{customerStats?.order_count ?? 0}</div>
                  <div className="text-slate-400">Ordrer</div>
                </div>
                <div>
                  <div className="font-bold text-slate-900">{customerStats?.activity_count ?? 0}</div>
                  <div className="text-slate-400">Akt.</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
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
  sellers,
  onCancel,
  onSave,
  onGeocoded,
}: {
  dealer: DealerAccount;
  sellers: BackendUser[];
  onCancel: () => void;
  onSave: (patch: UpdateDealerAccountPatch) => Promise<{ ok: boolean; error?: string }>;
  onGeocoded?: () => void | Promise<void>;
}) {
  const initialSeller = sellers.find((s) =>
    (dealer.assigned_seller_email && s.email.toLowerCase() === dealer.assigned_seller_email.toLowerCase()) ||
    (dealer.assigned_seller_initials && s.initials.toUpperCase() === dealer.assigned_seller_initials.toUpperCase())
  );
  const initialCustomerType = dealer.customer_type_label || dealer.customer_type || "";
  const [form, setForm] = useState({
    company_name: dealer.company_name || "",
    account_number: dealer.account_number || "",
    country: dealer.country || "",
    address: dealer.address || dealer.address_line_1 || "",
    postal_code: dealer.postal_code || "",
    city: dealer.city || "",
    email: dealer.email || "",
    phone: dealer.phone || "",
    seller_id: initialSeller?.id || "",
    assigned_seller_initials: initialSeller?.initials || dealer.assigned_seller_initials || "",
    assigned_seller_name: initialSeller?.name || dealer.assigned_seller_name || "",
    assigned_seller_email: initialSeller?.email || dealer.assigned_seller_email || "",
    customer_type_label: initialCustomerType,
  });
  // Geo captured from Google Places when the user selects a suggestion.
  // Manual typing leaves these null; backend manual geocode panel handles backfill.
  const [geo, setGeo] = useState<{ latitude: number | null; longitude: number | null; google_place_id: string | null }>({
    latitude: dealer.latitude ?? null,
    longitude: dealer.longitude ?? null,
    google_place_id: dealer.google_place_id ?? null,
  });
  const [saving, setSaving] = useState(false);

  const upd = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setText = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function applySeller(sellerId: string) {
    if (!sellerId) {
      setForm((f) => ({
        ...f,
        seller_id: "",
        assigned_seller_initials: "",
        assigned_seller_name: "",
        assigned_seller_email: "",
      }));
      return;
    }
    const selected = sellers.find((s) => s.id === sellerId);
    if (!selected) return;
    setForm((f) => ({
      ...f,
      seller_id: selected.id,
      assigned_seller_initials: selected.initials,
      assigned_seller_name: selected.name,
      assigned_seller_email: selected.email,
    }));
  }

  function applyResolved(r: ResolvedAddress) {
    setForm((f) => ({
      ...f,
      address: r.address_line_1 || r.formatted || f.address,
      postal_code: r.postal_code ?? f.postal_code,
      city: r.city ?? f.city,
      country: r.country ?? f.country,
    }));
    setGeo({ latitude: r.latitude, longitude: r.longitude, google_place_id: r.google_place_id });
  }

  function clearGeo() {
    setGeo({ latitude: null, longitude: null, google_place_id: null });
  }

  const fields: Array<{ label: string; k: keyof typeof form; type?: string }> = [
    { label: "Firmanavn", k: "company_name" },
    { label: "Kontonummer", k: "account_number" },
    { label: "Land", k: "country" },
    { label: "Postnr.", k: "postal_code" },
    { label: "By", k: "city" },
    { label: "Email", k: "email", type: "email" },
    { label: "Telefon", k: "phone" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 mt-12">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Rediger forhandler</h2>
        <p className="text-xs text-slate-500 mb-4">
          Kun backend kan rette forhandleroplysninger. Ændringer påvirker kun denne forhandlerkonto.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Adresse with Google Places autocomplete — spans both columns */}
          <label className="block md:col-span-2">
            <span className="block text-xs font-bold text-slate-600 mb-1">Adresse</span>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => {
                setForm((f) => ({ ...f, address: v }));
                clearGeo();
              }}
              onResolve={applyResolved}
              onGeocodeResolved={applyResolved}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Begynd at skrive adressen…"
              showValidationState
              addressParts={{ address_line_1: form.address, postal_code: form.postal_code, city: form.city, country: form.country }}
            />
            {geo.google_place_id && (
              <span className="mt-1 inline-block text-[10px] text-emerald-700">
                Google-koordinater: {geo.latitude?.toFixed(5)}, {geo.longitude?.toFixed(5)}
              </span>
            )}
          </label>
          {fields.map((f) => (
            <label key={f.k} className="block">
              <span className="block text-xs font-bold text-slate-600 mb-1">{f.label}</span>
              <input
                type={f.type || "text"}
                value={form[f.k]}
                onChange={(e) => {
                  upd(f.k)(e);
                  if (f.k === "postal_code" || f.k === "city" || f.k === "country") clearGeo();
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          ))}
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Tildelt sælger</span>
            <select
              value={form.seller_id}
              onChange={(e) => applySeller(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">Ingen sælger</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.initials} - {seller.name}
                </option>
              ))}
            </select>
            {form.assigned_seller_email && (
              <span className="mt-1 block text-[10px] text-slate-500">{form.assigned_seller_email}</span>
            )}
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-slate-600 mb-1">Forhandlertype</span>
            <select
              value={form.customer_type_label}
              onChange={setText("customer_type_label")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">Ingen kundetype</option>
              {CUSTOMER_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              {form.customer_type_label && !CUSTOMER_TYPE_OPTIONS.includes(form.customer_type_label as typeof CUSTOMER_TYPE_OPTIONS[number]) && (
                <option value={form.customer_type_label}>{form.customer_type_label}</option>
              )}
            </select>
          </label>
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
                const addressChanged =
                  trim(form.address) !== (dealer.address ?? null) ||
                  trim(form.postal_code) !== (dealer.postal_code ?? null) ||
                  trim(form.city) !== (dealer.city ?? null) ||
                  trim(form.country) !== (dealer.country ?? null);
                const patch: UpdateDealerAccountPatch = {
                  company_name: form.company_name.trim(),
                  account_number: form.account_number.trim(),
                  country: trim(form.country),
                  address: trim(form.address),
                  address_line_1: trim(form.address),
                  postal_code: trim(form.postal_code),
                  city: trim(form.city),
                  email: trim(form.email),
                  phone: trim(form.phone),
                  assigned_seller_initials: trim(form.assigned_seller_initials),
                  assigned_seller_name: trim(form.assigned_seller_name),
                  assigned_seller_email: trim(form.assigned_seller_email),
                  dealer_type: dealerTypeFromCustomerType(trim(form.customer_type_label)),
                  customer_type: trim(form.customer_type_label),
                  customer_type_label: trim(form.customer_type_label),
                };
                const addressParts = {
                  address: form.address,
                  postal_code: form.postal_code,
                  city: form.city,
                  country: form.country,
                };
                const resolvedPatch = buildResolvedGeocodingPatch(geo);
                if (resolvedPatch) {
                  Object.assign(patch, resolvedPatch);
                } else if (addressChanged) {
                  Object.assign(patch, buildPendingGeocodingPatch(hasUsableDealerAddress(addressParts)));
                }
                const saved = await onSave(patch);
                if (saved.ok && addressChanged && !resolvedPatch && hasUsableDealerAddress(addressParts)) {
                  const geocoded = await requestDealerGeocoding(dealer.id);
                  if (!geocoded.ok) {
                    toast.error(`Forhandleren blev gemt, men geokodning fejlede: ${geocoded.error}`);
                  } else {
                    await onGeocoded?.();
                  }
                }
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

// ============================================================================
// ContactHero — top-of-page card for sellers on the go
// ============================================================================

interface HeroAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}

function ContactHero({
  dealer,
  contacts,
  lang,
  admin,
  isBranch,
  mainDealer,
  hasGroup,
  scope,
  setScope,
  branchCount,
  budgetTotals,
  budgetYear,
  nextFollowup,
  onAddActivity,
  onEdit,
}: {
  dealer: DealerAccount;
  contacts: DealerContact[];
  lang: Language;
  admin: boolean;
  isBranch: boolean;
  mainDealer: DealerAccount | null;
  hasGroup: boolean;
  scope: "branch" | "group";
  setScope: (s: "branch" | "group") => void;
  branchCount: number;
  budgetTotals: ReturnType<typeof aggregateDealerBudget> | null;
  budgetYear: number;
  nextFollowup: { date: string; title: string } | null;
  onAddActivity: () => void;
  onEdit: () => void;
}) {
  const primaryRow = contacts.find((c) => c.is_primary) || null;
  const primaryName =
    primaryRow?.name || dealer.primary_contact_name || dealer.sales_contact_name || null;
  const primaryEmail =
    primaryRow?.email || dealer.primary_contact_email || dealer.sales_contact_email || null;
  const primaryPhone =
    primaryRow?.phone || dealer.primary_contact_phone || dealer.sales_contact_phone || null;

  // Fallbacks: action cards use company-level data if no primary contact.
  const callPhone = primaryPhone || dealer.phone || null;
  const mailAddr  = primaryEmail || dealer.email || null;

  const addressLine = [dealer.address_line_1 || dealer.address, dealer.address_line_2, dealer.postal_code, dealer.city, dealer.country]
    .filter(Boolean).join(", ");
  const hasCoords = typeof dealer.latitude === "number" && typeof dealer.longitude === "number";
  const mapsHref = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${dealer.latitude},${dealer.longitude}`
    : addressLine
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressLine)}`
      : undefined;
  const websiteHref = dealer.website
    ? (dealer.website.startsWith("http") ? dealer.website : `https://${dealer.website}`)
    : undefined;

  // Only include actions whose data exists.
  const actionsAll: HeroAction[] = [
    callPhone ? { key: "call",   label: tl("call", lang),          icon: <Phone className="h-5 w-5" />,        href: `tel:${callPhone}` } : null,
    mailAddr  ? { key: "mail",   label: tl("send_mail", lang),     icon: <Mail className="h-5 w-5" />,         href: `mailto:${mailAddr}` } : null,
    mapsHref  ? { key: "route",  label: tl("directions", lang),    icon: <MapPin className="h-5 w-5" />,       href: mapsHref } : null,
    websiteHref ? { key: "web",  label: tl("website", lang),       icon: <Globe className="h-5 w-5" />,        href: websiteHref } : null,
    { key: "dealerdata", label: tl("open_dealer_data", lang), icon: <FileText className="h-5 w-5" />,   href: `/portal/dealer-data?accountNumber=${encodeURIComponent(dealer.account_number)}` },
    { key: "activity", label: tl("new_activity", lang),     icon: <PlusCircle className="h-5 w-5" />,   onClick: onAddActivity },
  ].filter(Boolean) as HeroAction[];
  const actions = actionsAll;

  const initials = (dealer.company_name || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?";

  const budgetPct = budgetTotals && !budgetTotals.noBudget ? classifyBudgetStatus(budgetTotals).pct : null;
  const langBadge = (dealer as unknown as { preferred_language?: string }).preferred_language || lang;

  return (
    <div className="mb-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="min-w-0">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 truncate">
            {dealer.branch_name || dealer.company_name}
          </h2>
          <div className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="font-mono">#{dealer.account_number}</span>
            <span>·</span>
            <span>{dealer.customer_type_label || dealer.customer_type || "—"}</span>
            {dealer.country && <><span>·</span><span>{formatCountryFn(dealer.country, lang)}</span></>}
            <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
              {tl("status_active", lang)}
            </span>
            {isBranch && mainDealer && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                <GitBranch className="h-3 w-3" /> Filial · {mainDealer.company_name}
              </span>
            )}
            {dealer.is_main_account && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-200">
                <Star className="h-3 w-3" /> Hovedkonto
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasGroup && (
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 text-xs">
              <button onClick={() => setScope("branch")}
                className={`px-2.5 py-1 rounded-md font-semibold ${scope==="branch" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
                Filial
              </button>
              <button onClick={() => setScope("group")}
                className={`px-2.5 py-1 rounded-md font-semibold ${scope==="group" ? "bg-white shadow text-slate-900" : "text-slate-600"}`}>
                Gruppe ({branchCount})
              </button>
            </div>
          )}
          {admin && (
            <button onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-1.5 text-xs font-bold">
              <Pencil className="h-3.5 w-3.5" /> Rediger forhandler
            </button>
          )}
          {budgetTotals && (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 min-w-[180px]">
              <div className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Budget YTD {budgetYear}</div>
              {budgetTotals.noBudget ? (
                <div className="text-xs text-slate-500 mt-0.5">Intet budget</div>
              ) : (
                <div className="text-sm font-bold text-slate-900 mt-0.5 flex items-baseline gap-1.5">
                  <span>{Math.round(budgetTotals.ytdRealisedQty)}/{Math.round(budgetTotals.ytdBudgetQty)} stk.</span>
                  <span className="text-xs text-emerald-700">{budgetPct}%</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Hero card — focus on company contact information */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-5 items-start">
          {/* Company contact information */}
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-base font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">{tl("contact_info", lang)}</div>
              <div className="space-y-1 text-xs text-slate-700">
                {addressLine && (
                  <div className="flex items-start gap-1.5"><MapPin className="h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0" /><span className="truncate">{addressLine}</span></div>
                )}
                {dealer.phone && (
                  <div className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" /><a href={`tel:${dealer.phone}`} className="hover:underline">{dealer.phone}</a></div>
                )}
                {dealer.email && (
                  <div className="flex items-center gap-1.5 min-w-0"><Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" /><a href={`mailto:${dealer.email}`} className="truncate hover:underline">{dealer.email}</a></div>
                )}
                {websiteHref && (
                  <div className="flex items-center gap-1.5 min-w-0"><Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" /><a href={websiteHref} target="_blank" rel="noreferrer" className="truncate hover:underline">{dealer.website}</a></div>
                )}
                {!dealer.phone && !dealer.email && !addressLine && (
                  <div className="text-slate-400 italic">—</div>
                )}
              </div>
              {(() => {
                

                const sellerName = dealer.assigned_seller_name || dealer.assigned_seller_initials || null;
                const contractStart = dealer.source_created_at || null;
                const contractUpdated = (dealer as unknown as { source_changed_at?: string; updated_at?: string }).source_changed_at
                  || (dealer as unknown as { updated_at?: string }).updated_at
                  || null;

                let followupNode: React.ReactNode = <span className="italic text-slate-400">Ingen opfølgning planlagt</span>;
                if (nextFollowup) {
                  const today = new Date(); today.setHours(0,0,0,0);
                  const tgt = new Date(nextFollowup.date); tgt.setHours(0,0,0,0);
                  const diff = (tgt.getTime() - today.getTime()) / (1000*60*60*24);
                  const cls = diff < 0
                    ? "text-rose-700"
                    : diff === 0 ? "text-amber-700" : "text-emerald-700";
                  followupNode = (
                    <span className={`font-semibold ${cls}`}>
                      {fmtDate(nextFollowup.date)} · <span className="font-normal">{nextFollowup.title}</span>
                    </span>
                  );
                }

                const rows: Array<{ label: string; value: React.ReactNode }> = [
                  { label: tl("language", lang), value: String(langBadge).toUpperCase() },
                ];

                if (sellerName) rows.push({ label: tl("assigned_seller", lang), value: sellerName });
                if (contractStart) rows.push({ label: "Kontraktstart", value: fmtDate(contractStart) });
                if (contractUpdated) rows.push({ label: "Senest opdateret", value: fmtDate(contractUpdated) });
                rows.push({ label: t("next_followup"), value: followupNode });

                return (
                  <ul className="mt-2 space-y-1 text-xs">
                    {rows.map((r, i) => (
                      <li key={i} className="flex items-baseline gap-2">
                        <span className="text-slate-500 min-w-[140px]">{r.label}:</span>
                        <span className="text-slate-800">{r.value}</span>
                      </li>
                    ))}
                  </ul>
                );
              })()}
              {primaryName && (
                <div className="mt-2 text-[11px] text-slate-500">
                  {tl("contact_person", lang)}: <span className="font-semibold text-slate-700">{primaryName}</span>
                </div>
              )}
            </div>
          </div>



          {/* Action cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {actions.map((a) => {
              const cls = `flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-white px-2 py-3 text-center transition ${
                a.disabled
                  ? "border-slate-200 text-slate-300 cursor-not-allowed"
                  : "border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40 hover:shadow-sm"
              }`;
              const inner = (
                <>
                  <span className={`flex items-center justify-center w-9 h-9 rounded-lg ${a.disabled ? "bg-slate-50 text-slate-300" : "bg-emerald-50 text-emerald-700"}`}>
                    {a.icon}
                  </span>
                  <span className="text-[11px] font-semibold leading-tight">{a.label}</span>
                </>
              );
              if (a.disabled) return <button key={a.key} disabled className={cls}>{inner}</button>;
              if (a.href) return <a key={a.key} href={a.href} target={a.key === "route" || a.key === "web" ? "_blank" : undefined} rel="noreferrer" className={cls}>{inner}</a>;
              return <button key={a.key} onClick={a.onClick} className={cls}>{inner}</button>;
            })}
          </div>
        </div>



      </div>
    </div>
  );
}


// ============================================================================
// KpiStrip — single horizontal strip
// Order: Orders, Quotes, Leads + Demos (combined), Activities this month, Pipeline
// ============================================================================
function KpiStrip({
  orders, quotes, pipelineValue, openLeads, openDemos, monthActs, fmtKr, dealerName,
}: {
  orders: number; quotes: number; pipelineValue: number;
  openLeads: number; openDemos: number; monthActs: number;
  fmtKr: (n: number) => string;
  dealerName?: string;
}) {
  const dq = dealerName ? `?dealer=${encodeURIComponent(dealerName)}` : "";
  const cols: Array<{ key: string; label: string; value: React.ReactNode; icon: React.ReactNode; tint: string; link?: { href: string; label: string }; emphasis?: boolean }> = [
    { key: "orders",   label: "Ordrer", value: String(orders), icon: <FileText className="h-4 w-4" />, tint: "bg-emerald-100 text-emerald-700", link: { href: `/portal/crm/orders${dq}`, label: "Se ordrer →" } },
    { key: "quotes",   label: "Tilbud", value: String(quotes), icon: <FileText className="h-4 w-4" />, tint: "bg-sky-100 text-sky-700", link: { href: `/portal/crm/quotes${dq}`, label: "Se tilbud →" } },
    {
      key: "leads", label: "Åbne leads + Demo leads", tint: "bg-amber-100 text-amber-700",
      icon: <TrendingUp className="h-4 w-4" />,
      value: (
        <div className="text-sm font-bold text-slate-900 leading-tight space-y-0.5">
          <div><span className="text-2xl">{openLeads}</span> <span className="text-xs font-semibold text-slate-500">åbne leads</span></div>
          <div><span className="text-2xl">{openDemos}</span> <span className="text-xs font-semibold text-slate-500">demo leads</span></div>
        </div>
      ),
      link: { href: `/portal/crm/leads${dq}`, label: "Se leads →" },
    },
    { key: "acts",     label: "Aktiviteter denne måned", value: String(monthActs), icon: <ClipboardList className="h-4 w-4" />, tint: "bg-violet-100 text-violet-700", link: { href: `/portal/crm/activities${dq}`, label: "Se aktiviteter →" } },
    { key: "pipeline", label: "Pipeline", value: pipelineValue > 0 ? fmtKr(pipelineValue) : "—", icon: <TrendingUp className="h-4 w-4" />, tint: "bg-emerald-100 text-emerald-700", emphasis: true },
  ];


  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-4 overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 lg:divide-x divide-slate-100">
        {cols.map((c) => (
          <div key={c.key} className="p-4 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`flex items-center justify-center w-7 h-7 rounded-lg ${c.tint}`}>{c.icon}</span>
              <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 truncate">{c.label}</span>
            </div>
            {typeof c.value === "string"
              ? <div className={`text-2xl font-bold leading-none ${c.emphasis ? "text-emerald-700" : "text-slate-900"}`}>{c.value}</div>
              : c.value}
            {c.link && (
              <Link to={c.link.href} className="mt-2 inline-block text-[11px] font-semibold text-emerald-700 hover:underline">{c.link.label}</Link>

            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// ContactsList — primary + dealer_accounts roles + extra dealer_contacts
// ============================================================================

interface ContactCardRow {
  area: string;
  name: string | null;
  role?: string | null;
  email: string | null;
  phone: string | null;
}

function ContactsList({
  dealer,
  extraContacts,
  lang,
}: {
  dealer: DealerAccount;
  extraContacts: DealerContact[];
  lang: Language;
}) {
  const rows: ContactCardRow[] = [
    { area: tl("area_primary", lang),   name: dealer.primary_contact_name,   email: dealer.primary_contact_email,   phone: dealer.primary_contact_phone },
    { area: tl("area_sales", lang),     name: dealer.sales_contact_name,     email: dealer.sales_contact_email,     phone: dealer.sales_contact_phone },
    { area: tl("area_workshop", lang),  name: dealer.workshop_contact_name,  email: dealer.workshop_contact_email,  phone: dealer.workshop_contact_phone },
    { area: tl("area_marketing", lang), name: dealer.marketing_contact_name, email: dealer.marketing_contact_email, phone: dealer.marketing_contact_phone },
    { area: tl("area_finance", lang),   name: dealer.finance_contact_name,   email: dealer.finance_contact_email,   phone: dealer.finance_contact_phone },
  ].filter((r) => r.name || r.email || r.phone);

  for (const c of extraContacts) {
    rows.push({
      area: tl(("area_" + c.contact_area) as keyof typeof L, lang),
      name: c.name,
      role: c.role_title,
      email: c.email,
      phone: c.phone,
    });
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 text-sm text-slate-500">
        {tl("no_primary", lang)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((r, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-[10px] uppercase tracking-wide font-bold text-slate-500 mb-1">{r.area}</div>
          <div className="flex items-center gap-2 mb-1">
            <UserCircle2 className="h-5 w-5 text-slate-400" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{r.name || "—"}</div>
              {r.role && <div className="text-xs text-slate-500 truncate">{r.role}</div>}
            </div>
          </div>
          <div className="text-xs space-y-0.5">
            {r.phone && <div className="text-slate-700"><Phone className="inline h-3 w-3 mr-1 text-slate-400" />{r.phone}</div>}
            {r.email && <div className="text-slate-700 truncate"><Mail className="inline h-3 w-3 mr-1 text-slate-400" />{r.email}</div>}
          </div>
          <div className="mt-2 flex gap-2">
            {r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-1 text-[11px] font-bold hover:bg-emerald-100"><Phone className="h-3 w-3" />{tl("call", lang)}</a>}
            {r.email && <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800 px-2 py-1 text-[11px] font-bold hover:bg-emerald-100"><Mail className="h-3 w-3" />{tl("send_mail", lang)}</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

// Suppress unused-import warning for Smartphone — kept for future mobile-specific UI.
void Smartphone;

// ============================================================================
// UsersAndContactsPanel — unified "Registrerede brugere" list
// (portal users + dealer_contacts, deduped by email)
// ============================================================================
function UsersAndContactsPanel({
  dealer, portalUsers, contacts, lang,
}: {
  dealer: DealerAccount;
  portalUsers: BackendUser[];
  contacts: DealerContact[];
  lang: Language;
}) {
  const dealerDataHref = dealer.account_number
    ? `/portal/dealer-data?accountNumber=${encodeURIComponent(dealer.account_number)}#users`
    : "/portal/dealer-data#users";

  const total = portalUsers.length + contacts.length;
  void lang;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Registrerede brugere ({total})
        </h3>
        <Link
          to={dealerDataHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold"
        >
          {tl("open_in_dealer_data", lang)} →
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <RegisteredUsersTable portalUsers={portalUsers} contacts={contacts} />
      </div>
    </div>
  );
}
