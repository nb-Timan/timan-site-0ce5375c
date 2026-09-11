import type { PortalUiLanguage } from '@/lib/portalLanguages';

export type NewsTopicType = 'machine' | 'attachment' | 'misc';
export type NewsTopicFilter = 'all' | NewsTopicType;

export interface NewsTopicMeta {
  type: NewsTopicType;
  target: string;
  attachment?: string;
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
  panelTitle: label('Nyhedsfilter', 'News filter', 'News filter', 'Filtro notizie', 'Hirszuro', 'Nyhetsfilter', 'Filtre actualites', 'Filtr aktualnosci', 'Filtr novinek'),
  panelDescription: label(
    'Vælges til filtrering i Messe og nyhedsoversigten. Gælder for alle sprog.',
    'Used for filtering in Exhibition and the news overview. Applies to all languages.',
    'Wird zum Filtern in Messe und in der News-Übersicht verwendet. Gilt für alle Sprachen.',
    'Usato per filtrare in Fiera e nella panoramica notizie. Vale per tutte le lingue.',
    'A kiállításban és a hírek áttekintésében használt szűrés. Minden nyelvre érvényes.',
    'Används för filtrering i Mässa och nyhetsöversikten. Gäller alla språk.',
    'Utilisé pour filtrer dans Salon et dans la vue des actualités. Valable pour toutes les langues.',
    'Używane do filtrowania w Targach i przeglądzie aktualności. Dotyczy wszystkich języków.',
    'Používá se k filtrování ve Výstavě a přehledu novinek. Platí pro všechny jazyky.',
  ),
  machineLabel: label('Maskine', 'Machine', 'Maschine', 'Macchina', 'Gép', 'Maskin', 'Machine', 'Maszyna', 'Stroj'),
  attachmentLabel: label('Redskab', 'Attachment', 'Anbaugerät', 'Attrezzo', 'Eszköz', 'Redskap', 'Outil', 'Osprzęt', 'Příslušenství'),
  noAttachmentLabel: label('Ingen redskab', 'No attachment', 'Kein Anbaugerät', 'Nessun attrezzo', 'Nincs eszköz', 'Inget redskap', 'Aucun outil', 'Brak osprzętu', 'Žádné příslušenství'),
  machineFilterPlaceholder: label('Vælg maskine', 'Select machine', 'Maschine wählen', 'Scegli macchina', 'Válassz gépet', 'Välj maskin', 'Choisir machine', 'Wybierz maszynę', 'Vyberte stroj'),
  attachmentFilterPlaceholder: label('Vælg redskab', 'Select attachment', 'Anbaugerät wählen', 'Scegli attrezzo', 'Válassz eszközt', 'Välj redskap', 'Choisir outil', 'Wybierz osprzęt', 'Vyberte příslušenství'),
  resetFilterLabel: label('Nulstil', 'Reset', 'Zurücksetzen', 'Reimposta', 'Visszaállítás', 'Nollställ', 'Réinitialiser', 'Resetuj', 'Resetovat'),
  topicColumn: label('Maskine / redskab', 'Machine / attachment', 'Maschine / Anbaugerät', 'Macchina / attrezzo', 'Gép / eszköz', 'Maskin / redskap', 'Machine / outil', 'Maszyna / osprzęt', 'Stroj / příslušenství'),
};

export const NEWS_TOPIC_TYPE_OPTIONS: Array<{ value: NewsTopicType; labels: Record<PortalUiLanguage, string> }> = [
  { value: 'machine', labels: NEWS_TOPIC_UI_TEXT.machineLabel },
  { value: 'attachment', labels: NEWS_TOPIC_UI_TEXT.attachmentLabel },
  { value: 'misc', labels: label('Diverse', 'Miscellaneous', 'Verschiedenes', 'Varie', 'Egyéb', 'Diverse', 'Divers', 'Różne', 'Různé') },
];

export const NEWS_MACHINE_TARGETS: NewsTopicOption[] = [
  { value: 'rc-751', labels: label('RC-751') },
  { value: 'rc-1000s', labels: label('RC-1000s') },
  { value: 'timan-2620', labels: label('Timan 2620') },
  { value: 'timan-3330', labels: label('Timan 3330') },
];

const attachment = (value: string, name: string): NewsTopicOption => ({ value, labels: label(name) });

export const NEWS_ATTACHMENT_TARGETS_BY_MACHINE: Record<string, NewsTopicOption[]> = {
  'rc-751': [],
  'rc-1000s': [
    attachment('sneslynge', 'Sneslynge'),
    attachment('v-plov', 'V-plov'),
    attachment('centerdrevet-hydraulisk-kost', 'Centerdrevet hydraulisk kost'),
    attachment('ukrudtsboerste', 'Ukrudtsbørste'),
    attachment('slagleklipper', 'Slagleklipper'),
    attachment('fingerklipper', 'Fingerklipper'),
    attachment('rotorklipper', 'Rotorklipper'),
    attachment('stubfraeser', 'Stubfræser'),
    attachment('skivehoester', 'Skivehøster'),
  ],
  'timan-2620': [
    attachment('skovl', 'Skovl'),
    attachment('klipper', 'Klipper'),
    attachment('ds-250-saltspreder', 'DS-250 saltspreder'),
    attachment('dozer-blad', 'Dozer blad'),
  ],
  'timan-3330': [
    attachment('centerdrevet-kost', 'Centerdrevet kost'),
    attachment('combispreader-cs-200', 'Combispreader CS-200'),
    attachment('dozerblad', 'Dozerblad'),
    attachment('fingerklipper', 'Fingerklipper'),
    attachment('multitrimmer', 'Multitrimmer'),
    attachment('rotorklipper-1350', 'Rotorklipper 1350'),
    attachment('rotorklipper-gmr', 'Rotorklipper GMR'),
    attachment('skovl', 'Skovl'),
    attachment('sneslynge', 'Sneslynge'),
    attachment('tornado-t2', 'Tornado T2'),
    attachment('tornado-t3', 'Tornado T3'),
    attachment('ukrudtsboerste', 'Ukrudtsbørste'),
    attachment('v-plov', 'V-plov'),
  ],
};

export const NEWS_ATTACHMENT_TARGETS: NewsTopicOption[] = Object.values(NEWS_ATTACHMENT_TARGETS_BY_MACHINE)
  .flat()
  .filter((option, index, all) => all.findIndex((item) => item.value === option.value) === index);

export const NEWS_MISC_TARGETS: NewsTopicOption[] = [
  { value: 'diverse', labels: label('Diverse', 'Miscellaneous', 'Verschiedenes', 'Varie', 'Egyéb', 'Diverse', 'Divers', 'Różne', 'Různé') },
];

export const NEWS_MACHINE_FILTER_TARGETS: NewsTopicOption[] = [
  ...NEWS_MACHINE_TARGETS,
  ...NEWS_MISC_TARGETS,
];

export const NEWS_TOPIC_FILTERS: Array<{ value: NewsTopicFilter; labels: Record<PortalUiLanguage, string> }> = [
  { value: 'all', labels: label('Alle', 'All', 'Alle', 'Tutti', 'Osszes', 'Alla', 'Tous', 'Wszystkie', 'Vse') },
  ...NEWS_TOPIC_TYPE_OPTIONS,
];

export function getNewsTopicTypeLabel(type: NewsTopicFilter, lang: PortalUiLanguage): string {
  return NEWS_TOPIC_FILTERS.find((option) => option.value === type)?.labels[lang] || type;
}

export function getAllNewsTargetsLabel(typeFilter: NewsTopicFilter, lang: PortalUiLanguage): string {
  if (typeFilter === 'machine') return getAllNewsMachinesLabel(lang);
  if (typeFilter === 'attachment') return getAllNewsAttachmentsLabel(lang);
  if (typeFilter === 'misc') {
    return label('Alle diverse', 'All miscellaneous', 'Alle Verschiedenes', 'Tutte le varie', 'Összes egyéb', 'Alla diverse', 'Tous divers', 'Wszystkie różne', 'Vše různé')[lang];
  }
  return label('Alle emner', 'All topics', 'Alle Themen', 'Tutti gli argomenti', 'Összes téma', 'Alla ämnen', 'Tous les sujets', 'Wszystkie tematy', 'Všechna témata')[lang];
}

export function getAllNewsMachinesLabel(lang: PortalUiLanguage): string {
  return label('Alle maskiner', 'All machines', 'Alle Maschinen', 'Tutte le macchine', 'Összes gép', 'Alla maskiner', 'Toutes les machines', 'Wszystkie maszyny', 'Všechny stroje')[lang];
}

export function getAllNewsAttachmentsLabel(lang: PortalUiLanguage): string {
  return label('Alle redskaber', 'All attachments', 'Alle Anbaugeräte', 'Tutti gli attrezzi', 'Összes eszköz', 'Alla redskap', 'Tous les outils', 'Wszystkie osprzęty', 'Všechna příslušenství')[lang];
}

export function getCombinedTargetOptions(): NewsTopicOption[] {
  return [...NEWS_MACHINE_FILTER_TARGETS, ...NEWS_ATTACHMENT_TARGETS];
}

export function getTargetOptions(type: NewsTopicType): NewsTopicOption[] {
  if (type === 'attachment') return NEWS_ATTACHMENT_TARGETS;
  if (type === 'misc') return NEWS_MISC_TARGETS;
  return NEWS_MACHINE_TARGETS;
}

export function getAttachmentOptionsForMachine(machineTarget: string | null | undefined): NewsTopicOption[] {
  return NEWS_ATTACHMENT_TARGETS_BY_MACHINE[machineTarget || ''] || [];
}

export function getCombinedAttachmentOptions(): NewsTopicOption[] {
  return NEWS_ATTACHMENT_TARGETS;
}

export function getNewsMachineLabel(meta: NewsTopicMeta, lang: PortalUiLanguage): string {
  return NEWS_MACHINE_FILTER_TARGETS.find((option) => option.value === meta.target)?.labels[lang] || meta.target;
}

export function getNewsAttachmentLabel(meta: NewsTopicMeta, lang: PortalUiLanguage): string {
  if (!meta.attachment) return '';
  return getAttachmentOptionsForMachine(meta.target).find((option) => option.value === meta.attachment)?.labels[lang] || meta.attachment;
}

export function getNewsTopicLabel(meta: NewsTopicMeta, lang: PortalUiLanguage): string {
  const machine = getNewsMachineLabel(meta, lang);
  const attachmentLabel = getNewsAttachmentLabel(meta, lang);
  return attachmentLabel ? `${machine} - ${attachmentLabel}` : machine;
}

export function normalizeNewsTopicData(value: unknown): NewsTopicMeta {
  const raw = value && typeof value === 'object' ? (value as Partial<NewsTopicMeta>) : {};
  if (raw.type === 'misc' || raw.target === 'diverse') {
    return { type: 'misc', target: 'diverse' };
  }

  let target = typeof raw.target === 'string' && NEWS_MACHINE_TARGETS.some((option) => option.value === raw.target)
    ? raw.target
    : NEWS_MACHINE_TARGETS[0]?.value || 'rc-751';
  let requestedAttachment = typeof raw.attachment === 'string' ? raw.attachment : undefined;

  if (raw.type === 'attachment' && typeof raw.target === 'string') {
    requestedAttachment = raw.target;
    if (['skivehoester', 'sneslynge', 'v-plov', 'ukrudtsboerste'].includes(raw.target)) {
      target = 'rc-1000s';
    }
  }

  const attachmentOptions = getAttachmentOptionsForMachine(target);
  const selectedAttachment = requestedAttachment && attachmentOptions.some((option) => option.value === requestedAttachment)
    ? requestedAttachment
    : undefined;

  return { type: 'machine', target, attachment: selectedAttachment };
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
  if (textIncludes(text, ['skivehoster', 'skivehoester', 'skivehost', 'disc harvester', 'scheiben'])) {
    return { type: 'machine', target: 'rc-1000s', attachment: 'skivehoester' };
  }
  if (textIncludes(text, ['rc-751', 'rc 751'])) return { type: 'machine', target: 'rc-751' };
  if (textIncludes(text, ['rc-1000', 'rc 1000', 'rc-1000s', 'rc 1000s'])) return { type: 'machine', target: 'rc-1000s' };
  if (textIncludes(text, ['2620'])) return { type: 'machine', target: 'timan-2620' };
  if (textIncludes(text, ['3330'])) return { type: 'machine', target: 'timan-3330' };
  return { type: 'machine', target: 'rc-751' };
}

export function getNewsTopicForDisplay(post: { title?: string | null; excerpt?: string | null; template_data?: Record<string, unknown> | null }): NewsTopicMeta {
  return getNewsTopicFromTemplateData(post.template_data) || inferNewsTopicFromText(post.title || '', post.excerpt || '');
}

export function matchesNewsTopicFilter(
  post: { title?: string | null; excerpt?: string | null; template_data?: Record<string, unknown> | null },
  machineFilter: string,
  attachmentFilter = 'all',
): boolean {
  const meta = getNewsTopicForDisplay(post);
  const noMachineFilter = !machineFilter || machineFilter === 'all';
  const machineMatches = noMachineFilter
    ? true
    : machineFilter === 'diverse'
      ? meta.type === 'misc' || meta.target === 'diverse'
      : meta.target === machineFilter;
  const attachmentMatches = !attachmentFilter || attachmentFilter === 'all' || meta.attachment === attachmentFilter;
  return machineMatches && attachmentMatches;
}
