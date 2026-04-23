import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calculator, Mail, FileText } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useConfigurator } from '@/hooks/useConfigurator';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  back:    { da: 'Tilbage til dashboard', en: 'Back to dashboard', de: 'Zurück zum Dashboard', it: 'Torna alla dashboard', hu: 'Vissza az irányítópultra' },
  title:   { da: 'Ressourcer', en: 'Resources', de: 'Ressourcen', it: 'Risorse', hu: 'Források' },
  intro: {
    da: 'Vælg et værktøj eller dokument for at fortsætte.',
    en: 'Choose a tool or document to continue.',
    de: 'Wählen Sie ein Werkzeug oder Dokument, um fortzufahren.',
    it: 'Seleziona uno strumento o documento per continuare.',
    hu: 'Válasszon eszközt vagy dokumentumot a folytatáshoz.',
  },
  driftTitle: { da: 'Driftberegner', en: 'Operating cost calculator', de: 'Betriebskostenrechner', it: 'Calcolatore costi', hu: 'Üzemköltség kalkulátor' },
  driftDesc: {
    da: 'Beregn TCO og driftsomkostninger for RC-serien og 3330.',
    en: 'Calculate TCO and operating costs for the RC series and 3330.',
    de: 'Berechnen Sie TCO und Betriebskosten für die RC-Serie und 3330.',
    it: 'Calcola TCO e costi operativi per la serie RC e 3330.',
    hu: 'Számítsa ki a TCO-t és üzemköltségeket az RC sorozat és 3330 esetében.',
  },
  driftCta: { da: 'Åbn beregner →', en: 'Open calculator →', de: 'Rechner öffnen →', it: 'Apri calcolatore →', hu: 'Kalkulátor megnyitása →' },
  newsletters: { da: 'Nyhedsbreve', en: 'Newsletters', de: 'Newsletter', it: 'Newsletter', hu: 'Hírlevelek' },
  forms:       { da: 'Formularer', en: 'Forms', de: 'Formulare', it: 'Moduli', hu: 'Űrlapok' },
  comingSoon:  { da: 'Kommer snart...', en: 'Coming soon...', de: 'Demnächst...', it: 'Prossimamente...', hu: 'Hamarosan...' },
};

export default function ResourcesPage() {
  const { appUser, loading, logout } = useAppUser();
  const { state, setLanguage } = useConfigurator();
  const navigate = useNavigate();
  const lang = state.language;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate('/portal', { replace: true });
        }}
      />

      {/* Page header — bg-white, border-b, py-10 (matches mockup) */}
      <header className="bg-white border-b border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/portal')}
            className="flex items-center text-[#2d5a27] font-semibold mb-4 hover:underline"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            {T.back[lang]}
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{T.title[lang]}</h1>
          <p className="text-gray-500 mt-2">{T.intro[lang]}</p>
        </div>
      </header>

      {/* Cards grid — 1 / 3 columns, gap-6 (matches mockup) */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Driftberegner — active */}
          <button
            type="button"
            onClick={() => navigate('/portal/resources/driftberegner')}
            className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm cursor-pointer group text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md"
          >
            <div className="w-12 h-12 bg-[#2d5a27] rounded-lg flex items-center justify-center text-white mb-6">
              <Calculator className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-gray-900">{T.driftTitle[lang]}</h3>
            <p className="text-gray-500 text-sm mb-4">{T.driftDesc[lang]}</p>
            <span className="text-[#2d5a27] font-bold text-sm uppercase">{T.driftCta[lang]}</span>
          </button>

          {/* Newsletters — coming soon */}
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm opacity-60">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 mb-6">
              <Mail className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-gray-900">{T.newsletters[lang]}</h3>
            <p className="text-gray-400 text-sm italic">{T.comingSoon[lang]}</p>
          </div>

          {/* Forms — coming soon */}
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm opacity-60">
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 mb-6">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-gray-900">{T.forms[lang]}</h3>
            <p className="text-gray-400 text-sm italic">{T.comingSoon[lang]}</p>
          </div>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
