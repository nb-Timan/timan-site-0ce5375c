import { Link } from 'react-router-dom';
import { Building2, FileCheck2, FlaskConical, MapPinned, Plus, ShieldCheck, FileWarning, Wrench } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { getActiveSellerView } from '@/lib/activeMode';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { derivePortalRole, getUserModuleAccessOverride, hasModuleAccess, ModuleAccessKey, PORTAL_ROLE_LABELS, type PortalRole } from '@/lib/portalAccess';
import { QUICK_ACTION_KEYS, type QuickActionKey } from '@/lib/backend-users-store';
import { getDefaultQuickActionRoles, resolveEffectiveQuickActions } from '@/lib/quickActionsAccess';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import { academySandbox } from '@/lib/academySandbox';
import { getLocalAcademyUser, getAcademyTracks, type AcademyCapability, isAcademyCapabilityUnlocked } from '@/lib/academyCurriculum';
import { WARRANTY_CREATE_ROUTE } from '@/lib/warrantyRoutes';

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

const QUICK_ACTION_CARDS: Record<QuickActionKey, Action> = {
  create_lead: { key: 'create_lead', labelKey: 'quickActionCreateLead', to: '/portal/crm/leads/new', icon: Plus, requires: 'timan_crm' },
  create_demo: { key: 'create_demo', labelKey: 'quickActionCreateDemo', to: '/portal/crm/demo-leads/new', icon: FlaskConical, requires: 'timan_crm' },
  company_contact_info: { key: 'company_contact_info', labelKey: 'quickActionCompanyContactInfo', to: '/portal/misc/forms/company-contact-info', icon: Building2, requires: 'sales_tools' },
  dealer_invoice_accept: { key: 'dealer_invoice_accept', labelKey: 'quickActionDealerInvoiceAccept', to: '/portal/misc/forms/dealer-invoice-accept', icon: FileCheck2, requires: 'sales_tools' },
  create_warranty_registration: { key: 'create_warranty_registration', labelKey: 'quickActionCreateWarrantyRegistration', to: WARRANTY_CREATE_ROUTE, icon: ShieldCheck, requires: 'warranty' },
  warranty_registrations: { key: 'warranty_registrations', labelKey: 'quickActionWarrantyRegistrations', to: '/portal/service/warranty/registrations', icon: ShieldCheck, requires: 'warranty' },
  partner_map: { key: 'partner_map', labelKey: 'quickActionPartnerMap', to: '/portal/misc/partner-map', icon: MapPinned, requires: 'sales_tools' },
};

const SERVICE_ACTIONS: Action[] = [
  QUICK_ACTION_CARDS.create_warranty_registration,
  QUICK_ACTION_CARDS.warranty_registrations,
  { labelKey: 'quickActionCreateServiceRegistration', to: '/portal/service/maintenance?view=create', icon: Wrench, requires: 'teknik_service' },
  { labelKey: 'quickActionClaims', to: '/portal/service/claims', icon: FileWarning, requires: 'claims' },
];

// Backend's overview includes every configurable action plus the two existing
// Service module shortcuts that do not have individual quick-action keys.
const ALL_ACTIONS = [...QUICK_ACTION_KEYS.map((key) => QUICK_ACTION_CARDS[key]), ...SERVICE_ACTIONS]
  .filter((action, index, actions) => actions.findIndex((candidate) => candidate.to === action.to) === index);

interface Props {
  language: PortalUiLanguage;
  showAllActions?: boolean;
  showRoleOverview?: boolean;
}

export default function QuickActions({ language, showAllActions = false, showRoleOverview = false }: Props) {
  const { appUser } = useAppUser();
  const academyUser = academySandbox.isActive() ? getLocalAcademyUser() : null;
  const renderUser = academyUser ?? appUser;
  const effectiveUser = useEffectivePortalUser(renderUser);
  const accessUser = useEffectivePortalUser(appUser ?? academyUser);
  if (!renderUser || !effectiveUser) return null;

  const portalRole = derivePortalRole(effectiveUser);
  const effectiveRoleKey = portalRole || (effectiveUser.portal_role || '').toLowerCase();
  const isEffectiveBackend = effectiveRoleKey === 'timan_backend';
  const canShowAllActions = !academyUser && showAllActions && isEffectiveBackend;
  const canShowRoleOverview = !academyUser && showRoleOverview && isEffectiveBackend;
  const moduleOverride = getUserModuleAccessOverride(effectiveUser);

  const effectiveQuickActions = resolveEffectiveQuickActions(effectiveUser);
  let actions: Action[] = canShowAllActions
    ? ALL_ACTIONS
    : effectiveQuickActions.map((key) => QUICK_ACTION_CARDS[key]);
  let contextLabel = '';

  if (canShowAllActions) {
    contextLabel = 'Alle portalroller';
  } else if (effectiveRoleKey === 'timan_service') {
    actions = [...actions, ...SERVICE_ACTIONS]
      .filter((action, index, all) => all.findIndex((candidate) => candidate.to === action.to) === index);
    contextLabel = t('quickActionsContextService', language);
  } else if (
    effectiveRoleKey === 'timan_dealer'
  ) {
    contextLabel = t('quickActionsContextDealer', language);
  } else if (
    effectiveRoleKey === 'timan_service_partner' ||
    effectiveRoleKey === 'timan_importer' ||
    effectiveRoleKey === 'dealer_customer' ||
    effectiveRoleKey === 'dealer_user'
  ) {
    contextLabel = t('quickActionsContextDealer', language);
  } else if (effectiveRoleKey === 'timan_backend' || effectiveRoleKey === 'timan_seller') {
    const activeSeller = isEffectiveBackend && appUser ? getActiveSellerView(appUser.email) : null;
    contextLabel = activeSeller
      ? t('quickActionsContextAs', language).replace('{name}', activeSeller.label)
      : isEffectiveBackend ? t('quickActionsContextBackend', language) : t('quickActionsContextSeller', language);
  } else {
    return null;
  }

  if (!canShowAllActions) actions = actions.filter((a) => a.key || !a.requires || hasModuleAccess(portalRole, a.requires, moduleOverride));
  if (academyUser && !getAcademyTracks(accessUser).includes('sales')) {
    actions = actions.filter((action) => !academyCapabilityForAction(action.key));
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
          const academyLocked = capability && !isAcademyCapabilityUnlocked(accessUser, capability, academySandbox.getCompletedCaseIds());
          const target = academyLocked
            ? `/academy?locked=${capability}`
            : to;
          const activeRoles: PortalRole[] = key
            ? getDefaultQuickActionRoles(key)
            : effectiveRoleKey === 'timan_service' || canShowAllActions
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
              {canShowRoleOverview && activeRoles.length > 0 && (
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
