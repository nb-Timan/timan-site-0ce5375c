/**
 * Site/product changelog service.
 *
 * Public portal UI reads only `site_change_public_entries`, which contains
 * user-facing published text. Marketing/Backend administration reads the
 * internal `site_change_entries` table.
 */
import { supabase } from './supabase';
import {
  CHANGELOG_ENTRIES,
  ChangeLogEntry,
  ModuleKey,
  ChangelogRole,
} from './portalChangelog';
import { PORTAL_LANGUAGE_CODES, portalLanguageLookupOrder, type PortalUiLanguage } from '@/lib/portalLanguages';

const PAGE_SIZE = 1000;

export type SiteChangeLocalizedText = {
  title?: string | null;
  description?: string | null;
  note?: string | null;
  module_label?: string | null;
  change_type_label?: string | null;
};

export type SiteChangeLocalizedContent = Partial<Record<PortalUiLanguage | string, SiteChangeLocalizedText>>;

export type SiteChangeStatus = 'new' | 'draft' | 'published' | 'archived';
export type SiteChangeRecommendation = 'publish' | 'maybe' | 'internal';

export interface SiteChangeEntryRow {
  id: string;
  source: string;
  source_ref: string | null;
  implemented_at: string;
  title_internal: string;
  description_internal: string | null;
  technical_description: string | null;
  title_public: string | null;
  description_public: string | null;
  localized_content: SiteChangeLocalizedContent | null;
  module: string;
  change_type: string;
  affected_roles: string[];
  user_impact_score: number;
  technical_impact_score: number;
  publish_recommendation: SiteChangeRecommendation;
  is_important: boolean;
  status: SiteChangeStatus;
  published_at: string | null;
  archived_at: string | null;
  reviewed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  published_by: string | null;
  is_group: boolean;
  group_parent_id: string | null;
  group_suggestion_status: 'none' | 'suggested' | 'approved' | 'split';
  grouped_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteChangePublicRow {
  id: string;
  published_at: string;
  implemented_at: string;
  title: string;
  description: string | null;
  localized_content: SiteChangeLocalizedContent | null;
  module: string;
  change_type: string;
  affected_roles: string[];
  is_important: boolean;
  source_ref: string | null;
  updated_at: string;
}

export interface ChangelogDraft {
  id?: string;
  source: string;
  source_ref?: string | null;
  implemented_at: string;
  title_internal: string;
  description_internal?: string | null;
  technical_description?: string | null;
  title_public?: string | null;
  description_public?: string | null;
  localized_content?: SiteChangeLocalizedContent | null;
  module: string;
  change_type: string;
  affected_roles: string[];
  user_impact_score: number;
  technical_impact_score: number;
  publish_recommendation: SiteChangeRecommendation;
  is_important: boolean;
  status: SiteChangeStatus;
  published_at?: string | null;
  archived_at?: string | null;
  reviewed_at?: string | null;
  is_group?: boolean;
  group_parent_id?: string | null;
  group_suggestion_status?: 'none' | 'suggested' | 'approved' | 'split';
  grouped_at?: string | null;
}

export interface ChangelogListOptions {
  page?: number;
  pageSize?: number;
  status?: SiteChangeStatus | 'all';
  recommendation?: SiteChangeRecommendation | 'all';
  module?: string;
  role?: string;
  changeType?: string;
  minUserImpact?: number;
  search?: string;
}

export interface SiteChangeGitHubSyncResult {
  ok?: boolean;
  imported?: number;
  skipped?: number;
  groupsSuggested?: number;
  commits?: string[];
  message?: string;
  error?: string;
}

function localizedText(values: SiteChangeLocalizedContent | null | undefined, key: keyof SiteChangeLocalizedText, language: PortalUiLanguage): string {
  if (!values) return '';
  const byLanguage = values as Record<string, SiteChangeLocalizedText | undefined>;
  for (const languageKey of portalLanguageLookupOrder(language)) {
    const value = byLanguage[languageKey]?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

export interface SiteChangePublishedContent {
  title: string;
  description: string;
  note: string;
  moduleLabel: string;
  changeTypeLabel: string;
}

type SiteChangeContentSource = {
  localized_content?: SiteChangeLocalizedContent | null;
  source?: string | null;
  source_ref?: string | null;
  title?: string | null;
  description?: string | null;
  title_public?: string | null;
  description_public?: string | null;
  title_internal?: string | null;
  description_internal?: string | null;
  module: string;
  change_type: string;
};

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

const AREA_PREFIX: Record<PortalUiLanguage, string> = {
  da: 'Område',
  en: 'Area',
  de: 'Bereich',
  it: 'Area',
  hu: 'Terület',
  sv: 'Område',
  fr: 'Zone',
  pl: 'Obszar',
  cs: 'Oblast',
};

const MODULE_PUBLIC_TEXT: Record<string, Record<PortalUiLanguage, { title: string; description: string; note: string }>> = {
  crm: {
    da: { title: 'CRM er forbedret', description: 'CRM-arbejdet er blevet gjort mere overskueligt, så leads, opfølgning og salgsarbejde er lettere at holde styr på.', note: 'CRM forbedret' },
    en: { title: 'CRM has been improved', description: 'CRM work has been made clearer, so leads, follow-up and sales activity are easier to manage.', note: 'CRM improved' },
    de: { title: 'CRM wurde verbessert', description: 'Die CRM-Arbeit ist übersichtlicher geworden, damit Leads, Nachverfolgung und Verkauf leichter gesteuert werden können.', note: 'CRM verbessert' },
    it: { title: 'CRM migliorato', description: 'Il lavoro CRM è più chiaro, così lead, follow-up e attività commerciali sono più facili da gestire.', note: 'CRM migliorato' },
    hu: { title: 'A CRM továbbfejlesztve', description: 'A CRM-munka áttekinthetőbb lett, így a leadek, utánkövetések és értékesítési feladatok könnyebben kezelhetők.', note: 'CRM fejlesztve' },
    sv: { title: 'CRM har förbättrats', description: 'CRM-arbetet har blivit tydligare, så leads, uppföljning och försäljning blir lättare att hantera.', note: 'CRM förbättrat' },
    fr: { title: 'Le CRM a été amélioré', description: 'Le travail CRM est plus clair, afin de mieux gérer les leads, le suivi et les activités commerciales.', note: 'CRM amélioré' },
    pl: { title: 'CRM został ulepszony', description: 'Praca w CRM jest bardziej przejrzysta, dzięki czemu leady, działania następcze i sprzedaż są łatwiejsze do obsługi.', note: 'CRM ulepszony' },
    cs: { title: 'CRM bylo vylepšeno', description: 'Práce v CRM je přehlednější, takže leady, následné kroky a prodejní aktivity se snáze řídí.', note: 'CRM vylepšeno' },
  },
  dealer_data: {
    da: { title: 'Partnerdata er forbedret', description: 'Partneroplysninger og kontaktdata er blevet lettere at finde, vedligeholde og bruge i det daglige arbejde.', note: 'Partnerdata forbedret' },
    en: { title: 'Partner data has been improved', description: 'Partner information and contact data are easier to find, maintain and use in daily work.', note: 'Partner data improved' },
    de: { title: 'Partnerdaten wurden verbessert', description: 'Partnerinformationen und Kontaktdaten sind leichter zu finden, zu pflegen und im Alltag zu nutzen.', note: 'Partnerdaten verbessert' },
    it: { title: 'Dati partner migliorati', description: 'Le informazioni partner e i dati di contatto sono più facili da trovare, mantenere e usare nel lavoro quotidiano.', note: 'Dati partner migliorati' },
    hu: { title: 'Partneradatok továbbfejlesztve', description: 'A partnerinformációk és kapcsolattartási adatok könnyebben megtalálhatók, karbantarthatók és használhatók.', note: 'Partneradatok fejlesztve' },
    sv: { title: 'Partnerdata har förbättrats', description: 'Partnerinformation och kontaktdata är lättare att hitta, underhålla och använda i det dagliga arbetet.', note: 'Partnerdata förbättrat' },
    fr: { title: 'Les données partenaires ont été améliorées', description: 'Les informations partenaires et les coordonnées sont plus faciles à trouver, maintenir et utiliser au quotidien.', note: 'Données partenaires améliorées' },
    pl: { title: 'Dane partnera zostały ulepszone', description: 'Informacje o partnerach i dane kontaktowe są łatwiejsze do znalezienia, utrzymania i użycia na co dzień.', note: 'Dane partnera ulepszone' },
    cs: { title: 'Data partnerů byla vylepšena', description: 'Informace o partnerech a kontaktní údaje se snáze hledají, udržují a používají v každodenní práci.', note: 'Data partnerů vylepšena' },
  },
  map: {
    da: { title: 'Forbedret områdekort', description: 'Kort og områdevalg er blevet mere overskuelige, så geografiske områder kan aflæses og bruges mere sikkert.', note: 'Områdekort forbedret' },
    en: { title: 'Improved territory map', description: 'Maps and territory selection are clearer, so geographic areas can be reviewed and used more reliably.', note: 'Territory map improved' },
    de: { title: 'Verbesserte Gebietskarte', description: 'Karten und Gebietsauswahl sind übersichtlicher, sodass geografische Bereiche zuverlässiger geprüft und genutzt werden können.', note: 'Gebietskarte verbessert' },
    it: { title: 'Mappa aree migliorata', description: 'Mappe e selezione delle aree sono più chiare, così le aree geografiche possono essere controllate e usate meglio.', note: 'Mappa aree migliorata' },
    hu: { title: 'Továbbfejlesztett területtérkép', description: 'A térképek és területválasztás áttekinthetőbbek, így a földrajzi területek megbízhatóbban használhatók.', note: 'Területtérkép fejlesztve' },
    sv: { title: 'Förbättrad områdeskarta', description: 'Kartor och områdesval är tydligare, så geografiska områden kan granskas och användas mer säkert.', note: 'Områdeskarta förbättrad' },
    fr: { title: 'Carte des zones améliorée', description: 'Les cartes et la sélection de zones sont plus claires, afin d’examiner et d’utiliser les zones géographiques plus sûrement.', note: 'Carte des zones améliorée' },
    pl: { title: 'Ulepszona mapa obszarów', description: 'Mapy i wybór obszarów są bardziej przejrzyste, więc obszary geograficzne można sprawdzać i używać pewniej.', note: 'Mapa obszarów ulepszona' },
    cs: { title: 'Vylepšená mapa oblastí', description: 'Mapy a výběr oblastí jsou přehlednější, takže geografické oblasti lze spolehlivěji kontrolovat a používat.', note: 'Mapa oblastí vylepšena' },
  },
  marketing: {
    da: { title: 'Marketing-indhold er forbedret', description: 'Marketing kan lettere styre publiceret indhold, sprog og visning i portalen.', note: 'Marketing forbedret' },
    en: { title: 'Marketing content has been improved', description: 'Marketing can manage published content, languages and portal display more easily.', note: 'Marketing improved' },
    de: { title: 'Marketing-Inhalte wurden verbessert', description: 'Marketing kann veröffentlichte Inhalte, Sprachen und Portalanzeige einfacher steuern.', note: 'Marketing verbessert' },
    it: { title: 'Contenuti marketing migliorati', description: 'Il Marketing può gestire più facilmente contenuti pubblicati, lingue e visualizzazione nel portale.', note: 'Marketing migliorato' },
    hu: { title: 'Marketingtartalom továbbfejlesztve', description: 'A Marketing könnyebben kezelheti a közzétett tartalmat, nyelveket és portálmegjelenítést.', note: 'Marketing fejlesztve' },
    sv: { title: 'Marketinginnehåll har förbättrats', description: 'Marketing kan enklare styra publicerat innehåll, språk och visning i portalen.', note: 'Marketing förbättrat' },
    fr: { title: 'Le contenu marketing a été amélioré', description: 'Le marketing peut gérer plus facilement les contenus publiés, les langues et l’affichage du portail.', note: 'Marketing amélioré' },
    pl: { title: 'Treści marketingowe zostały ulepszone', description: 'Marketing może łatwiej zarządzać opublikowanymi treściami, językami i widokiem portalu.', note: 'Marketing ulepszony' },
    cs: { title: 'Marketingový obsah byl vylepšen', description: 'Marketing může snadněji spravovat zveřejněný obsah, jazyky a zobrazení v portálu.', note: 'Marketing vylepšen' },
  },
};

function isGitHubImportPlaceholder(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^(automatisk|automatically)\s+importeret?\s+fra\s+github|^automatically\s+imported\s+from\s+github/i.test(value.trim());
}

function isTechnicalPublicTitle(value: string | null | undefined, feature: SiteChangeContentSource): boolean {
  const title = firstText(value);
  if (!title) return false;
  const internal = firstText(feature.title_internal);
  const description = firstText(feature.description_public, feature.description);
  const isGitHubRow = firstText(feature.source_ref).startsWith('github:') || feature.source === 'github';
  return (
    title === internal ||
    /^(feat|fix|chore|refactor|style|test|docs|build|ci)(\([^)]+\))?:\s*/i.test(title) ||
    /\b(commit|github|chunk|vite|supabase|rls|migration)\b/i.test(title) ||
    (isGitHubRow && (!description || isGitHubImportPlaceholder(description)))
  );
}

function fallbackPublicText(module: string, changeType: string, language: PortalUiLanguage): { title: string; description: string; note: string } {
  const area = moduleName(module)[language] || moduleName(module).en || moduleName(module).da || module;
  const descriptions: Record<'bugfix' | 'improvement', Record<PortalUiLanguage, string>> = {
    bugfix: {
      da: `${area} er blevet rettet, så funktionen virker mere stabilt for brugerne.`,
      en: `${area} has been corrected so the feature works more reliably for users.`,
      de: `${area} wurde korrigiert, damit die Funktion für Benutzer zuverlässiger arbeitet.`,
      it: `${area} è stato corretto, così la funzione è più stabile per gli utenti.`,
      hu: `${area} javítva lett, így a funkció megbízhatóbban működik a felhasználók számára.`,
      sv: `${area} har rättats, så funktionen fungerar mer stabilt för användarna.`,
      fr: `${area} a été corrigé afin que la fonction soit plus fiable pour les utilisateurs.`,
      pl: `${area} został poprawiony, dzięki czemu funkcja działa stabilniej dla użytkowników.`,
      cs: `${area} bylo opraveno, takže funkce pracuje pro uživatele spolehlivěji.`,
    },
    improvement: {
      da: `${area} er blevet forbedret, så hverdagsarbejdet i portalen bliver mere overskueligt.`,
      en: `${area} has been improved to make everyday portal work clearer.`,
      de: `${area} wurde verbessert, damit die tägliche Arbeit im Portal übersichtlicher wird.`,
      it: `${area} è stato migliorato per rendere più chiaro il lavoro quotidiano nel portale.`,
      hu: `${area} továbbfejlesztve, hogy a mindennapi portálmunka áttekinthetőbb legyen.`,
      sv: `${area} har förbättrats så det dagliga arbetet i portalen blir tydligare.`,
      fr: `${area} a été amélioré pour rendre le travail quotidien dans le portail plus clair.`,
      pl: `${area} został ulepszony, aby codzienna praca w portalu była bardziej przejrzysta.`,
      cs: `${area} bylo vylepšeno, aby každodenní práce v portálu byla přehlednější.`,
    },
  };
  const titles: Record<PortalUiLanguage, string> = {
    da: `${area} er opdateret`,
    en: `${area} has been updated`,
    de: `${area} wurde aktualisiert`,
    it: `${area} è stato aggiornato`,
    hu: `${area} frissítve`,
    sv: `${area} har uppdaterats`,
    fr: `${area} a été mis à jour`,
    pl: `${area} został zaktualizowany`,
    cs: `${area} bylo aktualizováno`,
  };
  const notes: Record<PortalUiLanguage, string> = {
    da: `${area} opdateret`,
    en: `${area} updated`,
    de: `${area} aktualisiert`,
    it: `${area} aggiornato`,
    hu: `${area} frissítve`,
    sv: `${area} uppdaterat`,
    fr: `${area} mis à jour`,
    pl: `${area} zaktualizowany`,
    cs: `${area} aktualizováno`,
  };
  return {
    title: titles[language],
    description: changeType === 'bugfix' ? descriptions.bugfix[language] : descriptions.improvement[language],
    note: notes[language],
  };
}

export function buildPublishedFeatureSuggestion(
  module: string,
  changeType: string,
  language: PortalUiLanguage,
): SiteChangeLocalizedText {
  const template = MODULE_PUBLIC_TEXT[module]?.[language] || fallbackPublicText(module, changeType, language);
  const area = moduleName(module)[language] || moduleName(module).en || moduleName(module).da || module;
  return {
    title: template.title,
    description: `${template.description}\n\n${AREA_PREFIX[language]}: ${area}`,
    note: template.note,
    module_label: area,
    change_type_label: changeType,
  };
}

const CRM_OVERVIEW_GROUP_TEXT: Record<PortalUiLanguage, { title: string; description: string; note: string }> = {
  da: {
    title: 'CRM-overblikket er forbedret',
    description: 'Partneroversigten er blevet gjort mere kompakt og overskuelig. Kontaktoplysninger, KPI-kort, noter og øvrige partnerdata er blevet organiseret bedre, så de vigtigste oplysninger er lettere at finde og arbejde med.',
    note: 'CRM-overblik forbedret',
  },
  en: {
    title: 'The CRM overview has been improved',
    description: 'The partner overview has been made more compact and easier to scan. Contact details, KPI cards, notes and other partner data are organized more clearly, so the most important information is easier to find and work with.',
    note: 'CRM overview improved',
  },
  de: {
    title: 'Die CRM-Übersicht wurde verbessert',
    description: 'Die Partnerübersicht wurde kompakter und übersichtlicher gestaltet. Kontaktdaten, KPI-Karten, Notizen und weitere Partnerdaten sind klarer organisiert, damit wichtige Informationen leichter zu finden und zu bearbeiten sind.',
    note: 'CRM-Übersicht verbessert',
  },
  it: {
    title: 'La panoramica CRM è stata migliorata',
    description: 'La panoramica partner è stata resa più compatta e chiara. Contatti, KPI, note e altri dati partner sono organizzati meglio, così le informazioni principali sono più facili da trovare e usare.',
    note: 'Panoramica CRM migliorata',
  },
  hu: {
    title: 'A CRM-áttekintés továbbfejlesztve',
    description: 'A partneráttekintés kompaktabb és áttekinthetőbb lett. A kapcsolattartási adatok, KPI-kártyák, jegyzetek és egyéb partneradatok rendezettebben jelennek meg, így a fontos információk könnyebben megtalálhatók és használhatók.',
    note: 'CRM-áttekintés fejlesztve',
  },
  sv: {
    title: 'CRM-översikten har förbättrats',
    description: 'Partneröversikten har blivit mer kompakt och lättare att överblicka. Kontaktuppgifter, KPI-kort, anteckningar och annan partnerdata är tydligare organiserade, så viktig information blir lättare att hitta och arbeta med.',
    note: 'CRM-översikt förbättrad',
  },
  fr: {
    title: 'La vue d’ensemble CRM a été améliorée',
    description: 'La vue partenaire est plus compacte et plus claire. Les coordonnées, cartes KPI, notes et autres données partenaire sont mieux organisées, afin de retrouver et traiter plus facilement les informations importantes.',
    note: 'Vue CRM améliorée',
  },
  pl: {
    title: 'Widok CRM został ulepszony',
    description: 'Widok partnera jest bardziej kompaktowy i czytelny. Dane kontaktowe, karty KPI, notatki i pozostałe dane partnera są lepiej uporządkowane, dzięki czemu najważniejsze informacje łatwiej znaleźć i wykorzystać.',
    note: 'Widok CRM ulepszony',
  },
  cs: {
    title: 'Přehled CRM byl vylepšen',
    description: 'Přehled partnera je kompaktnější a přehlednější. Kontaktní údaje, KPI karty, poznámky a další partnerská data jsou lépe uspořádána, takže důležité informace lze snáze najít a používat.',
    note: 'Přehled CRM vylepšen',
  },
};

function rowTextForGrouping(row: Pick<SiteChangeEntryRow, 'title_internal' | 'description_internal' | 'technical_description'>): string {
  return `${row.title_internal}\n${row.description_internal || ''}\n${row.technical_description || ''}`.toLowerCase();
}

function isCrmOverviewGroup(rows: Array<Pick<SiteChangeEntryRow, 'title_internal' | 'description_internal' | 'technical_description' | 'module'>>): boolean {
  return rows.some((row) => row.module === 'crm' && /\b(partner|dealer|detail|overview|overblik|kpi|note|quick-card|quick card)\b/.test(rowTextForGrouping(row)));
}

export function buildGroupedFeatureSuggestion(rows: SiteChangeEntryRow[]): SiteChangeLocalizedContent {
  const module = rows[0]?.module || 'backend';
  const changeType = rows[0]?.change_type || 'improvement';
  const useCrmOverview = module === 'crm' && isCrmOverviewGroup(rows);

  return PORTAL_LANGUAGE_CODES.reduce((acc, lang) => {
    const area = moduleName(module)[lang] || moduleName(module).en || moduleName(module).da || module;
    if (useCrmOverview) {
      const text = CRM_OVERVIEW_GROUP_TEXT[lang];
      acc[lang] = {
        title: text.title,
        description: `${text.description}\n\n${AREA_PREFIX[lang]}: ${area}`,
        note: text.note,
        module_label: area,
        change_type_label: changeType,
      };
      return acc;
    }
    const generated = buildPublishedFeatureSuggestion(module, changeType, lang);
    acc[lang] = {
      ...generated,
      title: generated.title,
      description: generated.description || '',
    };
    return acc;
  }, {} as SiteChangeLocalizedContent);
}

function userFacingLocalizedText(
  values: SiteChangeLocalizedContent | null | undefined,
  key: keyof SiteChangeLocalizedText,
  language: PortalUiLanguage,
  feature: SiteChangeContentSource,
): string {
  if (!values) return '';
  const byLanguage = values as Record<string, SiteChangeLocalizedText | undefined>;
  for (const languageKey of portalLanguageLookupOrder(language)) {
    const value = byLanguage[languageKey]?.[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    if (key === 'description' && isGitHubImportPlaceholder(value)) continue;
    if (key === 'title') {
      const siblingDescription = firstText(byLanguage[languageKey]?.description);
      const isGitHubRow = firstText(feature.source_ref).startsWith('github:') || feature.source === 'github';
      if (isTechnicalPublicTitle(value, feature)) continue;
      if (isGitHubRow && (!siblingDescription || isGitHubImportPlaceholder(siblingDescription))) continue;
    }
    return value.trim();
  }
  return '';
}

export function getPublishedFeatureContent(
  feature: SiteChangeContentSource,
  language: PortalUiLanguage,
): SiteChangePublishedContent {
  const content = feature.localized_content || {};
  const moduleLabels = moduleName(feature.module);
  const generated = buildPublishedFeatureSuggestion(feature.module, feature.change_type, language);
  const fallbackTitle = firstText(
    !isTechnicalPublicTitle(feature.title_public, feature) ? feature.title_public : '',
    !isTechnicalPublicTitle(feature.title, feature) ? feature.title : '',
    generated.title,
  );
  const fallbackDescription = firstText(
    !isGitHubImportPlaceholder(feature.description_public) ? feature.description_public : '',
    !isGitHubImportPlaceholder(feature.description) ? feature.description : '',
    generated.description,
  );
  const title = firstText(userFacingLocalizedText(content, 'title', language, feature), fallbackTitle);
  const description = firstText(userFacingLocalizedText(content, 'description', language, feature), fallbackDescription);

  return {
    title,
    description: firstText(description, generated.description),
    note: firstText(userFacingLocalizedText(content, 'note', language, feature), generated.note, title),
    moduleLabel: firstText(
      localizedText(content, 'module_label', language) !== feature.module ? localizedText(content, 'module_label', language) : '',
      moduleLabels[language],
      moduleLabels.en,
      moduleLabels.da,
      feature.module,
    ),
    changeTypeLabel: firstText(localizedText(content, 'change_type_label', language), feature.change_type),
  };
}

function localizePublishedContent(
  feature: SiteChangeContentSource,
  key: keyof SiteChangeLocalizedText,
): Record<PortalUiLanguage, string> {
  return PORTAL_LANGUAGE_CODES.reduce((acc, lang) => {
    const published = getPublishedFeatureContent(feature, lang);
    acc[lang] =
      key === 'title' ? published.title :
      key === 'description' ? published.description :
      key === 'note' ? published.note :
      key === 'module_label' ? published.moduleLabel :
      published.changeTypeLabel;
    return acc;
  }, {} as Record<PortalUiLanguage, string>);
}

const MODULE_LABELS: Record<string, Partial<Record<PortalUiLanguage, string>>> = {
  crm: { da: 'CRM', en: 'CRM', de: 'CRM', it: 'CRM', hu: 'CRM', sv: 'CRM', fr: 'CRM', pl: 'CRM', cs: 'CRM' },
  leads: { da: 'Leads', en: 'Leads', de: 'Leads', it: 'Lead', hu: 'Érdeklődők', sv: 'Leads', fr: 'Leads', pl: 'Leady', cs: 'Leady' },
  dealer_data: { da: 'Partnerdata', en: 'Partner data', de: 'Partnerdaten', it: 'Dati partner', hu: 'Partneradatok', sv: 'Partnerdata', fr: 'Données partenaire', pl: 'Dane partnera', cs: 'Data partnera' },
  dealer_portal: { da: 'Forhandlerportal', en: 'Dealer portal', de: 'Händlerportal', it: 'Portale rivenditore', hu: 'Kereskedői portál', sv: 'Återförsäljarportal', fr: 'Portail revendeur', pl: 'Portal dealera', cs: 'Portál prodejce' },
  service: { da: 'Service & Teknik', en: 'Service & Technical', de: 'Service & Technik', it: 'Assistenza e tecnica', hu: 'Szerviz és műszaki', sv: 'Service och teknik', fr: 'Service et technique', pl: 'Serwis i technika', cs: 'Servis a technika' },
  messe: { da: 'Messe', en: 'Exhibition', de: 'Messe', it: 'Fiera', hu: 'Kiállítás', sv: 'Mässa', fr: 'Salon', pl: 'Targi', cs: 'Veletrh' },
  marketing: { da: 'Marketing', en: 'Marketing', de: 'Marketing', it: 'Marketing', hu: 'Marketing', sv: 'Marketing', fr: 'Marketing', pl: 'Marketing', cs: 'Marketing' },
  map: { da: 'Kort / Kontrakt', en: 'Map / Contract', de: 'Karte / Vertrag', it: 'Mappa / Contratto', hu: 'Térkép / Szerződés', sv: 'Karta / Avtal', fr: 'Carte / Contrat', pl: 'Mapa / Umowa', cs: 'Mapa / Smlouva' },
  warranty: { da: 'Garantiregistrering', en: 'Warranty registration', de: 'Garantieregistrierung', it: 'Registrazione garanzia', hu: 'Garanciaregisztráció', sv: 'Garantiregistrering', fr: 'Enregistrement de garantie', pl: 'Rejestracja gwarancji', cs: 'Registrace záruky' },
  claims: { da: 'Claims', en: 'Claims', de: 'Reklamationen', it: 'Reclami', hu: 'Reklamációk', sv: 'Reklamationer', fr: 'Réclamations', pl: 'Reklamacje', cs: 'Reklamace' },
  tsb: { da: 'TSB', en: 'TSB', de: 'TSB', it: 'TSB', hu: 'TSB', sv: 'TSB', fr: 'TSB', pl: 'TSB', cs: 'TSB' },
  users: { da: 'Brugere', en: 'Users', de: 'Benutzer', it: 'Utenti', hu: 'Felhasználók', sv: 'Användare', fr: 'Utilisateurs', pl: 'Użytkownicy', cs: 'Uživatelé' },
  budget: { da: 'Budget', en: 'Budget', de: 'Budget', it: 'Budget', hu: 'Költségvetés', sv: 'Budget', fr: 'Budget', pl: 'Budżet', cs: 'Rozpočet' },
  quotes: { da: 'Tilbud', en: 'Quotes', de: 'Angebote', it: 'Offerte', hu: 'Ajánlatok', sv: 'Offerter', fr: 'Devis', pl: 'Oferty', cs: 'Nabídky' },
  orders: { da: 'Ordrer', en: 'Orders', de: 'Aufträge', it: 'Ordini', hu: 'Megrendelések', sv: 'Order', fr: 'Commandes', pl: 'Zamówienia', cs: 'Objednávky' },
  backend: { da: 'Backend', en: 'Backend', de: 'Backend', it: 'Backend', hu: 'Backend', sv: 'Backend', fr: 'Backend', pl: 'Backend', cs: 'Backend' },
  misc: { da: 'Formularer', en: 'Forms', de: 'Formulare', it: 'Moduli', hu: 'Űrlapok', sv: 'Formulär', fr: 'Formulaires', pl: 'Formularze', cs: 'Formuláře' },
  configurator: { da: 'Konfigurator', en: 'Configurator', de: 'Konfigurator', it: 'Configuratore', hu: 'Konfigurátor', sv: 'Konfigurator', fr: 'Configurateur', pl: 'Konfigurator', cs: 'Konfigurátor' },
  partner_map: { da: 'Partnerkort', en: 'Partner map', de: 'Partnerkarte', it: 'Mappa partner', hu: 'Partnertérkép', sv: 'Partnerkarta', fr: 'Carte partenaires', pl: 'Mapa partnerów', cs: 'Mapa partnerů' },
};

function moduleName(module: string): Partial<Record<PortalUiLanguage, string>> {
  const labels = MODULE_LABELS[module] || {};
  if (Object.keys(labels).length > 0) return labels;
  return PORTAL_LANGUAGE_CODES.reduce((acc, lang) => {
    acc[lang] = module;
    return acc;
  }, {} as Partial<Record<PortalUiLanguage, string>>);
}

export function localizedContentFromDraft(draft: Pick<ChangelogDraft, 'localized_content' | 'title_public' | 'description_public' | 'title_internal' | 'description_internal' | 'module' | 'change_type' | 'source' | 'source_ref'>): SiteChangeLocalizedContent {
  const base = draft.localized_content || {};
  const feature = draft as SiteChangeContentSource;
  return PORTAL_LANGUAGE_CODES.reduce((acc, lang) => {
    const generated = buildPublishedFeatureSuggestion(draft.module, draft.change_type, lang);
    const existing = base[lang] || {};
    const title =
      !isTechnicalPublicTitle(existing.title, feature) ? firstText(existing.title) : '';
    const description =
      !isGitHubImportPlaceholder(existing.description) ? firstText(existing.description) : '';

    acc[lang] = {
      ...existing,
      title: firstText(title, lang === 'da' && !isTechnicalPublicTitle(draft.title_public, feature) ? draft.title_public : '', generated.title),
      description: firstText(description, lang === 'da' && !isGitHubImportPlaceholder(draft.description_public) ? draft.description_public : '', generated.description),
      note: firstText(existing.note, generated.note),
      module_label: firstText(existing.module_label, generated.module_label),
      change_type_label: firstText(existing.change_type_label, generated.change_type_label),
    };
    return acc;
  }, { ...base } as SiteChangeLocalizedContent);
}

export function missingSiteChangeLanguages(row: Pick<SiteChangeEntryRow, 'localized_content' | 'title_public' | 'description_public' | 'title_internal' | 'description_internal' | 'source' | 'source_ref' | 'module' | 'change_type'>): PortalUiLanguage[] {
  const content = row.localized_content || {};
  return PORTAL_LANGUAGE_CODES.filter((lang) => {
    const exact = content[lang];
    const hasTitle = firstText(
      !isTechnicalPublicTitle(exact?.title, row) ? exact?.title : '',
      lang === 'da' && !isTechnicalPublicTitle(row.title_public, row) ? row.title_public : '',
    );
    const hasDescription = firstText(
      !isGitHubImportPlaceholder(exact?.description) ? exact?.description : '',
      lang === 'da' && !isGitHubImportPlaceholder(row.description_public) ? row.description_public : '',
    );
    return !(hasTitle && hasDescription);
  });
}

function moduleToKey(module: string): ModuleKey {
  const map: Record<string, ModuleKey> = {
    map: 'partner_map',
    partner_map: 'misc',
    dealer_portal: 'dealer_data',
    leads: 'crm',
    budget: 'crm',
    quotes: 'crm',
    orders: 'crm',
    users: 'backend',
    marketing: 'backend',
    tsb: 'service',
  };
  return map[module] || (module as ModuleKey);
}

function normalizeRoleVisibility(roles: string[]): ChangelogRole[] {
  const out = new Set<ChangelogRole>();
  for (const role of roles) {
    if (role === 'all') out.add('all');
    if (role === 'timan_backend') out.add('timan_backend').add('backend').add('admin');
    if (role === 'admin') out.add('backend').add('admin');
    if (role === 'timan_seller') out.add('timan_seller').add('sales');
    if (role === 'sales') out.add('sales');
    if (role === 'timan_service') out.add('timan_service').add('service');
    if (role === 'service') out.add('service');
    if (role === 'timan_importer') out.add('timan_importer');
    if (role === 'timan_dealer') out.add('timan_dealer');
    if (role === 'timan_service_partner') out.add('timan_service_partner');
    if (role === 'dealer_customer') out.add('dealer_customer');
    if (role === 'dealer_user') out.add('dealer_user');
    if (role === 'private_end_user') out.add('private_end_user');
    if (role === 'exhibition_user') out.add('exhibition_user').add('timan_messe');
    if (role === 'timan_messe') out.add('timan_messe').add('exhibition_user');
    if (
      role === 'dealer' ||
      role === 'timan_dealer' ||
      role === 'dealer_user' ||
      role === 'timan_importer' ||
      role === 'timan_service_partner' ||
      role === 'dealer_customer'
    ) out.add('dealer');
  }
  return out.size > 0 ? Array.from(out) : ['all'];
}

export function publicRowToEntry(row: SiteChangePublicRow): ChangeLogEntry {
  const description = localizePublishedContent(row, 'description');
  const hasDescription = Object.values(description).some(Boolean);

  return {
    id: row.id,
    module_key: moduleToKey(row.module),
    module_name: localizePublishedContent(row, 'module_label'),
    changed_at: row.published_at,
    title: localizePublishedContent(row, 'title'),
    description: hasDescription ? description : undefined,
    note: localizePublishedContent(row, 'note'),
    role_visibility: normalizeRoleVisibility(row.affected_roles || ['all']),
    is_major: !!row.is_important,
  };
}

// ---------- In-memory public cache ----------

type CacheState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; rows: SiteChangePublicRow[] }
  | { status: 'fallback' };

let cache: CacheState = { status: 'idle' };
const subs = new Set<() => void>();
let snapshotVersion = 0;
let snapshotToken = 'idle';

function bumpSnapshot() {
  snapshotVersion += 1;
  snapshotToken = `${cache.status}#${snapshotVersion}`;
  subs.forEach(cb => { try { cb(); } catch { /* ignore */ } });
}

export function subscribeChangelog(cb: () => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

export function getChangelogSnapshot(): string {
  return snapshotToken;
}

async function fetchAllPublicRows(): Promise<SiteChangePublicRow[]> {
  const rows: SiteChangePublicRow[] = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('site_change_public_entries')
      .select('*')
      .order('published_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    const batch = (data || []) as SiteChangePublicRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export async function loadChangelogFromSupabase(force = false): Promise<void> {
  if (!force && (cache.status === 'loading' || cache.status === 'ready' || cache.status === 'fallback')) return;
  cache = { status: 'loading' };
  bumpSnapshot();
  try {
    const rows = await fetchAllPublicRows();
    cache = rows.length > 0 ? { status: 'ready', rows } : { status: 'fallback' };
  } catch {
    cache = { status: 'fallback' };
  }
  bumpSnapshot();
}

export async function refreshChangelog(): Promise<void> {
  await loadChangelogFromSupabase(true);
}

export function getEntriesForLanguage(_language: PortalUiLanguage): ChangeLogEntry[] {
  if (cache.status === 'idle') void loadChangelogFromSupabase();
  if (cache.status === 'ready') {
    return cache.rows.map(publicRowToEntry).sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
  }
  return CHANGELOG_ENTRIES;
}

// ---------- Admin CRUD helpers ----------

function applyFilters(query: any, options: ChangelogListOptions) {
  let q = query;
  if (options.status && options.status !== 'all') q = q.eq('status', options.status);
  if (options.recommendation && options.recommendation !== 'all') q = q.eq('publish_recommendation', options.recommendation);
  if (options.module && options.module !== 'all') q = q.eq('module', options.module);
  if (options.role && options.role !== 'all') q = q.contains('affected_roles', [options.role]);
  if (options.changeType && options.changeType !== 'all') q = q.eq('change_type', options.changeType);
  if (options.minUserImpact) q = q.gte('user_impact_score', options.minUserImpact);
  if (options.search?.trim()) {
    const s = `%${options.search.trim()}%`;
    q = q.or(`title_internal.ilike.${s},description_internal.ilike.${s},title_public.ilike.${s},description_public.ilike.${s},source_ref.ilike.${s}`);
  }
  return q;
}

export async function adminListChangelog(options: ChangelogListOptions = {}): Promise<{ rows: SiteChangeEntryRow[]; count: number; error: string | null }> {
  const page = Math.max(0, options.page ?? 0);
  const pageSize = Math.min(Math.max(10, options.pageSize ?? 50), 100);
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('site_change_entries')
    .select('*', { count: 'exact' });
  query = applyFilters(query, options)
    .order('implemented_at', { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;
  if (error) return { rows: [], count: 0, error: error.message };
  return { rows: (data || []) as SiteChangeEntryRow[], count: count || 0, error: null };
}

function toPayload(draft: ChangelogDraft) {
  const now = new Date().toISOString();
  const status = draft.status;
  const localizedContent = localizedContentFromDraft(draft);
  const feature = draft as SiteChangeContentSource;
  const daSuggestion = getPublishedFeatureContent(
    {
      ...draft,
      localized_content: localizedContent,
    },
    'da',
  );
  return {
    source: draft.source || 'manual',
    source_ref: draft.source_ref || null,
    implemented_at: draft.implemented_at,
    title_internal: draft.title_internal,
    description_internal: draft.description_internal || null,
    technical_description: draft.technical_description || null,
    title_public: firstText(!isTechnicalPublicTitle(draft.title_public, feature) ? draft.title_public : '', daSuggestion.title) || null,
    description_public: firstText(!isGitHubImportPlaceholder(draft.description_public) ? draft.description_public : '', daSuggestion.description) || null,
    localized_content: localizedContent,
    module: draft.module,
    change_type: draft.change_type,
    affected_roles: draft.affected_roles?.length ? draft.affected_roles : ['all'],
    user_impact_score: draft.user_impact_score,
    technical_impact_score: draft.technical_impact_score,
    publish_recommendation: draft.publish_recommendation,
    is_important: draft.is_important,
    status,
    published_at: status === 'published' ? (draft.published_at || now) : null,
    archived_at: status === 'archived' ? (draft.archived_at || now) : null,
    reviewed_at: status !== 'new' ? (draft.reviewed_at || now) : null,
    is_group: draft.is_group ?? false,
    group_parent_id: draft.group_parent_id ?? null,
    group_suggestion_status: draft.group_suggestion_status ?? 'none',
    grouped_at: draft.grouped_at ?? null,
  };
}

export async function adminCreateChangelog(draft: ChangelogDraft): Promise<{ row: SiteChangeEntryRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('site_change_entries')
    .insert(toPayload(draft))
    .select('*')
    .maybeSingle();
  if (error) return { row: null, error: error.message };
  await refreshChangelog();
  return { row: data as SiteChangeEntryRow, error: null };
}

export async function adminUpdateChangelog(id: string, draft: ChangelogDraft): Promise<{ error: string | null }> {
  const groupStatusPatch =
    draft.is_group && draft.status === 'published'
      ? { group_suggestion_status: 'approved' as const }
      : {};
  const { error } = await supabase
    .from('site_change_entries')
    .update({ ...toPayload(draft), ...groupStatusPatch })
    .eq('id', id);
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}

export async function adminDeleteChangelog(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('site_change_entries').delete().eq('id', id);
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}

export async function adminUpdateChangelogStatus(id: string, status: SiteChangeStatus): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const patch: Record<string, string | null> = {
    status,
    reviewed_at: status === 'new' ? null : now,
    published_at: status === 'published' ? now : null,
    archived_at: status === 'archived' ? now : null,
  };
  if (status === 'published') {
    (patch as Record<string, string | null>).group_suggestion_status = 'approved';
  }
  const { error } = await supabase.from('site_change_entries').update(patch).eq('id', id);
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}

function groupSourceRef(ids: string[]): string {
  return `group:${ids.slice().sort().join(':').slice(0, 180)}`;
}

function titleForGroupRows(rows: SiteChangeEntryRow[]): string {
  const localized = buildGroupedFeatureSuggestion(rows);
  return firstText(localized.da?.title, localized.en?.title, rows[0]?.title_internal, 'Samlet feature');
}

function descriptionForGroupRows(rows: SiteChangeEntryRow[]): string {
  const localized = buildGroupedFeatureSuggestion(rows);
  return firstText(localized.da?.description, localized.en?.description, 'Flere relaterede ændringer er samlet i én brugerrettet publicering.');
}

export async function adminCreateChangelogGroup(ids: string[]): Promise<{ row: SiteChangeEntryRow | null; error: string | null }> {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  if (uniqueIds.length < 2) return { row: null, error: 'Vælg mindst to ændringer, der skal samles.' };

  const { data: rowsData, error: rowsError } = await supabase
    .from('site_change_entries')
    .select('*')
    .in('id', uniqueIds);
  if (rowsError) return { row: null, error: rowsError.message };

  const rows = ((rowsData || []) as SiteChangeEntryRow[])
    .filter((row) => !row.is_important && !row.is_group && !row.group_parent_id && ['improvement', 'ui_ux', 'bugfix', 'performance'].includes(row.change_type));
  if (rows.length < 2) return { row: null, error: 'Gruppen kan kun oprettes af mindst to små, ikke-vigtige kandidater uden eksisterende gruppe.' };

  const localized = buildGroupedFeatureSuggestion(rows);
  const implementedAt = rows.map((row) => row.implemented_at).sort().at(-1) || new Date().toISOString();
  const module = rows[0].module;
  const changeType = rows.every((row) => row.change_type === rows[0].change_type) ? rows[0].change_type : 'improvement';
  const roles = Array.from(new Set(rows.flatMap((row) => row.affected_roles?.length ? row.affected_roles : ['all'])));
  const sourceRefs = rows.map((row) => row.source_ref).filter(Boolean).join(', ');
  const technical = rows.map((row, index) => [
    `${index + 1}. ${row.title_internal}`,
    row.source_ref ? `Source: ${row.source_ref}` : null,
    row.implemented_at ? `Dato: ${row.implemented_at}` : null,
    row.technical_description || row.description_internal || null,
  ].filter(Boolean).join('\n')).join('\n\n');

  const groupDraft: ChangelogDraft = {
    source: 'group',
    source_ref: groupSourceRef(rows.map((row) => row.id)),
    implemented_at: implementedAt,
    title_internal: `${rows.length} ændringer samlet: ${titleForGroupRows(rows)}`,
    description_internal: `Redaktionel gruppe foreslået ud fra ${rows.length} relaterede source commits.`,
    technical_description: `Denne publicering består af ${rows.length} commits.\n${sourceRefs ? `Commits: ${sourceRefs}\n\n` : ''}${technical}`,
    title_public: titleForGroupRows(rows),
    description_public: descriptionForGroupRows(rows),
    localized_content: localized,
    module,
    change_type: changeType,
    affected_roles: roles.length ? roles : ['all'],
    user_impact_score: Math.max(...rows.map((row) => row.user_impact_score), 3),
    technical_impact_score: Math.max(...rows.map((row) => row.technical_impact_score), 3),
    publish_recommendation: 'maybe',
    is_important: false,
    status: 'new',
    published_at: null,
    archived_at: null,
    reviewed_at: null,
    is_group: true,
    group_parent_id: null,
    group_suggestion_status: 'suggested',
    grouped_at: new Date().toISOString(),
  };

  const { data: groupData, error: groupError } = await supabase
    .from('site_change_entries')
    .insert(toPayload(groupDraft))
    .select('*')
    .maybeSingle();
  if (groupError || !groupData) return { row: null, error: groupError?.message || 'Gruppen kunne ikke oprettes.' };

  const group = groupData as SiteChangeEntryRow;
  const { error: childError } = await supabase
    .from('site_change_entries')
    .update({
      group_parent_id: group.id,
      group_suggestion_status: 'suggested',
      grouped_at: new Date().toISOString(),
    })
    .in('id', rows.map((row) => row.id));
  if (childError) return { row: group, error: childError.message };

  await refreshChangelog();
  return { row: group, error: null };
}

export async function adminRemoveChangeFromGroup(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('site_change_entries')
    .update({ group_parent_id: null, group_suggestion_status: 'none', grouped_at: null })
    .eq('id', id);
  if (error) return { error: error.message };
  await refreshChangelog();
  return { error: null };
}

export async function adminSplitChangelogGroup(groupId: string): Promise<{ error: string | null }> {
  const { error: childError } = await supabase
    .from('site_change_entries')
    .update({ group_parent_id: null, group_suggestion_status: 'split', grouped_at: null })
    .eq('group_parent_id', groupId);
  if (childError) return { error: childError.message };

  const { error: groupError } = await supabase
    .from('site_change_entries')
    .update({ status: 'archived', archived_at: new Date().toISOString(), group_suggestion_status: 'split' })
    .eq('id', groupId);
  if (groupError) return { error: groupError.message };

  await refreshChangelog();
  return { error: null };
}

export async function syncSiteChangesFromGitHub(): Promise<SiteChangeGitHubSyncResult> {
  const { data, error } = await supabase.functions.invoke<SiteChangeGitHubSyncResult>("import-site-changes-from-github", {
    body: { mode: "manual", limit: 25 },
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ...data, ok: false };
  return data || { ok: true, imported: 0, skipped: 0 };
}

export function recommendPublication(userImpact: number, technicalImpact: number): SiteChangeRecommendation {
  if (userImpact >= 8) return 'publish';
  if (userImpact <= 2 && technicalImpact <= 5) return 'internal';
  return 'maybe';
}

export function inferModuleFromFiles(files: string[]): string {
  const haystack = files.join('\n').toLowerCase();
  if (haystack.includes('/crm/') || haystack.includes('crm')) return 'crm';
  if (haystack.includes('partnermap') || haystack.includes('partner-map') || haystack.includes('map')) return 'map';
  if (haystack.includes('dealer')) return 'dealer_data';
  if (haystack.includes('messe')) return 'messe';
  if (haystack.includes('tsb')) return 'tsb';
  if (haystack.includes('warranty')) return 'warranty';
  if (haystack.includes('claim')) return 'claims';
  if (haystack.includes('news') || haystack.includes('marketing')) return 'marketing';
  if (haystack.includes('backend')) return 'backend';
  return 'backend';
}
