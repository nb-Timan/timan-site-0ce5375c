/**
 * Phase 4c — Service ticket detail (read-only).
 * Fetches a single ticket by ID via RLS-scoped supabase client.
 */
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ticket, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";

import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { getPortalBackTarget } from "@/lib/portalBackNav";
import { Language } from "@/types/configurator";
import {
  fetchServiceTicketById,
  ServiceTicketDetail,
  fetchExternalCommentsForTicket,
  createExternalComment,
  ServiceTicketComment,
  updateServiceTicketFields,
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
};

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
  const location = useLocation();
  const { ticketId } = useParams<{ ticketId: string }>();

  const [ticket, setTicket] = useState<ServiceTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [comments, setComments] = useState<ServiceTicketComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [saving, setSaving] = useState(false);

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
            await loadComments(ticketId);
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 flex flex-col">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <div className="bg-white border-b border-slate-200 py-3">
        <div className="mx-auto max-w-5xl px-6">
          <button
            onClick={() => navigate(getPortalBackTarget(location.pathname))}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {T.back[lang]}
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-10 flex-1 w-full">
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
                  <Badge className={statusBadgeClasses(ticket.status)}>{ticket.status}</Badge>
                  <Badge className={priorityBadgeClasses(ticket.priority)}>{ticket.priority}</Badge>
                  {ticket.category && (
                    <Badge variant="outline">{ticket.category}</Badge>
                  )}
                </div>
              </div>
              <h2 className="mt-4 text-xl font-semibold text-slate-900">{ticket.title}</h2>
              {ticket.description && (
                <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{ticket.description}</p>
              )}
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
