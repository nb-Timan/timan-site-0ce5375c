import { Link } from 'react-router-dom';
import { Building2, FileCheck2, FlaskConical, MapPinned, Plus, ShieldCheck, FileWarning } from 'lucide-react';
import { useAppUser } from '@/context/AppUserContext';
import { getActiveSellerView } from '@/lib/activeMode';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { derivePortalRole, getUserModuleAccessOverride, hasModuleAccess, ModuleAccessKey, PortalRole } from '@/lib/portalAccess';
import { QUICK_ACTION_KEYS, QuickActionKey, DEFAULT_QUICK_ACTIONS } from '@/lib/backend-users-store';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { t } from '@/lib/i18n/translations';

interface Action {
  key?: QuickActionKey;
  labelKey: string;
  to: string;
  icon: typeof Plus;
  requires?: ModuleAccessKey;
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

interface Props {
  language: PortalUiLanguage;
}

export default function QuickActions({ language }: Props) {
  const { appUser } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser);
  if (!appUser || !effectiveUser) return null;

  const realRole = (appUser.portal_role || '').toLowerCase();
  const isBackend = realRole === 'timan_backend';
  const portalRole = derivePortalRole(effectiveUser);
  const effectiveRoleKey = portalRole || (effectiveUser.portal_role || '').toLowerCase();
  const moduleOverride = getUserModuleAccessOverride(effectiveUser);

  let actions: Action[] = [];
  let contextLabel = '';

  if (effectiveRoleKey === 'timan_service') {
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

  actions = actions.filter((a) => !a.requires || hasModuleAccess(portalRole, a.requires, moduleOverride));

  const qaSetting = (effectiveUser.quick_actions ?? null) as QuickActionKey[] | null;
  const roleForQa: PortalRole | null = portalRole;
  const rawQaSetting = (effectiveUser.quick_actions ?? null) as string[] | null;
  const hasLegacyQuickActions = Array.isArray(rawQaSetting)
    && rawQaSetting.some((key) => key === 'calendar' || key === 'my_dealers');
  const qaAllowed: QuickActionKey[] = Array.isArray(qaSetting) && !hasLegacyQuickActions
    ? qaSetting.filter((key): key is QuickActionKey => (QUICK_ACTION_KEYS as readonly string[]).includes(key))
    : (roleForQa ? (DEFAULT_QUICK_ACTIONS[roleForQa] ?? []) : []);
  actions = actions.filter((action) => !action.key || qaAllowed.includes(action.key));

  if (actions.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-2xl font-bold text-slate-900">{t('quickActionsHeading', language)}</h2>
        <span className="text-xs text-slate-500">{contextLabel}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {actions.map(({ labelKey, to, icon: Icon }) => {
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
            </span>
          </Link>
          );
        })}
      </div>
    </section>
  );
}
