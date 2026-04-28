import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import { Language } from '@/types/configurator';
import {
  derivePortalRole,
  getPortalPermissions,
  hasModuleAccess,
  getClaimsViewVariant,
  ModuleAccessKey,
} from '@/lib/portalAccess';
import ClaimsInternalView from '@/components/claims/ClaimsInternalView';
import ClaimsDealerView from '@/components/claims/ClaimsDealerView';

const T: Record<string, Record<Language, string>> = {
  back:     { da: 'Tilbage til Timan Portalen', en: 'Back to Timan Portal', de: 'Zurück zum Timan Portal', it: 'Torna al Portale Timan', hu: 'Vissza a Timan Portálra' },
  noAccess: { da: 'Ingen adgang til Service / Claims.', en: 'No access to Service / Claims.', de: 'Kein Zugriff.', it: 'Nessun accesso.', hu: 'Nincs hozzáférés.' },
};

export default function ClaimsPage() {
  const { appUser, loading: authLoading, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">…</div>
      </div>
    );
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  const portalRole = derivePortalRole(appUser);
  const allowed = hasModuleAccess(
    portalRole,
    'claims',
    (appUser.module_access as ModuleAccessKey[] | null | undefined) ?? null,
  );
  const perms = portalRole ? getPortalPermissions(portalRole) : null;
  const viewVariant = getClaimsViewVariant(portalRole);
  const canCreate = !!perms?.canCreateClaim;
  const isReadOnly = !perms?.canEditData;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      {/* Back button — same for all role variants, keeps the unified portal nav */}
      <div className="bg-white border-b border-gray-200 py-3">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/portal')}
            className="flex items-center text-[#2d5a27] font-semibold hover:underline"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            {T.back[lang]}
          </button>
        </div>
      </div>

      {!allowed || viewVariant === 'none' ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-grow w-full">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 flex items-center gap-3 text-gray-700">
            <AlertCircle className="h-5 w-5 text-rose-500" />
            {T.noAccess[lang]}
          </div>
        </main>
      ) : viewVariant === 'internal' ? (
        <ClaimsInternalView lang={lang} />
      ) : (
        <ClaimsDealerView
          lang={lang}
          userEmail={appUser.email}
          canCreate={canCreate}
          readOnly={isReadOnly}
        />
      )}

      <PortalFooter language={lang} />
    </div>
  );
}
