import { ReactNode } from 'react';
import { Navigate, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { PORTAL_LANGUAGES } from '@/lib/portalLanguages';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import BackButton from '@/components/portal/BackButton';
import DemoModeBadge from '@/components/messe/DemoModeBadge';
import BackendExitButton from '@/components/messe/BackendExitButton';
import BackendRolePreviewSwitcher from '@/components/messe/BackendRolePreviewSwitcher';

import { derivePortalRole, hasModuleAccess, isExhibitionRole } from '@/lib/portalAccess';
import timanLogo from '@/assets/timan-logo.png';



import LastChangedLine from '@/components/portal/LastChangedLine';
import type { ModuleKey } from '@/lib/portalChangelog';

interface Props {
  title: string;
  intro?: string;
  /** Optional override for back link target. */
  backTo?: string;
  /** Optional changelog module key — renders "Senest ændret …" under the title. */
  changelogModule?: ModuleKey;
  children: ReactNode;
}

export default function MiscPageShell({ title, intro, backTo, changelogModule, children }: Props) {
  const { appUser, loading, logout } = useAppUser();
  const { language: lang, setLanguage, uiLanguage } = useLanguage();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }

  // Exhibition / Timan Messe demo session: render a minimal Messe-styled
  // shell so /messe/partner-map (and similar) work without the dealer-side
  // portal chrome and access gates.
  const exhibitionRole = isExhibitionRole(derivePortalRole(appUser));
  if (exhibitionRole) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <Link to="/messe" className="flex items-center gap-3">
              <img src={timanLogo} alt="Timan" className="h-10 sm:h-12 w-auto" />
              <DemoModeBadge />
            </Link>
            <Link to="/messe" className="inline-flex items-center text-sm font-semibold text-emerald-800 hover:underline">
              <ArrowLeft className="h-4 w-4 mr-1" /> Tilbage til Messe
            </Link>
            <div className="flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-200 p-1">
              {PORTAL_LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  className={`px-2 py-1 rounded-md text-base leading-none ${uiLanguage === l.code ? 'bg-white shadow-sm border border-emerald-700/30' : 'border border-transparent hover:bg-white'}`}
                  title={l.label}
                  aria-label={l.code}
                >
                  {l.emoji}
                </button>
              ))}
            </div>
            <BackendExitButton />
          </div>

        </header>
        <header className="bg-white border-b border-slate-200 py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{title}</h1>
            {intro && <p className="text-slate-500 mt-2 max-w-3xl whitespace-pre-line">{intro}</p>}
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
          {children}
        </main>
      </div>
    );
  }

  if (!appUser) return <Navigate to="/portal" replace />;
  {
    const portalRoleRaw = (appUser as { portal_role?: string | null }).portal_role ?? null;
    const dealerSideRoles = new Set(['timan_dealer','timan_importer','timan_service_partner','dealer_user','timan_backend','timan_seller','timan_service']);
    if (appUser.role === 'slutkunde' && !(portalRoleRaw && dealerSideRoles.has(portalRoleRaw))) {
      return <Navigate to="/configurator" replace />;
    }
  }

  // Gate behind sales_tools (same key used for the "Diverse" module card).
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

      <div className="bg-white border-b border-gray-200 py-3 no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <BackButton to={backTo} />
        </div>
      </div>

      <header className="bg-white border-b border-gray-200 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          {intro && <p className="text-gray-500 mt-2 max-w-3xl whitespace-pre-line">{intro}</p>}
          {changelogModule && <LastChangedLine moduleKey={changelogModule} className="mt-3" />}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        {children}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
