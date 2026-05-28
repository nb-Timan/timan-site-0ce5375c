/**
 * Phase 1 placeholder — "Søg på maskine".
 * Adds basic search against public.machines (RLS-respected).
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { getPortalBackTarget } from "@/lib/portalBackNav";
import { supabase } from "@/lib/supabase";
import { Language } from "@/types/configurator";

interface MachineRow {
  id: string;
  serial_number: string | null;
  machine_number: string | null;
  machine_type: string | null;
  model: string | null;
  dealer_name: string | null;
  dealer_number: string | null;
  customer_name: string | null;
  current_hours: number | null;
}

const T: Record<string, Record<Language, string>> = {
  back:        { da: "Tilbage til Teknik & Service", en: "Back to Technical & Service", de: "Zurück zu Technik & Service", it: "Torna a Tecnico & Assistenza", hu: "Vissza a Műszaki & Szerviz oldalra" },
  title:       { da: "Søg på maskine", en: "Search machine", de: "Maschine suchen", it: "Cerca macchina", hu: "Gép keresése" },
  lead:        { da: "Find en maskine på serienummer eller maskinnummer.", en: "Find a machine by serial number or machine number.", de: "Maschine über Seriennummer oder Maschinennummer finden.", it: "Trova una macchina tramite numero di serie o numero macchina.", hu: "Keressen gépet gyári szám vagy gép szám alapján." },
  placeholder: { da: "Serienummer / maskinnummer", en: "Serial number / machine number", de: "Seriennummer / Maschinennummer", it: "Numero di serie / numero macchina", hu: "Gyári szám / gép szám" },
  searchBtn:   { da: "Søg", en: "Search", de: "Suchen", it: "Cerca", hu: "Keresés" },
  searching:   { da: "Søger…", en: "Searching…", de: "Suche…", it: "Ricerca…", hu: "Keresés…" },
  notFound:    { da: "Ingen maskine fundet.", en: "No machine found.", de: "Keine Maschine gefunden.", it: "Nessuna macchina trovata.", hu: "Nincs találat." },
  errorMsg:    { da: "Fejl ved søgning.", en: "Search error.", de: "Suchfehler.", it: "Errore di ricerca.", hu: "Keresési hiba." },
  profile:     { da: "Maskinprofil", en: "Machine profile", de: "Maschinenprofil", it: "Profilo macchina", hu: "Gépprofil" },
  serial:      { da: "Serienummer", en: "Serial number", de: "Seriennummer", it: "Numero di serie", hu: "Gyári szám" },
  machineNo:   { da: "Maskinnummer", en: "Machine number", de: "Maschinennummer", it: "Numero macchina", hu: "Gép szám" },
  machineType: { da: "Maskintype", en: "Machine type", de: "Maschinentyp", it: "Tipo macchina", hu: "Gép típusa" },
  model:       { da: "Model", en: "Model", de: "Modell", it: "Modello", hu: "Modell" },
  dealer:      { da: "Forhandler", en: "Dealer", de: "Händler", it: "Rivenditore", hu: "Forgalmazó" },
  customer:    { da: "Kunde", en: "Customer", de: "Kunde", it: "Cliente", hu: "Ügyfél" },
  hours:       { da: "Driftstimer", en: "Operating hours", de: "Betriebsstunden", it: "Ore di funzionamento", hu: "Üzemórák" },
  emptyVal:    { da: "—", en: "—", de: "—", it: "—", hu: "—" },
};

export default function MachineSearchPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MachineRow | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setResult(null);
    try {
      const { data, error } = await supabase
        .from("machines")
        .select("id, serial_number, machine_number, machine_type, model, dealer_name, dealer_number, customer_name, current_hours")
        .or(`serial_number.ilike.${q},machine_number.ilike.${q}`)
        .limit(1);
      if (error) throw error;
      setResult((data && data[0]) ? (data[0] as MachineRow) : null);
    } catch (e) {
      console.error(e);
      setError(T.errorMsg[lang]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const dash = T.emptyVal[lang];
  const fmt = (v: string | number | null | undefined) =>
    v === null || v === undefined || v === "" ? dash : String(v);

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

        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
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
            <div className="mt-6 text-center text-sm text-red-600">{error}</div>
          )}

          {!loading && !error && searched && !result && (
            <div className="mt-6 text-center text-sm text-slate-500">{T.notFound[lang]}</div>
          )}

          {result && (
            <div className="mt-8 max-w-2xl mx-auto rounded-xl border border-slate-200 bg-slate-50 p-6">
              <h2 className="text-lg font-bold mb-4">{T.profile[lang]}</h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><dt className="text-slate-500">{T.serial[lang]}</dt><dd className="font-medium">{fmt(result.serial_number)}</dd></div>
                <div><dt className="text-slate-500">{T.machineNo[lang]}</dt><dd className="font-medium">{fmt(result.machine_number)}</dd></div>
                <div><dt className="text-slate-500">{T.machineType[lang]}</dt><dd className="font-medium">{fmt(result.machine_type)}</dd></div>
                <div><dt className="text-slate-500">{T.model[lang]}</dt><dd className="font-medium">{fmt(result.model)}</dd></div>
                <div><dt className="text-slate-500">{T.dealer[lang]}</dt><dd className="font-medium">{fmt(result.dealer_name || result.dealer_number)}</dd></div>
                <div><dt className="text-slate-500">{T.customer[lang]}</dt><dd className="font-medium">{fmt(result.customer_name)}</dd></div>
                <div><dt className="text-slate-500">{T.hours[lang]}</dt><dd className="font-medium">{fmt(result.current_hours)}</dd></div>
              </dl>
            </div>
          )}
        </section>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
