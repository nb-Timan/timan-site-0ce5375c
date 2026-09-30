export type PortalCapabilityAccess =
  | { kind: 'area'; key: string }
  | { kind: 'module'; key: string; area?: string }
  | { kind: 'crm' }
  | { kind: 'backend' }
  | { kind: 'backend_support' }
  | { kind: 'permission'; key: string; area?: string }
  | { kind: 'quick_action'; key: string }
  | { kind: 'messe' };

export interface PortalCapabilityContract {
  featureKey: string;
  areaKey: string;
  route: string;
  access: PortalCapabilityAccess;
  actions: readonly ('read' | 'create' | 'edit')[];
  routeUsesDealerNumber?: boolean;
}

/** Canonical role fallbacks shared by the Portal UI and server-side help gate. */
export const PORTAL_ROLE_DEFAULT_MODULE_ACCESS: Record<string, string[]> = {
  timan_backend: [
    'teknik_service', 'salg_marketing', 'calendar', 'marketing', 'timan_backend', 'timan_crm', 'dealer_data',
    'projects', 'claims', 'tsb', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'messe_portal', 'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'contracts', 'resources', 'videos',
  ],
  timan_seller: [
    'teknik_service', 'salg_marketing', 'calendar', 'timan_crm', 'dealer_data', 'projects',
    'claims', 'tsb', 'warranty', 'service_information', 'service_tickets', 'machine_search',
    'messe_portal', 'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  timan_service: [
    'teknik_service', 'dealer_data', 'claims', 'tsb', 'warranty', 'service_information',
    'service_tickets', 'machine_search', 'messe_portal', 'videos',
  ],
  timan_importer: [
    'teknik_service', 'salg_marketing', 'dealer_data', 'claims', 'warranty', 'service_information',
    'service_tickets', 'machine_search', 'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  timan_dealer: [
    'teknik_service', 'salg_marketing', 'calendar', 'timan_crm', 'dealer_data', 'claims', 'warranty',
    'service_information', 'service_tickets', 'machine_search', 'byg_din_timan', 'tilbud', 'ordre',
    'sales_tools', 'resources', 'videos', 'messe_portal',
  ],
  timan_service_partner: [
    'teknik_service', 'salg_marketing', 'dealer_data', 'claims', 'warranty', 'service_information',
    'service_tickets', 'machine_search', 'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  dealer_customer: [
    'salg_marketing', 'dealer_data', 'byg_din_timan', 'tilbud', 'ordre', 'sales_tools', 'resources', 'videos',
  ],
  dealer_user: ['messe_portal', 'salg_marketing', 'byg_din_timan', 'resources', 'sales_tools', 'videos'],
  private_end_user: ['messe_portal'],
  exhibition_user: ['messe_portal', 'byg_din_timan', 'resources', 'videos'],
  pending: [],
};

export const PORTAL_ROLE_DEFAULT_QUICK_ACTIONS: Record<string, string[]> = {
  timan_backend: ['create_lead', 'create_demo', 'company_contact_info', 'partner_map'],
  timan_seller: ['create_lead', 'create_demo', 'company_contact_info', 'partner_map'],
  timan_service: [],
  timan_importer: ['create_lead', 'create_demo', 'dealer_invoice_accept', 'partner_map'],
  timan_dealer: ['create_lead', 'dealer_invoice_accept', 'create_warranty_registration'],
  timan_service_partner: ['create_lead', 'create_demo', 'dealer_invoice_accept', 'partner_map'],
  dealer_customer: [],
  dealer_user: [],
  private_end_user: [],
  exhibition_user: [],
  pending: [],
};

const capability = (
  featureKey: string,
  areaKey: string,
  route: string,
  access: PortalCapabilityAccess,
  actions: PortalCapabilityContract['actions'] = ['read'],
  routeUsesDealerNumber = false,
): PortalCapabilityContract => ({ featureKey, areaKey, route, access, actions, routeUsesDealerNumber });

/**
 * Shared route/access contract used by both the Portal UI and support-chat.
 * Labels and descriptions stay in the Portal's existing translation/navigation
 * sources; this file only carries the server-safe identity, route and gate.
 */
export const PORTAL_CAPABILITY_CONTRACTS = [
  capability('area.sales', 'salg_marketing', '/portal/salg-marketing', { kind: 'area', key: 'salg_marketing' }),
  capability('area.partner_data', 'dealer_data', '/portal/dealer-data', { kind: 'area', key: 'dealer_data' }),
  capability('area.crm', 'timan_crm', '/portal/crm', { kind: 'crm' }),
  capability('area.marketing', 'marketing', '/portal/marketing', { kind: 'area', key: 'marketing' }),
  capability('area.technical_service', 'teknik_service', '/portal/teknik-service', { kind: 'area', key: 'teknik_service' }),
  capability('area.calendar', 'calendar', '/portal/crm/calendar', { kind: 'area', key: 'calendar' }),
  capability('area.backend', 'timan_backend', '/portal/backend', { kind: 'backend' }),
  capability('area.academy', 'academy', '/academy', { kind: 'module', key: 'academy' }),
  capability('area.messe', 'messe', '/messe', { kind: 'messe' }),

  capability('sales.configurator', 'salg_marketing', '/configurator', { kind: 'module', key: 'byg_din_timan', area: 'salg_marketing' }),
  capability('sales.videos', 'salg_marketing', '/portal/videos', { kind: 'module', key: 'videos', area: 'salg_marketing' }),
  capability('sales.resources', 'salg_marketing', '/portal/resources', { kind: 'module', key: 'resources', area: 'salg_marketing' }),
  capability('sales.forms', 'salg_marketing', '/portal/misc/forms', { kind: 'module', key: 'sales_tools', area: 'salg_marketing' }),
  capability('sales.contracts', 'salg_marketing', '/portal/contracts', { kind: 'module', key: 'contracts', area: 'salg_marketing' }, ['read', 'edit']),
  capability('sales.partner_map', 'salg_marketing', '/portal/misc/partner-map', { kind: 'module', key: 'sales_tools', area: 'salg_marketing' }),

  capability('partner.company_person_data', 'dealer_data', '/portal/dealer-data?accountNumber=:dealerNumber', { kind: 'area', key: 'dealer_data' }, ['read', 'edit'], true),

  capability('crm.dashboard', 'timan_crm', '/portal/crm/dashboard', { kind: 'crm' }),
  capability('crm.my_dealers', 'timan_crm', '/portal/crm/my-dealers', { kind: 'crm' }),
  capability('crm.leads', 'timan_crm', '/portal/crm/leads', { kind: 'crm' }),
  capability('crm.quotes', 'timan_crm', '/portal/crm/quotes', { kind: 'crm' }),
  capability('crm.orders', 'timan_crm', '/portal/crm/orders', { kind: 'crm' }),
  capability('crm.activities', 'timan_crm', '/portal/crm/activities', { kind: 'crm' }),
  capability('crm.calendar', 'calendar', '/portal/crm/calendar', { kind: 'area', key: 'calendar' }),
  capability('crm.budget', 'timan_crm', '/portal/crm/budget', { kind: 'crm' }),
  capability('crm.budget_dashboard', 'timan_crm', '/portal/crm/budget-dashboard', { kind: 'crm' }),
  capability('quick.create_lead', 'timan_crm', '/portal/crm/leads/new', { kind: 'quick_action', key: 'create_lead' }, ['create']),
  capability('quick.create_demo', 'timan_crm', '/portal/crm/demo-leads/new', { kind: 'quick_action', key: 'create_demo' }, ['create']),

  capability('service.machine_search', 'teknik_service', '/portal/service/machines', { kind: 'module', key: 'machine_search', area: 'teknik_service' }),
  capability('service.tickets', 'teknik_service', '/portal/service/tickets', { kind: 'module', key: 'service_tickets', area: 'teknik_service' }),
  capability('service.maintenance', 'teknik_service', '/portal/service/maintenance', { kind: 'module', key: 'service_information', area: 'teknik_service' }, ['read', 'create']),
  capability('service.claims', 'teknik_service', '/portal/service/claims', { kind: 'module', key: 'claims', area: 'teknik_service' }, ['read', 'create']),
  capability('service.warranty', 'teknik_service', '/portal/service/warranty', { kind: 'module', key: 'warranty', area: 'teknik_service' }, ['read', 'create']),
  capability('service.tsb', 'teknik_service', '/portal/service/tsb', { kind: 'module', key: 'tsb', area: 'teknik_service' }),

  capability('marketing.news_create', 'marketing', '/portal/marketing/news', { kind: 'permission', key: 'news_manage', area: 'marketing' }, ['create']),
  capability('marketing.news_overview', 'marketing', '/portal/marketing/news/overview', { kind: 'permission', key: 'news_manage', area: 'marketing' }),
  capability('marketing.videos', 'marketing', '/portal/marketing/videos', { kind: 'permission', key: 'marketing_videos_manage', area: 'marketing' }, ['read', 'edit']),
  capability('marketing.configurator', 'marketing', '/portal/marketing/configurator', { kind: 'permission', key: 'marketing_configurator_manage', area: 'marketing' }, ['read', 'edit']),
  capability('marketing.site_features', 'marketing', '/portal/marketing/site-features', { kind: 'permission', key: 'news_manage', area: 'marketing' }, ['read', 'edit']),

  capability('quick.company_contact_info', 'salg_marketing', '/portal/misc/forms/company-contact-info', { kind: 'quick_action', key: 'company_contact_info' }, ['edit']),
  capability('quick.dealer_invoice_accept', 'salg_marketing', '/portal/misc/forms/dealer-invoice-accept', { kind: 'quick_action', key: 'dealer_invoice_accept' }, ['edit']),
  capability('quick.create_warranty', 'teknik_service', '/portal/service/warranty/new', { kind: 'quick_action', key: 'create_warranty_registration' }, ['create']),
  capability('quick.warranty_registrations', 'teknik_service', '/portal/service/warranty/registrations', { kind: 'quick_action', key: 'warranty_registrations' }),
  capability('quick.partner_map', 'salg_marketing', '/portal/misc/partner-map', { kind: 'quick_action', key: 'partner_map' }),

  capability('backend.user_management', 'timan_backend', '/portal/backend/brugerstyring', { kind: 'backend' }),
  capability('backend.partner_management', 'timan_backend', '/portal/backend/partnerstyring', { kind: 'backend' }),
  capability('backend.data_integrations', 'timan_backend', '/portal/backend/data-integrationer', { kind: 'backend' }),
  capability('backend.analytics', 'timan_backend', '/portal/backend/analyse', { kind: 'backend' }),
  capability('backend.ai_support', 'timan_backend', '/portal/backend/ai-support', { kind: 'backend_support' }),
  capability('backend.system', 'timan_backend', '/portal/backend/system', { kind: 'backend' }),
  capability('backend.users', 'timan_backend', '/portal/backend/users', { kind: 'backend' }, ['read', 'edit']),
  capability('backend.roles', 'timan_backend', '/portal/backend/roles', { kind: 'backend' }, ['read', 'edit']),
  capability('backend.module_access', 'timan_backend', '/portal/backend/module-access', { kind: 'backend' }, ['read', 'edit']),
  capability('backend.audit_log', 'timan_backend', '/portal/backend/audit-log', { kind: 'backend' }),
  capability('backend.sellers', 'timan_backend', '/portal/backend/sellers', { kind: 'backend' }),
  capability('backend.dealer_accounts', 'timan_backend', '/portal/backend/dealer-accounts', { kind: 'backend' }, ['read', 'edit']),
  capability('backend.contract_approval', 'timan_backend', '/portal/backend/contracts', { kind: 'backend' }, ['read', 'edit']),
  capability('backend.partner_relations', 'timan_backend', '/portal/backend/partner-relations', { kind: 'backend' }, ['read', 'edit']),
  capability('backend.data', 'timan_backend', '/portal/backend/data', { kind: 'backend' }),
  capability('backend.geocoding', 'timan_backend', '/portal/backend/geocoding', { kind: 'backend' }),
  capability('backend.dealer_import', 'timan_backend', '/portal/backend/dealer-import', { kind: 'backend' }, ['create']),
  capability('backend.budget_import', 'timan_backend', '/portal/backend/budget-import', { kind: 'backend' }, ['create']),
  capability('backend.price_lists', 'timan_backend', '/portal/backend/price-lists', { kind: 'backend' }, ['read', 'edit']),
  capability('backend.portal_analytics', 'timan_backend', '/portal/backend/portal-analytics', { kind: 'backend' }),
  capability('backend.system_map', 'timan_backend', '/portal/backend/system-map', { kind: 'backend' }),
  capability('backend.persistence_audit', 'timan_backend', '/portal/backend/persistence-audit', { kind: 'backend' }),
  capability('backend.messe', 'timan_backend', '/portal/backend/messe', { kind: 'backend' }, ['read', 'edit']),
  capability('backend.mail_overview', 'timan_backend', '/portal/backend/mailoversigt', { kind: 'backend' }),
] as const satisfies readonly PortalCapabilityContract[];

export type PortalCapabilityFeatureKey = typeof PORTAL_CAPABILITY_CONTRACTS[number]['featureKey'];

export function findPortalCapabilityContract(featureKey: string): PortalCapabilityContract | null {
  return PORTAL_CAPABILITY_CONTRACTS.find((entry) => entry.featureKey === featureKey) ?? null;
}

export function portalCapabilityRoute(featureKey: PortalCapabilityFeatureKey): string {
  const contract = findPortalCapabilityContract(featureKey);
  if (!contract) throw new Error(`Missing portal capability contract: ${featureKey}`);
  return contract.route;
}
