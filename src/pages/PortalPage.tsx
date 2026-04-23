import { Navigate, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useConfigurator } from '@/hooks/useConfigurator';
import LoginStep from '@/components/configurator/LoginStep';
import PortalHeader from '@/components/portal/PortalHeader';
import ModuleCard from '@/components/portal/ModuleCard';
import LatestFromTiman from '@/components/portal/LatestFromTiman';
import { PORTAL_MODULES, isModuleVisible } from '@/lib/portalModules';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  yourTools:    { da: 'Dine værktøjer', en: 'Your tools', de: 'Ihre Tools', it: 'I tuoi strumenti', hu: 'Az eszközei' },
  loginNeeded:  { da: 'Log ind for at fortsætte', en: 'Log in to continue', de: 'Bitte anmelden', it: 'Accedi per continuare', hu: 'Jelentkezzen be a folytatáshoz' },
  heroEyebrow:  { da: 'Forhandlerportal', en: 'Dealer portal', de: 'Händlerportal', it: 'Portale rivenditori', hu: 'Kereskedői portál' },
  heroTitle:    { da: 'Velkommen til Timan', en: 'Welcome to Timan', de: 'Willkommen bei Timan', it: 'Benvenuto in Timan', hu: 'Üdvözöljük a Timannál' },
  heroBody: {
    da: 'Byg konfigurationer, find ressourcer og hold dig opdateret med det seneste fra Timan.',
    en: 'Build configurations, find resources and stay up to date with the latest from Timan.',
    de: 'Erstellen Sie Konfigurationen, finden Sie Ressourcen und bleiben Sie auf dem Laufenden.',
    it: 'Crea configurazioni, trova risorse e resta aggiornato con le ultime novità di Timan.',
    hu: 'Készítsen konfigurációkat, találjon forrásokat és maradjon naprakész a Timan híreivel.',
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
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg">T</div>
            <span className="text-lg font-bold text-gray-900">Timan</span>
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
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate('/portal', { replace: true });
        }}
      />

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-10">
        {/* Hero / welcome banner */}
        <section className="relative overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 text-white shadow-sm">
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.2) 0, transparent 35%)',
            }}
          />
          <div className="relative px-6 md:px-10 py-10 md:py-14 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-[11px] font-semibold uppercase tracking-wider">
              {T.heroEyebrow[lang]}
            </div>
            <h1 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">
              {T.heroTitle[lang]}{appUser.company_name ? `, ${appUser.company_name}` : ''}
            </h1>
            <p className="mt-3 text-sm md:text-base text-emerald-50/90 max-w-xl">
              {T.heroBody[lang]}
            </p>
          </div>
        </section>

        {/* 4-card grid */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {T.yourTools[lang]}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {visibleModules.map(m => (
              <ModuleCard key={m.id} module={m} language={lang} />
            ))}
          </div>
        </section>

        {/* Latest from Timan */}
        <LatestFromTiman language={lang} />
      </main>
    </div>
  );
}
