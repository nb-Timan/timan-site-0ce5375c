import { Link } from 'react-router-dom';
import { Building2, FileCheck2, FlaskConical, MapPinned, Plus, ShieldCheck, FileWarning } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { getActiveSellerView } from '@/lib/activeMode';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { derivePortalRole, getUserModuleAccessOverride, hasModuleAccess, ModuleAccessKey, PORTAL_ROLE_LABELS, type PortalRole } from '@/lib/portalAccess';
import { QuickActionKey } from '@/lib/backend-users-store';
import { getDefaultQuickActionRoles, resolveEffectiveQuickActions } from '@/lib/quickActionsAccess';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import { academySandbox } from '@/lib/academySandbox';
import { type AcademyCapability, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';

interface Action {
  key?: QuickActionKey;
  labelKey: string;
  to: string;
  icon: typeof Plus;
  requires?: ModuleAccessKey;
}

function academyCapabilityForAction(key?: QuickActionKey): AcademyCapability | null {
  if (key === 'create_lead') return 'crm';
  if (key === 'create_demo') return 'demo';
  return null;
}

const INTERNAL_ACTIONS: Action[] = [
  { key: 'create_lead', labelKey: 'quickActionCreateLead', to: '/portal/crm/leads/new', icon: Plus, requires: 'timan_crm' },
  { key: 'create_demo', labelKey: 'quickActionCreateDemo', to: '/portal/crm/demo-leads/new', icon: FlaskConical, requires: 'timan_crm' },
  { key: 'company_contact_info', labelKey: 'quickActionCompanyContactInfo', to: '/portal/misc/forms/company-contact-info', icon: Building2, requires: 'sales_tools' },
  { key: 'partner_map', labelKey: 'quickActionPartnerMap', to: '/portal/misc/partner-map', icon: MapPinned, requires: 'sales_tools' },
];

const PARTNER_ACTIONS: Action[] = [
  { key: 'create_lead', labelKey: 'quickActionCreateLead', to: '/portal/crm/leads/new', icon: Plus, requires: 'sales_tools' },
  { key: 'create_demo', labelKey: 'quickActionCreateDemo', to: '/portal/crm/demo-leads/new', icon: FlaskConical, requires: 'sales_tools' },
  { key: 'dealer_invoice_accept', labelKey: 'quickActionDealerInvoiceAccept', to: '/portal/misc/forms/dealer-invoice-accept', icon: FileCheck2, requires: 'sales_tools' },
  { key: 'partner_map', labelKey: 'quickActionPartnerMap', to: '/portal/misc/partner-map', icon: MapPinned, requires: 'sales_tools' },
];

const SERVICE_ACTIONS: Action[] = [
  { labelKey: 'quickActionWarrantyRegistrations', to: '/portal/service/warranty/registrations', icon: ShieldCheck, requires: 'warranty' },
  { labelKey: 'quickActionClaims', to: '/portal/service/claims', icon: FileWarning, requires: 'claims' },
];

const ALL_ACTIONS = [...INTERNAL_ACTIONS, ...PARTNER_ACTIONS, ...SERVICE_ACTIONS]
  .filter((action, index, actions) => actions.findIndex((candidate) => candidate.to === action.to) === index);

interface Props {
  language: PortalUiLanguage;
  showAllActions?: boolean;
  showRoleOverview?: boolean;
}

export default function QuickActions({ language, showAllActions = false, showRoleOverview = false }: Props) {
  const { appUser } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  if (!appUser || !effectiveUser) return null;

  const realRole = (appUser.portal_role || '').toLowerCase();
  const isBackend = realRole === 'timan_backend';
  const portalRole = derivePortalRole(effectiveUser);
  const effectiveRoleKey = portalRole || (effectiveUser.portal_role || '').toLowerCase();
  const moduleOverride = getUserModuleAccessOverride(effectiveUser);

  let actions: Action[] = showAllActions ? ALL_ACTIONS : [];
  let contextLabel = '';

  if (showAllActions) {
    contextLabel = 'Alle portalroller';
  } else if (effectiveRoleKey === 'timan_service') {
    actions = SERVICE_ACTIONS;
    contextLabel = t('quickActionsContextService', language);
  } else if (
    effectiveRoleKey === 'timan_dealer' ||
    effectiveRoleKey === 'timan_service_partner' ||
    effectiveRoleKey === 'timan_importer' ||
    effectiveRoleKey === 'dealer_customer' ||
    effectiveRoleKey === 'dealer_user'
  ) {
    actions = PARTNER_ACTIONS;
    contextLabel = t('quickActionsContextDealer', language);
  } else if (effectiveRoleKey === 'timan_backend' || effectiveRoleKey === 'timan_seller') {
    actions = INTERNAL_ACTIONS;
    const activeSeller = isBackend ? getActiveSellerView(appUser.email) : null;
    contextLabel = activeSeller
      ? t('quickActionsContextAs', language).replace('{name}', activeSeller.label)
      : isBackend ? t('quickActionsContextBackend', language) : t('quickActionsContextSeller', language);
  } else {
    return null;
  }

  if (!showAllActions) {
    const qaAllowed = resolveEffectiveQuickActions(effectiveUser);
    actions = actions.filter((action) => !action.key || qaAllowed.includes(action.key));
    actions = actions.filter((a) => a.key || !a.requires || hasModuleAccess(portalRole, a.requires, moduleOverride));
  }

  if (actions.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-900">{t('quickActionsHeading', language)}</h2>
        <span className="text-xs text-slate-500">{contextLabel}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {actions.map(({ key, labelKey, to, icon: Icon }) => {
          const capability = academyCapabilityForAction(key);
          const academyLocked = capability && !isAcademyCapabilityUnlocked(effectiveUser, capability, academySandbox.getCompletedCaseIds());
          const target = academyLocked ? `/academy?locked=${capability}` : to;
          const activeRoles: PortalRole[] = key
            ? getDefaultQuickActionRoles(key)
            : effectiveRoleKey === 'timan_service' || showAllActions
              ? ['timan_service']
              : [];
          return (
          <Link
            key={to}
            to={target}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-[#2d5a27] transition"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#2d5a27]/10 text-[#2d5a27] group-hover:bg-[#2d5a27] group-hover:text-white transition">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800">{academyLocked ? 'Kræver Academy' : t(labelKey, language)}</span>
              {academyLocked && <span className="block text-xs font-medium text-amber-700">Gennemfør Academy for at åbne denne funktion</span>}
              {labelKey === 'quickActionCompanyContactInfo' && (
                <span className="block text-xs font-medium text-slate-500">{t('quickActionCompanyContactInfoDesc', language)}</span>
              )}
              {showRoleOverview && activeRoles.length > 0 && (
                <span className="mt-1 block text-xs text-slate-500">
                  Aktiv for: {activeRoles.map((role) => PORTAL_ROLE_LABELS[role].da).join(' · ')}
                </span>
              )}
            </span>
          </Link>
          );
        })}
      </div>
    </section>
  );
}
