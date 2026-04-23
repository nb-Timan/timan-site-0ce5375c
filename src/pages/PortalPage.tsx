import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useConfigurator } from '@/hooks/useConfigurator';
import LoginStep from '@/components/configurator/LoginStep';
import PortalHeader from '@/components/portal/PortalHeader';
import MetricStrip from '@/components/portal/MetricStrip';
import ModuleCard from '@/components/portal/ModuleCard';
import {
  PORTAL_MODULES,
  isModuleVisible,
  loadDashboardMetrics,
  EMPTY_METRICS,
  DashboardMetrics,
} from '@/lib/portalModules';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  yourTools:   { da: 'Dine værktøjer', en: 'Your tools', de: 'Ihre Tools', it: 'I tuoi strumenti', hu: 'Az eszközei' },
  overview:    { da: 'Overblik', en: 'Overview', de: 'Übersicht', it: 'Panoramica', hu: 'Áttekintés' },
  loginNeeded: { da: 'Log ind for at fortsætte', en: 'Log in to continue', de: 'Bitte anmelden', it: 'Accedi per continuare', hu: 'Jelentkezzen be a folytatáshoz' },
};

export default function PortalPage() {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { state, setLanguage } = useConfigurator();
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);

  useEffect(() => {
    if (!appUser) return;
    let cancelled = false;
    loadDashboardMetrics(appUser).then(m => {
      if (!cancelled) setMetrics(m);
    });
    return () => { cancelled = true; };
  }, [appUser]);

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

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={state.language}
        onLanguageChange={setLanguage}
        onLogout={async () => {
          await logout();
          navigate('/portal', { replace: true });
        }}
      />

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {T.overview[state.language]}
          </h2>
          <MetricStrip metrics={metrics} language={state.language} />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {T.yourTools[state.language]}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleModules.map(m => (
              <ModuleCard key={m.id} module={m} language={state.language} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
