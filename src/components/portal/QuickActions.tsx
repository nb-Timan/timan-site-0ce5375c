import { Link } from 'react-router-dom';
import { Plus, FlaskConical, Calendar, Users, ShieldCheck, FileWarning, Gauge, Leaf } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { getActiveSellerView, getActiveRolePreview } from '@/lib/activeMode';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { hasModuleAccess, ModuleAccessKey, derivePortalRole } from '@/lib/portalAccess';

interface Action {
  label: string;
  to: string;
  icon: typeof Plus;
  /** Module access required to show this action. */
  requires?: ModuleAccessKey;
}

const INTERNAL_ACTIONS: Action[] = [
  { label: 'Opret nyt lead',       to: '/portal/crm/leads/new',      icon: Plus,         requires: 'timan_crm' },
  { label: 'Ny demo-registrering', to: '/portal/crm/demo-leads/new', icon: FlaskConical, requires: 'timan_crm' },
  { label: 'Kalender',             to: '/portal/crm/calendar',       icon: Calendar,     requires: 'timan_crm' },
  { label: 'Mine forhandlere',     to: '/portal/crm/my-dealers',     icon: Users,        requires: 'timan_crm' },
];

const SERVICE_ACTIONS: Action[] = [
  { label: 'Registrerede garantibeviser', to: '/portal/service/warranty/registrations', icon: ShieldCheck, requires: 'warranty' },
  { label: 'Alle claims',                 to: '/portal/service/claims',                 icon: FileWarning, requires: 'claims' },
];

const DEALER_ACTIONS: Action[] = [
  { label: 'Driftberegner',   to: '/portal/resources/driftberegner', icon: Gauge, requires: 'resources' },
  { label: 'CO2 Kalkulator',  to: '/portal/resources/co2',           icon: Leaf,  requires: 'resources' },
];

export default function QuickActions() {
  const { appUser } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  if (!appUser || !effectiveUser) return null;

  const realRole = (appUser.portal_role || '').toLowerCase();
  const isBackend = realRole === 'timan_backend';
  const portalRole = derivePortalRole(effectiveUser);
  const effectiveRoleKey = portalRole || (effectiveUser.portal_role || '').toLowerCase();
  const moduleOverride = (effectiveUser.module_access ?? null) as ModuleAccessKey[] | null;

  let actions: Action[] = [];
  let contextLabel = '';

  if (effectiveRoleKey === 'timan_service') {
    actions = SERVICE_ACTIONS;
    contextLabel = 'Service';
  } else if (
    effectiveRoleKey === 'timan_dealer' ||
    effectiveRoleKey === 'timan_service_partner' ||
    effectiveRoleKey === 'timan_importer' ||
    effectiveRoleKey === 'dealer_user'
  ) {
    actions = DEALER_ACTIONS;
    contextLabel = 'Forhandler';
  } else if (effectiveRoleKey === 'timan_backend' || effectiveRoleKey === 'timan_seller') {
    actions = INTERNAL_ACTIONS;
    const activeSeller = isBackend ? getActiveSellerView(appUser.email) : null;
    contextLabel = activeSeller ? `Som ${activeSeller.label}` : isBackend ? 'Backend' : 'Sælger';
  } else {
    return null;
  }

  // Filter by module access — hide actions the (effective) user lacks.
  actions = actions.filter((a) => !a.requires || hasModuleAccess(portalRole, a.requires, moduleOverride));

  if (actions.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-900">Hurtige handlinger</h2>
        <span className="text-xs text-slate-500">{contextLabel}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {actions.map(({ label, to, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-[#2d5a27] transition"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#2d5a27]/10 text-[#2d5a27] group-hover:bg-[#2d5a27] group-hover:text-white transition">
              <Icon className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-slate-800">{label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
