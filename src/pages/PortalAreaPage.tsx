import { Navigate, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Building2, Users, ShieldCheck, KeyRound, ScrollText, BarChart3, UserCog, Tag, Upload, Wrench, Ticket, Search, LucideIcon } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useLanguage } from '@/context/LanguageContext';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import ModuleCard from '@/components/portal/ModuleCard';
import PlaceholderCard from '@/components/portal/PlaceholderCard';
import { PORTAL_AREAS, isAreaVisible, PortalAreaId } from '@/lib/portalAreas';
import { PORTAL_MODULES, isModuleVisible } from '@/lib/portalModules';
import { canAccessTsb } from '@/components/tsb/TsbAccessGuard';
import { derivePortalRole, hasModuleAccess, ModuleAccessKey } from '@/lib/portalAccess';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { Language } from '@/types/configurator';

const T: Record<string, Record<Language, string>> = {
  back: { da: 'Tilbage til portal', en: 'Back to portal', de: 'Zurück zum Portal', it: 'Torna al portale', hu: 'Vissza a portálra' },
  desc_service_maintenance: {
    da: 'Registrer udført service og se servicehistorik pr. maskine.',
    en: 'Register completed service and view service history per machine.',
    de: 'Erfassen Sie durchgeführte Wartungen und zeigen Sie den Wartungsverlauf pro Maschine an.',
    it: 'Registra gli interventi di assistenza completati e visualizza la cronologia di assistenza per macchina.',
    hu: 'Rögzítse az elvégzett szervizeléseket és tekintse meg a szervizelési előzményeket gépenként.',
  },
  desc_service_tickets: {
    da: 'Opret, følg og håndter servicehenvendelser pr. maskine.',
    en: 'Create, track and handle service requests per machine.',
    de: 'Erstellen, verfolgen und bearbeiten Sie Serviceanfragen pro Maschine.',
    it: 'Crea, monitora e gestisci le richieste di assistenza per macchina.',
    hu: 'Hozzon létre, kövessen és kezeljen szerviz kéréseket gépenként.',
  },
  desc_machine_search: {
    da: 'Find en maskine på serienummer og se samlet maskinprofil.',
    en: 'Find a machine by serial number and see a full machine profile.',
    de: 'Finden Sie eine Maschine anhand der Seriennummer und zeigen Sie ein vollständiges Maschinenprofil an.',
    it: 'Trova una macchina tramite numero di serie e visualizza il profilo completo della macchina.',
    hu: 'Keressen gépet gyári szám alapján és tekintse meg a teljes gépprofilt.',
  },
};

interface Props { areaId: PortalAreaId }

export default function PortalAreaPage({ areaId }: Props) {
  const { appUser, loading, setAppUser, logout } = useAppUser();
  const { language: lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  // Hooks must run unconditionally on every render — keep this above all
  // early returns so the hook count is stable while `loading` flips.
  const effectiveUser = useEffectivePortalUser(appUser);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-sm text-gray-500">…</div></div>;
  }
  if (!appUser) return <Navigate to="/portal" replace />;
  if (appUser.role === 'slutkunde') return <Navigate to="/configurator" replace />;

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

      <main className={`${areaId === 'timan_backend' ? 'max-w-[1700px] xl:px-12' : 'max-w-7xl'} mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-grow w-full`}>
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
            } else if (p.key === 'service_maintenance') {
              href = '/portal/service/maintenance';
              icon = Wrench;
              description = lang === 'da'
                ? 'Registrer udført service og se servicehistorik pr. maskine.'
                : 'Register completed service and view service history per machine.';
            } else if (p.key === 'service_tickets') {
              href = '/portal/service/tickets';
              icon = Ticket;
              description = lang === 'da'
                ? 'Opret, følg og håndter servicehenvendelser pr. maskine.'
                : 'Create, track and handle service requests per machine.';
            } else if (p.key === 'machine_search') {
              href = '/portal/service/machines';
              icon = Search;
              description = lang === 'da'
                ? 'Find en maskine på serienummer og se samlet maskinprofil.'
                : 'Find a machine by serial number and see a full machine profile.';

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
      </main>

      <PortalFooter language={lang} />
    </div>
  );
}
