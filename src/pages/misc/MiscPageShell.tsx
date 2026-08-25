import { ReactNode } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import MesseSubpageHeader from '@/components/messe/MesseSubpageHeader';

import { derivePortalRole, hasModuleAccess } from '@/lib/portalAccess';

import LastChangedLine from '@/components/portal/LastChangedLine';
import type { ModuleKey } from '@/lib/portalChangelog';

interface Props {
  title: string;
  intro?: string;
  hideHeader?: boolean;
  /** Kept for compatibility; global portal header now owns back navigation. */
  backTo?: string;
  /** Optional changelog module key — renders "Senest ændret …" under the title. */
  changelogModule?: ModuleKey;
  children: ReactNode;
}

export default function MiscPageShell({ title, intro, hideHeader = false, backTo, changelogModule, children }: Props) {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  // /messe sub-routes share the simplified Messe layout.
  const onMesseRoute = location.pathname.startsWith('/messe');
  if (onMesseRoute) {
    if (!appUser) return null;
    return (
      <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
        <MesseSubpageHeader backLabel="Til forsiden" />
        {!hideHeader && (
          <header className="bg-white border-b border-slate-200 py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{title}</h1>
              {intro && <p className="text-slate-500 mt-2 max-w-3xl whitespace-pre-line">{intro}</p>}
            </div>
          </header>
        )}
        <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex-grow w-full ${hideHeader ? 'py-3' : 'py-8'}`}>
          {children}
        </main>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  {
    const portalRoleRaw = (appUser as { portal_role?: string | null }).portal_role ?? null;
    const dealerSideRoles = new Set(['timan_dealer','timan_importer','timan_service_partner','dealer_user','private_end_user','timan_backend','timan_seller','timan_service']);
    if (appUser.role === 'slutkunde' && !(portalRoleRaw && dealerSideRoles.has(portalRoleRaw))) {
      return <Navigate to="/configurator" replace />;
    }
  }

  // Gate behind sales_tools (same key used for the "Formularer" module card).
  const portalRole = derivePortalRole(appUser);
  const override = (appUser.module_access ?? null) as ('sales_tools' | string)[] | null;
  const allowed = portalRole
    ? hasModuleAccess(portalRole, 'sales_tools', override as never)
    : appUser.role === 'timan_saelger' || appUser.role === 'partner';
  if (!allowed) return <Navigate to="/portal/salg-marketing" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      {!hideHeader && (
        <header className="bg-white border-b border-gray-200 py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
            {intro && <p className="text-gray-500 mt-2 max-w-3xl whitespace-pre-line">{intro}</p>}
            {changelogModule && <LastChangedLine moduleKey={changelogModule} className="mt-3" />}
          </div>
        </header>
      )}

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex-grow w-full ${hideHeader ? 'py-4' : 'py-12'}`}>
        {children}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
