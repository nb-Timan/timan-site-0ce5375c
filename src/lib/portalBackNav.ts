/**
 * Centralised back-navigation for the portal.
 *
 * Every "Tilbage" button across the portal should resolve to its known
 * parent route — not to the browser history — so navigation behaves like
 * breadcrumbs no matter how the user landed on the page.
 *
 * Hierarchy (most specific first):
 *
 *   /portal/resources/driftberegner   → /portal/resources       ("beregnere")
 *   /portal/resources/co2             → /portal/resources       ("beregnere")
 *   /portal/resources                 → /portal/salg-marketing  ("Salg & Marketing")
 *   /portal/misc/forms/*              → /portal/misc/forms      ("Formularer")
 *   /portal/misc/forms                → /portal/salg-marketing  ("Salg & Marketing")
 *   /portal/misc/partner-map          → /portal/salg-marketing  ("Salg")
 *   /portal/misc                      → /portal/salg-marketing  ("Salg & Marketing")
 *   /portal/videos/*                  → /portal/videos          ("Videoer")
 *   /portal/videos                    → /portal/salg-marketing  ("Salg & Marketing")
 *   /portal/salg-marketing            → /portal                 ("portal")
 *   /portal/teknik-service            → /portal                 ("portal")
 *   /portal/backend/*                 → /portal/backend         ("Backend")
 *   /portal/backend                   → /portal                 ("portal")
 *   /portal/crm/my-dealers/:id        → /portal/crm/my-dealers  ("Mine forhandlere")
 *   /portal/crm/leads/(new|:id)       → /portal/crm/leads       ("Leads")
 *   /portal/crm/demo-leads/(new|:id)  → /portal/crm/demo-leads  ("Demo leads")
 *   /portal/crm/* (other tabs)        → /portal/crm             ("CRM")
 *   /portal/crm                       → /portal                 ("portal")
 *   /portal/service/claims/*          → /portal/service/claims  ("Claims")
 *   /portal/service/tsb/*             → /portal/service/tsb     ("TSB")
 *   /portal/service/warranty/*        → /portal/service/warranty("Warranty")
 *   /portal/service/tickets/*         → /portal/service/tickets ("Service tickets")
 *   /portal/service/*                 → /portal/teknik-service  ("Teknik & Service")
 *   /portal/dealer-data               → /portal                 ("portal")
 *   /messe/resources/driftberegner    → /messe                  ("Timan Messe")
 *   /messe/resources/co2              → /messe                  ("Timan Messe")
 *   /configurator                     → /portal/salg-marketing  ("Salg & Marketing")
 *   default                           → /portal                 ("portal")
 */

import type { NavigateFunction } from 'react-router-dom';
import type { Language } from '@/types/configurator';

export type PortalBackTarget = string;

interface ParentRule {
  /** Test the pathname (no query/hash). */
  match: (path: string) => boolean;
  to: string;
  labelKey: BackLabelKey;
}

type BackLabelKey =
  | 'portal'
  | 'messe'
  | 'sales_marketing'
  | 'service_area'
  | 'backend_area'
  | 'crm_area'
  | 'resources'
  | 'misc'
  | 'forms'
  | 'contracts'
  | 'videos'
  | 'my_dealers'
  | 'leads'
  | 'demo_leads'
  | 'claims'
  | 'tsb'
  | 'warranty'
  | 'warranty_dashboard'
  | 'service_tickets'
  | 'machine_journal'
  | 'machine_search'
  | 'service_maintenance';

const LABELS: Record<BackLabelKey, Record<Language, string>> = {
  portal:          { da: 'Tilbage til portal',        en: 'Back to portal',         de: 'Zurück zum Portal',         it: 'Torna al portale',         hu: 'Vissza a portálra' },
  messe:           { da: 'Tilbage til Timan Messe',   en: 'Back to Timan Exhibition', de: 'Zurück zu Timan Messe',   it: 'Torna a Timan Fiera',      hu: 'Vissza a Timan kiállításhoz' },
  sales_marketing: { da: 'Tilbage til Salg', en: 'Back to Sales', de: 'Zurück zu Vertrieb', it: 'Torna a Vendite', hu: 'Vissza: Értékesítés' },
  service_area:    { da: 'Tilbage til Teknik & Service', en: 'Back to Technical & Service', de: 'Zurück zu Technik & Service', it: 'Torna a Tecnico & Assistenza', hu: 'Vissza: Műszaki & Szerviz' },
  backend_area:    { da: 'Tilbage til Backend',       en: 'Back to Backend',        de: 'Zurück zum Backend',        it: 'Torna al Backend',         hu: 'Vissza a Backendhez' },
  crm_area:        { da: 'Tilbage til CRM',           en: 'Back to CRM',            de: 'Zurück zum CRM',            it: 'Torna al CRM',             hu: 'Vissza a CRM-hez' },
  resources:       { da: 'Tilbage til Beregnere',     en: 'Back to Calculators',    de: 'Zurück zu Rechnern',        it: 'Torna ai Calcolatori',     hu: 'Vissza a Kalkulátorokhoz' },
  misc:            { da: 'Tilbage til Formularer',    en: 'Back to Forms',          de: 'Zurück zu Formularen',      it: 'Torna ai Moduli',          hu: 'Vissza az Űrlapokhoz' },
  forms:           { da: 'Tilbage til Formularer',    en: 'Back to Forms',          de: 'Zurück zu Formularen',      it: 'Torna ai Moduli',          hu: 'Vissza az Űrlapokhoz' },
  contracts:       { da: 'Tilbage til Kontrakt',      en: 'Back to Contracts',      de: 'Zurück zu Verträgen',       it: 'Torna ai Contratti',       hu: 'Vissza a szerződésekhez' },
  videos:          { da: 'Tilbage til Videoer',       en: 'Back to Videos',         de: 'Zurück zu Videos',          it: 'Torna ai Video',           hu: 'Vissza a Videókhoz' },
  my_dealers:      { da: 'Tilbage til Mine forhandlere', en: 'Back to My dealers',  de: 'Zurück zu Meine Händler',   it: 'Torna a I miei rivenditori', hu: 'Vissza: Kereskedőim' },
  leads:           { da: 'Tilbage til Leads',         en: 'Back to Leads',          de: 'Zurück zu Leads',           it: 'Torna ai Lead',            hu: 'Vissza a Leadekhez' },
  demo_leads:      { da: 'Tilbage til Demo leads',    en: 'Back to Demo leads',     de: 'Zurück zu Demo-Leads',      it: 'Torna ai Demo lead',       hu: 'Vissza: Demo leadek' },
  claims:          { da: 'Tilbage til Reklamationer', en: 'Back to Claims',         de: 'Zurück zu Reklamationen',   it: 'Torna ai Reclami',         hu: 'Vissza a Reklamációkhoz' },
  tsb:             { da: 'Tilbage til TSB',           en: 'Back to TSB',            de: 'Zurück zu TSB',             it: 'Torna a TSB',              hu: 'Vissza a TSB-hez' },
  warranty:        { da: 'Tilbage til Garantier',     en: 'Back to Warranty',       de: 'Zurück zu Garantie',        it: 'Torna a Garanzia',         hu: 'Vissza a Garanciához' },
  warranty_dashboard: { da: 'Tilbage til Dashboard',  en: 'Back to Dashboard',      de: 'Zurück zum Dashboard',      it: 'Torna alla Dashboard',     hu: 'Vissza az irányítópultra' },
  service_tickets: { da: 'Tilbage til Servicesager',  en: 'Back to Service tickets',de: 'Zurück zu Service-Tickets', it: 'Torna ai Ticket di servizio', hu: 'Vissza a Szerviz-jegyekhez' },
  machine_journal: { da: 'Tilbage til Min Maskine',   en: 'Back to My Machine',     de: 'Zurück zu Meine Maschine',  it: 'Torna a La mia macchina',  hu: 'Vissza: Saját gép' },
  machine_search:  { da: 'Tilbage til Søg på maskine',en: 'Back to Machine Search', de: 'Zurück zur Maschinensuche', it: 'Torna a Cerca macchina',   hu: 'Vissza a gépkereséshez' },
  service_maintenance: { da: 'Tilbage til Serviceregistreringer', en: 'Back to Service registrations', de: 'Zurück zu Serviceerfassungen', it: 'Torna alle registrazioni di servizio', hu: 'Vissza a szervizregisztrációkhoz' },
};

const eq = (path: string, p: string) => path === p;
const startsWith = (path: string, p: string) =>
  path === p || path.startsWith(p + '/') || path.startsWith(p + '?');

// Order matters — first match wins. List the deepest routes first.
const RULES: ParentRule[] = [
  // Messe quick actions
  { match: p => eq(p, '/messe/resources/driftberegner'), to: '/messe', labelKey: 'messe' },
  { match: p => eq(p, '/messe/resources/co2'),           to: '/messe', labelKey: 'messe' },

  // Resources
  { match: p => eq(p, '/portal/resources/driftberegner'), to: '/portal/resources', labelKey: 'resources' },
  { match: p => eq(p, '/portal/resources/co2'),           to: '/portal/resources', labelKey: 'resources' },
  { match: p => eq(p, '/portal/resources'),               to: '/portal/salg-marketing', labelKey: 'sales_marketing' },

  // Formularer + standalone partner map
  { match: p => startsWith(p, '/portal/misc/forms') && !eq(p, '/portal/misc/forms'), to: '/portal/misc/forms', labelKey: 'forms' },
  { match: p => eq(p, '/portal/misc/forms'),              to: '/portal/salg-marketing', labelKey: 'sales_marketing' },
  { match: p => eq(p, '/portal/misc/partner-map'),        to: '/portal/salg-marketing', labelKey: 'sales_marketing' },
  { match: p => startsWith(p, '/portal/misc') && !eq(p, '/portal/misc'), to: '/portal/misc', labelKey: 'misc' },
  { match: p => eq(p, '/portal/misc'),                    to: '/portal/salg-marketing', labelKey: 'sales_marketing' },
  { match: p => eq(p, '/portal/contracts'),               to: '/portal/salg-marketing', labelKey: 'sales_marketing' },

  // Videos
  { match: p => startsWith(p, '/portal/videos') && !eq(p, '/portal/videos'), to: '/portal/videos', labelKey: 'videos' },
  { match: p => eq(p, '/portal/videos'),                  to: '/portal/salg-marketing', labelKey: 'sales_marketing' },

  // Area landing pages
  { match: p => eq(p, '/portal/salg-marketing'),          to: '/portal', labelKey: 'portal' },
  { match: p => eq(p, '/portal/teknik-service'),          to: '/portal', labelKey: 'portal' },
  { match: p => eq(p, '/portal/backend'),                 to: '/portal', labelKey: 'portal' },
  { match: p => eq(p, '/portal/dealer-data'),             to: '/portal', labelKey: 'portal' },

  // Backend child pages
  { match: p => startsWith(p, '/portal/backend/'),        to: '/portal/backend', labelKey: 'backend_area' },

  // CRM detail pages → list tabs
  { match: p => /^\/portal\/crm\/my-dealers\/[^/]+/.test(p), to: '/portal/crm/my-dealers', labelKey: 'my_dealers' },
  { match: p => /^\/portal\/crm\/leads\/(new|[^/]+)/.test(p), to: '/portal/crm/leads', labelKey: 'leads' },
  { match: p => /^\/portal\/crm\/demo-leads\/(new|[^/]+)/.test(p), to: '/portal/crm/demo-leads', labelKey: 'demo_leads' },
  { match: p => /^\/portal\/crm\/accounts\/[^/]+/.test(p), to: '/portal/crm/my-dealers', labelKey: 'my_dealers' },

  // CRM dashboard = CRM landing → back to portal
  { match: p => eq(p, '/portal/crm/dashboard'),           to: '/portal', labelKey: 'portal' },
  { match: p => eq(p, '/portal/crm'),                     to: '/portal', labelKey: 'portal' },
  // Other CRM tabs → CRM landing
  { match: p => startsWith(p, '/portal/crm/'),            to: '/portal/crm/dashboard', labelKey: 'crm_area' },

  // Service sub-areas
  { match: p => startsWith(p, '/portal/service/claims/'), to: '/portal/service/claims', labelKey: 'claims' },
  { match: p => eq(p, '/portal/service/claims'),          to: '/portal/teknik-service', labelKey: 'service_area' },
  { match: p => startsWith(p, '/portal/service/tsb/'),    to: '/portal/service/tsb', labelKey: 'tsb' },
  { match: p => eq(p, '/portal/service/tsb'),             to: '/portal/teknik-service', labelKey: 'service_area' },
  { match: p => eq(p, '/portal/service/warranty/registrations'), to: '/portal/service/warranty', labelKey: 'warranty_dashboard' },
  { match: p => eq(p, '/portal/service/warranty/sync'),   to: '/portal/service/warranty', labelKey: 'warranty_dashboard' },
  { match: p => startsWith(p, '/portal/service/warranty/'), to: '/portal/service/warranty', labelKey: 'warranty' },
  { match: p => eq(p, '/portal/service/warranty'),        to: '/portal/teknik-service', labelKey: 'service_area' },
  { match: p => startsWith(p, '/portal/service/tickets/'),to: '/portal/service/tickets', labelKey: 'service_tickets' },
  { match: p => startsWith(p, '/portal/service/maintenance/registrations/'), to: '/portal/service/maintenance', labelKey: 'service_maintenance' },
  { match: p => /^\/portal\/service\/machines\/[^/]+/.test(p), to: '/portal/service/machines', labelKey: 'machine_search' },
  { match: p => startsWith(p, '/portal/service/'),        to: '/portal/teknik-service', labelKey: 'service_area' },

  // Configurator
  { match: p => startsWith(p, '/configurator'),           to: '/portal/salg-marketing', labelKey: 'sales_marketing' },

  // Portal frontpage and anything unknown → portal
  { match: () => true,                                    to: '/portal', labelKey: 'portal' },
];

function resolve(pathname: string, search?: string): { to: string; labelKey: BackLabelKey } {
  const clean = pathname.split('?')[0].split('#')[0];

  // Navigation context overrides — when a detail page was opened from
  // Min Maskine, the back button should return to that exact machine.
  // Detail pages forward `?fromMachine=<serial>` (and optionally
  // `?fromSearch=1`) so we can rebuild the correct breadcrumb.
  if (search) {
    const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const fromMachine = q.get('fromMachine');
    if (fromMachine && !clean.startsWith('/portal/service/machines/' + fromMachine)) {
      return {
        to: `/portal/service/machines/${encodeURIComponent(fromMachine)}`,
        labelKey: 'machine_journal',
      };
    }
    if (q.get('fromSearch') === '1' && clean === '/portal/service/machines') {
      // no-op: machine search itself
    }
    if (q.get('fromSearch') === '1' && clean.startsWith('/portal/service/machines/')) {
      return { to: '/portal/service/machines', labelKey: 'machine_search' };
    }
  }

  for (const rule of RULES) {
    if (rule.match(clean)) return { to: rule.to, labelKey: rule.labelKey };
  }
  return { to: '/portal', labelKey: 'portal' };
}

/** Parent route for the given pathname. */
export function getPortalBackTarget(pathname: string, search?: string): PortalBackTarget {
  return resolve(pathname, search).to;
}

/** Parent route + localized label for the given pathname. */
export function getPortalBackInfo(
  pathname: string,
  language: Language = 'da',
  search?: string,
): { to: string; label: string } {
  const { to, labelKey } = resolve(pathname, search);
  return { to, label: LABELS[labelKey][language] ?? LABELS[labelKey].da };
}

/**
 * Navigate "back" using the parent-route map (breadcrumb style).
 *
 * Browser history is no longer used as the primary mechanism because
 * deep-linking, redirects and external entry points make it unreliable.
 * The parent map always returns a route the user has access to (or the
 * portal frontpage as the final fallback). Configurator is never used
 * as a fallback unless the user explicitly opens it.
 */
export function goBackOrFallback(
  navigate: NavigateFunction,
  location: { key?: string; pathname: string; search?: string },
  fallback?: string,
): void {
  navigate(fallback ?? getPortalBackTarget(location.pathname, location.search));
}

