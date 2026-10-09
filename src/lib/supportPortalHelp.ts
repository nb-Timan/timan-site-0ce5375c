import type { SessionUser } from '@/context/AppUserContext';
import { backendSections } from '@/lib/backendNavigation';
import { CRM_NAV_ITEMS } from '@/lib/crmNavigation';
import { t } from '@/lib/i18n/translations';
import {
  canManageMarketingConfiguratorContent,
  canManageMarketingVideos,
  canManageNewsContent,
  derivePortalRole,
  getUserModuleAccessOverride,
  hasAreaAccess,
  hasMessePortalAccess,
  hasModuleAccess,
} from '@/lib/portalAccess';
import { PORTAL_AREAS } from '@/lib/portalAreas';
import { PORTAL_MODULES } from '@/lib/portalModules';
import { resolveEffectiveQuickActions } from '@/lib/quickActionsAccess';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { canUseCrm } from '@/lib/crmScope';
import {
  PORTAL_CAPABILITY_CONTRACTS,
  type PortalCapabilityContract,
} from '../../supabase/functions/_shared/portalCapabilityContract';

const LANGUAGES: readonly PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];
type LocalizedText = Record<PortalUiLanguage, string>;

export interface PortalCapability {
  featureKey: string;
  areaKey: string;
  label: LocalizedText;
  description: LocalizedText;
  navigationPath: LocalizedText[];
  canonicalRoute: string;
  availableActions: readonly ('read' | 'create' | 'edit')[];
  searchAliases: string[];
  source: 'portal-area' | 'portal-module' | 'crm-navigation' | 'backend-navigation' | 'portal-feature';
}

export interface SupportPortalHelpLocation {
  feature_key: string;
  label: string;
  description: string;
  breadcrumb: string[];
  route: string;
  accessible: boolean;
  available_actions: readonly ('read' | 'create' | 'edit')[];
}

export interface SupportPortalHelpContext {
  domain: 'PORTAL_HELP';
  navigation_source: 'canonical_portal_navigation';
  topic: string;
  clarification_required: boolean;
  locations: SupportPortalHelpLocation[];
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[-_/→]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function localized(getValue: (language: PortalUiLanguage) => string): LocalizedText {
  return Object.fromEntries(LANGUAGES.map((language) => [language, getValue(language)])) as LocalizedText;
}

const AREA_TITLE_KEYS: Record<string, string> = {
  salg_marketing: 'area_salg_marketing_title', dealer_data: 'area_dealer_data_title',
  timan_crm: 'area_timan_crm_title', marketing: 'area_marketing_title',
  teknik_service: 'area_teknik_service_title', calendar: 'area_calendar_title',
  timan_backend: 'area_timan_backend_title',
};

const AREA_DESCRIPTION_KEYS: Record<string, string> = {
  salg_marketing: 'area_salg_marketing_desc', dealer_data: 'area_dealer_data_desc',
  timan_crm: 'area_timan_crm_desc', marketing: 'area_marketing_desc',
  teknik_service: 'area_teknik_service_desc', calendar: 'area_calendar_desc',
  timan_backend: 'area_timan_backend_desc',
};

const FEATURE_TRANSLATIONS: Record<string, { label: LocalizedText; description: LocalizedText }> = {
  'partner.company_person_data': {
    label: {
      da: 'Virksomheds- og persondata', en: 'Company and personal data', de: 'Unternehmens- und Personendaten',
      it: 'Dati aziendali e personali', hu: 'Cég- és személyes adatok', sv: 'Företags- och personuppgifter',
      fr: 'Données d’entreprise et personnelles', pl: 'Dane firmy i osób', cs: 'Firemní a osobní údaje',
    },
    description: {
      da: 'Administrér virksomhedens adresse og de kontaktoplysninger, som din bruger har adgang til.',
      en: 'Manage the company address and contact details available to your user.',
      de: 'Verwalten Sie die Firmenadresse und die Kontaktdaten, auf die Ihr Benutzer zugreifen kann.',
      it: 'Gestisci l’indirizzo aziendale e i dati di contatto disponibili per il tuo utente.',
      hu: 'Kezelje a felhasználója számára elérhető cégcímet és kapcsolattartási adatokat.',
      sv: 'Hantera företagets adress och de kontaktuppgifter som din användare har åtkomst till.',
      fr: 'Gérez l’adresse de l’entreprise et les coordonnées accessibles à votre utilisateur.',
      pl: 'Zarządzaj adresem firmy i danymi kontaktowymi dostępnymi dla użytkownika.',
      cs: 'Spravujte adresu firmy a kontaktní údaje dostupné vašemu uživateli.',
    },
  },
  'area.academy': {
    label: localized(() => 'Timan Academy'),
    description: localized((language) => t('academyHomeDescription', language)),
  },
  'area.messe': {
    label: localized(() => 'Messe'),
    description: localized((language) => t('messeHomeIntro', language)),
  },
};

const FEATURE_ALIASES: Record<string, string[]> = {
  'partner.company_person_data': [
    'ændre adresse', 'adresser', 'firmaadresse', 'virksomhedsoplysninger', 'kontaktoplysninger', 'kontaktperson',
    'ændre telefon', 'persondata', 'company address', 'company details', 'contact details', 'contact person',
    'firmenadresse', 'unternehmensdaten', 'kontaktdaten', 'ansprechpartner', 'indirizzo aziendale',
    'dati aziendali', 'dati di contatto', 'kapcsolati adatok', 'företagsadress', 'kontaktuppgifter',
    'adresse entreprise', 'coordonnées', 'adres firmy', 'dane kontaktowe', 'adresa firmy', 'kontaktní údaje',
  ],
  'crm.leads': ['mine leads', 'my leads', 'meine leads', 'leadek', 'leady'],
  'crm.quotes': ['mine tilbud', 'tilbud', 'quotes', 'angebote', 'preventivi', 'árajánlatok', 'offerter', 'devis', 'oferty', 'nabídky'],
  'crm.activities': ['aktiviteter', 'activities', 'aktivitäten', 'attività', 'tevékenységek', 'activités', 'aktywności', 'aktivity'],
  'crm.calendar': ['kalender', 'calendar', 'calendario', 'naptár', 'calendrier', 'kalendarz', 'kalendář'],
  'quick.create_lead': ['opret nyt lead', 'opretter jeg et nyt lead', 'create new lead', 'neuen lead erstellen', 'crea nuovo lead', 'új lead', 'skapa nytt lead', 'créer un lead', 'utwórz lead', 'vytvořit lead'],
  'quick.create_demo': ['demo registrering', 'demo-registrering', 'ny demo', 'demo registration', 'demo-registrierung', 'registrazione demo', 'demó regisztráció', 'demoregistrering', 'enregistrement démo', 'rejestracja demo', 'registrace dema'],
  'sales.configurator': ['configurator', 'konfigurator', 'configuratore', 'konfigurátor', 'configurateur'],
  'area.partner_data': ['partnerdata', 'partner data', 'partnerdaten', 'dati partner', 'partneradatok', 'données partenaire', 'dane partnera', 'data partnera'],
  'backend.user_management': ['brugerstyring', 'user management', 'benutzerverwaltung', 'gestione utenti', 'felhasználókezelés', 'användarhantering', 'gestion utilisateurs', 'zarządzanie użytkownikami', 'správa uživatelů'],
  'backend.ai_support': ['ai support', 'ki support', 'support ai'],
  'area.technical_service': ['teknik service', 'teknik og service', 'technical service', 'technik service', 'tecnico assistenza', 'műszaki szerviz', 'technique service', 'techniczne serwis', 'technika servis'],
  'sales.contracts': ['forhandlerkontrakt', 'forhandler kontrakt', 'dealer contract', 'händlervertrag', 'contratto rivenditore', 'kereskedői szerződés', 'återförsäljaravtal', 'contrat revendeur', 'umowa dealerska', 'smlouva prodejce'],
  'backend.contract_approval': ['kontraktgodkendelse', 'contract approval', 'vertragsgenehmigung', 'approvazione contratto', 'szerződés jóváhagyás', 'avtalsgodkännande', 'approbation contrat', 'zatwierdzanie umów', 'schválení smlouvy'],
  'area.academy': ['academy', 'timan academy'],
};

const QUICK_ACTION_LABEL_KEYS: Record<string, string> = {
  'quick.create_lead': 'quickActionCreateLead', 'quick.create_demo': 'quickActionCreateDemo',
  'quick.company_contact_info': 'quickActionCompanyContactInfo',
  'quick.dealer_invoice_accept': 'quickActionDealerInvoiceAccept',
  'quick.create_warranty': 'quickActionCreateWarrantyRegistration',
  'quick.warranty_registrations': 'quickActionWarrantyRegistrations',
  'quick.partner_map': 'quickActionPartnerMap',
};

const SERVICE_LABEL_KEYS: Record<string, string> = {
  'service.machine_search': 'mod_machine_search', 'service.tickets': 'mod_service_tickets',
  'service.maintenance': 'mod_service_maintenance', 'service.claims': 'mod_claims',
  'service.warranty': 'mod_warranty_reg', 'service.tsb': 'mod_tsb',
};

const MARKETING_LABEL_KEYS: Record<string, string> = {
  'marketing.news_create': 'newsCmsTitle', 'marketing.news_overview': 'newsCmsOverview',
  'marketing.videos': 'videoMgmtTitle', 'marketing.configurator': 'area_marketing_title',
  'marketing.site_features': 'siteFeaturesTitle',
};

function areaLabel(areaKey: string): LocalizedText {
  const key = AREA_TITLE_KEYS[areaKey];
  if (key) return localized((language) => t(key, language));
  return localized(() => areaKey === 'academy' ? 'Timan Academy' : areaKey === 'messe' ? 'Messe' : areaKey);
}

function areaDescription(areaKey: string): LocalizedText {
  const key = AREA_DESCRIPTION_KEYS[areaKey];
  return localized((language) => key ? t(key, language) : '');
}

function sourceMetadata(contract: PortalCapabilityContract) {
  const special = FEATURE_TRANSLATIONS[contract.featureKey];
  if (special) return { ...special, source: 'portal-feature' as const };
  if (contract.featureKey.startsWith('area.')) {
    return { label: areaLabel(contract.areaKey), description: areaDescription(contract.areaKey), source: 'portal-area' as const };
  }
  const portalModule = PORTAL_MODULES.find((entry) => entry.href === contract.route);
  if (portalModule) {
    return {
      label: localized((language) => portalModule.title[language] || portalModule.title.en || portalModule.id),
      description: localized((language) => portalModule.description[language] || portalModule.description.en || ''),
      source: 'portal-module' as const,
    };
  }
  const crmItem = CRM_NAV_ITEMS.find((entry) => entry.to === contract.route);
  if (crmItem && contract.featureKey.startsWith('crm.')) {
    return { label: localized((language) => t(crmItem.tKey, language)), description: localized(() => ''), source: 'crm-navigation' as const };
  }
  const backendItem = backendSections.flatMap((section) => [section, ...section.items]).find((entry) => entry.to === contract.route);
  if (backendItem) {
    return { label: localized(() => backendItem.title), description: localized(() => backendItem.description), source: 'backend-navigation' as const };
  }
  const translationKey = QUICK_ACTION_LABEL_KEYS[contract.featureKey]
    || SERVICE_LABEL_KEYS[contract.featureKey]
    || MARKETING_LABEL_KEYS[contract.featureKey];
  return {
    label: localized((language) => translationKey ? t(translationKey, language) : contract.featureKey),
    description: localized(() => ''), source: 'portal-feature' as const,
  };
}

export const PORTAL_CAPABILITY_REGISTRY: readonly PortalCapability[] = PORTAL_CAPABILITY_CONTRACTS.map((contract) => {
  const metadata = sourceMetadata(contract);
  const area = areaLabel(contract.areaKey);
  return {
    featureKey: contract.featureKey, areaKey: contract.areaKey,
    label: metadata.label, description: metadata.description,
    navigationPath: contract.featureKey.startsWith('area.') ? [metadata.label] : [area, metadata.label],
    canonicalRoute: contract.route, availableActions: contract.actions,
    searchAliases: FEATURE_ALIASES[contract.featureKey] || [], source: metadata.source,
  };
});

const NAVIGATION_HINTS = [
  'hvor finder', 'hvor ligger', 'hvor er', 'hvordan finder', 'hvordan kommer', 'hvor kan jeg', 'hvor ændrer', 'hvor ændre',
  'hvor opretter', 'hvor laver', 'kan jeg', 'hvilken menu', 'hvordan gør jeg',
  'where', 'how do i find', 'how can i', 'which menu', 'wo finde', 'wo kann', 'wie komme', 'kann ich',
  'dove trovo', 'dove posso', 'come trovo', 'posso', 'hol talalom', 'hol tudom', 'hogyan',
  'var hittar', 'var kan jag', 'hur hittar', 'ou trouver', 'ou puis je', 'comment trouver',
  'gdzie znajde', 'gdzie moge', 'jak znalezc', 'kde najdu', 'kde mohu', 'jak najdu',
];

function searchableTerms(capability: PortalCapability): string[] {
  return [
    ...Object.values(capability.label), ...Object.values(capability.description),
    ...capability.navigationPath.flatMap((part) => Object.values(part)), ...capability.searchAliases,
  ].map(normalized).filter(Boolean);
}

function matchScore(question: string, capability: PortalCapability): number {
  const value = normalized(question);
  const aliasMatch = capability.searchAliases.map(normalized).filter((alias) => alias && value.includes(alias)).sort((a, b) => b.length - a.length)[0];
  if (aliasMatch) return 200 + aliasMatch.length;
  const direct = searchableTerms(capability).filter((term) => term.length > 3 && value.includes(term)).sort((a, b) => b.length - a.length)[0];
  if (direct) return 120 + direct.length;
  const queryTokens = new Set(value.split(' ').filter((token) => token.length > 3));
  const overlap = new Set(searchableTerms(capability).join(' ').split(' ').filter((token) => queryTokens.has(token)));
  return overlap.size >= 2 ? overlap.size * 10 : 0;
}

export function findPortalCapabilities(question: string): PortalCapability[] {
  const value = normalized(question);
  const dealerContract = FEATURE_ALIASES['sales.contracts'].some((term) => value.includes(normalized(term)));
  const asksApproval = ['godkend', 'approval', 'approve', 'genehm', 'approv', 'zatwierd', 'schval'].some((term) => value.includes(term));
  if (dealerContract) {
    const keys = asksApproval ? ['backend.contract_approval'] : ['sales.contracts', 'backend.contract_approval'];
    return keys.map((key) => PORTAL_CAPABILITY_REGISTRY.find((entry) => entry.featureKey === key)!).filter(Boolean);
  }
  return PORTAL_CAPABILITY_REGISTRY
    .map((capability) => ({ capability, score: matchScore(question, capability) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.capability.searchAliases.length - a.capability.searchAliases.length)
    .slice(0, 1).map((entry) => entry.capability);
}

export function isPortalHelpQuestion(question: string): boolean {
  const value = normalized(question);
  return NAVIGATION_HINTS.some((hint) => value.includes(normalized(hint))) && findPortalCapabilities(question).length > 0;
}

function canAccessCapability(contract: PortalCapabilityContract, user: SessionUser | null): boolean {
  if (!user) return false;
  const role = derivePortalRole(user);
  const modules = getUserModuleAccessOverride(user);
  const access = contract.access;
  if (access.kind === 'area') return hasAreaAccess(user, access.key as Parameters<typeof hasAreaAccess>[1]);
  if (access.kind === 'module') {
    const areaAllowed = !access.area || hasAreaAccess(user, access.area as Parameters<typeof hasAreaAccess>[1]);
    return areaAllowed && hasModuleAccess(role, access.key as Parameters<typeof hasModuleAccess>[1], modules);
  }
  if (access.kind === 'crm') return hasAreaAccess(user, 'timan_crm') && canUseCrm(role);
  if (access.kind === 'backend') return role === 'timan_backend';
  if (access.kind === 'backend_support') return role === 'timan_backend' && user.permissions?.support_access === true;
  if (access.kind === 'messe') return hasMessePortalAccess(user);
  if (access.kind === 'quick_action') return resolveEffectiveQuickActions(user).includes(access.key as never);
  if (access.kind === 'permission') {
    if (access.key === 'marketing_videos_manage') return canManageMarketingVideos(user);
    if (access.key === 'marketing_configurator_manage') return canManageMarketingConfiguratorContent(user);
    return canManageNewsContent(user);
  }
  return false;
}

function resolvedRoute(contract: PortalCapabilityContract, user: SessionUser | null): string {
  if (!contract.routeUsesDealerNumber) return contract.route;
  return user?.dealer_number ? contract.route.replace(':dealerNumber', encodeURIComponent(user.dealer_number)) : '/portal/dealer-data';
}

export function buildSupportPortalHelpContext(
  question: string,
  language: PortalUiLanguage,
  user: SessionUser | null,
): SupportPortalHelpContext | null {
  if (!isPortalHelpQuestion(question)) return null;
  const capabilities = findPortalCapabilities(question);
  if (!capabilities.length) return null;
  const locations = capabilities.map((capability): SupportPortalHelpLocation => {
    const contract = PORTAL_CAPABILITY_CONTRACTS.find((entry) => entry.featureKey === capability.featureKey)!;
    return {
      feature_key: capability.featureKey,
      label: capability.label[language] || capability.label.en,
      description: capability.description[language] || capability.description.en,
      breadcrumb: capability.navigationPath.map((part) => part[language] || part.en),
      route: resolvedRoute(contract, user),
      accessible: canAccessCapability(contract, user),
      available_actions: capability.availableActions,
    };
  });
  return {
    domain: 'PORTAL_HELP', navigation_source: 'canonical_portal_navigation',
    topic: capabilities.length > 1 ? 'dealer-contract' : capabilities[0].featureKey,
    clarification_required: capabilities.length > 1, locations,
  };
}

export const PORTAL_CAPABILITY_COVERAGE_SOURCES = {
  areaIds: PORTAL_AREAS.map((area) => area.id),
  moduleRoutes: PORTAL_MODULES.filter((module) => module.enabled).map((module) => module.href),
  crmRoutes: CRM_NAV_ITEMS.map((item) => item.to),
  backendRoutes: backendSections.flatMap((section) => [section.to, ...section.items.flatMap((item) => item.to ? [item.to] : [])]),
};
