import { Navigate, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import ModuleCard from '@/components/portal/ModuleCard';
import PlaceholderCard from '@/components/portal/PlaceholderCard';
import { PORTAL_AREAS, isAreaVisible, PortalAreaId } from '@/lib/portalAreas';
import { PORTAL_MODULES, isModuleVisible } from '@/lib/portalModules';
import { canAccessTsb } from '@/components/tsb/TsbAccessGuard';
import { derivePortalRole } from '@/lib/portalAccess';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  back: { da: 'Tilbage til portal', en: 'Back to portal', de: 'Zurück zum Portal', it: 'Torna al portale', hu: 'Vissza a portálra' },
};

interface Props { areaId: PortalAreaId }

export default function PortalAreaPage({ areaId }: Props) {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

  const area = PORTAL_AREAS.find(a => a.id === areaId);
  if (!area || !isAreaVisible(area, appUser)) return <Navigate to="/portal" replace />;

  const portalRole = derivePortalRole(appUser);
  const areaModules = PORTAL_MODULES.filter(m => area.moduleIds.includes(m.id)).filter(m => isModuleVisible(m, appUser));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full">
        <Link to="/portal" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {T.back[lang]}
        </Link>

        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{area.title[lang] || area.title.en}</h1>
          <p className="text-gray-600 text-base mt-2 max-w-3xl">{area.description[lang] || area.description.en}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {areaModules.map(m => <ModuleCard key={m.id} module={m} language={lang} />)}
          {area.placeholders.map(p => {
            let href: string | undefined;
            if (p.key === 'tsb_portal') {
              // TSB is internal-only — hide card entirely for roles without access
              if (!canAccessTsb(portalRole)) return null;
              href = '/portal/service/tsb/dashboard';
            } else if (p.key === 'warranty_reg') {
              href = '/portal/service/warranty';
            } else if (p.key === 'service_info') {
              href = '/portal/service/information';
            }
            return (
              <PlaceholderCard
                key={p.key}
                title={p.title[lang] || p.title.en}
                language={lang}
                to={href}
              />
            );
          })}
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
