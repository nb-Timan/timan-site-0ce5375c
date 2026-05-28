/**
 * Phase 3+4a — "Søg på maskine" read-only.
 * Search by serial_number or machine_number against public.machines (RLS).
 * Shows tabs; Overblik and Service tickets render real data — others are placeholders.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { derivePortalRole } from "@/lib/portalAccess";
import { getPortalBackTarget } from "@/lib/portalBackNav";
import { findMachineByIdentifier, MachineRecord, fetchServiceTicketsForMachine, ServiceTicket, fetchMachineActivityLog, MachineActivityLogRow, fetchMachineDocumentsForMachine, getMachineDocumentSignedUrl, MachineDocumentRow } from "@/lib/machineLifecycleService";
import { Language } from "@/types/configurator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type TabKey =
  | "overview" | "service_history" | "tickets" | "claims" | "warranties"
  | "tsb" | "documents" | "comments" | "internal_notes" | "activity"
  | "parts" | "ai";

const T: Record<string, Record<Language, string>> = {
  back:        { da: "Tilbage til Teknik & Service", en: "Back to Technical & Service", de: "Zurück zu Technik & Service", it: "Torna a Tecnico & Assistenza", hu: "Vissza a Műszaki & Szerviz oldalra" },
  title:       { da: "Søg på maskine", en: "Search machine", de: "Maschine suchen", it: "Cerca macchina", hu: "Gép keresése" },
  lead:        { da: "Find en maskine på serienummer eller maskinnummer.", en: "Find a machine by serial number or machine number.", de: "Maschine über Seriennummer oder Maschinennummer finden.", it: "Trova una macchina tramite numero di serie o numero macchina.", hu: "Keressen gépet gyári szám vagy gép szám alapján." },
  placeholder: { da: "Serienummer / maskinnummer", en: "Serial number / machine number", de: "Seriennummer / Maschinennummer", it: "Numero di serie / numero macchina", hu: "Gyári szám / gép szám" },
  searchBtn:   { da: "Søg", en: "Search", de: "Suchen", it: "Cerca", hu: "Keresés" },
  searching:   { da: "Søger…", en: "Searching…", de: "Suche…", it: "Ricerca…", hu: "Keresés…" },
  notFound:    { da: "Ingen maskine fundet.", en: "No machine found.", de: "Keine Maschine gefunden.", it: "Nessuna macchina trovata.", hu: "Nincs találat." },
  errorMsg:    { da: "Der opstod en fejl. Prøv igen.", en: "Something went wrong. Please try again.", de: "Ein Fehler ist aufgetreten. Bitte erneut versuchen.", it: "Si è verificato un errore. Riprova.", hu: "Hiba történt. Próbálja újra." },

  // Profile labels
  profile:     { da: "Maskinprofil", en: "Machine profile", de: "Maschinenprofil", it: "Profilo macchina", hu: "Gépprofil" },
  serial:      { da: "Serienummer", en: "Serial number", de: "Seriennummer", it: "Numero di serie", hu: "Gyári szám" },
  machineNo:   { da: "Maskinnummer", en: "Machine number", de: "Maschinennummer", it: "Numero macchina", hu: "Gép szám" },
  machineType: { da: "Maskintype", en: "Machine type", de: "Maschinentyp", it: "Tipo macchina", hu: "Gép típusa" },
  model:       { da: "Model", en: "Model", de: "Modell", it: "Modello", hu: "Modell" },
  prodYear:    { da: "Produktionsår", en: "Production year", de: "Baujahr", it: "Anno di produzione", hu: "Gyártási év" },
  dealer:      { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Forgalmazó" },
  customer:    { da: "Kunde", en: "Customer", de: "Kunde", it: "Cliente", hu: "Ügyfél" },
  seller:      { da: "Sælger / ansvarlig", en: "Seller / responsible", de: "Verkäufer / Verantwortlich", it: "Venditore / responsabile", hu: "Értékesítő / felelős" },
  warrantyStart:{ da: "Garantistart", en: "Warranty start", de: "Garantiebeginn", it: "Inizio garanzia", hu: "Garancia kezdete" },
  warrantyEnd: { da: "Garantiudløb", en: "Warranty end", de: "Garantieende", it: "Fine garanzia", hu: "Garancia vége" },
  hours:       { da: "Driftstimer", en: "Operating hours", de: "Betriebsstunden", it: "Ore di funzionamento", hu: "Üzemórák" },

  // Tabs
  tab_overview:        { da: "Overblik",            en: "Overview",          de: "Übersicht",            it: "Panoramica",        hu: "Áttekintés" },
  tab_service_history: { da: "Servicehistorik",     en: "Service history",   de: "Servicehistorie",      it: "Storico assistenza",hu: "Szerviz előzmények" },
  tab_tickets:         { da: "Service tickets",     en: "Service tickets",   de: "Service-Tickets",      it: "Ticket di assistenza", hu: "Szerviz jegyek" },
  tab_claims:          { da: "Claims",              en: "Claims",            de: "Reklamationen",        it: "Reclami",           hu: "Reklamációk" },
  tab_warranties:      { da: "Garantier",           en: "Warranties",        de: "Garantien",            it: "Garanzie",          hu: "Garanciák" },
  tab_tsb:             { da: "TSB",                 en: "TSB",               de: "TSB",                  it: "TSB",               hu: "TSB" },
  tab_documents:       { da: "Dokumenter",          en: "Documents",         de: "Dokumente",            it: "Documenti",         hu: "Dokumentumok" },
  tab_comments:        { da: "Kommentarer",         en: "Comments",          de: "Kommentare",           it: "Commenti",          hu: "Megjegyzések" },
  tab_internal_notes:  { da: "Interne noter",       en: "Internal notes",    de: "Interne Notizen",      it: "Note interne",      hu: "Belső jegyzetek" },
  tab_activity:        { da: "Aktivitetslog",       en: "Activity log",      de: "Aktivitätsprotokoll",  it: "Registro attività", hu: "Tevékenységnapló" },
  tab_parts:           { da: "Reservedelsforbrug",  en: "Spare parts usage", de: "Ersatzteilverbrauch",  it: "Consumo ricambi",   hu: "Alkatrész-felhasználás" },
  tab_ai:              { da: "AI analyse",          en: "AI analysis",       de: "KI-Analyse",           it: "Analisi AI",        hu: "AI elemzés" },

  comingSoon:  { da: "Kommer snart.", en: "Coming soon.", de: "Bald verfügbar.", it: "In arrivo.", hu: "Hamarosan." },

  // Tickets table
  ticketNumber: { da: "Ticketnummer", en: "Ticket number", de: "Ticket-Nr.", it: "Numero ticket", hu: "Jegy szám" },
  ticketTitle:  { da: "Titel", en: "Title", de: "Titel", it: "Titolo", hu: "Cím" },
  ticketStatus: { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Státusz" },
  ticketPriority: { da: "Prioritet", en: "Priority", de: "Priorität", it: "Priorità", hu: "Prioritás" },
  ticketCategory: { da: "Kategori", en: "Category", de: "Kategorie", it: "Categoria", hu: "Kategória" },
  ticketDealer: { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Forgalmazó" },
  ticketCreated:{ da: "Oprettet", en: "Created", de: "Erstellt", it: "Creato", hu: "Létrehozva" },
  ticketAssigned:{ da: "Ansvarlig", en: "Assigned", de: "Zuständig", it: "Assegnato a", hu: "Felelős" },
  noTickets:    { da: "Ingen service tickets fundet for denne maskine.", en: "No service tickets found for this machine.", de: "Keine Service-Tickets für diese Maschine gefunden.", it: "Nessun ticket di assistenza trovato per questa macchina.", hu: "Nincs szerviz jegy ehhez a géphez." },
  ticketsError: { da: "Kunne ikke hente service tickets.", en: "Could not load service tickets.", de: "Service-Tickets konnten nicht geladen werden.", it: "Impossibile caricare i ticket di assistenza.", hu: "Nem sikerült betölteni a szerviz jegyeket." },

  // Activity log
  actDate:        { da: "Dato", en: "Date", de: "Datum", it: "Data", hu: "Dátum" },
  actTitle:       { da: "Titel", en: "Title", de: "Titel", it: "Titolo", hu: "Cím" },
  actDescription: { da: "Beskrivelse", en: "Description", de: "Beschreibung", it: "Descrizione", hu: "Leírás" },
  actType:        { da: "Type", en: "Type", de: "Typ", it: "Tipo", hu: "Típus" },
  actCreatedBy:   { da: "Oprettet af", en: "Created by", de: "Erstellt von", it: "Creato da", hu: "Létrehozta" },
  actEmpty:       { da: "Ingen aktiviteter fundet for denne maskine.", en: "No activities found for this machine.", de: "Keine Aktivitäten für diese Maschine gefunden.", it: "Nessuna attività trovata per questa macchina.", hu: "Nincs tevékenység ehhez a géphez." },
  actError:       { da: "Kunne ikke hente aktivitetslog.", en: "Could not load activity log.", de: "Aktivitätsprotokoll konnte nicht geladen werden.", it: "Impossibile caricare il registro attività.", hu: "Nem sikerült betölteni a tevékenységnaplót." },

  // Documents
  docFile:        { da: "Filnavn", en: "File name", de: "Dateiname", it: "Nome file", hu: "Fájlnév" },
  docType:        { da: "Filtype", en: "File type", de: "Dateityp", it: "Tipo file", hu: "Fájltípus" },
  docRelated:     { da: "Relateret til", en: "Related to", de: "Bezug zu", it: "Relativo a", hu: "Kapcsolódik" },
  docUploaded:    { da: "Uploadet", en: "Uploaded", de: "Hochgeladen", it: "Caricato", hu: "Feltöltve" },
  docUploadedBy:  { da: "Uploadet af", en: "Uploaded by", de: "Hochgeladen von", it: "Caricato da", hu: "Feltöltötte" },
  docVisibility:  { da: "Synlighed", en: "Visibility", de: "Sichtbarkeit", it: "Visibilità", hu: "Láthatóság" },
  docOpen:        { da: "Åbn", en: "Open", de: "Öffnen", it: "Apri", hu: "Megnyit" },
  docEmpty:       { da: "Ingen dokumenter fundet for denne maskine.", en: "No documents found for this machine.", de: "Keine Dokumente für diese Maschine gefunden.", it: "Nessun documento trovato per questa macchina.", hu: "Nincs dokumentum ehhez a géphez." },
  docError:       { da: "Kunne ikke hente dokumenter.", en: "Could not load documents.", de: "Dokumente konnten nicht geladen werden.", it: "Impossibile caricare i documenti.", hu: "Nem sikerült betölteni a dokumentumokat." },
  docOpenError:   { da: "Kunne ikke åbne filen.", en: "Could not open the file.", de: "Datei konnte nicht geöffnet werden.", it: "Impossibile aprire il file.", hu: "Nem sikerült megnyitni a fájlt." },
  docRelTicket:   { da: "Service ticket", en: "Service ticket", de: "Service-Ticket", it: "Ticket di assistenza", hu: "Szerviz jegy" },
  docVisInternal: { da: "Intern", en: "Internal", de: "Intern", it: "Interna", hu: "Belső" },
  docVisDealer:   { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Forgalmazó" },
};

function statusBadgeClasses(status: string): string {
  const s = status.toLowerCase();
  if (s === "created") return "bg-slate-100 text-slate-700";
  if (s === "in_progress") return "bg-blue-100 text-blue-700";
  if (["waiting_timan", "waiting_dealer", "waiting_customer", "waiting_parts"].includes(s)) return "bg-amber-100 text-amber-700";
  if (s === "resolved") return "bg-green-100 text-green-700";
  if (s === "closed") return "bg-slate-100 text-slate-600";
  if (["converted_to_claim", "converted_to_warranty", "converted_to_tsb"].includes(s)) return "bg-purple-100 text-purple-700";
  return "bg-slate-100 text-slate-700";
}

function priorityBadgeClasses(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "low") return "bg-sky-100 text-sky-700";
  if (p === "normal") return "bg-slate-100 text-slate-700";
  if (p === "high") return "bg-orange-100 text-orange-700";
  if (p === "critical_machine_stopped") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function fmtDateShort(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  } catch {
    return v;
  }
}

export default function MachineSearchPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const effectiveUser = useEffectivePortalUser(appUser);

  const portalRole = derivePortalRole(effectiveUser);
  const isInternal = portalRole === "timan_backend" || portalRole === "timan_seller" || portalRole === "timan_service";

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [machine, setMachine] = useState<MachineRecord | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);

  const [activities, setActivities] = useState<MachineActivityLogRow[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<MachineDocumentRow[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  if (!appUser) {
    navigate("/portal", { replace: true });
    return null;
  }

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setMachine(null);
    setTickets([]);
    setTicketsError(null);
    setActiveTab("overview");
    try {
      const result = await findMachineByIdentifier(q);
      setMachine(result);
    } catch (e) {
      console.error("[MachineSearch] supabase error", e);
      setError(T.errorMsg[lang]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch tickets whenever a machine is found
  useEffect(() => {
    if (!machine) {
      setTickets([]);
      setTicketsError(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setTicketsLoading(true);
      setTicketsError(null);
      try {
        const list = await fetchServiceTicketsForMachine(machine.id, machine.serial_number);
        if (!cancelled) setTickets(list);
      } catch (e) {
        console.error("[MachineSearch] tickets load error", e);
        if (!cancelled) setTicketsError(T.ticketsError[lang]);
      } finally {
        if (!cancelled) setTicketsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [machine, lang]);

  // Fetch activity log whenever a machine is found
  useEffect(() => {
    if (!machine) {
      setActivities([]);
      setActivitiesError(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setActivitiesLoading(true);
      setActivitiesError(null);
      try {
        const list = await fetchMachineActivityLog(machine.id, machine.serial_number);
        if (!cancelled) setActivities(list);
      } catch (e) {
        console.error("[MachineSearch] activity log load error", e);
        if (!cancelled) setActivitiesError(T.actError[lang]);
      } finally {
        if (!cancelled) setActivitiesLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [machine, lang]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const dash = "—";
  const fmt = (v: string | number | null | undefined) =>
    v === null || v === undefined || v === "" ? dash : String(v);
  const fmtDate = (v: string | null | undefined) => {
    if (!v) return dash;
    try { return new Date(v).toLocaleDateString(); } catch { return v; }
  };

  const TABS: { key: TabKey; label: string; internalOnly?: boolean }[] = [
    { key: "overview",        label: T.tab_overview[lang] },
    { key: "service_history", label: T.tab_service_history[lang] },
    { key: "tickets",         label: T.tab_tickets[lang] },
    { key: "claims",          label: T.tab_claims[lang] },
    { key: "warranties",      label: T.tab_warranties[lang] },
    { key: "tsb",             label: T.tab_tsb[lang] },
    { key: "documents",       label: T.tab_documents[lang] },
    { key: "comments",        label: T.tab_comments[lang] },
    { key: "internal_notes",  label: T.tab_internal_notes[lang], internalOnly: true },
    { key: "activity",        label: T.tab_activity[lang] },
    { key: "parts",           label: T.tab_parts[lang] },
    { key: "ai",              label: T.tab_ai[lang] },
  ];
  const visibleTabs = TABS.filter(t => !t.internalOnly || isInternal);

  const sellerLabel = (m: MachineRecord) =>
    m.seller_initials || m.seller_email || dash;
  const dealerLabel = (m: MachineRecord) =>
    m.dealer_name || m.dealer_number || dash;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <div className="bg-white border-b border-slate-200 py-3">
        <div className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate(getPortalBackTarget(location.pathname))}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {T.back[lang]}
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2d5a27]/10 text-[#2d5a27]">
            <Search className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{T.title[lang]}</h1>
            <p className="mt-1 text-sm text-slate-500">{T.lead[lang]}</p>
          </div>
        </div>

        {/* Search bar */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-6">
          <div className="max-w-2xl mx-auto flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={T.placeholder[lang]}
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2d5a27]/30 focus:border-[#2d5a27]"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#2d5a27] px-5 py-3 text-sm font-semibold text-white hover:bg-[#234a1f] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? T.searching[lang] : T.searchBtn[lang]}
            </button>
          </div>

          {error && (
            <div className="mt-4 text-center text-sm text-red-600">{error}</div>
          )}
          {!loading && !error && searched && !machine && (
            <div className="mt-4 text-center text-sm text-slate-500">{T.notFound[lang]}</div>
          )}
        </section>

        {/* Machine profile + tabs */}
        {machine && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Header summary */}
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-bold">{fmt(machine.serial_number)}</h2>
                {machine.machine_number && (
                  <span className="text-sm text-slate-500">· {machine.machine_number}</span>
                )}
                {machine.machine_type && (
                  <span className="text-sm text-slate-500">· {machine.machine_type}</span>
                )}
                {machine.model && (
                  <span className="text-sm text-slate-500">· {machine.model}</span>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200 bg-white">
              <nav className="flex flex-wrap gap-1 px-4 py-2">
                {visibleTabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={
                      "px-3 py-2 text-sm rounded-lg transition-colors " +
                      (activeTab === tab.key
                        ? "bg-[#2d5a27] text-white font-semibold"
                        : "text-slate-600 hover:bg-slate-100")
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab content */}
            <div className="p-6">
              {activeTab === "overview" && (
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-sm">
                  <div><dt className="text-slate-500">{T.serial[lang]}</dt><dd className="font-medium">{fmt(machine.serial_number)}</dd></div>
                  <div><dt className="text-slate-500">{T.machineNo[lang]}</dt><dd className="font-medium">{fmt(machine.machine_number)}</dd></div>
                  <div><dt className="text-slate-500">{T.machineType[lang]}</dt><dd className="font-medium">{fmt(machine.machine_type)}</dd></div>
                  <div><dt className="text-slate-500">{T.model[lang]}</dt><dd className="font-medium">{fmt(machine.model)}</dd></div>
                  <div><dt className="text-slate-500">{T.prodYear[lang]}</dt><dd className="font-medium">{fmt(machine.production_year)}</dd></div>
                  <div><dt className="text-slate-500">{T.dealer[lang]}</dt><dd className="font-medium">{dealerLabel(machine)}</dd></div>
                  <div><dt className="text-slate-500">{T.customer[lang]}</dt><dd className="font-medium">{fmt(machine.customer_name)}</dd></div>
                  <div><dt className="text-slate-500">{T.seller[lang]}</dt><dd className="font-medium">{sellerLabel(machine)}</dd></div>
                  <div><dt className="text-slate-500">{T.hours[lang]}</dt><dd className="font-medium">{fmt(machine.current_hours)}</dd></div>
                  <div><dt className="text-slate-500">{T.warrantyStart[lang]}</dt><dd className="font-medium">{fmtDate(machine.warranty_start_date)}</dd></div>
                  <div><dt className="text-slate-500">{T.warrantyEnd[lang]}</dt><dd className="font-medium">{fmtDate(machine.warranty_end_date)}</dd></div>
                </dl>
              )}

              {activeTab === "tickets" && (
                <div>
                  {ticketsLoading ? (
                    <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {T.searching[lang]}
                    </div>
                  ) : ticketsError ? (
                    <div className="py-10 text-center text-sm text-red-600">{ticketsError}</div>
                  ) : tickets.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">{T.noTickets[lang]}</div>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{T.ticketNumber[lang]}</TableHead>
                            <TableHead>{T.ticketTitle[lang]}</TableHead>
                            <TableHead>{T.ticketStatus[lang]}</TableHead>
                            <TableHead>{T.ticketPriority[lang]}</TableHead>
                            <TableHead>{T.ticketCategory[lang]}</TableHead>
                            <TableHead>{T.ticketDealer[lang]}</TableHead>
                            <TableHead>{T.ticketCreated[lang]}</TableHead>
                            <TableHead>{T.ticketAssigned[lang]}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tickets.map(t => (
                            <TableRow key={t.id}>
                              <TableCell className="font-medium">{fmt(t.ticket_number)}</TableCell>
                              <TableCell>{fmt(t.title)}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClasses(t.status)}`}>
                                  {t.status}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${priorityBadgeClasses(t.priority)}`}>
                                  {t.priority}
                                </span>
                              </TableCell>
                              <TableCell>{fmt(t.category)}</TableCell>
                              <TableCell>{fmt(t.dealer_name)}</TableCell>
                              <TableCell>{fmtDateShort(t.created_at)}</TableCell>
                              <TableCell>{fmt(t.assigned_name)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "activity" && (
                <div>
                  {activitiesLoading ? (
                    <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {T.searching[lang]}
                    </div>
                  ) : activitiesError ? (
                    <div className="py-10 text-center text-sm text-red-600">{activitiesError}</div>
                  ) : activities.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">{T.actEmpty[lang]}</div>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{T.actDate[lang]}</TableHead>
                            <TableHead>{T.actTitle[lang]}</TableHead>
                            <TableHead>{T.actDescription[lang]}</TableHead>
                            <TableHead>{T.actType[lang]}</TableHead>
                            <TableHead>{T.actCreatedBy[lang]}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activities.map(a => (
                            <TableRow key={a.id}>
                              <TableCell className="whitespace-nowrap">{fmtDateShort(a.created_at)}</TableCell>
                              <TableCell className="font-medium">
                                {a.title}
                                {a.visibility === "internal" && (
                                  <span className="ml-2 inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                    internal
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-slate-600">{fmt(a.description)}</TableCell>
                              <TableCell className="text-slate-500 text-xs">{a.event_type}</TableCell>
                              <TableCell className="text-slate-600">{fmt(a.created_by_email)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {activeTab !== "overview" && activeTab !== "tickets" && activeTab !== "activity" && (
                <div className="py-10 text-center text-sm text-slate-500">
                  {T.comingSoon[lang]}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
