/**
 * Phase 4c — Service ticket detail (read-only).
 * Fetches a single ticket by ID via RLS-scoped supabase client.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Ticket, Loader2, MessageSquare, Paperclip, Download, FileWarning } from "lucide-react";
import { toast } from "sonner";

import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { Language } from "@/types/configurator";
import {
  fetchServiceTicketById,
  ServiceTicketDetail,
  fetchExternalCommentsForTicket,
  createExternalComment,
  ServiceTicketComment,
  updateServiceTicketFields,
  fetchInternalCommentsForTicket,
  createInternalComment,
  createMachineActivityLog,
  uploadServiceTicketFile,
  fetchMachineDocumentsForTicket,
  getMachineDocumentSignedUrl,
  MachineDocumentRow,
  MAX_UPLOAD_BYTES,
  isAllowedUploadFile,
} from "@/lib/machineLifecycleService";
import { formatDate, formatDateTime } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";



const T: Record<string, Record<Language, string>> = {
  back:      { da: "Tilbage til Service tickets", en: "Back to Service tickets", de: "Zurück zu Service-Tickets", it: "Torna ai ticket di assistenza", hu: "Vissza a szerviz jegyekhez" },
  title:     { da: "Service ticket", en: "Service ticket", de: "Service-Ticket", it: "Ticket di assistenza", hu: "Szerviz jegy" },
  loading:   { da: "Indlæser…", en: "Loading…", de: "Lädt…", it: "Caricamento…", hu: "Betöltés…" },
  notFound:  { da: "Service ticket ikke fundet.", en: "Service ticket not found.", de: "Service-Ticket nicht gefunden.", it: "Ticket di assistenza non trovato.", hu: "Szerviz jegy nem található." },
  loadErr:   { da: "Kunne ikke hente service ticket.", en: "Could not load service ticket.", de: "Service-Ticket konnte nicht geladen werden.", it: "Impossibile caricare il ticket di assistenza.", hu: "Nem sikerült betölteni a szerviz jegyet." },

  // Detail labels
  ticketNumber:  { da: "Ticketnummer", en: "Ticket number", de: "Ticket-Nr.", it: "Numero ticket", hu: "Jegy szám" },
  ticketTitle:   { da: "Titel", en: "Title", de: "Titel", it: "Titolo", hu: "Cím" },
  status:        { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Státusz" },
  priority:      { da: "Prioritet", en: "Priority", de: "Priorität", it: "Priorità", hu: "Prioritás" },
  category:      { da: "Kategori", en: "Category", de: "Kategorie", it: "Categoria", hu: "Kategória" },
  description:   { da: "Beskrivelse", en: "Description", de: "Beschreibung", it: "Descrizione", hu: "Leírás" },
  serial:        { da: "Serienummer", en: "Serial number", de: "Seriennummer", it: "Numero di serie", hu: "Gyári szám" },
  machineType:   { da: "Maskintype", en: "Machine type", de: "Maschinentyp", it: "Tipo macchina", hu: "Gép típusa" },
  dealer:        { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Forgalmazó" },
  customer:      { da: "Kunde / bruger", en: "Customer / user", de: "Kunde / Anwender", it: "Cliente / utente", hu: "Ügyfél / felhasználó" },
  contactPerson: { da: "Kontaktperson", en: "Contact person", de: "Ansprechpartner", it: "Persona di contatto", hu: "Kapcsolattartó" },
  contactEmail:  { da: "Kontaktmail", en: "Contact email", de: "Kontakt-E-Mail", it: "Email di contatto", hu: "Kapcsolat e-mail" },
  phone:         { da: "Telefonnummer", en: "Phone number", de: "Telefonnummer", it: "Numero di telefono", hu: "Telefonszám" },
  operatingHours:{ da: "Driftstimer", en: "Operating hours", de: "Betriebsstunden", it: "Ore di funzionamento", hu: "Üzemórák" },
  created:       { da: "Oprettet", en: "Created", de: "Erstellt", it: "Creato", hu: "Létrehozva" },
  createdBy:     { da: "Oprettet af", en: "Created by", de: "Erstellt von", it: "Creato da", hu: "Létrehozta" },
  assigned:      { da: "Ansvarlig Timan-medarbejder", en: "Assigned Timan staff", de: "Zuständige/r Timan-Mitarbeiter/in", it: "Responsabile Timan", hu: "Felelős Timan munkatárs" },
  closedAt:      { da: "Lukket", en: "Closed", de: "Geschlossen", it: "Chiuso", hu: "Lezárva" },

  // Comments
  commentsTitle:    { da: "Kommentarer", en: "Comments", de: "Kommentare", it: "Commenti", hu: "Megjegyzések" },
  commentsLoading:  { da: "Indlæser kommentarer…", en: "Loading comments…", de: "Kommentare werden geladen…", it: "Caricamento commenti…", hu: "Megjegyzések betöltése…" },
  commentsEmpty:    { da: "Ingen kommentarer endnu.", en: "No comments yet.", de: "Noch keine Kommentare.", it: "Nessun commento.", hu: "Még nincsenek megjegyzések." },
  commentsLoadErr:  { da: "Kunne ikke hente kommentarer.", en: "Could not load comments.", de: "Kommentare konnten nicht geladen werden.", it: "Impossibile caricare i commenti.", hu: "Nem sikerült betölteni a megjegyzéseket." },
  writeComment:     { da: "Skriv kommentar", en: "Write a comment", de: "Kommentar schreiben", it: "Scrivi un commento", hu: "Megjegyzés írása" },
  addComment:       { da: "Tilføj kommentar", en: "Add comment", de: "Kommentar hinzufügen", it: "Aggiungi commento", hu: "Megjegyzés hozzáadása" },
  added:            { da: "Kommentar tilføjet", en: "Comment added", de: "Kommentar hinzugefügt", it: "Commento aggiunto", hu: "Megjegyzés hozzáadva" },
  emptyErr:         { da: "Skriv en kommentar først.", en: "Please write a comment first.", de: "Bitte zuerst einen Kommentar schreiben.", it: "Scrivi prima un commento.", hu: "Először írj egy megjegyzést." },
  saveErr:          { da: "Kunne ikke gemme kommentar.", en: "Could not save comment.", de: "Kommentar konnte nicht gespeichert werden.", it: "Impossibile salvare il commento.", hu: "Nem sikerült menteni a megjegyzést." },
  saving:           { da: "Gemmer…", en: "Saving…", de: "Speichert…", it: "Salvataggio…", hu: "Mentés…" },

  // Internal notes
  internalNotesTitle:   { da: "Interne Timan-noter", en: "Internal Timan notes", de: "Interne Timan-Notizen", it: "Note interne Timan", hu: "Belső Timan jegyzetek" },
  internalNotesLoading: { da: "Indlæser interne noter…", en: "Loading internal notes…", de: "Interne Notizen werden geladen…", it: "Caricamento note interne…", hu: "Belső jegyzetek betöltése…" },
  internalNotesEmpty:   { da: "Ingen interne noter endnu.", en: "No internal notes yet.", de: "Noch keine internen Notizen.", it: "Nessuna nota interna.", hu: "Még nincsenek belső jegyzetek." },
  internalNotesLoadErr: { da: "Kunne ikke hente interne noter.", en: "Could not load internal notes.", de: "Interne Notizen konnten nicht geladen werden.", it: "Impossibile caricare le note interne.", hu: "Nem sikerült betölteni a belső jegyzeteket." },
  writeInternalNote:    { da: "Skriv intern note", en: "Write internal note", de: "Interne Notiz schreiben", it: "Scrivi nota interna", hu: "Belső jegyzet írása" },
  addInternalNote:      { da: "Tilføj intern note", en: "Add internal note", de: "Interne Notiz hinzufügen", it: "Aggiungi nota interna", hu: "Belső jegyzet hozzáadása" },
  internalNoteAdded:    { da: "Intern note tilføjet", en: "Internal note added", de: "Interne Notiz hinzugefügt", it: "Nota interna aggiunta", hu: "Belső jegyzet hozzáadva" },
  internalNoteEmptyErr: { da: "Skriv en intern note først.", en: "Please write an internal note first.", de: "Bitte zuerst eine interne Notiz schreiben.", it: "Scrivi prima una nota interna.", hu: "Először írj egy belső jegyzetet." },
  internalNoteSaveErr:  { da: "Kunne ikke gemme intern note.", en: "Could not save internal note.", de: "Interne Notiz konnte nicht gespeichert werden.", it: "Impossibile salvare la nota interna.", hu: "Nem sikerült menteni a belső jegyzetet." },

  // Edit
  editTitle:        { da: "Opdater sag", en: "Update ticket", de: "Ticket aktualisieren", it: "Aggiorna ticket", hu: "Jegy frissítése" },
  saveChanges:      { da: "Gem ændringer", en: "Save changes", de: "Änderungen speichern", it: "Salva modifiche", hu: "Módosítások mentése" },
  updated:          { da: "Service ticket opdateret", en: "Service ticket updated", de: "Service-Ticket aktualisiert", it: "Ticket di assistenza aggiornato", hu: "Szerviz jegy frissítve" },
  updateErr:        { da: "Kunne ikke opdatere service ticket.", en: "Could not update service ticket.", de: "Service-Ticket konnte nicht aktualisiert werden.", it: "Impossibile aggiornare il ticket.", hu: "Nem sikerült frissíteni a szerviz jegyet." },
  none:             { da: "Ingen", en: "None", de: "Keine", it: "Nessuna", hu: "Nincs" },

  // Status options
  st_created:               { da: "Oprettet", en: "Created", de: "Erstellt", it: "Creato", hu: "Létrehozva" },
  st_in_progress:           { da: "I gang", en: "In progress", de: "In Bearbeitung", it: "In corso", hu: "Folyamatban" },
  st_waiting_timan:         { da: "Afventer Timan", en: "Waiting for Timan", de: "Wartet auf Timan", it: "In attesa di Timan", hu: "Timan-ra vár" },
  st_waiting_dealer:        { da: "Afventer forhandler", en: "Waiting for dealer", de: "Wartet auf Händler", it: "In attesa del rivenditore", hu: "Forgalmazóra vár" },
  st_waiting_customer:      { da: "Afventer kunde", en: "Waiting for customer", de: "Wartet auf Kunden", it: "In attesa del cliente", hu: "Ügyfélre vár" },
  st_waiting_parts:         { da: "Afventer reservedele", en: "Waiting for parts", de: "Wartet auf Ersatzteile", it: "In attesa di ricambi", hu: "Alkatrészre vár" },
  st_resolved:              { da: "Løst", en: "Resolved", de: "Gelöst", it: "Risolto", hu: "Megoldva" },
  st_closed:                { da: "Lukket", en: "Closed", de: "Geschlossen", it: "Chiuso", hu: "Lezárva" },
  st_converted_to_claim:    { da: "Konverteret til claim", en: "Converted to claim", de: "In Claim umgewandelt", it: "Convertito in reclamo", hu: "Claim-mé alakítva" },
  st_converted_to_warranty: { da: "Konverteret til garanti", en: "Converted to warranty", de: "In Garantie umgewandelt", it: "Convertito in garanzia", hu: "Garanciává alakítva" },
  st_converted_to_tsb:      { da: "Konverteret til TSB", en: "Converted to TSB", de: "In TSB umgewandelt", it: "Convertito in TSB", hu: "TSB-vé alakítva" },

  // Priority options
  pr_low:                       { da: "Lav", en: "Low", de: "Niedrig", it: "Bassa", hu: "Alacsony" },
  pr_normal:                    { da: "Normal", en: "Normal", de: "Normal", it: "Normale", hu: "Normál" },
  pr_high:                      { da: "Høj", en: "High", de: "Hoch", it: "Alta", hu: "Magas" },
  pr_critical_machine_stopped:  { da: "Kritisk maskinstop", en: "Critical machine stopped", de: "Kritisch / Maschine steht", it: "Critica / macchina ferma", hu: "Kritikus / gép leállt" },

  // Category options
  cat_engine:         { da: "Motor", en: "Engine", de: "Motor", it: "Motore", hu: "Motor" },
  cat_hydraulics:     { da: "Hydraulik", en: "Hydraulics", de: "Hydraulik", it: "Idraulica", hu: "Hidraulika" },
  cat_electronics:    { da: "Elektronik", en: "Electronics", de: "Elektronik", it: "Elettronica", hu: "Elektronika" },
  cat_remote_control: { da: "Fjernbetjening", en: "Remote control", de: "Fernbedienung", it: "Telecomando", hu: "Távirányító" },
  cat_transmission:   { da: "Transmission", en: "Transmission", de: "Getriebe", it: "Trasmissione", hu: "Hajtómű" },
  cat_service:        { da: "Service", en: "Service", de: "Service", it: "Assistenza", hu: "Szerviz" },
  cat_spare_part:     { da: "Reservedel", en: "Spare part", de: "Ersatzteil", it: "Ricambio", hu: "Alkatrész" },
  cat_software:       { da: "Software", en: "Software", de: "Software", it: "Software", hu: "Szoftver" },
  cat_safety:         { da: "Sikkerhed", en: "Safety", de: "Sicherheit", it: "Sicurezza", hu: "Biztonság" },
  cat_other:          { da: "Andet", en: "Other", de: "Sonstiges", it: "Altro", hu: "Egyéb" },

  // Files / documentation
  filesTitle:        { da: "Filer / dokumentation", en: "Files / documentation", de: "Dateien / Dokumentation", it: "File / documentazione", hu: "Fájlok / dokumentáció" },
  filesEmpty:        { da: "Ingen filer uploadet endnu.", en: "No files uploaded yet.", de: "Noch keine Dateien hochgeladen.", it: "Nessun file caricato.", hu: "Még nincsenek feltöltött fájlok." },
  filesLoading:      { da: "Indlæser filer…", en: "Loading files…", de: "Dateien werden geladen…", it: "Caricamento file…", hu: "Fájlok betöltése…" },
  filesLoadErr:      { da: "Kunne ikke hente filer.", en: "Could not load files.", de: "Dateien konnten nicht geladen werden.", it: "Impossibile caricare i file.", hu: "Nem sikerült betölteni a fájlokat." },
  fileSelect:        { da: "Vælg fil(er) at uploade", en: "Select file(s) to upload", de: "Datei(en) zum Hochladen auswählen", it: "Seleziona file da caricare", hu: "Válassz fájl(oka)t a feltöltéshez" },
  fileUpload:        { da: "Upload", en: "Upload", de: "Hochladen", it: "Carica", hu: "Feltöltés" },
  fileUploading:     { da: "Uploader…", en: "Uploading…", de: "Wird hochgeladen…", it: "Caricamento…", hu: "Feltöltés…" },
  fileUploaded:      { da: "Fil uploadet", en: "File uploaded", de: "Datei hochgeladen", it: "File caricato", hu: "Fájl feltöltve" },
  fileOpen:          { da: "Åbn", en: "Open", de: "Öffnen", it: "Apri", hu: "Megnyitás" },
  fileTooLarge:      { da: "Filen er for stor. Maks 25 MB.", en: "File is too large. Max 25 MB.", de: "Datei ist zu groß. Max. 25 MB.", it: "File troppo grande. Max 25 MB.", hu: "A fájl túl nagy. Max. 25 MB." },
  fileTypeBad:       { da: "Filtypen er ikke tilladt.", en: "File type is not allowed.", de: "Dateityp ist nicht erlaubt.", it: "Tipo di file non consentito.", hu: "A fájltípus nem engedélyezett." },
  fileUploadErr:     { da: "Kunne ikke uploade filen.", en: "Could not upload the file.", de: "Datei konnte nicht hochgeladen werden.", it: "Impossibile caricare il file.", hu: "Nem sikerült feltölteni a fájlt." },
  fileMetaWarn:      { da: "Filen blev gemt, men kunne ikke registreres i databasen.", en: "File was stored but could not be registered in the database.", de: "Datei wurde gespeichert, konnte aber nicht in der Datenbank registriert werden.", it: "Il file è stato salvato ma non registrato nel database.", hu: "A fájl mentésre került, de nem sikerült a regisztrációja." },
  fileSignErr:       { da: "Kunne ikke åbne filen.", en: "Could not open the file.", de: "Datei konnte nicht geöffnet werden.", it: "Impossibile aprire il file.", hu: "Nem sikerült megnyitni a fájlt." },
  fileColName:       { da: "Filnavn", en: "File name", de: "Dateiname", it: "Nome file", hu: "Fájlnév" },
  fileColType:       { da: "Type", en: "Type", de: "Typ", it: "Tipo", hu: "Típus" },
  fileColDate:       { da: "Uploadet", en: "Uploaded", de: "Hochgeladen", it: "Caricato", hu: "Feltöltve" },
  fileColBy:         { da: "Uploadet af", en: "Uploaded by", de: "Hochgeladen von", it: "Caricato da", hu: "Feltöltötte" },
};


const STATUS_VALUES = [
  "created", "in_progress",
  "waiting_timan", "waiting_dealer", "waiting_customer", "waiting_parts",
  "resolved", "closed",
  "converted_to_claim", "converted_to_warranty", "converted_to_tsb",
] as const;
const PRIORITY_VALUES = ["low", "normal", "high", "critical_machine_stopped"] as const;
const CATEGORY_VALUES = [
  "engine", "hydraulics", "electronics", "remote_control", "transmission",
  "service", "spare_part", "software", "safety", "other",
] as const;

const INTERNAL_ROLES = new Set(["timan_backend", "timan_seller", "timan_service"]);


function statusBadgeClasses(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "created") return "bg-slate-100 text-slate-700";
  if (s === "in_progress") return "bg-blue-100 text-blue-700";
  if (["waiting_timan", "waiting_dealer", "waiting_customer", "waiting_parts"].includes(s)) return "bg-amber-100 text-amber-700";
  if (s === "resolved") return "bg-green-100 text-green-700";
  if (s === "closed") return "bg-slate-100 text-slate-600";
  if (s.startsWith("converted_")) return "bg-purple-100 text-purple-700";
  return "bg-slate-100 text-slate-700";
}

function priorityBadgeClasses(priority: string): string {
  const p = (priority || "").toLowerCase();
  if (p === "low") return "bg-sky-100 text-sky-700";
  if (p === "normal") return "bg-slate-100 text-slate-700";
  if (p === "high") return "bg-orange-100 text-orange-700";
  if (p === "critical_machine_stopped") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

export default function ServiceTicketDetailPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const { ticketId } = useParams<{ ticketId: string }>();

  const [ticket, setTicket] = useState<ServiceTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<ServiceTicketComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving] = useState(false);

  // Editable fields (Timan-internal only)
  const [editStatus, setEditStatus] = useState<string>("created");
  const [editPriority, setEditPriority] = useState<string>("normal");
  const [editCategory, setEditCategory] = useState<string>("");
  const [editAssigned, setEditAssigned] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Internal notes (Timan-internal only)
  const [internalNotes, setInternalNotes] = useState<ServiceTicketComment[]>([]);
  const [internalNotesLoading, setInternalNotesLoading] = useState(false);
  const [internalNotesError, setInternalNotesError] = useState<string | null>(null);
  const [newInternalNote, setNewInternalNote] = useState("");
  const [savingInternalNote, setSavingInternalNote] = useState(false);

  // Files / documents
  const [documents, setDocuments] = useState<MachineDocumentRow[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canEdit = INTERNAL_ROLES.has(appUser?.portal_role ?? "");
  const isInternal = canEdit;
  const [converting, setConverting] = useState(false);

  const handleConvertToClaim = async () => {
    if (!ticket || converting) return;
    setConverting(true);
    try {
      const { convertTicketToClaim } = await import('@/lib/claimsService');
      const res = await convertTicketToClaim(
        {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          title: ticket.title,
          description: ticket.description,
          serial_number: ticket.serial_number,
          machine_type: ticket.machine_type,
          dealer_name: ticket.dealer_name,
          customer_name: ticket.customer_name,
          contact_person: ticket.contact_person,
          contact_email: ticket.contact_email,
          contact_phone: ticket.contact_phone,
          category: ticket.category,
          created_by_email: appUser?.email ?? null,
        },
        { mode: isInternal ? 'internal' : 'dealer_request', createdByEmail: appUser?.email ?? null },
      );
      toast.success(
        isInternal ? 'Claim oprettet og åbnet' : 'Claim-ansøgning sendt — afventer servicegodkendelse',
      );
      navigate(`/portal/service/claims/${res.claim.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Kunne ikke konvertere til claim');
    } finally {
      setConverting(false);
    }
  };

  if (!appUser) {
    navigate("/portal", { replace: true });
    return null;
  }

  const loadComments = async (id: string) => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const rows = await fetchExternalCommentsForTicket(id);
      setComments(rows);
    } catch (e) {
      console.error("[ServiceTicketDetail] comments load error", e);
      setCommentsError(T.commentsLoadErr[lang]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const loadInternalNotes = async (id: string) => {
    if (!canEdit) return; // skip for non-internal users
    setInternalNotesLoading(true);
    setInternalNotesError(null);
    try {
      const rows = await fetchInternalCommentsForTicket(id);
      setInternalNotes(rows);
    } catch (e) {
      console.error("[ServiceTicketDetail] internal notes load error", e);
      setInternalNotesError(T.internalNotesLoadErr[lang]);
    } finally {
      setInternalNotesLoading(false);
    }
  };

  const loadDocuments = async (id: string) => {
    setDocsLoading(true);
    setDocsError(null);
    try {
      const rows = await fetchMachineDocumentsForTicket(id);
      setDocuments(rows);
    } catch (e) {
      console.error("[ServiceTicketDetail] documents load error", e);
      setDocsError(T.filesLoadErr[lang]);
    } finally {
      setDocsLoading(false);
    }
  };



  useEffect(() => {
    if (!ticketId) {
      setLoading(false);
      setError(T.notFound[lang]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchServiceTicketById(ticketId);
        if (!cancelled) {
          if (!data) {
            setError(T.notFound[lang]);
          } else {
            setTicket(data);
            setEditStatus(data.status || "created");
            setEditPriority(data.priority || "normal");
            setEditCategory(data.category || "");
            setEditAssigned(data.assigned_name || "");
            await loadComments(ticketId);
            await loadInternalNotes(ticketId);
            await loadDocuments(ticketId);

          }

        }
      } catch (e) {
        console.error("[ServiceTicketDetail] load error", e);
        if (!cancelled) setError(T.loadErr[lang]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticketId, lang]);

  const handleAddComment = async () => {
    if (!ticketId) return;
    const body = newComment.trim();
    if (!body) {
      toast.error(T.emptyErr[lang]);
      return;
    }
    setSaving(true);
    try {
      await createExternalComment({
        ticket_id: ticketId,
        body,
        created_by_email: appUser.email,
        created_by_name: appUser.display_name ?? null,
      });
      // Best-effort activity log
      if (ticket) {
        try {
          await createMachineActivityLog({
            machine_id: ticket.machine_id,
            serial_number: ticket.serial_number,
            event_type: "external_comment_added",
            title: "Kommentar tilføjet",
            description: body.length > 120 ? body.slice(0, 117) + "…" : body,
            related_entity_type: "service_ticket",
            related_entity_id: ticket.id,
            visibility: "dealer_visible",
          });
        } catch (logErr) {
          console.error("[ServiceTicketDetail] activity log (external_comment) failed", logErr);
        }
      }
      setNewComment("");
      toast.success(T.added[lang]);
      await loadComments(ticketId);
    } catch (e) {
      console.error("[ServiceTicketDetail] save comment error", e);
      toast.error(T.saveErr[lang]);
    } finally {
      setSaving(false);
    }
  };

  const handleAddInternalNote = async () => {
    if (!ticketId || !canEdit) return;
    const body = newInternalNote.trim();
    if (!body) {
      toast.error(T.internalNoteEmptyErr[lang]);
      return;
    }
    setSavingInternalNote(true);
    try {
      await createInternalComment({
        ticket_id: ticketId,
        body,
        created_by_email: appUser.email,
        created_by_name: appUser.display_name ?? null,
      });
      if (ticket) {
        try {
          await createMachineActivityLog({
            machine_id: ticket.machine_id,
            serial_number: ticket.serial_number,
            event_type: "internal_note_added",
            title: "Intern note tilføjet",
            description: body.length > 120 ? body.slice(0, 117) + "…" : body,
            related_entity_type: "service_ticket",
            related_entity_id: ticket.id,
            visibility: "internal",
          });
        } catch (logErr) {
          console.error("[ServiceTicketDetail] activity log (internal_note) failed", logErr);
        }
      }
      setNewInternalNote("");
      toast.success(T.internalNoteAdded[lang]);
      await loadInternalNotes(ticketId);
    } catch (e) {
      console.error("[ServiceTicketDetail] save internal note error", e);
      toast.error(T.internalNoteSaveErr[lang]);
    } finally {
      setSavingInternalNote(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!ticket || !ticketId) return;
    const files = e.target.files ? Array.from(e.target.files) : [];
    // Reset native input so the same file can be reselected later
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;

    // Pre-validate all files
    for (const f of files) {
      if (f.size > MAX_UPLOAD_BYTES) { toast.error(T.fileTooLarge[lang]); return; }
      if (!isAllowedUploadFile(f)) { toast.error(T.fileTypeBad[lang]); return; }
    }

    setUploading(true);
    let okCount = 0;
    let metaWarn = false;
    try {
      for (const file of files) {
        try {
          const res = await uploadServiceTicketFile({ ticket, file });
          if (!res.document) {
            metaWarn = true;
          } else {
            okCount += 1;
            // Best-effort activity log
            try {
              await createMachineActivityLog({
                machine_id: ticket.machine_id,
                serial_number: ticket.serial_number,
                event_type: "document_uploaded",
                title: "Dokument uploadet",
                description: file.name,
                related_entity_type: "service_ticket",
                related_entity_id: ticket.id,
                visibility: "dealer_visible",
              });
            } catch (logErr) {
              console.error("[ServiceTicketDetail] activity log (document_uploaded) failed", logErr);
            }
          }
        } catch (err) {
          console.error("[ServiceTicketDetail] upload failed", err);
          const msg = err instanceof Error ? err.message : "";
          if (msg === "file_too_large") toast.error(T.fileTooLarge[lang]);
          else if (msg === "file_type_not_allowed") toast.error(T.fileTypeBad[lang]);
          else toast.error(T.fileUploadErr[lang]);
        }
      }
      if (okCount > 0) toast.success(T.fileUploaded[lang]);
      if (metaWarn) toast.error(T.fileMetaWarn[lang]);
      await loadDocuments(ticketId);
    } finally {
      setUploading(false);
    }
  };

  const handleOpenDocument = async (doc: MachineDocumentRow) => {
    try {
      const url = await getMachineDocumentSignedUrl(doc.storage_bucket, doc.storage_path, 60 * 60);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("[ServiceTicketDetail] signed url error", e);
      toast.error(T.fileSignErr[lang]);
    }
  };



  const reloadTicket = async () => {
    if (!ticketId) return;
    const data = await fetchServiceTicketById(ticketId);
    if (data) {
      setTicket(data);
      setEditStatus(data.status || "created");
      setEditPriority(data.priority || "normal");
      setEditCategory(data.category || "");
      setEditAssigned(data.assigned_name || "");
    }
  };

  const handleSaveEdit = async () => {
    if (!ticketId || !canEdit) return;
    const previousStatus = ticket?.status ?? null;
    setSavingEdit(true);
    try {
      await updateServiceTicketFields(ticketId, {
        status: editStatus,
        priority: editPriority,
        category: editCategory || null,
        assigned_name: editAssigned.trim() || null,
      });
      // Log status change if it actually changed
      if (ticket && previousStatus && previousStatus !== editStatus) {
        try {
          await createMachineActivityLog({
            machine_id: ticket.machine_id,
            serial_number: ticket.serial_number,
            event_type: "service_ticket_status_changed",
            title: "Status ændret",
            description: `Fra ${previousStatus} til ${editStatus}`,
            related_entity_type: "service_ticket",
            related_entity_id: ticket.id,
            visibility: "dealer_visible",
          });
        } catch (logErr) {
          console.error("[ServiceTicketDetail] activity log (status_changed) failed", logErr);
        }
      }
      toast.success(T.updated[lang]);
      await reloadTicket();
    } catch (e) {
      console.error("[ServiceTicketDetail] update error", e);
      toast.error(T.updateErr[lang]);
    } finally {
      setSavingEdit(false);
    }
  };

  const statusLabel = (v: string) => T[`st_${v}`]?.[lang] ?? v;
  const priorityLabel = (v: string) => T[`pr_${v}`]?.[lang] ?? v;
  const categoryLabel = (v: string) => T[`cat_${v}`]?.[lang] ?? v;

  return (

    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <main className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2d5a27]/10 text-[#2d5a27]">
            <Ticket className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{T.title[lang]}</h1>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {T.loading[lang]}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-10 text-center text-sm text-red-600">{error}</div>
        ) : ticket ? (
          <div className="space-y-6">
            {/* Header card */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">{T.ticketNumber[lang]}</p>
                  <p className="text-2xl font-bold text-slate-900">{ticket.ticket_number || ticket.id.slice(0, 8)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={statusBadgeClasses(ticket.status)}>{statusLabel(ticket.status)}</Badge>
                  <Badge className={priorityBadgeClasses(ticket.priority)}>{priorityLabel(ticket.priority)}</Badge>
                  {ticket.category && (
                    <Badge variant="outline">{categoryLabel(ticket.category)}</Badge>
                  )}
                </div>

              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">{ticket.title}</h2>
              {ticket.description && (
                <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{ticket.description}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleConvertToClaim}
                  disabled={converting}
                  className="border-amber-300 text-amber-800 hover:bg-amber-50"
                >
                  <FileWarning className="h-4 w-4 mr-2" />
                  {converting
                    ? 'Opretter…'
                    : isInternal
                      ? 'Konverter til claim'
                      : 'Ansøg om claim fra sag'}
                </Button>
              </div>
            </div>

            {/* Two-column detail grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Machine / Customer */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{T.serial[lang]} / {T.machineType[lang]}</h3>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{T.serial[lang]}</span>
                    <span className="font-mono font-medium">{ticket.serial_number}</span>
                  </div>
                  {ticket.machine_type && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.machineType[lang]}</span>
                      <span className="font-medium">{ticket.machine_type}</span>
                    </div>
                  )}
                  {ticket.dealer_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.dealer[lang]}</span>
                      <span className="font-medium">{ticket.dealer_name}</span>
                    </div>
                  )}
                  {ticket.customer_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.customer[lang]}</span>
                      <span className="font-medium">{ticket.customer_name}</span>
                    </div>
                  )}
                  {ticket.contact_person && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.contactPerson[lang]}</span>
                      <span className="font-medium">{ticket.contact_person}</span>
                    </div>
                  )}
                  {ticket.contact_email && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.contactEmail[lang]}</span>
                      <span className="font-medium">{ticket.contact_email}</span>
                    </div>
                  )}
                  {ticket.contact_phone && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.phone[lang]}</span>
                      <span className="font-medium">{ticket.contact_phone}</span>
                    </div>
                  )}
                  {ticket.operating_hours !== null && ticket.operating_hours !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.operatingHours[lang]}</span>
                      <span className="font-medium">{ticket.operating_hours} h</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Meta / Staff */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">{T.created[lang]}</h3>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{T.created[lang]}</span>
                    <span className="font-medium">{formatDateTime(ticket.created_at)}</span>
                  </div>
                  {ticket.created_by_email && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.createdBy[lang]}</span>
                      <span className="font-medium">{ticket.created_by_email}</span>
                    </div>
                  )}
                  {ticket.assigned_name && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.assigned[lang]}</span>
                      <span className="font-medium">{ticket.assigned_name}</span>
                    </div>
                  )}
                  {ticket.closed_at && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">{T.closedAt[lang]}</span>
                      <span className="font-medium">{formatDateTime(ticket.closed_at)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Edit (Timan internal only) */}
            {canEdit && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  {T.editTitle[lang]}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{T.status[lang]}</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      disabled={savingEdit}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {STATUS_VALUES.map((s) => (
                        <option key={s} value={s}>{statusLabel(s)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{T.priority[lang]}</label>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value)}
                      disabled={savingEdit}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {PRIORITY_VALUES.map((p) => (
                        <option key={p} value={p}>{priorityLabel(p)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{T.category[lang]}</label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      disabled={savingEdit}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {CATEGORY_VALUES.map((c) => (
                        <option key={c} value={c}>{categoryLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">{T.assigned[lang]}</label>
                    <Input
                      value={editAssigned}
                      onChange={(e) => setEditAssigned(e.target.value)}
                      disabled={savingEdit}
                      className="mt-1"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleSaveEdit} disabled={savingEdit}>
                    {savingEdit ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> {T.saving[lang]}
                      </span>
                    ) : (
                      T.saveChanges[lang]
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Internal notes (Timan-internal only) */}
            {canEdit && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  {T.internalNotesTitle[lang]}
                </h3>

                {internalNotesLoading ? (
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> {T.internalNotesLoading[lang]}
                  </div>
                ) : internalNotesError ? (
                  <div className="text-sm text-red-600">{internalNotesError}</div>
                ) : internalNotes.length === 0 ? (
                  <div className="text-sm text-slate-500">{T.internalNotesEmpty[lang]}</div>
                ) : (
                  <ul className="space-y-3">
                    {internalNotes.map((n) => (
                      <li key={n.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-sm text-slate-900 whitespace-pre-wrap">{n.body}</p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="font-medium text-slate-700">
                            {n.created_by_name || n.created_by_email || "—"}
                          </span>
                          <span>{formatDateTime(n.created_at)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    {T.writeInternalNote[lang]}
                  </label>
                  <Textarea
                    value={newInternalNote}
                    onChange={(e) => setNewInternalNote(e.target.value)}
                    rows={3}
                    disabled={savingInternalNote}
                    placeholder={T.writeInternalNote[lang]}
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleAddInternalNote} disabled={savingInternalNote}>
                      {savingInternalNote ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> {T.saving[lang]}
                        </span>
                      ) : (
                        T.addInternalNote[lang]
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Files / documentation */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Paperclip className="h-5 w-5 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  {T.filesTitle[lang]}
                </h3>
              </div>

              {docsLoading ? (
                <div className="text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {T.filesLoading[lang]}
                </div>
              ) : docsError ? (
                <div className="text-sm text-red-600">{docsError}</div>
              ) : documents.length === 0 ? (
                <div className="text-sm text-slate-500">{T.filesEmpty[lang]}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="py-2 pr-3 font-semibold">{T.fileColName[lang]}</th>
                        <th className="py-2 pr-3 font-semibold">{T.fileColType[lang]}</th>
                        <th className="py-2 pr-3 font-semibold">{T.fileColDate[lang]}</th>
                        <th className="py-2 pr-3 font-semibold">{T.fileColBy[lang]}</th>
                        <th className="py-2 pr-3 font-semibold text-right">&nbsp;</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {documents.map((d) => (
                        <tr key={d.id}>
                          <td className="py-2 pr-3 font-medium text-slate-900 break-all">{d.file_name}</td>
                          <td className="py-2 pr-3 text-slate-600">{d.file_type || "—"}</td>
                          <td className="py-2 pr-3 text-slate-600">{formatDateTime(d.created_at)}</td>
                          <td className="py-2 pr-3 text-slate-600">{d.uploaded_by_email || "—"}</td>
                          <td className="py-2 pr-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenDocument(d)}
                            >
                              <Download className="h-4 w-4 mr-1" /> {T.fileOpen[lang]}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 space-y-2">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  {T.fileSelect[lang]}
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,video/*,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="block text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
                  />
                  {uploading && (
                    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> {T.fileUploading[lang]}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {/* Max size hint, language-agnostic numeric */}
                  Max 25 MB. image/*, PDF, video/*, .doc, .docx, .xls, .xlsx
                </p>
              </div>
            </div>

            {/* Comments */}


            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-slate-500" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                  {T.commentsTitle[lang]}
                </h3>
              </div>

              {commentsLoading ? (
                <div className="text-sm text-slate-500 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {T.commentsLoading[lang]}
                </div>
              ) : commentsError ? (
                <div className="text-sm text-red-600">{commentsError}</div>
              ) : comments.length === 0 ? (
                <div className="text-sm text-slate-500">{T.commentsEmpty[lang]}</div>
              ) : (
                <ul className="space-y-3">
                  {comments.map((c) => (
                    <li key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-900 whitespace-pre-wrap">{c.body}</p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">
                          {c.created_by_name || c.created_by_email || "—"}
                        </span>
                        <span>{formatDateTime(c.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  {T.writeComment[lang]}
                </label>
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={3}
                  disabled={saving}
                  placeholder={T.writeComment[lang]}
                />
                <div className="flex justify-end">
                  <Button onClick={handleAddComment} disabled={saving}>
                    {saving ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> {T.saving[lang]}
                      </span>
                    ) : (
                      T.addComment[lang]
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
