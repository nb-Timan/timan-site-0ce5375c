/**
 * Min Maskine — unified machine journal page (read-only v1).
 *
 * Route: /portal/service/machines/:serialNumber
 *
 * Combines warranty, service registration, service tickets, claims and TSB
 * data for a single serial number. Links open the original detail pages —
 * nothing is duplicated. Supabase data is RLS-scoped; mock claims/TSB are
 * scope-filtered by dealer label for non-internal users.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowUpDown, ChevronRight, Loader2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { derivePortalRole } from "@/lib/portalAccess";
import { Language } from "@/types/configurator";
import { t as tt } from "@/lib/i18n/translations";
import {
  loadMachineJournal, isInternalRole, type MachineJournal, type JournalSummary,
  type TimelineKind, type JournalScope, type StatusTone, type HealthLevel,
} from "@/lib/machineJournalService";
import { buildJournalScope } from "@/lib/machineJournalScope";
import { getMachineDocumentSignedUrl, MachineDocumentRow } from "@/lib/machineLifecycleService";

const T: Record<string, Record<Language, string>> = {
  pageTitle:        { da: "Min Maskine", en: "My Machine", de: "Meine Maschine", it: "La mia macchina", hu: "Saját gép" },
  back:             { da: "Tilbage", en: "Back", de: "Zurück", it: "Indietro", hu: "Vissza" },
  backToSearch:     { da: "Tilbage til Søg på maskine", en: "Back to Machine Search", de: "Zurück zur Maschinensuche", it: "Torna a Cerca macchina", hu: "Vissza a gépkereséshez" },
  crumbService:     { da: "Teknik & Service", en: "Technical & Service", de: "Technik & Service", it: "Tecnico & Assistenza", hu: "Műszaki & Szerviz" },
  crumbSearch:      { da: "Søg Maskine", en: "Search Machine", de: "Maschine suchen", it: "Cerca macchina", hu: "Gép keresése" },
  loading:          { da: "Indlæser…", en: "Loading…", de: "Lädt…", it: "Caricamento…", hu: "Betöltés…" },
  notFound:         { da: "Ingen data for denne maskine.", en: "No data for this machine.", de: "Keine Daten zu dieser Maschine.", it: "Nessun dato per questa macchina.", hu: "Nincs adat ehhez a géphez." },
  serial:           { da: "Serienr.", en: "Serial no.", de: "Seriennr.", it: "N. di serie", hu: "Gyári sz." },
  status:           { da: "Status", en: "Status", de: "Status", it: "Stato", hu: "Státusz" },
  active:           { da: "Aktiv", en: "Active", de: "Aktiv", it: "Attiva", hu: "Aktív" },
  archived:         { da: "Arkiveret", en: "Archived", de: "Archiviert", it: "Archiviata", hu: "Archivált" },
  customer:         { da: "Kunde", en: "Customer", de: "Kunde", it: "Cliente", hu: "Ügyfél" },
  dealer:           { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Forgalmazó" },
  seller:           { da: "Sælger", en: "Seller", de: "Verkäufer", it: "Venditore", hu: "Értékesítő" },
  warranty:         { da: "Garanti", en: "Warranty", de: "Garantie", it: "Garanzia", hu: "Garancia" },
  warrantyUntil:    { da: "Garanti til", en: "Warranty until", de: "Garantie bis", it: "Garanzia fino al", hu: "Garancia eddig" },
  hours:            { da: "Timer", en: "Hours", de: "Stunden", it: "Ore", hu: "Üzemórák" },
  latestService:    { da: "Seneste service", en: "Latest service", de: "Letzter Service", it: "Ultimo intervento", hu: "Utolsó szerviz" },
  openTickets:      { da: "Åbne tickets", en: "Open tickets", de: "Offene Tickets", it: "Ticket aperti", hu: "Nyitott jegyek" },
  openClaims:       { da: "Åbne claims", en: "Open claims", de: "Offene Reklamationen", it: "Reclami aperti", hu: "Nyitott reklamációk" },
  tsbPending:       { da: "TSB mangler", en: "TSB pending", de: "TSB ausstehend", it: "TSB in attesa", hu: "TSB hátralévő" },
  registered:       { da: "Registreret", en: "Registered", de: "Registriert", it: "Registrato", hu: "Regisztrálva" },

  timeline:         { da: "Tidslinje", en: "Timeline", de: "Zeitstrahl", it: "Cronologia", hu: "Idővonal" },
  newestFirst:      { da: "Nyeste først", en: "Newest first", de: "Neueste zuerst", it: "Più recenti", hu: "Legújabb elöl" },
  oldestFirst:      { da: "Ældste først", en: "Oldest first", de: "Älteste zuerst", it: "Più vecchi", hu: "Legrégebbi elöl" },
  noEvents:         { da: "Ingen hændelser registreret.", en: "No events recorded.", de: "Keine Ereignisse erfasst.", it: "Nessun evento registrato.", hu: "Nincs rögzített esemény." },
  allTypes:         { da: "Alle", en: "All", de: "Alle", it: "Tutti", hu: "Mind" },

  related:          { da: "Tilknyttede sager", en: "Related records", de: "Verwandte Vorgänge", it: "Record correlati", hu: "Kapcsolódó esetek" },
  open:             { da: "Åbn", en: "Open", de: "Öffnen", it: "Apri", hu: "Megnyit" },
  warranties:       { da: "Garantiregistreringer", en: "Warranty registrations", de: "Garantieregistrierungen", it: "Registrazioni garanzia", hu: "Garanciaregisztrációk" },
  serviceRegs:      { da: "Service registreringer", en: "Service registrations", de: "Serviceregistrierungen", it: "Registrazioni di servizio", hu: "Szerviz regisztrációk" },
  tickets:          { da: "Service tickets", en: "Service tickets", de: "Service-Tickets", it: "Ticket assistenza", hu: "Szerviz jegyek" },
  claims:           { da: "Claims", en: "Claims", de: "Reklamationen", it: "Reclami", hu: "Reklamációk" },
  tsbHead:          { da: "TSB", en: "TSB", de: "TSB", it: "TSB", hu: "TSB" },
  empty:            { da: "Ingen poster", en: "No records", de: "Keine Einträge", it: "Nessuna voce", hu: "Nincs bejegyzés" },

  comments:         { da: "Maskinkommentarer", en: "Machine comments", de: "Maschinenkommentare", it: "Commenti macchina", hu: "Gépmegjegyzések" },
  noComments:       { da: "Ingen kommentarer fundet.", en: "No comments found.", de: "Keine Kommentare gefunden.", it: "Nessun commento trovato.", hu: "Nincsenek megjegyzések." },
  readOnlyNote:     { da: "Læsevisning — kommentarer redigeres på den oprindelige sag.", en: "Read view — comments are edited on the original record.", de: "Leseansicht — Kommentare werden im Originaldatensatz bearbeitet.", it: "Vista in sola lettura — i commenti si modificano sul record originale.", hu: "Csak olvasható nézet — a megjegyzéseket az eredeti rekordon kell szerkeszteni." },

  documents:        { da: "Dokumenter", en: "Documents", de: "Dokumente", it: "Documenti", hu: "Dokumentumok" },
  photos:           { da: "Billeder", en: "Photos", de: "Fotos", it: "Foto", hu: "Képek" },
  noDocs:           { da: "Ingen dokumenter registreret", en: "No documents registered", de: "Keine Dokumente erfasst", it: "Nessun documento registrato", hu: "Nincsenek dokumentumok rögzítve" },
  noPhotos:         { da: "Ingen billeder registreret", en: "No photos registered", de: "Keine Fotos erfasst", it: "Nessuna foto registrata", hu: "Nincsenek képek rögzítve" },

  owners:           { da: "Maskinens ejere", en: "Machine owners", de: "Maschinenbesitzer", it: "Proprietari della macchina", hu: "Gép tulajdonosai" },
  current:          { da: "Nuværende", en: "Current", de: "Aktuell", it: "Attuale", hu: "Jelenlegi" },

  source_warranty:  { da: "Garanti", en: "Warranty", de: "Garantie", it: "Garanzia", hu: "Garancia" },
  source_service:   { da: "Service", en: "Service", de: "Service", it: "Assistenza", hu: "Szerviz" },
  source_ticket:    { da: "Ticket", en: "Ticket", de: "Ticket", it: "Ticket", hu: "Jegy" },
  source_claim:     { da: "Claim", en: "Claim", de: "Reklamation", it: "Reclamo", hu: "Reklamáció" },
  source_tsb:       { da: "TSB", en: "TSB", de: "TSB", it: "TSB", hu: "TSB" },
  source_comment:   { da: "Note", en: "Note", de: "Notiz", it: "Nota", hu: "Jegyzet" },
};

const KIND_BADGE: Record<TimelineKind, string> = {
  warranty: "bg-blue-100 text-blue-700 border-blue-200",
  service:  "bg-emerald-100 text-emerald-700 border-emerald-200",
  ticket:   "bg-amber-100 text-amber-700 border-amber-200",
  claim:    "bg-red-100 text-red-700 border-red-200",
  tsb:      "bg-purple-100 text-purple-700 border-purple-200",
  comment:  "bg-slate-100 text-slate-700 border-slate-200",
};

const KIND_DOT: Record<TimelineKind, string> = {
  warranty: "bg-blue-500",
  service:  "bg-emerald-500",
  ticket:   "bg-amber-500",
  claim:    "bg-red-500",
  tsb:      "bg-purple-500",
  comment:  "bg-slate-400",
};

function fmtDate(v: string | null | undefined): string {
  if (!v) return "";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  } catch { return v; }
}

export default function MachineJournalPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage, uiLanguage } = useLanguage();
  const navigate = useNavigate();
  const params = useParams<{ serialNumber: string }>();
  const effective = useEffectivePortalUser(appUser);
  const role = derivePortalRole(effective);
  const internal = isInternalRole(role);

  const serial = useMemo(() => decodeURIComponent(params.serialNumber || ""), [params.serialNumber]);

  const [journal, setJournal] = useState<MachineJournal | null>(null);
  const [loading, setLoading] = useState(true);
  const [oldestFirst, setOldestFirst] = useState(false);
  const [kindFilter, setKindFilter] = useState<TimelineKind | "all">("all");
  const breadcrumbCurrent = useMemo(() => {
    if (journal?.summary) {
      return journal.summary.machineType || journal.summary.model || journal.summary.serial || serial;
    }
    return serial;
  }, [journal, serial]);

  useEffect(() => {
    if (!appUser) {
      navigate("/portal", { replace: true });
      return;
    }
    if (!serial) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const scope: JournalScope = await buildJournalScope(appUser, role);
        const j = await loadMachineJournal(serial, scope);
        if (!cancelled) setJournal(j);
      } catch (e) {
        console.error("[MachineJournal] load failed", e);
        if (!cancelled) setJournal(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appUser, serial, role, navigate]);

  if (!appUser) return null;

  const handleOpenDoc = async (d: MachineDocumentRow) => {
    try {
      const url = await getMachineDocumentSignedUrl(d.storage_bucket, d.storage_path, 60 * 60);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error("[MachineJournal] open doc failed", e);
    }
  };

  const sortedTimeline = useMemo(() => {
    if (!journal) return [];
    let arr = [...journal.timeline];
    if (kindFilter !== "all") arr = arr.filter((e) => e.kind === kindFilter);
    if (oldestFirst) arr.reverse();
    return arr;
  }, [journal, oldestFirst, kindFilter]);

  const availableKinds = useMemo<TimelineKind[]>(() => {
    if (!journal) return [];
    const set = new Set<TimelineKind>();
    for (const e of journal.timeline) set.add(e.kind);
    return Array.from(set);
  }, [journal]);

  return (
    <div className="tk-scale-up min-h-screen bg-slate-50 text-slate-950 flex flex-col">
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate("/portal", { replace: true }); }}
      />

      <div className="bg-white border-b border-slate-200 py-3">
        <div className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-end gap-2">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
            <button
              onClick={() => navigate('/portal/teknik-service')}
              className="font-semibold text-slate-600 hover:text-[#2d5a27] hover:underline"
            >{T.crumbService[lang]}</button>
            <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
            <button
              onClick={() => navigate('/portal/service/machines')}
              className="font-semibold text-slate-600 hover:text-[#2d5a27] hover:underline"
            >{T.crumbSearch[lang]}</button>
            <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-900 truncate max-w-[260px]" title={breadcrumbCurrent}>
              {breadcrumbCurrent}
            </span>
          </nav>
        </div>
      </div>


      <main className="mx-auto max-w-[1800px] px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{T.pageTitle[lang]}</div>

        {loading ? (
          <div className="py-20 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> {T.loading[lang]}
          </div>
        ) : !journal || !journal.found ? (
          <div className="py-20 text-center text-sm text-slate-500">
            <div className="text-2xl font-bold text-slate-900 mb-2">{serial}</div>
            <div>{T.notFound[lang]}</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="mb-6">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h1 className="text-3xl font-black tracking-tight">
                  {journal.summary.machineType || journal.summary.model || journal.summary.serial}
                </h1>
                {journal.summary.status && (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700">
                    {journal.summary.status === "active" ? T.active[lang] : T.archived[lang]}
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                <span className="font-medium">{T.serial[lang]}:</span> <span className="font-mono">{journal.summary.serial}</span>
                {journal.summary.customerName && <> · {journal.summary.customerName}</>}
                {journal.summary.dealerName && <> · {journal.summary.dealerName}</>}
                {journal.summary.sellerLabel && <> · {T.seller[lang]}: {journal.summary.sellerLabel}</>}
              </div>
            </header>

            {/* Maskinestatus — health dashboard */}
            <HealthDashboard summary={journal.summary} />


            {internal && journal.summary.dealerLinkMissing && (
              <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                Maskinen mangler forhandlerkobling
              </div>
            )}

            {journal.summary.openItemsCount > 0 && (
              <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                Åbne punkter på maskinen: {journal.summary.openItemsCount}
                <span className="ml-2 font-normal text-red-700">
                  {[
                    journal.summary.openTickets > 0 ? `${journal.summary.openTickets} ticket(s)` : null,
                    journal.summary.openClaims > 0 ? `${journal.summary.openClaims} claim(s)` : null,
                    journal.summary.tsbPending > 0 ? `${journal.summary.tsbPending} TSB` : null,
                  ].filter(Boolean).join(" · ")}
                </span>
              </div>
            )}

            {journal.summary.hoursRegression && (
              <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                Advarsel: Timetal ser ud til at være lavere end tidligere registrering
                <span className="ml-2 font-normal text-amber-700">
                  ({journal.summary.hoursRegression.newerSource}: {journal.summary.hoursRegression.newerHours} t
                  {journal.summary.hoursRegression.newerDate ? ` · ${fmtDate(journal.summary.hoursRegression.newerDate)}` : ""}
                  {" "}vs. {journal.summary.hoursRegression.previousSource}: {journal.summary.hoursRegression.previousHours} t
                  {journal.summary.hoursRegression.previousDate ? ` · ${fmtDate(journal.summary.hoursRegression.previousDate)}` : ""})
                </span>
              </div>
            )}



            {/* Quick stats */}
            <section className="mb-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {journal.summary.currentHours != null && (
                <StatCard label={T.hours[lang]} value={String(journal.summary.currentHours)} />
              )}
              {journal.summary.latestServiceDate && (
                <StatCard label={T.latestService[lang]} value={fmtDate(journal.summary.latestServiceDate)} />
              )}
              {journal.summary.openTickets > 0 && (
                <StatCard label={T.openTickets[lang]} value={String(journal.summary.openTickets)} tone="amber" />
              )}
              {journal.summary.openClaims > 0 && (
                <StatCard label={T.openClaims[lang]} value={String(journal.summary.openClaims)} tone="red" />
              )}
              {journal.summary.tsbPending > 0 && (
                <StatCard label={T.tsbPending[lang]} value={String(journal.summary.tsbPending)} tone="purple" />
              )}
              {journal.summary.registrationDate && (
                <StatCard label={T.registered[lang]} value={fmtDate(journal.summary.registrationDate)} />
              )}
            </section>

            {/* Timeline */}
            <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold">{T.timeline[lang]}</h2>
                <button
                  onClick={() => setOldestFirst((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {oldestFirst ? T.oldestFirst[lang] : T.newestFirst[lang]}
                </button>
              </div>
              {availableKinds.length > 1 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  <FilterChip
                    label={T.allTypes[lang]}
                    active={kindFilter === "all"}
                    onClick={() => setKindFilter("all")}
                  />
                  {availableKinds.map((k) => (
                    <FilterChip
                      key={k}
                      label={T[`source_${k}` as keyof typeof T]?.[lang] ?? k}
                      active={kindFilter === k}
                      activeClass={KIND_BADGE[k]}
                      onClick={() => setKindFilter(k)}
                    />
                  ))}
                </div>
              )}
              {sortedTimeline.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-500">{T.noEvents[lang]}</div>
              ) : (
                <ol className="space-y-3">
                  {sortedTimeline.map((e) => (
                    <li key={e.id} className="flex items-start gap-3">
                      <div className={`mt-1.5 h-2.5 w-2.5 rounded-full ${KIND_DOT[e.kind]}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-2 text-sm">
                          <span className="font-mono text-xs text-slate-500">{fmtDate(e.date)}</span>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${KIND_BADGE[e.kind]}`}>
                            {T[`source_${e.kind}` as keyof typeof T]?.[lang] ?? e.kind}
                          </span>
                          {e.href ? (
                            <Link to={e.href} className="font-semibold text-slate-900 hover:underline">{e.title}</Link>
                          ) : (
                            <span className="font-semibold text-slate-900">{e.title}</span>
                          )}
                        </div>
                        {e.description && <div className="mt-0.5 text-xs text-slate-600">{e.description}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* Related records */}
            <section className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <RelatedCard title={T.warranties[lang]} items={journal.related.warranties} emptyText={T.empty[lang]} openLabel={T.open[lang]} kindClass={KIND_BADGE.warranty} />
              <RelatedCard title={T.serviceRegs[lang]} items={journal.related.serviceRegistrations} emptyText={T.empty[lang]} openLabel={T.open[lang]} kindClass={KIND_BADGE.service} />
              <RelatedCard title={T.tickets[lang]} items={journal.related.tickets} emptyText={T.empty[lang]} openLabel={T.open[lang]} kindClass={KIND_BADGE.ticket} />
              <RelatedCard title={T.claims[lang]} items={journal.related.claims} emptyText={T.empty[lang]} openLabel={T.open[lang]} kindClass={KIND_BADGE.claim} />
              <RelatedCard title={T.tsbHead[lang]} items={journal.related.tsb} emptyText={T.empty[lang]} openLabel={T.open[lang]} kindClass={KIND_BADGE.tsb} />
            </section>

            {/* Comments */}
            <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="text-lg font-bold">{T.comments[lang]}</h2>
                <span className="text-xs text-slate-400">{T.readOnlyNote[lang]}</span>
              </div>
              {journal.comments.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-500">{T.noComments[lang]}</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {journal.comments.map((c) => (
                    <li key={c.id} className="py-3">
                      <div className="flex flex-wrap items-baseline gap-2 text-xs text-slate-500">
                        <span className="font-mono">{fmtDate(c.date)}</span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${KIND_BADGE[c.source as TimelineKind] ?? KIND_BADGE.comment}`}>
                          {T[`source_${c.source}` as keyof typeof T]?.[lang] ?? c.source}
                        </span>
                        {c.author && <span>· {c.author}</span>}
                        {c.href && <Link to={c.href} className="ml-auto text-xs font-semibold text-slate-700 hover:underline">{T.open[lang]} →</Link>}
                      </div>
                      <div className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">{c.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Documents + Photos */}
            <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold mb-3">{T.documents[lang]}</h2>
                {journal.documents.filter(d => internal || d.visibility !== "internal").length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-500">{T.noDocs[lang]}</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {journal.documents.filter(d => internal || d.visibility !== "internal").map((d) => (
                      <li key={d.id} className="py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{d.file_name}</div>
                          <div className="text-xs text-slate-500">{fmtDate(d.created_at)}</div>
                        </div>
                        <button
                          onClick={() => handleOpenDoc(d)}
                          className="rounded-md bg-[#2d5a27] px-3 py-1 text-xs font-semibold text-white hover:bg-[#234a1f]"
                        >
                          {T.open[lang]}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold mb-3">{T.photos[lang]}</h2>
                {journal.photos.filter(d => internal || d.visibility !== "internal").length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-500">{T.noPhotos[lang]}</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {journal.photos.filter(d => internal || d.visibility !== "internal").map((d) => (
                      <li key={d.id} className="py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{d.file_name}</div>
                          <div className="text-xs text-slate-500">{fmtDate(d.created_at)}</div>
                        </div>
                        <button
                          onClick={() => handleOpenDoc(d)}
                          className="rounded-md bg-[#2d5a27] px-3 py-1 text-xs font-semibold text-white hover:bg-[#234a1f]"
                        >
                          {T.open[lang]}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Owners */}
            {journal.owners.length > 0 && (
              <section className="mb-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-bold mb-3">{T.owners[lang]}</h2>
                <ul className="divide-y divide-slate-100">
                  {journal.owners.map((o, i) => (
                    <li key={i} className="py-2 flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-slate-500">{o.period === "Nuværende" ? T.current[lang] : o.period}</span>
                      <span className="font-medium">{o.name}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}

// ---------- Subcomponents ----------

const TONE_CLASS: Record<StatusTone, string> = {
  green:   "bg-emerald-50 border-emerald-200 text-emerald-900",
  yellow:  "bg-amber-50 border-amber-200 text-amber-900",
  red:     "bg-red-50 border-red-200 text-red-900",
  neutral: "bg-slate-50 border-slate-200 text-slate-700",
};
const TONE_DOT: Record<StatusTone, string> = {
  green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500", neutral: "bg-slate-400",
};
const HEALTH_META: Record<HealthLevel, { label: string; cls: string; dot: string }> = {
  healthy:         { label: "Healthy",         cls: "bg-emerald-100 text-emerald-800 border-emerald-300", dot: "bg-emerald-500" },
  needs_attention: { label: "Needs Attention", cls: "bg-amber-100 text-amber-800 border-amber-300",       dot: "bg-amber-500" },
  critical:        { label: "Critical",        cls: "bg-red-100 text-red-800 border-red-300",             dot: "bg-red-500" },
};

function HealthDashboard({ summary }: { summary: JournalSummary }) {
  const meta = HEALTH_META[summary.health.level];
  return (
    <TooltipProvider delayDuration={200}>
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">Maskinestatus</h2>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${meta.cls}`}>
            <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {summary.statusItems.map((it) => {
            const card = (
              <div
                key={it.key}
                className={`rounded-lg border px-2.5 py-2 ${TONE_CLASS[it.tone]}`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-75">
                  <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[it.tone]}`} />
                  {it.label}
                </div>
                <div className="mt-0.5 text-sm font-semibold truncate" title={it.value}>{it.value}</div>
                {it.sub && (
                  <div className="text-[11px] font-medium opacity-80 truncate" title={it.sub}>{it.sub}</div>
                )}
              </div>
            );
            if (!it.tooltip) return card;
            return (
              <Tooltip key={it.key}>
                <TooltipTrigger asChild>
                  <div className={`rounded-lg border px-2.5 py-2 ${TONE_CLASS[it.tone]} cursor-help`}>
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-75">
                      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[it.tone]}`} />
                      {it.label}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold truncate" title={it.value}>{it.value}</div>
                    {it.sub && (
                      <div className="text-[11px] font-medium opacity-80 truncate" title={it.sub}>{it.sub}</div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs whitespace-pre-line">
                  {it.tooltip}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {summary.health.reasons.length > 0 && (
          <div className="mt-2 text-xs text-slate-600">
            <span className="font-semibold">Begrundelse:</span> {summary.health.reasons.join(" · ")}
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}



function StatCard({ label, value, tone }: { label: string; value: string; tone?: "amber" | "red" | "purple" }) {
  const toneClass =
    tone === "amber" ? "bg-amber-50 border-amber-200 text-amber-900"
    : tone === "red" ? "bg-red-50 border-red-200 text-red-900"
    : tone === "purple" ? "bg-purple-50 border-purple-200 text-purple-900"
    : "bg-white border-slate-200 text-slate-900";
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${toneClass}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function RelatedCard({
  title, items, emptyText, openLabel, kindClass,
}: {
  title: string;
  items: Array<{ id: string; label: string; sublabel?: string; date?: string | null; href?: string }>;
  emptyText: string;
  openLabel: string;
  kindClass: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${kindClass}`}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">{emptyText}</div>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 8).map((it) => (
            <li key={it.id} className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{it.label}</div>
                {it.sublabel && <div className="text-xs text-slate-500 truncate">{it.sublabel}</div>}
                {it.date && <div className="text-[11px] font-mono text-slate-400">{fmtDate(it.date)}</div>}
              </div>
              {it.href && (
                <Link to={it.href} className="shrink-0 text-xs font-semibold text-slate-700 hover:underline">
                  {openLabel} →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label, active, activeClass, onClick,
}: {
  label: string;
  active: boolean;
  activeClass?: string;
  onClick: () => void;
}) {
  const cls = active
    ? `border ${activeClass ?? "bg-slate-900 text-white border-slate-900"}`
    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition ${cls}`}
    >
      {label}
    </button>
  );
}
