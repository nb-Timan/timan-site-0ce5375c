/**
 * Phase 3 — "Søg på maskine" read-only.
 * Search by serial_number or machine_number against public.machines (RLS).
 * Shows tabs; only Overblik renders real data — others are placeholders.
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { useEffectivePortalUser } from "@/lib/viewAsUser";
import { derivePortalRole } from "@/lib/portalAccess";
import { getPortalBackTarget } from "@/lib/portalBackNav";
import { findMachineByIdentifier, MachineRecord } from "@/lib/machineLifecycleService";
import { Language } from "@/types/configurator";

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
};

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
        <div className="mx-auto max-w-7xl px-6">
          <button
            onClick={() => navigate(getPortalBackTarget(location.pathname))}
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {T.back[lang]}
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-10 flex-1 w-full">
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
              {activeTab === "overview" ? (
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
              ) : (
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
