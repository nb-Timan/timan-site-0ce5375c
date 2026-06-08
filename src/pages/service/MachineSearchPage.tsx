/**
 * Phase 3+4a — "Søg på maskine" read-only.
 * Search by serial_number or machine_number against public.machines (RLS).
 * Shows tabs; Overblik and Service tickets render real data — others are placeholders.
 */
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { derivePortalRole } from "@/lib/portalAccess";
import { goBackOrFallback } from "@/lib/portalBackNav";
import { findMachineByIdentifier, MachineRecord, fetchServiceTicketsForMachine, ServiceTicket, fetchMachineActivityLog, MachineActivityLogRow, fetchMachineDocumentsForMachine, getMachineDocumentSignedUrl, MachineDocumentRow, fetchServiceHistoryForMachine, ServiceRegistrationRow, fetchServiceRegistrationParts, ServiceRegistrationPartRow } from "@/lib/machineLifecycleService";
import { searchMachinesByIdentifier, type MachineSearchHit, type MachineSearchDebug, listAccessibleMachines, type MachineOverviewRow } from "@/lib/machineJournalService";
import { buildJournalScope } from "@/lib/machineJournalScope";
import { Language } from "@/types/configurator";
import { t as tt } from "@/lib/i18n/translations";
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

  // Service history
  shDate:         { da: "Servicedato", en: "Service date", de: "Servicedatum", it: "Data assistenza", hu: "Szerviz dátuma" },
  shHours:        { da: "Driftstimer", en: "Operating hours", de: "Betriebsstunden", it: "Ore di funzionamento", hu: "Üzemórák" },
  shInterval:     { da: "Serviceinterval", en: "Service interval", de: "Serviceintervall", it: "Intervallo assistenza", hu: "Szerviz intervallum" },
  shTechnician:   { da: "Tekniker", en: "Technician", de: "Techniker", it: "Tecnico", hu: "Szerelő" },
  shDealer:       { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Forgalmazó" },
  shPlanCompleted:{ da: "Serviceplan udført", en: "Service plan completed", de: "Serviceplan ausgeführt", it: "Piano assistenza completato", hu: "Szerviz terv elvégezve" },
  shTotal:        { da: "Totalpris", en: "Total price", de: "Gesamtpreis", it: "Prezzo totale", hu: "Végösszeg" },
  shPartsNotes:   { da: "Reservedele / noter", en: "Spare parts / notes", de: "Ersatzteile / Notizen", it: "Ricambi / note", hu: "Alkatrészek / jegyzetek" },
  shYes:          { da: "Ja", en: "Yes", de: "Ja", it: "Sì", hu: "Igen" },
  shNo:           { da: "Nej", en: "No", de: "Nein", it: "No", hu: "Nem" },
  shEmpty:        { da: "Ingen servicehistorik fundet for denne maskine.", en: "No service history found for this machine.", de: "Keine Servicehistorie für diese Maschine gefunden.", it: "Nessuno storico di assistenza trovato per questa macchina.", hu: "Nincs szerviz előzmény ehhez a géphez." },
  shError:        { da: "Kunne ikke hente servicehistorik.", en: "Could not load service history.", de: "Servicehistorie konnte nicht geladen werden.", it: "Impossibile caricare lo storico assistenza.", hu: "Nem sikerült betölteni a szerviz előzményeket." },
  shHoursUnit:    { da: "timer", en: "hours", de: "Std.", it: "ore", hu: "óra" },
  shNotes:        { da: "Bemærkninger", en: "Notes", de: "Notizen", it: "Note", hu: "Megjegyzések" },
  shFaults:       { da: "Fejl fundet", en: "Faults found", de: "Festgestellte Fehler", it: "Difetti riscontrati", hu: "Talált hibák" },
  shSpareParts:   { da: "Reservedele brugt", en: "Spare parts used", de: "Verwendete Ersatzteile", it: "Ricambi utilizzati", hu: "Felhasznált alkatrészek" },
  shKitPrice:     { da: "Servicekit-pris", en: "Service kit price", de: "Servicekit-Preis", it: "Prezzo kit assistenza", hu: "Szerviz kit ára" },
  shExtraPrice:   { da: "Ekstra reservedele-pris", en: "Extra parts price", de: "Preis Zusatzteile", it: "Prezzo ricambi extra", hu: "Extra alkatrészek ára" },
  shPartsList:    { da: "Reservedelsliste", en: "Parts list", de: "Teileliste", it: "Elenco ricambi", hu: "Alkatrészlista" },
  shExpand:       { da: "Vis detaljer", en: "Show details", de: "Details anzeigen", it: "Mostra dettagli", hu: "Részletek" },
  shCollapse:     { da: "Skjul detaljer", en: "Hide details", de: "Details ausblenden", it: "Nascondi dettagli", hu: "Részletek elrejtése" },
  shPartItem:     { da: "Varenr.", en: "Item no.", de: "Artikelnr.", it: "Codice", hu: "Cikkszám" },
  shPartDesc:     { da: "Beskrivelse", en: "Description", de: "Beschreibung", it: "Descrizione", hu: "Leírás" },
  shPartQty:      { da: "Antal", en: "Qty", de: "Menge", it: "Qtà", hu: "Db" },
  shPartUnit:     { da: "Stk-pris", en: "Unit price", de: "Einzelpreis", it: "Prezzo unit.", hu: "Egységár" },
  shPartLine:     { da: "Linjetotal", en: "Line total", de: "Zeilensumme", it: "Totale riga", hu: "Sor összesen" },
  shPartSource:   { da: "Kilde", en: "Source", de: "Quelle", it: "Origine", hu: "Forrás" },
  shSrcKit:       { da: "Servicekit", en: "Service kit", de: "Servicekit", it: "Kit assistenza", hu: "Szerviz kit" },
  shSrcExtra:     { da: "Ekstra", en: "Extra", de: "Zusatz", it: "Extra", hu: "Extra" },

  // Status labels
  st_created: { da: "Oprettet", en: "Created", de: "Erstellt", it: "Creato", hu: "Létrehozva" },
  st_in_progress: { da: "I gang", en: "In progress", de: "In Bearbeitung", it: "In corso", hu: "Folyamatban" },
  st_waiting_timan: { da: "Afventer Timan", en: "Waiting for Timan", de: "Wartet auf Timan", it: "In attesa di Timan", hu: "Timan-ra vár" },
  st_waiting_dealer: { da: "Afventer forhandler", en: "Waiting for dealer", de: "Wartet auf Händler", it: "In attesa del rivenditore", hu: "Forgalmazóra vár" },
  st_waiting_customer: { da: "Afventer kunde", en: "Waiting for customer", de: "Wartet auf Kunden", it: "In attesa del cliente", hu: "Ügyfélre vár" },
  st_waiting_parts: { da: "Afventer reservedele", en: "Waiting for parts", de: "Wartet auf Ersatzteile", it: "In attesa di ricambi", hu: "Alkatrészre vár" },
  st_resolved: { da: "Løst", en: "Resolved", de: "Gelöst", it: "Risolto", hu: "Megoldva" },
  st_closed: { da: "Lukket", en: "Closed", de: "Geschlossen", it: "Chiuso", hu: "Lezárva" },

  // Priority labels
  pr_low: { da: "Lav", en: "Low", de: "Niedrig", it: "Bassa", hu: "Alacsony" },
  pr_normal: { da: "Normal", en: "Normal", de: "Normal", it: "Normale", hu: "Normál" },
  pr_high: { da: "Høj", en: "High", de: "Hoch", it: "Alta", hu: "Magas" },
  pr_critical_machine_stopped: { da: "Kritisk maskinstop", en: "Critical machine stopped", de: "Kritisch / Maschine steht", it: "Critica / macchina ferma", hu: "Kritikus / gép leállt" },

  // Category labels
  cat_engine: { da: "Motor", en: "Engine", de: "Motor", it: "Motore", hu: "Motor" },
  cat_hydraulics: { da: "Hydraulik", en: "Hydraulics", de: "Hydraulik", it: "Idraulica", hu: "Hidraulika" },
  cat_electronics: { da: "Elektronik", en: "Electronics", de: "Elektronik", it: "Elettronica", hu: "Elektronika" },
  cat_remote_control: { da: "Fjernbetjening", en: "Remote control", de: "Fernbedienung", it: "Telecomando", hu: "Távirányító" },
  cat_transmission: { da: "Transmission", en: "Transmission", de: "Getriebe", it: "Trasmissione", hu: "Hajtómű" },
  cat_service: { da: "Service", en: "Service", de: "Service", it: "Assistenza", hu: "Szerviz" },
  cat_spare_part: { da: "Reservedel", en: "Spare part", de: "Ersatzteil", it: "Ricambio", hu: "Alkatrész" },
  cat_software: { da: "Software", en: "Software", de: "Software", it: "Software", hu: "Szoftver" },
  cat_safety: { da: "Sikkerhed", en: "Safety", de: "Sicherheit", it: "Sicurezza", hu: "Biztonság" },
  cat_other: { da: "Andet", en: "Other", de: "Sonstiges", it: "Altro", hu: "Egyéb" },
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

function statusLabel(v: string, lang: Language): string {
  const key = `st_${v}` as keyof typeof T;
  return (T[key]?.[lang] as string | undefined) ?? v;
}
function priorityLabel(v: string, lang: Language): string {
  const key = `pr_${v}` as keyof typeof T;
  return (T[key]?.[lang] as string | undefined) ?? v;
}
function categoryLabel(v: string, lang: Language): string {
  if (!v) return "—";
  const key = `cat_${v}` as keyof typeof T;
  return (T[key]?.[lang] as string | undefined) ?? v;
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

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  try {
    return new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
  } catch {
    return String(v);
  }
}

export default function MachineSearchPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const effectiveUser = useEffectivePortalUser(appUser);

  const portalRole = derivePortalRole(effectiveUser);
  const isInternal = portalRole === "timan_backend" || portalRole === "timan_seller" || portalRole === "timan_service";

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [machine, setMachine] = useState<MachineRecord | null>(null);
  const [crossHits, setCrossHits] = useState<MachineSearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchDebug, setSearchDebug] = useState<MachineSearchDebug | null>(null);
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

  const [serviceHistory, setServiceHistory] = useState<ServiceRegistrationRow[]>([]);
  const [serviceHistoryLoading, setServiceHistoryLoading] = useState(false);
  const [serviceHistoryError, setServiceHistoryError] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyParts, setHistoryParts] = useState<Record<string, ServiceRegistrationPartRow[]>>({});
  const [historyPartsLoading, setHistoryPartsLoading] = useState<Record<string, boolean>>({});

  // ---- Machine Registry Overview (Phase 1) ----
  const [overview, setOverview] = useState<MachineOverviewRow[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewPage, setOverviewPage] = useState(1);
  const PAGE_SIZE_OPTIONS: Array<number | "all"> = [50, 100, 200, 300, 400, "all"];
  const [pageSize, setPageSize] = useState<number | "all">(50);

  useEffect(() => {
    if (!appUser) return;
    let cancelled = false;
    (async () => {
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const scope = await buildJournalScope(appUser, portalRole);
        const rows = await listAccessibleMachines(scope);
        if (!cancelled) setOverview(rows);
      } catch (e) {
        console.error("[MachineSearch] overview load failed", e);
        if (!cancelled) setOverviewError("Kunne ikke hente maskineoversigt.");
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appUser, portalRole]);

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
    setCrossHits([]);
    setTickets([]);
    setTicketsError(null);
    setActiveTab("overview");
    try {
      const scope = await buildJournalScope(appUser, portalRole);
      const result = await findMachineByIdentifier(q);
      // Belt+suspenders: drop machine row that the dealer scope does not allow.
      const allowed = result && (scope.unrestricted
        || (result.dealer_number && scope.dealerNumbers.has(String(result.dealer_number).trim().toLowerCase()))
        || (result.dealer_name && Array.from(scope.dealerNames).some((n) => {
              const h = String(result.dealer_name).trim().toLowerCase();
              return h === n || h.includes(n) || n.includes(h);
            })));
      setMachine(allowed ? result : null);
      // Also probe other sources by serial — surfaces machines that exist
      // only in warranty/service/ticket/claim/TSB sources.
      try {
        const dbg: MachineSearchDebug = {
          searchTerm: "", normalizedQuery: "", role: null, isInternal: false,
          raw: { machines: 0, warranties: 0, serviceRegistrations: 0, tickets: 0, claims: 0, tsb: 0, registry: 0 },
          matched: { machines: 0, warranties: 0, serviceRegistrations: 0, tickets: 0, claims: 0, tsb: 0, registry: 0 },
          warrantiesTotal: 0, warrantiesWithSerial: 0, warrantiesSkippedNoSerial: 0, warrantiesSkippedByScope: 0,
          registryError: null, registrySkippedReason: null, totalHits: 0,
        };
        const hits = await searchMachinesByIdentifier(q, scope, dbg);
        setCrossHits(hits);
        setSearchDebug(dbg);
        // eslint-disable-next-line no-console
        console.info("[MachineSearch] debug", dbg);
      } catch (sErr) {
        console.warn("[MachineSearch] cross-source search failed", sErr);
      }
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

  // Fetch documents whenever a machine is found
  useEffect(() => {
    if (!machine) {
      setDocuments([]);
      setDocumentsError(null);
      return;
    }
    let cancelled = false;
    async function load() {
      setDocumentsLoading(true);
      setDocumentsError(null);
      try {
        const list = await fetchMachineDocumentsForMachine(machine.id, machine.serial_number);
        if (!cancelled) setDocuments(list);
      } catch (e) {
        console.error("[MachineSearch] documents load error", e);
        if (!cancelled) setDocumentsError(T.docError[lang]);
      } finally {
        if (!cancelled) setDocumentsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [machine, lang]);

  // Fetch service history whenever a machine is found
  useEffect(() => {
    if (!machine) {
      setServiceHistory([]);
      setServiceHistoryError(null);
      setExpandedHistoryId(null);
      setHistoryParts({});
      return;
    }
    let cancelled = false;
    async function load() {
      setServiceHistoryLoading(true);
      setServiceHistoryError(null);
      try {
        const list = await fetchServiceHistoryForMachine(machine.id, machine.serial_number);
        if (!cancelled) setServiceHistory(list);
      } catch (e) {
        console.error("[MachineSearch] service history load error", e);
        if (!cancelled) setServiceHistoryError(T.shError[lang]);
      } finally {
        if (!cancelled) setServiceHistoryLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [machine, lang]);

  const handleOpenDocument = async (doc: MachineDocumentRow) => {
    try {
      const url = await getMachineDocumentSignedUrl(doc.storage_bucket, doc.storage_path, 60 * 60);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("[MachineSearch] open document error", e);
      alert(T.docOpenError[lang]);
    }
  };

  const handleToggleHistory = async (reg: ServiceRegistrationRow) => {
    if (expandedHistoryId === reg.id) {
      setExpandedHistoryId(null);
      return;
    }
    setExpandedHistoryId(reg.id);
    if (historyParts[reg.id]) return;
    setHistoryPartsLoading(prev => ({ ...prev, [reg.id]: true }));
    try {
      const parts = await fetchServiceRegistrationParts(reg.id);
      setHistoryParts(prev => ({ ...prev, [reg.id]: parts }));
    } catch (e) {
      console.error("[MachineSearch] service history parts error", e);
    } finally {
      setHistoryPartsLoading(prev => ({ ...prev, [reg.id]: false }));
    }
  };

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
            onClick={() => goBackOrFallback(navigate, location)}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {tt('backToTechnicalService', uiLanguage)}
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2d5a27]/10 text-[#2d5a27]">
            <Search className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{tt('mod_machine_search', uiLanguage)}</h1>
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
          {!loading && !error && searched && !machine && crossHits.length === 0 && (
            <div className="mt-4 text-center text-sm text-slate-500">{T.notFound[lang]}</div>
          )}

          {/* DEV-only debug HUD. Remove once "Søg på maskine" is verified. */}
          {import.meta.env.DEV && searched && !loading && searchDebug && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-mono text-amber-900 space-y-1">
              <div className="font-semibold">[DEV] Machine Search debug</div>
              <div>Search term: <span className="font-bold">{searchDebug.searchTerm || "(empty)"}</span> · normalized: <span className="font-bold">{searchDebug.normalizedQuery || "(empty)"}</span></div>
              <div>Portal role: <span className="font-bold">{String(searchDebug.role)}</span> · internal: <span className="font-bold">{String(searchDebug.isInternal)}</span></div>
              <div>Raw rows fetched per source — machines: {searchDebug.raw.machines}, warranties: {searchDebug.raw.warranties}, serviceRegs: {searchDebug.raw.serviceRegistrations}, tickets: {searchDebug.raw.tickets}, claims: {searchDebug.raw.claims}, tsb: {searchDebug.raw.tsb}, <span className="font-bold">registry: {searchDebug.raw.registry}</span></div>
              <div>Rows matched (after normalized-serial substring filter) — machines: {searchDebug.matched.machines}, warranties: {searchDebug.matched.warranties}, serviceRegs: {searchDebug.matched.serviceRegistrations}, tickets: {searchDebug.matched.tickets}, claims: {searchDebug.matched.claims}, tsb: {searchDebug.matched.tsb}, <span className="font-bold">registry: {searchDebug.matched.registry}</span></div>
              <div>Warranty breakdown — total active: <span className="font-bold">{searchDebug.warrantiesTotal}</span>, with valid serial: <span className="font-bold">{searchDebug.warrantiesWithSerial}</span>, skipped (no serial): {searchDebug.warrantiesSkippedNoSerial}, skipped (scope): {searchDebug.warrantiesSkippedByScope}</div>
              <div>Total deduped hits: <span className="font-bold">{searchDebug.totalHits}</span> · primary machine row: <span className="font-bold">{machine ? "yes" : "no"}</span></div>
              {searchDebug.registryError && <div className="text-red-700">Registry error: {searchDebug.registryError}</div>}
              {searchDebug.registrySkippedReason && <div className="text-amber-700">Registry skipped: {searchDebug.registrySkippedReason}</div>}
            </div>
          )}
        </section>

        {/* ---- Machine Registry Overview (compact table) ---- */}
        {(() => {
          const totalMachines = overview.length;
          const healthyCount = overview.filter(r => r.health === "healthy").length;
          const attentionCount = overview.filter(r => r.health === "needs_attention").length;
          const criticalCount = overview.filter(r => r.health === "critical").length;
          const effectivePageSize = pageSize === "all" ? Math.max(1, totalMachines) : pageSize;
          const totalPages = Math.max(1, Math.ceil(totalMachines / effectivePageSize));
          const page = Math.min(overviewPage, totalPages);
          const sliceStart = (page - 1) * effectivePageSize;
          const sliceEnd = Math.min(totalMachines, sliceStart + effectivePageSize);
          const pageRows = overview.slice(sliceStart, sliceEnd);

          const sourceLabels: Record<string, string> = {
            warranty: "Warranty", service: "Service", ticket: "Ticket",
            claim: "Claim", tsb: "TSB", comment: "Comment",
          };

          const healthMeta = (h: string) => {
            if (h === "critical") return { chip: "bg-red-100 text-red-700", border: "border-l-red-500", label: "Critical" };
            if (h === "needs_attention") return { chip: "bg-amber-100 text-amber-700", border: "border-l-amber-500", label: "Needs Attention" };
            return { chip: "bg-emerald-100 text-emerald-700", border: "border-l-emerald-500", label: "Healthy" };
          };

          return (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {/* KPI bar */}
              {!overviewLoading && totalMachines > 0 && (
                <div className="px-4 py-3 border-b border-slate-200 bg-white grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">Maskiner totalt</div>
                    <div className="text-lg font-bold text-slate-900 leading-tight">{totalMachines}</div>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-emerald-700">Healthy</div>
                    <div className="text-lg font-bold text-emerald-800 leading-tight">{healthyCount}</div>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-amber-700">Needs Attention</div>
                    <div className="text-lg font-bold text-amber-800 leading-tight">{attentionCount}</div>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-red-700">Critical</div>
                    <div className="text-lg font-bold text-red-800 leading-tight">{criticalCount}</div>
                  </div>
                </div>
              )}

              {/* Header / pagination */}
              <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-700">
                  {overviewLoading
                    ? "Indlæser maskiner…"
                    : `${totalMachines} ${totalMachines === 1 ? "maskine" : "maskiner"}`}
                </div>
                {!overviewLoading && totalMachines > PAGE_SIZE && (
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <button onClick={() => setOverviewPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                      className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40">‹</button>
                    <span>Side {page} / {totalPages}</span>
                    <button onClick={() => setOverviewPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40">›</button>
                    <select value={page} onChange={e => setOverviewPage(Number(e.target.value))}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {overviewError && (
                <div className="px-4 py-3 text-sm text-red-600">{overviewError}</div>
              )}

              {overviewLoading ? (
                <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Indlæser…
                </div>
              ) : totalMachines === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">Ingen maskiner i din adgang.</div>
              ) : (
                <>
                  {/* Desktop / wide: compact table */}
                  <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="text-left font-semibold px-3 py-2 w-[120px]">Status</th>
                          <th className="text-left font-semibold px-3 py-2">Serienummer</th>
                          <th className="text-left font-semibold px-3 py-2">Model</th>
                          <th className="text-left font-semibold px-3 py-2">Forhandler</th>
                          <th className="text-left font-semibold px-3 py-2 whitespace-nowrap">Levering</th>
                          <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">Timer</th>
                          <th className="text-left font-semibold px-3 py-2">Seneste aktivitet</th>
                          <th className="text-left font-semibold px-3 py-2">Historik</th>
                          <th className="text-right font-semibold px-3 py-2">Handling</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pageRows.map(row => {
                          const meta = healthMeta(row.health);
                          const openItems: string[] = [];
                          if (row.openTickets > 0) openItems.push(`Ticket ${row.openTickets}`);
                          if (row.openClaims > 0) openItems.push(`Claim ${row.openClaims}`);
                          if (row.openTsb > 0) openItems.push(`TSB ${row.openTsb}`);
                          return (
                            <tr key={row.normalizedSerial}
                              onClick={() => navigate(`/portal/service/machines/${encodeURIComponent(row.serial)}`)}
                              className={`cursor-pointer hover:bg-slate-50 border-l-4 ${meta.border}`}>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>
                                  {meta.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap">{row.serial}</td>
                              <td className="px-3 py-2 text-slate-700">
                                <div className="truncate max-w-[180px]">{row.machineModel || "—"}</div>
                                {row.machineType && row.machineType !== row.machineModel && (
                                  <div className="text-[10px] text-slate-400 truncate max-w-[180px]">{row.machineType}</div>
                                )}
                              </td>
                              <td className="px-3 py-2 text-slate-700 truncate max-w-[180px]">{row.dealerName || "—"}</td>
                              <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{row.deliveryDate ? fmtDateShort(row.deliveryDate) : "—"}</td>
                              <td className="px-3 py-2 text-right text-slate-700 whitespace-nowrap">{row.operatingHours != null ? row.operatingHours : "—"}</td>
                              <td className="px-3 py-2 text-slate-700 truncate max-w-[220px]">{row.latestActivityLabel || "—"}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-1">
                                  {row.sources.map(s => (
                                    <span key={s} className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600">
                                      {sourceLabels[s] ?? s}
                                    </span>
                                  ))}
                                  {openItems.map(o => (
                                    <span key={o} className="inline-flex items-center rounded-full bg-red-50 text-red-700 px-1.5 py-0.5 text-[9px] font-semibold">
                                      {o}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={(e) => { e.stopPropagation(); navigate(`/portal/service/machines/${encodeURIComponent(row.serial)}`); }}
                                  className="inline-flex items-center rounded-md bg-[#2d5a27] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#234a1f] whitespace-nowrap"
                                >
                                  Min Maskine →
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile / narrow: compact cards */}
                  <ul className="lg:hidden divide-y divide-slate-100">
                    {pageRows.map(row => {
                      const meta = healthMeta(row.health);
                      const openItems: string[] = [];
                      if (row.openTickets > 0) openItems.push(`Ticket ${row.openTickets}`);
                      if (row.openClaims > 0) openItems.push(`Claim ${row.openClaims}`);
                      if (row.openTsb > 0) openItems.push(`TSB ${row.openTsb}`);
                      return (
                        <li key={row.normalizedSerial}
                          onClick={() => navigate(`/portal/service/machines/${encodeURIComponent(row.serial)}`)}
                          className={`px-4 py-3 cursor-pointer hover:bg-slate-50 border-l-4 ${meta.border}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.chip}`}>{meta.label}</span>
                              <span className="font-mono text-sm font-semibold text-slate-900 truncate">{row.serial}</span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/portal/service/machines/${encodeURIComponent(row.serial)}`); }}
                              className="shrink-0 inline-flex items-center rounded-md bg-[#2d5a27] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#234a1f]"
                            >Min Maskine →</button>
                          </div>
                          <div className="mt-1 text-xs text-slate-600 truncate">
                            {row.machineModel || "—"}{row.dealerName ? ` · ${row.dealerName}` : ""}
                          </div>
                          <div className="mt-1 text-[11px] text-slate-500 truncate">
                            {row.latestActivityLabel || "—"}
                          </div>
                          {(row.sources.length > 0 || openItems.length > 0) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {row.sources.map(s => (
                                <span key={s} className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-600">{sourceLabels[s] ?? s}</span>
                              ))}
                              {openItems.map(o => (
                                <span key={o} className="inline-flex items-center rounded-full bg-red-50 text-red-700 px-1.5 py-0.5 text-[9px] font-semibold">{o}</span>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          );
        })()}

        {/* Cross-source results: serials found only in warranty/service/ticket/claim/TSB. */}

        {searched && !loading && crossHits.length > 0 && (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
              {crossHits.length} {crossHits.length === 1 ? "resultat" : "resultater"}
            </div>
            <ul className="divide-y divide-slate-100">
              {crossHits.map(h => {
                const sourceLabels: Record<string, string> = {
                  warranty: "Warranty", service: "Service", ticket: "Ticket",
                  claim: "Claim", tsb: "TSB", comment: "Comment",
                };
                return (
                  <li key={h.normalizedSerial} className="px-6 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900">{h.serial}</span>
                        {h.machineType && <span className="text-xs text-slate-500">· {h.machineType}</span>}
                      </div>
                      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-xs text-slate-600">
                        {h.dealerName && (
                          <div><dt className="text-slate-400">Forhandler / nuværende ejer</dt><dd className="font-medium text-slate-800">{h.dealerName}</dd></div>
                        )}
                        {h.deliveryDate && (
                          <div><dt className="text-slate-400">Leveringsdato</dt><dd className="font-medium text-slate-800">{fmtDateShort(h.deliveryDate)}</dd></div>
                        )}
                        {h.operatingHours != null && (
                          <div><dt className="text-slate-400">Driftstimer</dt><dd className="font-medium text-slate-800">{h.operatingHours}</dd></div>
                        )}
                      </dl>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {h.sources.map(s => (
                          <span key={s} className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                            {sourceLabels[s] ?? s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/portal/service/machines/${encodeURIComponent(h.serial)}`)}
                      className="shrink-0 inline-flex items-center rounded-md bg-[#2d5a27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#234a1f]"
                    >
                      Min Maskine →
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

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
                {machine.serial_number && (
                  <button
                    onClick={() => navigate(`/portal/service/machines/${encodeURIComponent(machine.serial_number!)}`)}
                    className="ml-auto inline-flex items-center rounded-md bg-[#2d5a27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#234a1f]"
                  >
                    Min Maskine →
                  </button>
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
                                  {statusLabel(t.status, lang)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${priorityBadgeClasses(t.priority)}`}>
                                  {priorityLabel(t.priority, lang)}
                                </span>
                              </TableCell>
                              <TableCell>{categoryLabel(t.category, lang)}</TableCell>
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

              {activeTab === "documents" && (
                <div>
                  {documentsLoading ? (
                    <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {T.searching[lang]}
                    </div>
                  ) : documentsError ? (
                    <div className="py-10 text-center text-sm text-red-600">{documentsError}</div>
                  ) : documents.filter(d => isInternal || d.visibility !== "internal").length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">{T.docEmpty[lang]}</div>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{T.docFile[lang]}</TableHead>
                            <TableHead>{T.docType[lang]}</TableHead>
                            <TableHead>{T.docRelated[lang]}</TableHead>
                            <TableHead>{T.docUploaded[lang]}</TableHead>
                            <TableHead>{T.docUploadedBy[lang]}</TableHead>
                            <TableHead>{T.docVisibility[lang]}</TableHead>
                            <TableHead className="text-right">{T.docOpen[lang]}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {documents
                            .filter(d => isInternal || d.visibility !== "internal")
                            .map(d => (
                            <TableRow key={d.id}>
                              <TableCell className="font-medium">{d.file_name}</TableCell>
                              <TableCell className="text-slate-500 text-xs">{fmt(d.file_type)}</TableCell>
                              <TableCell className="text-slate-600 text-xs">
                                {d.related_entity_type === "service_ticket" ? T.docRelTicket[lang] : fmt(d.related_entity_type)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{fmtDateShort(d.created_at)}</TableCell>
                              <TableCell className="text-slate-600">{fmt(d.uploaded_by_email)}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${d.visibility === "internal" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-700"}`}>
                                  {d.visibility === "internal" ? T.docVisInternal[lang] : T.docVisDealer[lang]}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <button
                                  onClick={() => handleOpenDocument(d)}
                                  className="inline-flex items-center rounded-md bg-[#2d5a27] px-3 py-1 text-xs font-semibold text-white hover:bg-[#234a1f]"
                                >
                                  {T.docOpen[lang]}
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "service_history" && (
                <div>
                  {serviceHistoryLoading ? (
                    <div className="py-10 flex items-center justify-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {T.searching[lang]}
                    </div>
                  ) : serviceHistoryError ? (
                    <div className="py-10 text-center text-sm text-red-600">{serviceHistoryError}</div>
                  ) : serviceHistory.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">{T.shEmpty[lang]}</div>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{T.shDate[lang]}</TableHead>
                            <TableHead>{T.shHours[lang]}</TableHead>
                            <TableHead>{T.shInterval[lang]}</TableHead>
                            <TableHead>{T.shTechnician[lang]}</TableHead>
                            <TableHead>{T.shDealer[lang]}</TableHead>
                            <TableHead>{T.shPlanCompleted[lang]}</TableHead>
                            <TableHead className="text-right">{T.shTotal[lang]}</TableHead>
                            <TableHead>{T.shPartsNotes[lang]}</TableHead>
                            <TableHead className="text-right"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {serviceHistory.map(reg => {
                            const expanded = expandedHistoryId === reg.id;
                            const parts = historyParts[reg.id] || [];
                            const partsLoading = !!historyPartsLoading[reg.id];
                            const summary = [reg.spare_parts_used, reg.notes].filter(Boolean).join(" — ");
                            return (
                              <React.Fragment key={reg.id}>
                                <TableRow key={reg.id}>
                                  <TableCell className="whitespace-nowrap font-medium">{fmtDateShort(reg.service_date)}</TableCell>
                                  <TableCell>{fmt(reg.operating_hours)}</TableCell>
                                  <TableCell>{reg.service_interval_hours} {T.shHoursUnit[lang]}</TableCell>
                                  <TableCell>{fmt(reg.technician_name)}</TableCell>
                                  <TableCell>{fmt(reg.dealer_name || reg.dealer_number)}</TableCell>
                                  <TableCell>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${reg.service_plan_completed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                                      {reg.service_plan_completed ? T.shYes[lang] : T.shNo[lang]}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right whitespace-nowrap font-medium">{fmtMoney(reg.total_price)}</TableCell>
                                  <TableCell className="text-slate-600 text-xs max-w-[260px] truncate" title={summary}>{summary || dash}</TableCell>
                                  <TableCell className="text-right">
                                    <button
                                      onClick={() => handleToggleHistory(reg)}
                                      className="inline-flex items-center rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      {expanded ? T.shCollapse[lang] : T.shExpand[lang]}
                                    </button>
                                  </TableCell>
                                </TableRow>
                                {expanded && (
                                  <TableRow key={reg.id + "-detail"}>
                                    <TableCell colSpan={9} className="bg-slate-50">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm py-2">
                                        <div>
                                          <div className="text-slate-500">{T.shNotes[lang]}</div>
                                          <div className="font-medium whitespace-pre-wrap">{fmt(reg.notes)}</div>
                                        </div>
                                        <div>
                                          <div className="text-slate-500">{T.shFaults[lang]}</div>
                                          <div className="font-medium whitespace-pre-wrap">{fmt(reg.faults_found)}</div>
                                        </div>
                                        <div>
                                          <div className="text-slate-500">{T.shSpareParts[lang]}</div>
                                          <div className="font-medium whitespace-pre-wrap">{fmt(reg.spare_parts_used)}</div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                          <div>
                                            <div className="text-slate-500">{T.shKitPrice[lang]}</div>
                                            <div className="font-medium">{fmtMoney(reg.total_servicekit_price)}</div>
                                          </div>
                                          <div>
                                            <div className="text-slate-500">{T.shExtraPrice[lang]}</div>
                                            <div className="font-medium">{fmtMoney(reg.total_extra_parts_price)}</div>
                                          </div>
                                          <div>
                                            <div className="text-slate-500">{T.shTotal[lang]}</div>
                                            <div className="font-bold">{fmtMoney(reg.total_price)}</div>
                                          </div>
                                        </div>
                                      </div>
                                      <div className="mt-3">
                                        <div className="text-slate-500 text-sm mb-1">{T.shPartsList[lang]}</div>
                                        {partsLoading ? (
                                          <div className="py-3 flex items-center gap-2 text-xs text-slate-500">
                                            <Loader2 className="h-3 w-3 animate-spin" /> {T.searching[lang]}
                                          </div>
                                        ) : parts.length === 0 ? (
                                          <div className="text-xs text-slate-500 py-2">—</div>
                                        ) : (
                                          <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                                            <Table>
                                              <TableHeader>
                                                <TableRow>
                                                  <TableHead>{T.shPartSource[lang]}</TableHead>
                                                  <TableHead>{T.shPartItem[lang]}</TableHead>
                                                  <TableHead>{T.shPartDesc[lang]}</TableHead>
                                                  <TableHead className="text-right">{T.shPartQty[lang]}</TableHead>
                                                  <TableHead className="text-right">{T.shPartUnit[lang]}</TableHead>
                                                  <TableHead className="text-right">{T.shPartLine[lang]}</TableHead>
                                                </TableRow>
                                              </TableHeader>
                                              <TableBody>
                                                {parts.map(p => (
                                                  <TableRow key={p.id}>
                                                    <TableCell className="text-xs">
                                                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${p.source_type === "servicekit" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-700"}`}>
                                                        {p.source_type === "servicekit" ? T.shSrcKit[lang] : T.shSrcExtra[lang]}
                                                      </span>
                                                    </TableCell>
                                                    <TableCell className="text-xs">{fmt(p.item_number)}</TableCell>
                                                    <TableCell className="text-xs">{fmt(p.description)}</TableCell>
                                                    <TableCell className="text-right">{p.quantity}</TableCell>
                                                    <TableCell className="text-right">{fmtMoney(p.unit_price)}</TableCell>
                                                    <TableCell className="text-right font-medium">{fmtMoney(p.line_total)}</TableCell>
                                                  </TableRow>
                                                ))}
                                              </TableBody>
                                            </Table>
                                          </div>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}

              {activeTab !== "overview" && activeTab !== "tickets" && activeTab !== "activity" && activeTab !== "documents" && activeTab !== "service_history" && (
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
