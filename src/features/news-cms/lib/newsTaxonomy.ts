import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type NewsTopicType = 'machine' | 'attachment' | 'misc';
export type NewsTopicFilter = 'all' | NewsTopicType;

export interface NewsTopicMeta {
  type: NewsTopicType;
  target: string;
}

export interface NewsTopicOption {
  value: string;
  labels: Record<PortalUiLanguage, string>;
}

const label = (da: string, en = da, de = en, it = en, hu = en, sv = en, fr = en, pl = en, cs = en): Record<PortalUiLanguage, string> => ({
  da,
  en,
  de,
  it,
  hu,
  sv,
  fr,
  pl,
  cs,
});

export const NEWS_TOPIC_UI_TEXT = {
  panelTitle: label('Nyhedsfilter', 'News filter', 'News-Filter', 'Filtro notizie', 'Hirszuero', 'Nyhetsfilter', 'Filtre actualites', 'Filtr aktualnosci', 'Filtr novinek'),
  panelDescription: label(
    'Vælges til filtrering i Messe og nyhedsoversigten. Gælder for alle sprog.',
    'Used for filtering in Exhibition and the news overview. Applies to all languages.',
    'Wird zum Filtern in Messe und in der News-Uebersicht verwendet. Gilt fuer alle Sprachen.',
    'Usato per filtrare in Fiera e nella panoramica notizie. Vale per tutte le lingue.',
    'A kiallitasban es a hirek attekinteseben hasznalt szures. Minden nyelvre ervenyes.',
    'Anvands for filtrering i Messa och nyhetsoverikten. Galler alla sprak.',
    'Utilise pour filtrer dans Salon et dans la vue des actualites. Valable pour toutes les langues.',
    'Uzywane do filtrowania w Targach i przegladzie aktualnosci. Dotyczy wszystkich jezykow.',
    'Pouziva se k filtrovani ve Vystave a prehledu novinek. Plati pro vsechny jazyky.',
  ),
  typeLabel: label('Type', 'Type', 'Typ', 'Tipo', 'Tipus', 'Typ', 'Type', 'Typ', 'Typ'),
  machineLabel: label('Maskine', 'Machine', 'Maschine', 'Macchina', 'Gep', 'Maskin', 'Machine', 'Maszyna', 'Stroj'),
  attachmentLabel: label('Redskab', 'Attachment', 'Anbaugeraet', 'Attrezzo', 'Eszkoz', 'Redskap', 'Outil', 'Osprzet', 'Prislusenstvi'),
  categoryLabel: label('Kategori', 'Category', 'Kategorie', 'Categoria', 'Kategoria', 'Kategori', 'Categorie', 'Kategoria', 'Kategorie'),
  topicColumn: label('Emne', 'Topic', 'Thema', 'Tema', 'Tema', 'Amne', 'Sujet', 'Temat', 'Tema'),
};

export const NEWS_TOPIC_TYPE_OPTIONS: Array<{ value: NewsTopicType; labels: Record<PortalUiLanguage, string> }> = [
  { value: 'machine', labels: label('Maskine', 'Machine', 'Maschine', 'Macchina', 'Gep', 'Maskin', 'Machine', 'Maszyna', 'Stroj') },
  { value: 'attachment', labels: label('Redskab', 'Attachment', 'Anbaugeraet', 'Attrezzo', 'Eszkoz', 'Redskap', 'Outil', 'Osprzet', 'Prislusenstvi') },
  { value: 'misc', labels: label('Diverse', 'Miscellaneous', 'Verschiedenes', 'Varie', 'Egyeb', 'Diverse', 'Divers', 'Rozne', 'Ruzne') },
];

export const NEWS_MACHINE_TARGETS: NewsTopicOption[] = [
  { value: 'rc-751', labels: label('Timan RC-751') },
  { value: 'rc-1000s', labels: label('Timan RC-1000s') },
  { value: 'timan-2620', labels: label('Timan 2620') },
  { value: 'timan-3330', labels: label('Timan 3330') },
  { value: 'machine-other', labels: label('Diverse maskine', 'Other machine', 'Andere Maschine', 'Altra macchina', 'Egyeb gep', 'Ovrig maskin', 'Autre machine', 'Inna maszyna', 'Jiny stroj') },
];

export const NEWS_ATTACHMENT_TARGETS: NewsTopicOption[] = [
  { value: 'skivehoester', labels: label('Skivehoester', 'Disc harvester', 'Scheibenmaeher', 'Falciatrice a dischi', 'Tarcsas kasza', 'Skiveskordare', 'Faucheuse a disques', 'Kosiarka dyskowa', 'Diskovy zaci stroj') },
  { value: 'attachment-other', labels: label('Diverse redskab', 'Other attachment', 'Anderes Anbaugeraet', 'Altro attrezzo', 'Egyeb eszkoz', 'Ovrigt redskap', 'Autre outil', 'Inny osprzet', 'Jine prislusenstvi') },
];

export const NEWS_MISC_TARGETS: NewsTopicOption[] = [
  { value: 'diverse', labels: label('Diverse', 'Miscellaneous', 'Verschiedenes', 'Varie', 'Egyeb', 'Diverse', 'Divers', 'Rozne', 'Ruzne') },
];

export const NEWS_TOPIC_FILTERS: Array<{ value: NewsTopicFilter; labels: Record<PortalUiLanguage, string> }> = [
  { value: 'all', labels: label('Alle', 'All', 'Alle', 'Tutti', 'Osszes', 'Alla', 'Tous', 'Wszystkie', 'Vse') },
  ...NEWS_TOPIC_TYPE_OPTIONS,
];

export function getNewsTopicTypeLabel(type: NewsTopicFilter, lang: PortalUiLanguage): string {
  return NEWS_TOPIC_FILTERS.find((option) => option.value === type)?.labels[lang] || type;
}

export function getAllNewsTargetsLabel(typeFilter: NewsTopicFilter, lang: PortalUiLanguage): string {
  if (typeFilter === 'machine') {
    return label('Alle maskiner', 'All machines', 'Alle Maschinen', 'Tutte le macchine', 'Osszes gep', 'Alla maskiner', 'Toutes les machines', 'Wszystkie maszyny', 'Vsechny stroje')[lang];
  }
  if (typeFilter === 'attachment') {
    return label('Alle redskaber', 'All attachments', 'Alle Anbaugeraete', 'Tutti gli attrezzi', 'Osszes eszkoz', 'Alla redskap', 'Tous les outils', 'Wszystkie osprzety', 'Vsechna prislusenstvi')[lang];
  }
  if (typeFilter === 'misc') {
    return label('Alle diverse', 'All miscellaneous', 'Alle Verschiedenes', 'Tutte le varie', 'Osszes egyeb', 'Alla diverse', 'Tous divers', 'Wszystkie rozne', 'Vse ruzne')[lang];
  }
  return label('Alle emner', 'All topics', 'Alle Themen', 'Tutti gli argomenti', 'Osszes tema', 'Alla amnen', 'Tous les sujets', 'Wszystkie tematy', 'Vsechna temata')[lang];
}

export function getCombinedTargetOptions(): NewsTopicOption[] {
  return [...NEWS_MACHINE_TARGETS, ...NEWS_ATTACHMENT_TARGETS, ...NEWS_MISC_TARGETS];
}

export function getTargetOptions(type: NewsTopicType): NewsTopicOption[] {
  if (type === 'attachment') return NEWS_ATTACHMENT_TARGETS;
  if (type === 'misc') return NEWS_MISC_TARGETS;
  return NEWS_MACHINE_TARGETS;
}

export function getNewsTopicLabel(meta: NewsTopicMeta, lang: PortalUiLanguage): string {
  const typeLabel = getNewsTopicTypeLabel(meta.type, lang);
  const target = getTargetOptions(meta.type).find((option) => option.value === meta.target);
  return target ? `${typeLabel}: ${target.labels[lang]}` : typeLabel;
}

export function normalizeNewsTopicData(value: unknown): NewsTopicMeta {
  const raw = value && typeof value === 'object' ? (value as Partial<NewsTopicMeta>) : {};
  const type = NEWS_TOPIC_TYPE_OPTIONS.some((option) => option.value === raw.type) ? raw.type as NewsTopicType : 'machine';
  const options = getTargetOptions(type);
  const target = typeof raw.target === 'string' && options.some((option) => option.value === raw.target)
    ? raw.target
    : options[0]?.value || 'machine-other';
  return { type, target };
}

export function getNewsTopicFromTemplateData(templateData: Record<string, unknown> | null | undefined): NewsTopicMeta | null {
  if (!templateData || typeof templateData !== 'object') return null;
  return normalizeNewsTopicData(templateData.news_topic);
}

function textIncludes(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

export function inferNewsTopicFromText(title = '', excerpt = ''): NewsTopicMeta {
  const text = `${title} ${excerpt}`.toLowerCase();
  if (textIncludes(text, ['skivehoster', 'skivehøster', 'disc harvester', 'scheiben'])) {
    return { type: 'attachment', target: 'skivehoester' };
  }
  if (textIncludes(text, ['rc-751', 'rc 751'])) return { type: 'machine', target: 'rc-751' };
  if (textIncludes(text, ['rc-1000', 'rc 1000', 'rc-1000s', 'rc 1000s'])) return { type: 'machine', target: 'rc-1000s' };
  if (textIncludes(text, ['2620'])) return { type: 'machine', target: 'timan-2620' };
  if (textIncludes(text, ['3330'])) return { type: 'machine', target: 'timan-3330' };
  return { type: 'misc', target: 'diverse' };
}

export function getNewsTopicForDisplay(post: { title?: string | null; excerpt?: string | null; template_data?: Record<string, unknown> | null }): NewsTopicMeta {
  return getNewsTopicFromTemplateData(post.template_data) || inferNewsTopicFromText(post.title || '', post.excerpt || '');
}

export function matchesNewsTopicFilter(
  post: { title?: string | null; excerpt?: string | null; template_data?: Record<string, unknown> | null },
  typeFilter: NewsTopicFilter,
  targetFilter = 'all',
): boolean {
  const meta = getNewsTopicForDisplay(post);
  const typeMatches = typeFilter === 'all' || meta.type === typeFilter;
  const targetMatches = targetFilter === 'all' || meta.target === targetFilter;
  return typeMatches && targetMatches;
}
