import { Navigate, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Users, ShieldCheck, KeyRound, ScrollText, BarChart3, UserCog, LucideIcon } from 'lucide-react';
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
            let icon: LucideIcon | undefined;
            let description: string | undefined;
            if (p.key === 'tsb_portal') {
              // TSB is internal-only — hide card entirely for roles without access
              if (!canAccessTsb(portalRole)) return null;
              href = '/portal/service/tsb';
            } else if (p.key === 'warranty_reg') {
              href = '/portal/service/warranty';
            } else if (p.key === 'service_info') {
              href = '/portal/service/information';
            } else if (p.key === 'users') {
              href = '/portal/backend/users';
              icon = Users;
              description = lang === 'da' ? 'Administrer alle portal-brugere, godkend nye signups og tildel roller.' : 'Manage all portal users, approve signups and assign roles.';
            } else if (p.key === 'roles') {
              href = '/portal/backend/roles';
              icon = ShieldCheck;
              description = lang === 'da' ? 'Definér portal-roller og standard-rettigheder.' : 'Define portal roles and default permissions.';
            } else if (p.key === 'module_access') {
              href = '/portal/backend/module-access';
              icon = KeyRound;
              description = lang === 'da' ? 'Styr hvilke moduler hver rolle har adgang til.' : 'Control which modules each role can access.';
            } else if (p.key === 'audit') {
              href = '/portal/backend/audit-log';
              icon = ScrollText;
              description = lang === 'da' ? 'Se ændringer på brugere, roller og adgang.' : 'See changes to users, roles and access.';
            } else if (p.key === 'portal_analytics') {
              href = '/portal/backend/portal-analytics';
              icon = BarChart3;
              description = lang === 'da' ? 'Brug af portalen — besøg, sessioner og moduler.' : 'Portal usage — visits, sessions and modules.';
            } else if (p.key === 'dealer_accounts') {
              href = '/portal/backend/dealer-accounts';
              icon = Building2;
              description = lang === 'da'
                ? 'Master-overblik over alle forhandlere, service partnere og importører — med tildelt sælger, brugere, tilbud og ordrer.'
                : 'Master overview of all dealers, service partners and importers — with assigned seller, users, quotes and orders.';
            } else if (p.key === 'sellers') {
              href = '/portal/backend/sellers';
              icon = UserCog;
              description = lang === 'da' ? 'Timan sælgere og deres tildelte forhandlere.' : 'Timan sellers and their assigned dealers.';
            }
            return (
              <PlaceholderCard
                key={p.key}
                title={p.title[lang] || p.title.en}
                language={lang}
                to={href}
                icon={icon}
                description={description}
              />
            );
          })}
        </div>
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
