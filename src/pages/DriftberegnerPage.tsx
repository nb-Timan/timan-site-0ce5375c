import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useConfigurator } from '@/hooks/useConfigurator';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';

const LANGS: { code: Language; flag: string; label: string }[] = [
  { code: 'da', flag: '🇩🇰', label: 'DA' },
  { code: 'en', flag: '🇬🇧', label: 'EN' },
  { code: 'de', flag: '🇩🇪', label: 'DE' },
  { code: 'it', flag: '🇮🇹', label: 'IT' },
  { code: 'hu', flag: '🇭🇺', label: 'HU' },
];

const T: Record<string, Record<Language, string>> = {
  back: {
    da: 'Tilbage til ressourcer',
    en: 'Back to resources',
    de: 'Zurück zu Ressourcen',
    it: 'Torna alle risorse',
    hu: 'Vissza a forrásokhoz',
  },
  title: { da: 'Driftberegner', en: 'Operating cost calculator', de: 'Betriebskostenrechner', it: 'Calcolatore costi', hu: 'Üzemköltség kalkulátor' },
  placeholder: {
    da: 'Beregneren bliver tilføjet her.',
    en: 'The calculator will be added here.',
    de: 'Der Rechner wird hier hinzugefügt.',
    it: 'Il calcolatore verrà aggiunto qui.',
    hu: 'A kalkulátor itt kerül hozzáadásra.',
  },
};

export default function DriftberegnerPage() {
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

      {/* Calculator sub-header — matches mockup: bg-white, border-b, py-6, max-w-4xl */}
      <header className="bg-white border-b border-gray-200 py-6 no-print">
        <div className="max-w-4xl mx-auto px-4 flex justify-between items-center">
          <button
            onClick={() => navigate('/portal/resources')}
            className="flex items-center text-[#2d5a27] font-semibold hover:underline"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            {T.back[lang]}
          </button>

          {/* Language selector slot (#lang-selector-placeholder in mockup) */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-50 border border-gray-200">
            {LANGS.map(l => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 transition ${
                  lang === l.code ? 'bg-white shadow-sm border border-[#2d5a27]/30 text-gray-900' : 'text-gray-600 hover:bg-white'
                }`}
                aria-label={l.code}
              >
                <span className="text-base leading-none">{l.flag}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Calculator main — matches mockup: max-w-4xl, px-4 py-8, centered */}
      <main className="max-w-4xl mx-auto px-4 py-8 flex flex-col items-center w-full flex-grow">
        <div id="calculator-app" className="w-full space-y-6">
          {/* Calculator UI/logic from uploaded file goes here */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{T.title[lang]}</h1>
            <p className="text-gray-500 text-sm">{T.placeholder[lang]}</p>
          </div>
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
