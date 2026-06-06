/**
 * Phase 4b — Service tickets list + create.
 * Read-only list of tickets visible via RLS, plus an "Opret service ticket"
 * dialog that inserts into public.service_tickets.
 *
 * No claims/TSB/warranty changes. No file upload. No internal notes here.
 * Standard supabase-js client only — RLS controls visibility.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Ticket, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { derivePortalRole } from "@/lib/portalAccess";
import { useDealerScope } from "@/lib/dealerScope";
import { goBackOrFallback } from "@/lib/portalBackNav";
import { Language } from "@/types/configurator";

import {
  ServiceTicket,
  fetchVisibleServiceTickets,
  createServiceTicket,
  NewServiceTicketInput,
} from "@/lib/machineLifecycleService";
import { fetchDealerAccounts, type DealerAccount } from "@/lib/dealerAccountsService";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const T: Record<string, Record<Language, string>> = {
  back:   { da: "Tilbage til Teknik & Service", en: "Back to Technical & Service", de: "Zurück zu Technik & Service", it: "Torna a Tecnico & Assistenza", hu: "Vissza a Műszaki & Szerviz oldalra" },
  title:  { da: "Service tickets", en: "Service tickets", de: "Service-Tickets", it: "Ticket di assistenza", hu: "Szervizjegyek" },
  lead:   { da: "Opret, følg og håndter servicehenvendelser pr. maskine.", en: "Create, track and handle service requests per machine.", de: "Service-Anfragen pro Maschine erstellen, verfolgen und bearbeiten.", it: "Crea, monitora e gestisci le richieste di assistenza per macchina.", hu: "Szerviz kérések létrehozása, követése és kezelése gépenként." },
  createBtn: { da: "Opret service ticket", en: "Create service ticket", de: "Service-Ticket erstellen", it: "Crea ticket di assistenza", hu: "Szervizjegy létrehozása" },
  loading: { da: "Indlæser…", en: "Loading…", de: "Lädt…", it: "Caricamento…", hu: "Betöltés…" },
  loadErr: { da: "Kunne ikke hente service tickets.", en: "Could not load service tickets.", de: "Service-Tickets konnten nicht geladen werden.", it: "Impossibile caricare i ticket di assistenza.", hu: "Nem sikerült betölteni a szervizjegyeket." },
  empty:   { da: "Ingen service tickets endnu.", en: "No service tickets yet.", de: "Noch keine Service-Tickets.", it: "Nessun ticket di assistenza.", hu: "Még nincs szervizjegy." },

  // Columns
  colNumber: { da: "Ticketnr.", en: "Ticket no.", de: "Ticket-Nr.", it: "N. ticket", hu: "Jegy szám" },
  colTitle:  { da: "Titel", en: "Title", de: "Titel", it: "Titolo", hu: "Cím" },
  colSerial: { da: "Serienummer", en: "Serial number", de: "Seriennummer", it: "Numero di serie", hu: "Gyári szám" },
  colStatus: { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Státusz" },
  colPrio:   { da: "Prioritet", en: "Priority", de: "Priorität", it: "Priorità", hu: "Prioritás" },
  colDealer: { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Forgalmazó" },
  colCreated:{ da: "Oprettet", en: "Created", de: "Erstellt", it: "Creato", hu: "Létrehozva" },

  // Form
  fTitle:   { da: "Titel *", en: "Title *", de: "Titel *", it: "Titolo *", hu: "Cím *" },
  fDesc:    { da: "Beskrivelse *", en: "Description *", de: "Beschreibung *", it: "Descrizione *", hu: "Leírás *" },
  fSerial:  { da: "Serienummer / maskinnummer *", en: "Serial / machine number *", de: "Serien- / Maschinennummer *", it: "Numero di serie / macchina *", hu: "Gyári / gép szám *" },
  fMtype:   { da: "Maskintype", en: "Machine type", de: "Maschinentyp", it: "Tipo macchina", hu: "Gép típusa" },
  fDealer:  { da: "Forhandler *", en: "Dealer *", de: "Händler *", it: "Rivenditore *", hu: "Forgalmazó *" },
  fCust:    { da: "Kunde / bruger", en: "Customer / user", de: "Kunde / Anwender", it: "Cliente / utente", hu: "Ügyfél / felhasználó" },
  fContact: { da: "Kontaktperson", en: "Contact person", de: "Ansprechpartner", it: "Persona di contatto", hu: "Kapcsolattartó" },
  fEmail:   { da: "Kontaktmail", en: "Contact email", de: "Kontakt-E-Mail", it: "Email di contatto", hu: "Kapcsolat e-mail" },
  fPhone:   { da: "Telefonnummer", en: "Phone number", de: "Telefonnummer", it: "Numero di telefono", hu: "Telefonszám" },
  fHours:   { da: "Driftstimer", en: "Operating hours", de: "Betriebsstunden", it: "Ore di funzionamento", hu: "Üzemórák" },
  fPrio:    { da: "Prioritet *", en: "Priority *", de: "Priorität *", it: "Priorità *", hu: "Prioritás *" },
  fStatus:  { da: "Status *", en: "Status *", de: "Status *", it: "Stato *", hu: "Státusz *" },
  fCat:     { da: "Kategori", en: "Category", de: "Kategorie", it: "Categoria", hu: "Kategória" },
  fAssign:  { da: "Ansvarlig Timan-medarbejder", en: "Assigned Timan staff", de: "Zuständige/r Timan-Mitarbeiter/in", it: "Responsabile Timan", hu: "Felelős Timan munkatárs" },
  cancel:   { da: "Annullér", en: "Cancel", de: "Abbrechen", it: "Annulla", hu: "Mégse" },
  save:     { da: "Opret", en: "Create", de: "Erstellen", it: "Crea", hu: "Létrehozás" },
  saving:   { da: "Gemmer…", en: "Saving…", de: "Speichert…", it: "Salvataggio…", hu: "Mentés…" },
  saved:    { da: "Service ticket oprettet", en: "Service ticket created", de: "Service-Ticket erstellt", it: "Ticket di assistenza creato", hu: "Szervizjegy létrehozva" },
  saveErr:  { da: "Kunne ikke oprette ticket. Tjek dine rettigheder og prøv igen.", en: "Could not create ticket. Check your permissions and try again.", de: "Ticket konnte nicht erstellt werden. Berechtigungen prüfen.", it: "Impossibile creare il ticket. Verifica i permessi.", hu: "A jegy létrehozása sikertelen. Ellenőrizze a jogosultságot." },
  dealerLocked: { da: "Forhandler er låst til din egen organisation.", en: "Dealer is locked to your own organisation.", de: "Händler ist auf Ihre Organisation festgelegt.", it: "Rivenditore bloccato sulla tua organizzazione.", hu: "A forgalmazó a saját szervezetére van rögzítve." },
  selectDealer: { da: "Vælg forhandler…", en: "Select dealer…", de: "Händler wählen…", it: "Seleziona rivenditore…", hu: "Válasszon forgalmazót…" },
  required: { da: "Udfyld de obligatoriske felter.", en: "Fill in the required fields.", de: "Bitte Pflichtfelder ausfüllen.", it: "Compila i campi obbligatori.", hu: "Töltse ki a kötelező mezőket." },
  noDealerLink: { da: "Din bruger er ikke koblet til en forhandlerkonto.", en: "Your user is not linked to a dealer account.", de: "Ihr Benutzer ist keinem Händlerkonto zugeordnet.", it: "Il tuo utente non è collegato a un account rivenditore.", hu: "Felhasználója nincs forgalmazói fiókhoz kapcsolva." },
  mtypeSelect: { da: "Vælg maskintype…", en: "Select machine type…", de: "Maschinentyp wählen…", it: "Seleziona tipo macchina…", hu: "Válasszon gép típust…" },
  mtypeOther: { da: "Andet", en: "Other", de: "Andere", it: "Altro", hu: "Egyéb" },
  mtypeOtherLabel: { da: "Anden maskintype", en: "Other machine type", de: "Anderer Maschinentyp", it: "Altro tipo macchina", hu: "Egyéb gép típus" },
  mtypeAutoFilled: { da: "Foreslået ud fra serienummer", en: "Suggested from serial number", de: "Vorgeschlagen anhand der Seriennummer", it: "Suggerito dal numero di serie", hu: "Javaslat a gyári szám alapján" },
  fEquip: { da: "Redskab / udstyr", en: "Equipment / attachment", de: "Anbaugerät / Ausstattung", it: "Attrezzatura / accessorio", hu: "Eszköz / felszerelés" },
  equipOtherLabel: { da: "Andet redskab / udstyr", en: "Other equipment", de: "Anderes Anbaugerät", it: "Altra attrezzatura", hu: "Egyéb eszköz" },

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

const MACHINE_TYPE_OPTIONS = ["RC-751", "RC-1000s", "Timan 3330", "Timan 2620"];
const SERIAL_PREFIX_MAP: Array<{ prefix: string; type: string }> = [
  { prefix: "411000", type: "RC-1000s" },
  { prefix: "410040", type: "RC-751" },
  { prefix: "712000", type: "Timan 3330" },
  { prefix: "999-888", type: "Timan 2620" },
];
const EQUIPMENT_OPTIONS = [
  "Slagleklipper","Y-slagle sæt","Rotorclipper","Fingerripper","Skivehøster",
  "Hammerklipper","Stativ","Fjernbetjening",
];

function suggestMachineType(serial: string): string | null {
  const s = serial.trim();
  if (!s) return null;
  for (const m of SERIAL_PREFIX_MAP) {
    if (s.startsWith(m.prefix)) return m.type;
  }
  return null;
}

const STATUS_OPTIONS = [
  "created","in_progress","waiting_timan","waiting_dealer","waiting_customer",
  "waiting_parts","resolved","closed",
];
const PRIORITY_OPTIONS = ["low","normal","high","critical_machine_stopped"];
const CATEGORY_OPTIONS = [
  "engine","hydraulics","electronics","remote_control","transmission",
  "service","spare_part","software","safety","other",
];

function statusClass(s: string): string {
  const x = (s || "").toLowerCase();
  if (x === "created") return "bg-slate-100 text-slate-700";
  if (x === "in_progress") return "bg-blue-100 text-blue-700";
  if (x.startsWith("waiting_")) return "bg-amber-100 text-amber-700";
  if (x === "resolved") return "bg-green-100 text-green-700";
  if (x === "closed") return "bg-slate-100 text-slate-600";
  if (x.startsWith("converted_")) return "bg-purple-100 text-purple-700";
  return "bg-slate-100 text-slate-700";
}
function prioClass(p: string): string {
  const x = (p || "").toLowerCase();
  if (x === "low") return "bg-sky-100 text-sky-700";
  if (x === "normal") return "bg-slate-100 text-slate-700";
  if (x === "high") return "bg-orange-100 text-orange-700";
  if (x === "critical_machine_stopped") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return d.toLocaleString();
  } catch { return v as string; }
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

export default function ServiceTicketsPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const effectiveUser = useEffectivePortalUser(appUser);

  const portalRole = derivePortalRole(effectiveUser);
  const isInternal =
    portalRole === "timan_backend" ||
    portalRole === "timan_seller" ||
    portalRole === "timan_service";

  // Phase 51 — fælles dealer-scope helper. Eksterne roller låses automatisk
  // til egen forhandler. Interne Timan-roller kan fortsat vælge i dropdown.
  const dealerScope = useDealerScope();

  const [tickets, setTickets] = useState<ServiceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  if (!appUser) {
    navigate("/portal", { replace: true });
    return null;
  }

  const reload = async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const list = await fetchVisibleServiceTickets();
      setTickets(list);
    } catch (e) {
      console.error("[ServiceTickets] load error", e);
      setLoadErr(T.loadErr[lang]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

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
            {T.back[lang]}
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[1700px] px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2d5a27]/10 text-[#2d5a27]">
              <Ticket className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">{T.title[lang]}</h1>
              <p className="mt-1 text-sm text-slate-500">{T.lead[lang]}</p>
            </div>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-[#2d5a27] hover:bg-[#234a1f] text-white"
          >
            <Plus className="h-4 w-4" />
            {T.createBtn[lang]}
          </Button>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> {T.loading[lang]}
            </div>
          ) : loadErr ? (
            <div className="p-10 text-center text-sm text-red-600">{loadErr}</div>
          ) : tickets.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">{T.empty[lang]}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T.colNumber[lang]}</TableHead>
                  <TableHead>{T.colTitle[lang]}</TableHead>
                  <TableHead>{T.colSerial[lang]}</TableHead>
                  <TableHead>{T.colStatus[lang]}</TableHead>
                  <TableHead>{T.colPrio[lang]}</TableHead>
                  <TableHead>{T.colDealer[lang]}</TableHead>
                  <TableHead>{T.colCreated[lang]}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/portal/service/tickets/${t.id}`)}
                  >
                    <TableCell className="font-mono text-xs">{t.ticket_number || "—"}</TableCell>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="font-mono text-xs">{(t as ServiceTicket & { serial_number?: string }).serial_number || "—"}</TableCell>
                    <TableCell>
                      <span className={"inline-block rounded-full px-2 py-0.5 text-xs font-semibold " + statusClass(t.status)}>
                        {statusLabel(t.status, lang)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={"inline-block rounded-full px-2 py-0.5 text-xs font-semibold " + prioClass(t.priority)}>
                        {priorityLabel(t.priority, lang)}
                      </span>
                    </TableCell>
                    <TableCell>{t.dealer_name || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{fmtDate(t.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      </main>

      <CreateTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        lang={lang}
        isInternal={isInternal}
        lockedDealerNumber={isInternal ? null : dealerScope.lockedDealerNumber}
        lockedDealerName={isInternal ? null : dealerScope.lockedDealerName}
        onCreated={() => { setCreateOpen(false); reload(); }}
      />

      <PortalFooter language={lang} />
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Create dialog                                                         */
/* -------------------------------------------------------------------- */

function CreateTicketDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Language;
  isInternal: boolean;
  lockedDealerNumber: string | null;
  lockedDealerName: string | null;
  onCreated: () => void;
}) {
  const { open, onOpenChange, lang, isInternal, lockedDealerNumber, lockedDealerName, onCreated } = props;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [serial, setSerial] = useState("");
  // Machine type: one of MACHINE_TYPE_OPTIONS, "" (none), or "__other__"
  const [mtypeChoice, setMtypeChoice] = useState<string>("");
  const [mtypeOther, setMtypeOther] = useState<string>("");
  const [mtypeAutoFilled, setMtypeAutoFilled] = useState<boolean>(false);
  // Equipment multi-select
  const [equipment, setEquipment] = useState<string[]>([]);
  const [equipmentOther, setEquipmentOther] = useState<string>("");
  const [equipOtherChecked, setEquipOtherChecked] = useState<boolean>(false);

  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [hours, setHours] = useState<string>("");
  const [priority, setPriority] = useState<string>("normal");
  const [status, setStatus] = useState<string>("created");
  const [category, setCategory] = useState<string>("");
  const [assigned, setAssigned] = useState<string>("");

  const [dealers, setDealers] = useState<DealerAccount[]>([]);
  const [dealerId, setDealerId] = useState<string>(""); // dealer_account_id for internal users

  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setTitle(""); setDescription(""); setSerial("");
    setMtypeChoice(""); setMtypeOther(""); setMtypeAutoFilled(false);
    setEquipment([]); setEquipmentOther(""); setEquipOtherChecked(false);
    setCustomer(""); setContact(""); setEmail(""); setPhone(""); setHours("");
    setPriority("normal"); setStatus("created"); setCategory(""); setAssigned("");
    setDealerId("");
  }, [open]);

  // Auto-suggest machine type from serial number.
  // Only overwrite when field is empty OR previously auto-filled.
  const handleSerialChange = (next: string) => {
    setSerial(next);
    const suggested = suggestMachineType(next);
    if (suggested && MACHINE_TYPE_OPTIONS.includes(suggested)) {
      if (mtypeChoice === "" || mtypeAutoFilled) {
        setMtypeChoice(suggested);
        setMtypeAutoFilled(true);
      }
    }
  };

  const handleMtypeChange = (next: string) => {
    setMtypeChoice(next);
    setMtypeAutoFilled(false);
  };

  const toggleEquipment = (item: string, checked: boolean) => {
    setEquipment((prev) =>
      checked ? Array.from(new Set([...prev, item])) : prev.filter((x) => x !== item),
    );
  };

  // Load dealers for internal users
  useEffect(() => {
    if (!open || !isInternal) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchDealerAccounts({ includeDeleted: false });
        if (!cancelled) setDealers(res.rows);
      } catch (e) {
        console.error("[ServiceTickets] dealer fetch failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [open, isInternal]);

  const selectedDealer = useMemo(
    () => dealers.find((d) => d.id === dealerId) || null,
    [dealers, dealerId],
  );

  const resolvedMtype = (): string | null => {
    if (mtypeChoice === "__other__") return mtypeOther.trim() || null;
    return mtypeChoice.trim() || null;
  };

  const resolvedEquipment = (): string[] => {
    const list = [...equipment];
    if (equipOtherChecked && equipmentOther.trim()) list.push(equipmentOther.trim());
    return list;
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim() || !serial.trim() || !priority || !status) {
      toast.error(T.required[lang]);
      return;
    }
    // Resolve dealer info
    let dealer_account_id: string | null = null;
    let dealer_number: string | null = null;
    let dealer_name: string | null = null;
    if (isInternal) {
      if (!selectedDealer) {
        toast.error(T.required[lang]);
        return;
      }
      dealer_account_id = selectedDealer.id;
      dealer_number = selectedDealer.account_number;
      dealer_name = selectedDealer.company_name;
    } else {
      dealer_number = lockedDealerNumber;
      dealer_name = lockedDealerName;
      if (!dealer_number) {
        toast.error(T.noDealerLink[lang]);
        return;
      }
    }

    // Equipment is stored as an extra line in description for now
    // (no dedicated column yet — temporary).
    const equipList = resolvedEquipment();
    const finalDescription = equipList.length > 0
      ? `${description.trim()}\n\n${T.fEquip[lang]}: ${equipList.join(", ")}`
      : description.trim();

    const input: NewServiceTicketInput = {
      title,
      description: finalDescription,
      serial_number: serial,
      machine_type: resolvedMtype(),
      dealer_account_id, dealer_number, dealer_name,
      customer_name: customer || null,
      contact_person: contact || null,
      contact_email: email || null,
      contact_phone: phone || null,
      operating_hours: hours.trim() === "" ? null : Number(hours),
      priority, status,
      category: category || null,
      assigned_name: assigned || null,
    };

    setSaving(true);
    try {
      await createServiceTicket(input);
      toast.success(T.saved[lang]);
      onCreated();
    } catch (e) {
      console.error("[ServiceTickets] create error", e);
      toast.error(T.saveErr[lang]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{T.createBtn[lang]}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="md:col-span-2">
            <Label>{T.fTitle[lang]}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label>{T.fDesc[lang]}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>

          <div>
            <Label>{T.fSerial[lang]}</Label>
            <Input value={serial} onChange={(e) => handleSerialChange(e.target.value)} />
          </div>
          <div>
            <Label>{T.fMtype[lang]}</Label>
            <select
              value={mtypeChoice}
              onChange={(e) => handleMtypeChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{T.mtypeSelect[lang]}</option>
              {MACHINE_TYPE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              <option value="__other__">{T.mtypeOther[lang]}</option>
            </select>
            {mtypeAutoFilled && mtypeChoice && mtypeChoice !== "__other__" ? (
              <p className="mt-1 text-xs text-slate-500">{T.mtypeAutoFilled[lang]}</p>
            ) : null}
            {mtypeChoice === "__other__" ? (
              <Input
                className="mt-2"
                placeholder={T.mtypeOtherLabel[lang]}
                value={mtypeOther}
                onChange={(e) => setMtypeOther(e.target.value)}
              />
            ) : null}
          </div>

          {/* Equipment / attachment (multi-select). Stored temporarily in description. */}
          <div className="md:col-span-2">
            <Label>{T.fEquip[lang]}</Label>
            <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-2 rounded-md border border-input bg-background p-3 text-sm">
              {EQUIPMENT_OPTIONS.map((item) => (
                <label key={item} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={equipment.includes(item)}
                    onChange={(e) => toggleEquipment(item, e.target.checked)}
                  />
                  <span>{item}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={equipOtherChecked}
                  onChange={(e) => setEquipOtherChecked(e.target.checked)}
                />
                <span>{T.mtypeOther[lang]}</span>
              </label>
            </div>
            {equipOtherChecked ? (
              <Input
                className="mt-2"
                placeholder={T.equipOtherLabel[lang]}
                value={equipmentOther}
                onChange={(e) => setEquipmentOther(e.target.value)}
              />
            ) : null}
          </div>

          {/* Dealer */}
          <div className="md:col-span-2">
            <Label>{T.fDealer[lang]}</Label>
            {isInternal ? (
              <select
                value={dealerId}
                onChange={(e) => setDealerId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{T.selectDealer[lang]}</option>
                {dealers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.company_name} {d.account_number ? `(${d.account_number})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <Input
                  value={
                    lockedDealerName && lockedDealerNumber
                      ? `${lockedDealerName} (${lockedDealerNumber})`
                      : (lockedDealerName || lockedDealerNumber || "")
                  }
                  readOnly
                  className="bg-slate-50 cursor-default"
                />
                {lockedDealerNumber ? (
                  <p className="mt-1 text-xs text-slate-500">{T.dealerLocked[lang]}</p>
                ) : (
                  <p className="mt-1 text-xs text-red-600">{T.noDealerLink[lang]}</p>
                )}
              </>
            )}
          </div>

          <div>
            <Label>{T.fCust[lang]}</Label>
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          </div>
          <div>
            <Label>{T.fContact[lang]}</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>

          <div>
            <Label>{T.fEmail[lang]}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>{T.fPhone[lang]}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          <div>
            <Label>{T.fHours[lang]}</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>

          <div>
            <Label>{T.fPrio[lang]}</Label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{priorityLabel(p, lang)}</option>)}
            </select>
          </div>

          <div>
            <Label>{T.fStatus[lang]}</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{statusLabel(s, lang)}</option>)}
            </select>
          </div>

          <div>
            <Label>{T.fCat[lang]}</Label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{categoryLabel(c, lang)}</option>)}
            </select>
          </div>

          <div className="md:col-span-2">
            <Label>{T.fAssign[lang]}</Label>
            <Input value={assigned} onChange={(e) => setAssigned(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {T.cancel[lang]}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-[#2d5a27] hover:bg-[#234a1f] text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {saving ? T.saving[lang] : T.save[lang]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
