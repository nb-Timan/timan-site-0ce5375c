// Module catalog for the dealer portal landing page.
// Each module is a clickable card. Visibility can be gated by role.
// Metric loaders are placeholders so the dashboard can later show live numbers.

import { AppUser } from '@/data/appUsers';
import { Language } from '@/types/configurator';
import { Wrench, ShieldAlert, FileWarning, BookOpen, Film, Sparkles, LucideIcon } from 'lucide-react';

export type PortalModuleId =
  | 'configurator'
  | 'claims'
  | 'tsb'
  | 'resources'
  | 'videos'
  | 'misc';

export interface PortalMetric {
  label: Record<Language, string>;
  /** Optional emphasis style — used for overdue / awaiting approval. */
  tone?: 'default' | 'warning' | 'danger';
  value: number | string;
}

export interface PortalModule {
  id: PortalModuleId;
  title: Record<Language, string>;
  description: Record<Language, string>;
  icon: LucideIcon;
  /** Where the card navigates. Internal route OR external URL. */
  href: string;
  /** When true the module is fully active. When false → "Coming soon" badge. */
  enabled: boolean;
  /** Role-based visibility. Empty array = visible to everyone. */
  visibleToRoles?: AppUser['role'][];
  /** Optional partner-type restriction. */
  visibleToPartnerTypes?: NonNullable<AppUser['partner_type']>[];
  /** Optional accent color token (uses CSS variables / Tailwind classes). */
  accent: 'primary' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate';
}

export const PORTAL_MODULES: PortalModule[] = [
  {
    id: 'configurator',
    title: { da: 'Build your Timan', en: 'Build your Timan', de: 'Build your Timan', it: 'Build your Timan', hu: 'Build your Timan' },
    description: {
      da: 'Konfigurer maskine, redskaber og tilbud',
      en: 'Configure machine, attachments and quote',
      de: 'Maschine, Anbaugeräte und Angebot konfigurieren',
      it: 'Configura macchina, accessori e preventivo',
      hu: 'Gép, tartozékok és árajánlat összeállítása',
    },
    icon: Wrench,
    href: '/configurator',
    enabled: true,
    accent: 'primary',
  },
  {
    id: 'claims',
    title: { da: 'Claims', en: 'Claims', de: 'Reklamationen', it: 'Reclami', hu: 'Reklamációk' },
    description: {
      da: 'Indsend og følg garantisager',
      en: 'Submit and follow warranty cases',
      de: 'Garantiefälle einreichen und verfolgen',
      it: 'Invia e segui le richieste di garanzia',
      hu: 'Garanciális ügyek beküldése és követése',
    },
    icon: ShieldAlert,
    href: '/portal/claims',
    enabled: false,
    visibleToRoles: ['partner', 'timan_saelger'],
    accent: 'rose',
  },
  {
    id: 'tsb',
    title: { da: 'TSB / Service', en: 'TSB / Service', de: 'TSB / Service', it: 'TSB / Assistenza', hu: 'TSB / Szerviz' },
    description: {
      da: 'Tekniske service-bulletiner og service-sager',
      en: 'Technical Service Bulletins and service cases',
      de: 'Technische Service-Bulletins und Service-Fälle',
      it: 'Bollettini tecnici e casi di assistenza',
      hu: 'Műszaki értesítők és szervizügyek',
    },
    icon: FileWarning,
    href: '/portal/tsb',
    enabled: false,
    visibleToRoles: ['partner', 'timan_saelger'],
    accent: 'amber',
  },
  {
    id: 'resources',
    title: { da: 'Resources', en: 'Resources', de: 'Ressourcen', it: 'Risorse', hu: 'Források' },
    description: {
      da: 'Brochurer, manualer og prislister',
      en: 'Brochures, manuals and price lists',
      de: 'Broschüren, Handbücher und Preislisten',
      it: 'Brochure, manuali e listini',
      hu: 'Brosúrák, kézikönyvek és árlisták',
    },
    icon: BookOpen,
    href: '/portal/resources',
    enabled: false,
    accent: 'sky',
  },
  {
    id: 'videos',
    title: { da: 'Video gallery', en: 'Video gallery', de: 'Videogalerie', it: 'Galleria video', hu: 'Videógaléria' },
    description: {
      da: 'Produktvideoer og træningsmateriale',
      en: 'Product videos and training material',
      de: 'Produktvideos und Schulungsmaterial',
      it: 'Video di prodotto e formazione',
      hu: 'Termékvideók és oktatóanyagok',
    },
    icon: Film,
    href: '/portal/videos',
    enabled: false,
    accent: 'violet',
  },
  {
    id: 'misc',
    title: { da: 'Miscellaneous', en: 'Miscellaneous', de: 'Verschiedenes', it: 'Varie', hu: 'Egyéb' },
    description: {
      da: 'Diverse værktøjer og links',
      en: 'Other tools and links',
      de: 'Sonstige Werkzeuge und Links',
      it: 'Altri strumenti e link',
      hu: 'Egyéb eszközök és linkek',
    },
    icon: Sparkles,
    href: '/portal/misc',
    enabled: false,
    accent: 'slate',
  },
];

export function isModuleVisible(module: PortalModule, user: AppUser | null): boolean {
  if (!module.visibleToRoles || module.visibleToRoles.length === 0) return true;
  if (!user) return false;
  if (!module.visibleToRoles.includes(user.role)) return false;
  if (module.visibleToPartnerTypes && module.visibleToPartnerTypes.length > 0) {
    if (!user.partner_type) return false;
    if (!module.visibleToPartnerTypes.includes(user.partner_type)) return false;
  }
  return true;
}

// ----- Dashboard metrics -----
// Real loaders will read from Supabase tables (claims, tsb_cases, news...).
// For now we expose a typed shape so the UI is ready for live data.

export interface DashboardMetrics {
  openClaims: number | null;
  claimsAwaitingApproval: number | null;
  activeTsbCases: number | null;
  overdueTsbCases: number | null;
  latestNewsCount: number | null;
}

export const EMPTY_METRICS: DashboardMetrics = {
  openClaims: null,
  claimsAwaitingApproval: null,
  activeTsbCases: null,
  overdueTsbCases: null,
  latestNewsCount: null,
};

/**
 * Placeholder loader. When the relevant Supabase tables exist, swap the body
 * for real `select count(*)` queries scoped to the user / partner.
 */
export async function loadDashboardMetrics(_user: AppUser): Promise<DashboardMetrics> {
  return EMPTY_METRICS;
}
