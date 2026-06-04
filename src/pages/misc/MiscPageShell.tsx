import { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { goBackOrFallback, getPortalBackTarget } from '@/lib/portalBackNav';
import { derivePortalRole, hasModuleAccess } from '@/lib/portalAccess';
import { Language } from '@/types/configurator';

const BACK: Record<Language, string> = {
  da: 'Tilbage', en: 'Back', de: 'Zurück', it: 'Indietro', hu: 'Vissza',
};

interface Props {
  title: string;
  intro?: string;
  /** Optional override for back link target. */
  backTo?: string;
  children: ReactNode;
}

export default function MiscPageShell({ title, intro, backTo, children }: Props) {
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

  const back = backTo ?? getPortalBackTarget(location.pathname);

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
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        {children}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
