/**
 * Phase 1 placeholder — "Søg på maskine".
 * Empty page shell only. Real search + machine profile comes in Phase 4.
 */
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Search } from "lucide-react";
import PortalHeader from "@/components/portal/PortalHeader";
import PortalFooter from "@/components/portal/PortalFooter";
import { useAppUser } from "@/context/AppUserContext";
import { useLanguage } from "@/context/LanguageContext";
import { getPortalBackTarget } from "@/lib/portalBackNav";
import { Language } from "@/types/configurator";

const T: Record<string, Record<Language, string>> = {
  back:        { da: "Tilbage til Teknik & Service", en: "Back to Technical & Service", de: "Zurück zu Technik & Service", it: "Torna a Tecnico & Assistenza", hu: "Vissza a Műszaki & Szerviz oldalra" },
  title:       { da: "Søg på maskine", en: "Search machine", de: "Maschine suchen", it: "Cerca macchina", hu: "Gép keresése" },
  lead:        { da: "Find en maskine på serienummer og se samlet maskinprofil med service, claims, garantier og TSB.", en: "Find a machine by serial number and see a full machine profile with service, claims, warranties and TSBs.", de: "Maschine über die Seriennummer finden und vollständiges Maschinenprofil mit Service, Reklamationen, Garantien und TSBs ansehen.", it: "Trova una macchina tramite il numero di serie e visualizza il profilo completo con assistenza, reclami, garanzie e TSB.", hu: "Keressen gépet gyári szám alapján, és tekintse meg a teljes gépprofilt szervizzel, reklamációkkal, garanciákkal és TSB-kkel." },
  soon:        { da: "Kommer snart", en: "Coming soon", de: "Bald verfügbar", it: "In arrivo", hu: "Hamarosan" },
  body:        { da: "Dette modul er under opbygning. Næste fase tilføjer søgning og fuld maskinprofil.", en: "This module is being built. The next phase will add search and a full machine profile.", de: "Dieses Modul wird aufgebaut. Die nächste Phase ergänzt Suche und vollständiges Maschinenprofil.", it: "Questo modulo è in costruzione. La prossima fase aggiungerà la ricerca e il profilo completo della macchina.", hu: "Ez a modul fejlesztés alatt áll. A következő fázis hozza a keresést és a teljes gépprofilt." },
  placeholder: { da: "Serienummer / maskinnummer", en: "Serial number / machine number", de: "Seriennummer / Maschinennummer", it: "Numero di serie / numero macchina", hu: "Gyári szám / gép szám" },
};

export default function MachineSearchPage() {
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
            <Search className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{T.title[lang]}</h1>
            <p className="mt-1 text-sm text-slate-500">{T.lead[lang]}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <div className="max-w-xl mx-auto">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                disabled
                placeholder={T.placeholder[lang]}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-400 cursor-not-allowed"
              />
            </div>
            <div className="text-center">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 mb-4">
                {T.soon[lang]}
              </span>
              <p className="text-sm text-slate-600">{T.body[lang]}</p>
            </div>
          </div>
        </section>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
