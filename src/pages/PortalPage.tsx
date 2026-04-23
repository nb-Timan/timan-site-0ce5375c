import { Navigate, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useConfigurator } from '@/hooks/useConfigurator';
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
    da: 'Din centrale adgang til konfiguration, salgsværktøjer og teknisk support.',
    en: 'Your central access to configuration, sales tools and technical support.',
    de: 'Ihr zentraler Zugang zu Konfiguration, Vertriebstools und technischem Support.',
    it: 'Il tuo accesso centrale a configurazione, strumenti di vendita e supporto tecnico.',
    hu: 'Központi hozzáférése a konfigurációhoz, értékesítési eszközökhöz és műszaki támogatáshoz.',
  },
};

export default function PortalPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { state, setLanguage } = useConfigurator();
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
            <span className="text-2xl font-bold tracking-tight text-emerald-700">TIMAN</span>
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
  const greetingName = appUser.display_name ? `, ${appUser.display_name}` : '';

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

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 md:px-8 py-8 space-y-10">
        {/* Hero / welcome banner — light card */}
        <section className="rounded-3xl border border-gray-200 bg-white shadow-sm p-6 md:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 md:gap-7">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-4xl md:text-5xl font-bold shadow-sm flex-shrink-0">
              T
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                {T.heroTitle[lang]}{greetingName}
              </h1>
              <p className="mt-2 text-sm md:text-base text-gray-500 max-w-2xl">
                {T.heroBody[lang]}
              </p>
            </div>
          </div>
        </section>

        {/* 4-card grid */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {visibleModules.map(m => (
              <ModuleCard key={m.id} module={m} language={lang} />
            ))}
          </div>
        </section>

        {/* Latest from Timan */}
        <LatestFromTiman language={lang} />
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
