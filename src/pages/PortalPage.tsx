import { Navigate, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import LoginStep from '@/components/configurator/LoginStep';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import ModuleCard from '@/components/portal/ModuleCard';
import LatestFromTiman from '@/components/portal/LatestFromTiman';
import { PORTAL_MODULES, isModuleVisible } from '@/lib/portalModules';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  loginNeeded:  { da: 'Log ind for at fortsætte', en: 'Log in to continue', de: 'Bitte anmelden', it: 'Accedi per continuare', hu: 'Jelentkezzen be a folytatáshoz' },
  heroTitle:    { da: 'Velkommen til Timan', en: 'Welcome to Timan', de: 'Willkommen bei Timan', it: 'Benvenuto in Timan', hu: 'Üdvözöljük a Timannál' },
  heroBody: {
    da: 'Din centrale adgang som samarbejdspartner til konfiguration, salgsværktøjer og værdifulde ressourcer.',
    en: 'Your central access to configuration, sales tools and technical support.',
    de: 'Ihr zentraler Zugang zu Konfiguration, Vertriebstools und technischem Support.',
    it: 'Il tuo accesso centrale a configurazione, strumenti di vendita e supporto tecnico.',
    hu: 'Központi hozzáférése a konfigurációhoz, értékesítési eszközökhöz és műszaki támogatáshoz.',
  },
  heroAlt: {
    da: 'Timan industri', en: 'Timan industry', de: 'Timan Industrie', it: 'Industria Timan', hu: 'Timan ipar',
  },
};

export default function PortalPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  // Not logged in → render LoginStep, redirect to /portal on success
  if (!appUser) {
    return (
      <div className="min-h-screen p-4 md:p-8 bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-md mx-auto mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="bg-[#2d5a27] text-white font-bold px-3 py-1 rounded text-xl">TIMAN</span>
          </div>
          <p className="text-sm text-gray-500">{T.loginNeeded[state.language]}</p>
        </div>
        <LoginStep
          language={state.language}
          onResolved={(user) => {
            setAppUser(user);
            navigate('/portal', { replace: true });
          }}
        />
      </div>
    );
  }

  // Slutkunde / unapproved users go straight to the configurator (single-purpose access)
  if (appUser.role === 'slutkunde') {
    return <Navigate to="/configurator" replace />;
  }

  const visibleModules = PORTAL_MODULES.filter(m => isModuleVisible(m, appUser));
  const lang = state.language;

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

      {/* Hero Section — exact mockup: bg-gray-900, h-64, image overlay opacity-40, gradient-to-r from-black to-transparent */}
      <header className="relative bg-gray-900 h-64 flex items-center overflow-hidden">
        <div className="absolute inset-0 opacity-40">
          <div className="absolute inset-0 bg-gradient-to-r from-black to-transparent z-10"></div>
          <img
            src="https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&q=80&w=2070"
            alt={T.heroAlt[lang]}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-2">{T.heroTitle[lang]}</h1>
          <p className="text-gray-300 text-lg max-w-2xl">{T.heroBody[lang]}</p>
        </div>
      </header>

      {/* Dashboard Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        {/* Grid of categories — 1 / 2 / 4 columns, gap-8 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {visibleModules.map(m => (
            <ModuleCard key={m.id} module={m} language={lang} />
          ))}
        </div>

        {/* Seneste fra Timan */}
        <LatestFromTiman language={lang} />
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
