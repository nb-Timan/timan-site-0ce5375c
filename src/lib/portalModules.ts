// Module catalog for the dealer portal landing page.
// Each module is a clickable card. Visibility can be gated by role.
// Metric loaders are placeholders so the dashboard can later show live numbers.

import { AppUser } from '@/data/appUsers';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

import { Wrench, BookOpen, Film, Sparkles, LifeBuoy, LucideIcon } from 'lucide-react';

export type PortalModuleId =
  | 'configurator'
  | 'videos'
  | 'resources'
  | 'misc'
  | 'claims';

/**
 * Localised label for a module/metric. Covers the legacy 5 (da/en/de/it/hu)
 * plus the newer portal UI languages (sv/fr/pl/cs). Missing entries fall back
 * to English via `pickT` in the consumer.
 */
export type ModuleLabel = Partial<Record<PortalUiLanguage, string>>;

export interface PortalMetric {
  label: ModuleLabel;
  /** Optional emphasis style — used for overdue / awaiting approval. */
  tone?: 'default' | 'warning' | 'danger';
  value: number | string;
}

export interface PortalModule {
  id: PortalModuleId;
  title: ModuleLabel;
  description: ModuleLabel;
  /** Localized CTA button label shown at the bottom of each card. */
  cta: ModuleLabel;
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
    title: {
      da: 'Byg din Timan', en: 'Build your Timan', de: 'Bauen Sie Ihren Timan',
      it: 'Costruisci il tuo Timan', hu: 'Építse meg a Timanját',
      sv: 'Bygg din Timan', fr: 'Configurez votre Timan',
      pl: 'Zbuduj swojego Timana', cs: 'Sestavte si svůj Timan',
    },
    description: {
      da: 'Konfigurer maskiner, se priser og specifikationer. Få AI-assistance til tilbud og afgiv ordrer direkte.',
      en: 'Configure machines, view prices and specs. Get AI assistance for quotes and place orders directly.',
      de: 'Maschinen konfigurieren, Preise und Spezifikationen ansehen. KI-Unterstützung für Angebote und Bestellungen.',
      it: 'Configura macchine, visualizza prezzi e specifiche. Assistenza AI per preventivi e ordini diretti.',
      hu: 'Gépek konfigurálása, árak és specifikációk megtekintése. AI segítség árajánlatokhoz és rendelésekhez.',
      sv: 'Konfigurera maskiner, se priser och specifikationer. Få AI-stöd för offerter och lägg ordrar direkt.',
      fr: 'Configurez les machines, consultez prix et spécifications. Assistance IA pour devis et commandes directes.',
      pl: 'Konfiguruj maszyny, sprawdzaj ceny i specyfikacje. Wsparcie AI dla ofert i zamówień bezpośrednio.',
      cs: 'Konfigurujte stroje, prohlížejte ceny a specifikace. AI asistence pro nabídky a přímé objednávky.',
    },
    cta: {
      da: 'Gå til konfigurator', en: 'Open configurator', de: 'Konfigurator öffnen',
      it: 'Apri configuratore', hu: 'Konfigurátor megnyitása',
      sv: 'Öppna konfiguratorn', fr: 'Ouvrir le configurateur',
      pl: 'Otwórz konfigurator', cs: 'Otevřít konfigurátor',
    },
    icon: Wrench,
    href: '/configurator',
    enabled: true,
    accent: 'primary',
  },
  {
    id: 'videos',
    title: {
      da: 'Video Galleri', en: 'Video gallery', de: 'Videogalerie',
      it: 'Galleria video', hu: 'Videógaléria',
      sv: 'Videogalleri', fr: 'Galerie vidéo', pl: 'Galeria wideo', cs: 'Videogalerie',
    },
    description: {
      da: 'Hurtigt overblik over maskiner, redskaber og hjælpevideoer direkte fra vores YouTube-kanal.',
      en: 'Quick overview of machines, attachments and help videos directly from our YouTube channel.',
      de: 'Schneller Überblick über Maschinen, Anbaugeräte und Hilfevideos direkt von unserem YouTube-Kanal.',
      it: 'Panoramica rapida di macchine, accessori e video di aiuto direttamente dal nostro canale YouTube.',
      hu: 'Gyors áttekintés a gépekről, tartozékokról és súgóvideókról közvetlenül a YouTube-csatornánkról.',
      sv: 'Snabb översikt över maskiner, tillbehör och hjälpvideor direkt från vår YouTube-kanal.',
      fr: 'Aperçu rapide des machines, accessoires et vidéos d’aide directement depuis notre chaîne YouTube.',
      pl: 'Szybki przegląd maszyn, osprzętu i filmów pomocniczych bezpośrednio z naszego kanału YouTube.',
      cs: 'Rychlý přehled strojů, příslušenství a videí nápovědy přímo z našeho YouTube kanálu.',
    },
    cta: {
      da: 'Se videoer', en: 'Watch videos', de: 'Videos ansehen',
      it: 'Guarda i video', hu: 'Videók megtekintése',
      sv: 'Se videor', fr: 'Voir les vidéos', pl: 'Obejrzyj filmy', cs: 'Sledovat videa',
    },
    icon: Film,
    href: '/portal/videos',
    enabled: true,
    accent: 'violet',
  },
  {
    id: 'resources',
    title: {
      da: 'Ressourcer', en: 'Resources', de: 'Ressourcen', it: 'Risorse', hu: 'Források',
      sv: 'Resurser', fr: 'Ressources', pl: 'Zasoby', cs: 'Zdroje',
    },
    description: {
      da: 'Hent nyhedsbreve, formularer og andet nyttigt materiale til din forretning.',
      en: 'Download newsletters, forms and other useful material for your business.',
      de: 'Newsletter, Formulare und anderes nützliches Material für Ihr Geschäft herunterladen.',
      it: 'Scarica newsletter, moduli e altro materiale utile per la tua attività.',
      hu: 'Töltsön le hírleveleket, űrlapokat és egyéb hasznos anyagokat vállalkozásához.',
      sv: 'Ladda ner nyhetsbrev, formulär och annat användbart material för din verksamhet.',
      fr: 'Téléchargez bulletins, formulaires et autres documents utiles pour votre activité.',
      pl: 'Pobierz biuletyny, formularze i inne przydatne materiały dla Twojej firmy.',
      cs: 'Stáhněte si newslettery, formuláře a další užitečné materiály pro vaše podnikání.',
    },
    cta: {
      da: 'Åbn bibliotek', en: 'Open library', de: 'Bibliothek öffnen',
      it: 'Apri biblioteca', hu: 'Könyvtár megnyitása',
      sv: 'Öppna bibliotek', fr: 'Ouvrir la bibliothèque', pl: 'Otwórz bibliotekę', cs: 'Otevřít knihovnu',
    },
    icon: BookOpen,
    href: '/portal/resources',
    enabled: true,
    accent: 'sky',
  },
  {
    id: 'misc',
    title: {
      da: 'Diverse', en: 'Miscellaneous', de: 'Verschiedenes', it: 'Varie', hu: 'Egyéb',
      sv: 'Övrigt', fr: 'Divers', pl: 'Różne', cs: 'Různé',
    },
    description: {
      da: 'Diverse indstillinger, kontaktinfo og øvrige værktøjer samlet ét sted.',
      en: 'Other settings, contact info and additional tools all in one place.',
      de: 'Sonstige Einstellungen, Kontaktinformationen und zusätzliche Werkzeuge an einem Ort.',
      it: 'Altre impostazioni, contatti e strumenti aggiuntivi in un unico posto.',
      hu: 'Egyéb beállítások, kapcsolati információk és további eszközök egy helyen.',
      sv: 'Övriga inställningar, kontaktinfo och fler verktyg på ett ställe.',
      fr: 'Autres paramètres, informations de contact et outils supplémentaires regroupés.',
      pl: 'Inne ustawienia, dane kontaktowe i dodatkowe narzędzia w jednym miejscu.',
      cs: 'Další nastavení, kontaktní údaje a další nástroje na jednom místě.',
    },
    cta: {
      da: 'Se mere', en: 'See more', de: 'Mehr ansehen', it: 'Scopri di più', hu: 'További információ',
      sv: 'Se mer', fr: 'Voir plus', pl: 'Zobacz więcej', cs: 'Zobrazit více',
    },
    icon: Sparkles,
    href: '/portal/misc',
    enabled: true,
    accent: 'slate',
  },
  {
    id: 'claims',
    title: {
      da: 'Claims', en: 'Claims', de: 'Reklamationen', it: 'Reclami', hu: 'Reklamációk',
      sv: 'Reklamationer', fr: 'Réclamations', pl: 'Reklamacje', cs: 'Reklamace',
    },
    description: {
      da: 'Opret og følg service- og garantisager direkte i portalen.',
      en: 'Create and track service and warranty claims directly in the portal.',
      de: 'Service- und Garantiefälle direkt im Portal erstellen und verfolgen.',
      it: 'Crea e segui i casi di assistenza e garanzia direttamente nel portale.',
      hu: 'Szerviz- és garanciaesetek létrehozása és nyomon követése a portálon.',
      sv: 'Skapa och följ service- och garantiärenden direkt i portalen.',
      fr: 'Créez et suivez les dossiers de service et de garantie directement dans le portail.',
      pl: 'Twórz i śledź sprawy serwisowe i gwarancyjne bezpośrednio w portalu.',
      cs: 'Vytvářejte a sledujte servisní a záruční případy přímo v portálu.',
    },
    cta: {
      da: 'Åbn sager', en: 'Open claims', de: 'Fälle öffnen', it: 'Apri reclami', hu: 'Ügyek megnyitása',
      sv: 'Öppna ärenden', fr: 'Ouvrir les dossiers', pl: 'Otwórz sprawy', cs: 'Otevřít případy',
    },
    icon: LifeBuoy,
    href: '/portal/service/claims',
    enabled: true,
    accent: 'rose',
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
