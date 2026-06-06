import { Navigate, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Users, ShieldCheck, KeyRound, ScrollText, BarChart3, UserCog, Tag, Upload, Wrench, Ticket, Search, LifeBuoy, LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useAppUser } from '@/context/AppUserContext';
import { useChangelog } from '@/lib/portalChangelog';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import ModuleCard from '@/components/portal/ModuleCard';
import PlaceholderCard from '@/components/portal/PlaceholderCard';
import BackendHome from '@/components/portal/BackendHome';
import { PORTAL_AREAS, isAreaVisible, PortalAreaId } from '@/lib/portalAreas';
import { PORTAL_MODULES, isModuleVisible } from '@/lib/portalModules';
import { canAccessTsb } from '@/components/tsb/TsbAccessGuard';
import { derivePortalRole, hasModuleAccess, ModuleAccessKey } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { Language } from '@/types/configurator';
import { t } from '@/lib/i18n/translations';

const AREA_TITLE_KEY: Record<string, string> = {
  teknik_service: 'area_teknik_service_title',
  salg_marketing: 'area_salg_marketing_title',
  timan_crm:      'area_timan_crm_title',
  timan_backend:  'area_timan_backend_title',
  dealer_data:    'area_dealer_data_title',
};
const AREA_DESC_KEY: Record<string, string> = {
  teknik_service: 'area_teknik_service_desc',
  salg_marketing: 'area_salg_marketing_desc',
  timan_crm:      'area_timan_crm_desc',
  timan_backend:  'area_timan_backend_desc',
  dealer_data:    'area_dealer_data_desc',
};

const PLACEHOLDER_TITLE_KEY: Record<string, string> = {
  tsb_portal: 'mod_tsb',
  warranty_reg: 'mod_warranty_reg',
  service_maintenance: 'mod_service_maintenance',
  service_tickets: 'mod_service_tickets',
  machine_search: 'mod_machine_search',
  claims: 'mod_claims',
  users: 'mod_users',
  roles: 'mod_roles',
  module_access: 'mod_module_access',
  audit: 'mod_audit',
  portal_analytics: 'mod_portal_analytics',
  dealer_accounts: 'mod_dealer_accounts',
  sellers: 'mod_sellers',
  price_lists: 'mod_price_lists',
  budget_import: 'mod_budget_import',
};
const PLACEHOLDER_DESC_KEY: Record<string, string> = {
  tsb_portal: 'mod_tsb_desc',
  warranty_reg: 'mod_warranty_reg_desc',
  service_maintenance: 'mod_service_maintenance_desc',
  service_tickets: 'mod_service_tickets_desc',
  machine_search: 'mod_machine_search_desc',
  claims: 'mod_claims_desc',
  users: 'mod_users_desc',
  roles: 'mod_roles_desc',
  module_access: 'mod_module_access_desc',
  audit: 'mod_audit_desc',
  portal_analytics: 'mod_portal_analytics_desc',
  dealer_accounts: 'mod_dealer_accounts_desc',
  sellers: 'mod_sellers_desc',
  price_lists: 'mod_price_lists_desc',
  budget_import: 'mod_budget_import_desc',
};

interface Props { areaId: PortalAreaId }

export default function PortalAreaPage({ areaId }: Props) {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  // Hooks must run unconditionally on every render — keep this above all
  // early returns so the hook count is stable while `loading` flips.
  const effectiveUser = useEffectivePortalUser(appUser);
  const { markAreaRead } = useChangelog(appUser, lang);
  useEffect(() => {
    if (appUser) markAreaRead(areaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId, appUser?.email]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  // Only true end-customers without any portal role get redirected to the
  // configurator. Dealer-side users (timan_dealer, timan_importer,
  // timan_service_partner, dealer_user, internal staff) must see the area.
  {
    const portalRole = (appUser as { portal_role?: string | null }).portal_role ?? null;
    const dealerSideRoles = new Set([
      'timan_dealer', 'timan_importer', 'timan_service_partner', 'dealer_user',
      'timan_backend', 'timan_seller', 'timan_service',
    ]);
    const hasPortalAccess = portalRole ? dealerSideRoles.has(portalRole) : false;
    if (appUser.role === 'slutkunde' && !hasPortalAccess) {
      return <Navigate to="/configurator" replace />;
    }
  }

  const area = PORTAL_AREAS.find(a => a.id === areaId);
  if (!area || !isAreaVisible(area, effectiveUser)) return <Navigate to="/portal" replace />;

  const portalRole = derivePortalRole(effectiveUser);
  const moduleOverride = (effectiveUser?.module_access ?? null) as ModuleAccessKey[] | null;
  // Map portal-module ids → ModuleAccessKey for permission gating.
  const MODULE_ACCESS_MAP: Record<string, ModuleAccessKey | null> = {
    configurator: 'byg_din_timan',
    claims: 'claims',
    resources: 'resources',
    misc: 'sales_tools',
    videos: null, // always visible if area is visible
  };
  const areaModules = PORTAL_MODULES
    .filter(m => area.moduleIds.includes(m.id))
    .filter(m => isModuleVisible(m, effectiveUser))
    .filter(m => {
      const key = MODULE_ACCESS_MAP[m.id];
      if (!key) return true;
      return hasModuleAccess(portalRole, key, moduleOverride);
    });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={lang}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />

      <main className={`${areaId === 'timan_backend' || areaId === 'teknik_service' ? 'max-w-[1700px] xl:px-12' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full`}>
        <Link to="/portal" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {T.back[lang]}
        </Link>

        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{area.title[lang] || area.title.en}</h1>
          <p className="text-gray-600 text-base mt-2 max-w-3xl">{area.description[lang] || area.description.en}</p>
        </div>

        {areaId === 'timan_backend' ? (
          <BackendHome language={lang} />
        ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-8 ${areaId === 'teknik_service' ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
          {areaModules.map(m => <ModuleCard key={m.id} module={m} language={lang} />)}
          {area.placeholders.map(p => {
            let href: string | undefined;
            let icon: LucideIcon | undefined;
            let description: string | undefined;
            if (p.key === 'tsb_portal') {
              // TSB visibility: any role with 'tsb' module access (default or override)
              if (!canAccessTsb(portalRole, effectiveUser ?? null)) return null;
              href = '/portal/service/tsb';
              description = T.desc_tsb[lang];
            } else if (p.key === 'warranty_reg') {
              href = '/portal/service/warranty';
              description = T.desc_warranty_reg[lang];
            } else if (p.key === 'service_maintenance') {
              href = '/portal/service/maintenance';
              icon = Wrench;
              description = T.desc_service_maintenance[lang];
            } else if (p.key === 'service_tickets') {
              href = '/portal/service/tickets';
              icon = Ticket;
              description = T.desc_service_tickets[lang];
            } else if (p.key === 'machine_search') {
              href = '/portal/service/machines';
              icon = Search;
              description = T.desc_machine_search[lang];
            } else if (p.key === 'claims') {
              if (!hasModuleAccess(portalRole, 'claims', moduleOverride)) return null;
              href = '/portal/service/claims';
              icon = LifeBuoy;
              description = lang === 'da' ? 'Opret og følg service- og garantisager direkte i portalen.' : 'Create and track service and warranty claims directly in the portal.';

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
            } else if (p.key === 'price_lists') {
              href = '/portal/backend/price-lists';
              icon = Tag;
              description = lang === 'da'
                ? 'Administrér varepriser, importér prislister fra ERP og eksportér til CSV.'
                : 'Manage product prices, import from ERP and export to CSV.';
            } else if (p.key === 'budget_import') {
              href = '/portal/backend/budget-import';
              icon = Upload;
              description = lang === 'da'
                ? 'Importér sælgerbudgetter fra Excel-oversigt til CRM Budget.'
                : 'Import seller budgets from Excel overview to CRM Budget.';
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
        )}

        {areaId === 'teknik_service' && (
          <section className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">{T.support_section_title[lang]}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">{T.support_heading[lang]}</h3>
                <dl className="space-y-2 text-sm text-gray-700">
                  <div className="flex gap-2"><dt className="font-medium text-gray-500 w-24">{T.label_phone[lang]}:</dt><dd><a href="tel:+4596744466" className="text-[#2d5a27] hover:underline">96 74 44 66</a></dd></div>
                  <div className="flex gap-2"><dt className="font-medium text-gray-500 w-24">{T.label_email[lang]}:</dt><dd><a href="mailto:service@timan.dk" className="text-[#2d5a27] hover:underline">service@timan.dk</a></dd></div>
                </dl>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">{T.company_heading[lang]}</h3>
                <dl className="space-y-2 text-sm text-gray-700">
                  <div className="flex gap-2"><dt className="font-medium text-gray-500 w-24">{T.label_company[lang]}:</dt><dd>Timan A/S</dd></div>
                  <div className="flex gap-2"><dt className="font-medium text-gray-500 w-24">{T.label_address[lang]}:</dt><dd>Osvald Pedersens Vej 2A-D, 6980 Tim</dd></div>
                </dl>
              </div>
            </div>
          </section>
        )}
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
