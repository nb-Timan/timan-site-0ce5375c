import { Navigate, useNavigate } from 'react-router-dom';
import { Calculator, Leaf } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  title:   { da: 'Beregnere & kalkulatorer', en: 'Calculators', de: 'Rechner', it: 'Calcolatori', hu: 'Kalkulátorok' },
  intro: {
    da: 'Vælg en beregner for at fortsætte.',
    en: 'Choose a calculator to continue.',
    de: 'Wählen Sie einen Rechner, um fortzufahren.',
    it: 'Seleziona un calcolatore per continuare.',
    hu: 'Válasszon kalkulátort a folytatáshoz.',
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
  co2Title: { da: 'CO2 Kalkulator', en: 'CO2 Calculator', de: 'CO2-Rechner', it: 'Calcolatore CO2', hu: 'CO2 Kalkulátor' },
  co2Desc: {
    da: 'Sammenlign CO2-udledning og brændstofbesparelse mod konkurrenter.',
    en: 'Compare CO2 emissions and fuel savings against competitors.',
    de: 'Vergleichen Sie CO2-Emissionen und Kraftstoffeinsparungen mit Wettbewerbern.',
    it: 'Confronta emissioni CO2 e risparmio carburante con i concorrenti.',
    hu: 'Hasonlítsa össze a CO2-kibocsátást és üzemanyag-megtakarítást a versenytársakkal.',
  },
  co2Cta: { da: 'Åbn kalkulator →', en: 'Open calculator →', de: 'Rechner öffnen →', it: 'Apri calcolatore →', hu: 'Kalkulátor megnyitása →' },
};

export default function ResourcesPage() {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  {
    const portalRole = (appUser as { portal_role?: string | null }).portal_role ?? null;
    const dealerSideRoles = new Set(['timan_dealer','timan_importer','timan_service_partner','dealer_user','private_end_user','timan_backend','timan_seller','timan_service']);
    if (appUser.role === 'slutkunde' && !(portalRole && dealerSideRoles.has(portalRole))) {
      return <Navigate to="/configurator" replace />;
    }
  }

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

      {/* Page header */}
      <header className="bg-white border-b border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">{T.title[lang]}</h1>
          <p className="text-gray-500 mt-2">{T.intro[lang]}</p>
        </div>
      </header>

      {/* Cards grid — 1 / 2 columns matching mockup */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Driftberegner card */}
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

          {/* CO2 Kalkulator card */}
          <button
            type="button"
            onClick={() => navigate('/portal/resources/co2')}
            className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm cursor-pointer group text-left transition-all duration-300 hover:-translate-y-1.5 hover:shadow-md"
          >
            <div className="w-12 h-12 bg-[#2d5a27] rounded-lg flex items-center justify-center text-white mb-6">
              <Leaf className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-gray-900">{T.co2Title[lang]}</h3>
            <p className="text-gray-500 text-sm mb-4">{T.co2Desc[lang]}</p>
            <span className="text-[#2d5a27] font-bold text-sm uppercase">{T.co2Cta[lang]}</span>
          </button>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
