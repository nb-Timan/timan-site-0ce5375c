import { Link } from 'react-router-dom';
import { Building2, FileCheck2, FlaskConical, MapPinned, Plus, ShieldCheck, FileWarning, Wrench } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { useAcademyAccess } from '@/context/AcademyAccessContext';
import { getActiveSellerView } from '@/lib/activeMode';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { derivePortalRole, getUserModuleAccessOverride, hasModuleAccess, ModuleAccessKey, PORTAL_ROLE_LABELS, type PortalRole } from '@/lib/portalAccess';
import { QUICK_ACTION_KEYS, type QuickActionKey } from '@/lib/backend-users-store';
import { getDefaultQuickActionRoles, resolveEffectiveQuickActions } from '@/lib/quickActionsAccess';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';
import { academySandbox } from '@/lib/academySandbox';
import { getLocalAcademyUser, hasEffectiveAcademyCapabilityAccess } from '@/lib/academyCurriculum';
import { WARRANTY_CREATE_ROUTE } from '@/lib/warrantyRoutes';
import { findPortalCapabilityContract, portalCapabilityRoute, type PortalCapabilityFeatureKey } from '../../../supabase/functions/_shared/portalCapabilityContract';

interface Action {
  key?: QuickActionKey;
  labelKey: string;
  to: string;
  icon: typeof Plus;
  requires?: ModuleAccessKey;
  featureKey: PortalCapabilityFeatureKey;
}

const QUICK_ACTION_CARDS: Record<QuickActionKey, Action> = {
  create_lead: { key: 'create_lead', featureKey: 'quick.create_lead', labelKey: 'quickActionCreateLead', to: portalCapabilityRoute('quick.create_lead'), icon: Plus, requires: 'timan_crm' },
  create_demo: { key: 'create_demo', featureKey: 'quick.create_demo', labelKey: 'quickActionCreateDemo', to: portalCapabilityRoute('quick.create_demo'), icon: FlaskConical, requires: 'timan_crm' },
  company_contact_info: { key: 'company_contact_info', featureKey: 'quick.company_contact_info', labelKey: 'quickActionCompanyContactInfo', to: portalCapabilityRoute('quick.company_contact_info'), icon: Building2, requires: 'sales_tools' },
  dealer_invoice_accept: { key: 'dealer_invoice_accept', featureKey: 'quick.dealer_invoice_accept', labelKey: 'quickActionDealerInvoiceAccept', to: portalCapabilityRoute('quick.dealer_invoice_accept'), icon: FileCheck2, requires: 'sales_tools' },
  create_warranty_registration: { key: 'create_warranty_registration', featureKey: 'quick.create_warranty', labelKey: 'quickActionCreateWarrantyRegistration', to: WARRANTY_CREATE_ROUTE, icon: ShieldCheck, requires: 'warranty' },
  warranty_registrations: { key: 'warranty_registrations', featureKey: 'quick.warranty_registrations', labelKey: 'quickActionWarrantyRegistrations', to: portalCapabilityRoute('quick.warranty_registrations'), icon: ShieldCheck, requires: 'warranty' },
  partner_map: { key: 'partner_map', featureKey: 'quick.partner_map', labelKey: 'quickActionPartnerMap', to: portalCapabilityRoute('quick.partner_map'), icon: MapPinned, requires: 'sales_tools' },
};

const SERVICE_ACTIONS: Action[] = [
  QUICK_ACTION_CARDS.create_warranty_registration,
  QUICK_ACTION_CARDS.warranty_registrations,
  { featureKey: 'service.maintenance', labelKey: 'quickActionCreateServiceRegistration', to: '/portal/service/maintenance?view=create', icon: Wrench, requires: 'teknik_service' },
  { featureKey: 'service.claims', labelKey: 'quickActionClaims', to: '/portal/service/claims', icon: FileWarning, requires: 'claims' },
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
  const academyAccess = useAcademyAccess();
  const accessUser = academyAccess?.effectiveUser ?? effectiveUser;
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
  actions = actions.filter((action) => hasEffectiveAcademyCapabilityAccess(
    accessUser,
    true,
    findPortalCapabilityContract(action.featureKey)?.academyGate,
    academyAccess?.completionIds ?? academySandbox.getCompletedCaseIds(),
  ));

  if (actions.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-900">{t('quickActionsHeading', language)}</h2>
        <span className="text-xs text-slate-500">{contextLabel}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {actions.map(({ key, labelKey, to, icon: Icon }) => {
          const activeRoles: PortalRole[] = key
            ? getDefaultQuickActionRoles(key)
            : effectiveRoleKey === 'timan_service' || canShowAllActions
              ? ['timan_service']
              : [];
          return (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:shadow-md hover:border-[#2d5a27] transition"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#2d5a27]/10 text-[#2d5a27] group-hover:bg-[#2d5a27] group-hover:text-white transition">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800">{t(labelKey, language)}</span>
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
