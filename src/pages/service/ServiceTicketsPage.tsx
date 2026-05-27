/**
 * Phase 1 placeholder — "Service tickets".
 * Empty page shell only. No data, no SQL. Real list/create/detail comes in Phase 3.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Ticket } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { getPortalBackTarget } from "@/lib/portalBackNav";
import { Language } from "@/types/configurator";

const T: Record<string, Record<Language, string>> = {
  back:    { da: "Tilbage til Teknik & Service", en: "Back to Technical & Service", de: "Zurück zu Technik & Service", it: "Torna a Tecnico & Assistenza", hu: "Vissza a Műszaki & Szerviz oldalra" },
  title:   { da: "Service tickets", en: "Service tickets", de: "Service-Tickets", it: "Ticket di assistenza", hu: "Szervizjegyek" },
  lead:    { da: "Opret, følg og håndter servicehenvendelser pr. maskine.", en: "Create, track and handle service requests per machine.", de: "Service-Anfragen pro Maschine erstellen, verfolgen und bearbeiten.", it: "Crea, monitora e gestisci le richieste di assistenza per macchina.", hu: "Szerviz kérések létrehozása, követése és kezelése gépenként." },
  soon:    { da: "Kommer snart", en: "Coming soon", de: "Bald verfügbar", it: "In arrivo", hu: "Hamarosan" },
  body:    { da: "Dette modul er under opbygning. Næste fase tilføjer liste, opret-formular og detalje-visning.", en: "This module is being built. The next phase will add list, create form and detail view.", de: "Dieses Modul wird aufgebaut. Die nächste Phase ergänzt Liste, Erstellungsformular und Detailansicht.", it: "Questo modulo è in costruzione. La prossima fase aggiungerà elenco, modulo di creazione e vista dettagliata.", hu: "Ez a modul fejlesztés alatt áll. A következő fázis hozza a listát, létrehozó űrlapot és részletes nézetet." },
};

export default function ServiceTicketsPage() {
  const { appUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  if (!appUser) {
    navigate("/portal", { replace: true });
    return null;
  }

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
            <Ticket className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{T.title[lang]}</h1>
            <p className="mt-1 text-sm text-slate-500">{T.lead[lang]}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm text-center">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 mb-4">
            {T.soon[lang]}
          </span>
          <p className="text-sm text-slate-600 max-w-xl mx-auto">{T.body[lang]}</p>
        </section>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
