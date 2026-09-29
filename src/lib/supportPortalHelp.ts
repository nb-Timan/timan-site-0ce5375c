import type { SessionUser } from '@/context/AppUserContext';
import { backendSections } from '@/lib/backendNavigation';
import { CRM_NAV_ITEMS } from '@/lib/crmNavigation';
import { t } from '@/lib/i18n/translations';
import {
  canAccessContractsModule,
  derivePortalRole,
  getUserModuleAccessOverride,
  hasAreaAccess,
  hasModuleAccess,
  hasTopLevelPortalAreaAccess,
} from '@/lib/portalAccess';
import { ACADEMY_ROUTE, PORTAL_AREA_ROUTES } from '@/lib/portalNavigation';
import { PORTAL_MODULES } from '@/lib/portalModules';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { canUseCrm } from '@/lib/crmScope';

export interface SupportPortalHelpLocation {
  label: string;
  breadcrumb: string[];
  route: string;
  accessible: boolean;
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
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAVIGATION_HINTS = [
  'hvor finder', 'hvor er', 'hvordan finder', 'hvordan kommer', 'ga til', 'abn',
  'where', 'how do i find', 'how can i find', 'open',
  'wo finde', 'wie komme', 'offnen',
  'dove trovo', 'come trovo', 'apri',
  'hol talalom', 'hogyan talalom', 'nyisd meg',
  'var hittar', 'hur hittar', 'oppna',
  'ou trouver', 'comment trouver', 'ouvrir',
  'gdzie znajde', 'jak znalezc', 'otworz',
  'kde najdu', 'jak najdu', 'otevri',
];

const TARGET_WORDS = [
  'kontrakt', 'contract', 'vertrag', 'contratto', 'szerzodes', 'avtal', 'contrat', 'umow', 'smlouv',
  'lead', 'configurator', 'konfigurator', 'configuratore', 'partnerdata', 'partner data',
  'brugerstyring', 'user management', 'benutzerverwaltung', 'ai support', 'academy',
  'teknik', 'technical', 'service', 'backend', 'forhandler', 'dealer',
];

export function isPortalHelpQuestion(question: string): boolean {
  const value = normalized(question);
  return NAVIGATION_HINTS.some((hint) => value.includes(hint))
    && TARGET_WORDS.some((target) => value.includes(target));
}

function module(id: 'configurator' | 'contracts') {
  const hit = PORTAL_MODULES.find((entry) => entry.id === id);
  if (!hit) throw new Error(`Missing canonical portal module: ${id}`);
  return hit;
}

function moduleLabel(id: 'configurator' | 'contracts', language: PortalUiLanguage): string {
  const labels = module(id).title;
  return labels[language] || labels.en || id;
}

function areaLabel(area: 'salg_marketing' | 'timan_crm' | 'teknik_service' | 'dealer_data', language: PortalUiLanguage): string {
  return t(`area_${area}_title`, language);
}

function location(
  label: string,
  breadcrumb: string[],
  route: string,
  accessible: boolean,
): SupportPortalHelpLocation {
  return { label, breadcrumb, route, accessible };
}

function backendAccess(user: SessionUser | null): boolean {
  return derivePortalRole(user) === 'timan_backend';
}

function salesModuleAccess(user: SessionUser | null, key: 'byg_din_timan' | 'contracts'): boolean {
  return hasAreaAccess(user, 'salg_marketing')
    && (key === 'contracts'
      ? canAccessContractsModule(user)
      : hasModuleAccess(derivePortalRole(user), key, getUserModuleAccessOverride(user)));
}

function contractLocations(language: PortalUiLanguage, user: SessionUser | null): SupportPortalHelpLocation[] {
  const contractModule = module('contracts');
  const approvals = backendSections
    .find((section) => section.id === 'partner-management')!
    .items.find((item) => item.to === '/portal/backend/contracts')!;
  return [
    location(
      moduleLabel('contracts', language),
      [areaLabel('salg_marketing', language), moduleLabel('contracts', language)],
      contractModule.href,
      salesModuleAccess(user, 'contracts'),
    ),
    location(
      approvals.title,
      ['Backend', backendSections.find((section) => section.id === 'partner-management')!.title, approvals.title],
      approvals.to!,
      backendAccess(user),
    ),
  ];
}

function backendLocation(question: string, user: SessionUser | null): SupportPortalHelpLocation | null {
  const value = normalized(question);
  for (const section of backendSections) {
    for (const item of section.items) {
      if (!item.to || !value.includes(normalized(item.title))) continue;
      return location(item.title, ['Backend', section.title, item.title], item.to, backendAccess(user));
    }
    if (value.includes(normalized(section.title))) {
      return location(section.title, ['Backend', section.title], section.to, backendAccess(user));
    }
  }
  return null;
}

export function buildSupportPortalHelpContext(
  question: string,
  language: PortalUiLanguage,
  user: SessionUser | null,
): SupportPortalHelpContext | null {
  if (!isPortalHelpQuestion(question)) return null;
  const value = normalized(question);
  const hasContract = ['kontrakt', 'contract', 'vertrag', 'contratto', 'szerzodes', 'avtal', 'contrat', 'umow', 'smlouv']
    .some((word) => value.includes(word));
  const asksApproval = ['godkend', 'approval', 'approve', 'genehm', 'approv', 'zatwierd', 'schval']
    .some((word) => value.includes(word));
  const asksDealerContract = hasContract && ['forhandler', 'dealer', 'handler', 'rivend', 'keresk', 'aterforsalj', 'revendeur', 'dealera', 'prodejce']
    .some((word) => value.includes(word));

  if (asksDealerContract) {
    return {
      domain: 'PORTAL_HELP',
      navigation_source: 'canonical_portal_navigation',
      topic: 'dealer-contract',
      clarification_required: !asksApproval,
      locations: asksApproval ? [contractLocations(language, user)[1]] : contractLocations(language, user),
    };
  }

  if (hasContract) {
    const locations = contractLocations(language, user);
    return {
      domain: 'PORTAL_HELP', navigation_source: 'canonical_portal_navigation',
      topic: asksApproval ? 'contract-approval' : 'contracts', clarification_required: false,
      locations: [locations[asksApproval ? 1 : 0]],
    };
  }

  if (value.includes('lead')) {
    const nav = CRM_NAV_ITEMS.find((item) => item.to === '/portal/crm/leads')!;
    const role = derivePortalRole(user);
    return {
      domain: 'PORTAL_HELP', navigation_source: 'canonical_portal_navigation',
      topic: 'crm-leads', clarification_required: false,
      locations: [location(
        t(nav.tKey, language),
        [areaLabel('timan_crm', language), t(nav.tKey, language)],
        nav.to,
        hasAreaAccess(user, 'timan_crm') && canUseCrm(role),
      )],
    };
  }

  if (['configurator', 'konfigurator', 'configuratore'].some((word) => value.includes(word))) {
    const configurator = module('configurator');
    return {
      domain: 'PORTAL_HELP', navigation_source: 'canonical_portal_navigation',
      topic: 'configurator', clarification_required: false,
      locations: [location(
        moduleLabel('configurator', language),
        [areaLabel('salg_marketing', language), moduleLabel('configurator', language)],
        configurator.href,
        salesModuleAccess(user, 'byg_din_timan'),
      )],
    };
  }

  if (value.includes('partnerdata') || value.includes('partner data')) {
    return {
      domain: 'PORTAL_HELP', navigation_source: 'canonical_portal_navigation',
      topic: 'partner-data', clarification_required: false,
      locations: [location(
        areaLabel('dealer_data', language),
        [areaLabel('dealer_data', language)],
        PORTAL_AREA_ROUTES.dealer_data,
        hasAreaAccess(user, 'dealer_data'),
      )],
    };
  }

  if (value.includes('academy')) {
    return {
      domain: 'PORTAL_HELP', navigation_source: 'canonical_portal_navigation',
      topic: 'academy', clarification_required: false,
      locations: [location('Academy', ['Academy'], ACADEMY_ROUTE, hasTopLevelPortalAreaAccess(user, 'academy'))],
    };
  }

  if (value.includes('ai support')) {
    const section = backendSections.find((entry) => entry.id === 'ai-support')!;
    return {
      domain: 'PORTAL_HELP', navigation_source: 'canonical_portal_navigation',
      topic: 'ai-support', clarification_required: false,
      locations: [location(
        section.title, ['Backend', section.title], section.to,
        backendAccess(user) && user?.permissions?.support_access === true,
      )],
    };
  }

  if (['teknik', 'technical', 'service'].some((word) => value.includes(word))) {
    return {
      domain: 'PORTAL_HELP', navigation_source: 'canonical_portal_navigation',
      topic: 'technical-service', clarification_required: false,
      locations: [location(
        areaLabel('teknik_service', language),
        [areaLabel('teknik_service', language)],
        PORTAL_AREA_ROUTES.teknik_service,
        hasAreaAccess(user, 'teknik_service'),
      )],
    };
  }

  const backend = backendLocation(question, user);
  if (backend) {
    return {
      domain: 'PORTAL_HELP', navigation_source: 'canonical_portal_navigation',
      topic: 'backend-navigation', clarification_required: false, locations: [backend],
    };
  }

  return null;
}
