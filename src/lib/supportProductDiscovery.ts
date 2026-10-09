import {
  PRODUCT_RECOMMENDATION_META,
  type MachinePlatform,
  type ProductRecommendationMeta,
  type WorkTask,
} from '@/data/productRecommendationMeta';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { storedProductText, type ProductTextSource } from '@/lib/productLanguages';

export interface PublishedProductOption {
  item_number?: unknown;
  item_text_da?: unknown;
  item_text_en?: unknown;
  item_text_de?: unknown;
  item_text_it?: unknown;
  item_text_hu?: unknown;
  item_text_sv?: unknown;
  item_text_fr?: unknown;
  item_text_pl?: unknown;
  item_text_cs?: unknown;
}

export interface SupportProductFact {
  product_id: string;
  item_number: string;
  name: string;
  kind: 'machine' | 'attachment';
  compatible_machines: string[];
  work_tasks: string[];
  short_pitch: string;
}

export interface SupportProductCompatibility {
  machine_id: string;
  machine_item_number: string;
  attachment_id: string;
  attachment_item_number: string;
  compatible: boolean;
}

export interface SupportProductDiscoveryContext {
  domain: 'PRODUCT_DISCOVERY';
  catalog_source: 'canonical_configurator_metadata';
  purchase_intent: boolean;
  task_codes: string[];
  machines: SupportProductFact[];
  attachments: SupportProductFact[];
  requested_compatibility: SupportProductCompatibility | null;
}

const PRODUCT_DISCOVERY_PATTERN = /\b(maskine(?:n|r|rne)?|redskab(?:et|er|erne)?|vinterredskab(?:et|er|erne)?|tilbehør|vinter|vinterbekæmpelse|sne|snerydning|sneslynge(?:n|r)?|plov(?:en|e)?|kost(?:en|e)?|spreder(?:en|e)?|glatføre|machine|machines|attachment|attachments|implement|implements|winter|snow|plow|blower|sweeper|spreader|maschine|maschinen|gerät|geräte|winterdienst|schnee|pflug|kehrmaschine|streuer|macchina|macchine|attrezzo|inverno|neve|gép|gépek|eszköz|tél|hó|maskin|redskap|vinterunderhåll|snö|maskine|outil|hiver|neige|maszyna|osprzęt|zima|śnieg|stroj|nářadí|zima|sníh)\b/i;
const TECHNICAL_SUPPORT_PATTERN = /\b(fejlkode|servicekode|hydrauliktryk|ledningsdiagram|wiring|error code|fault code|hydraulic pressure|service procedure|schaltplan|fehlercode|hydraulikdruck)\b/i;
const PURCHASE_INTENT_PATTERN = /\b(sælg|sælge|køb|købe|bestil|bestille|purchase|buy|sell me|order|kaufen|bestellen|vendere|acquistare|vásárol|köpa|acheter|acheter|kupić|objednat|koupit)\b/i;

const TASK_PATTERNS: Array<[WorkTask[], RegExp]> = [
  [['snow_blowing'], /\b(sneslynge(?:n|r)?|snow\s*(blower|thrower)|schneefräse|turbina da neve|hómaró|snöslunga|fraise à neige|odśnieżarka|sněhová fréza)\b/i],
  [['snow_plowing'], /\b(v[- ]?plov|sneplov|snerydning|snow\s*plow|snow clearing|schneepflug|räumung|lama da neve|hóeke|snöplog|chasse-neige|pług|sněhový pluh)\b/i],
  [['de_icing'], /\b(glatføre|saltning|saltspreder|spreader|de[- ]?icing|streuer|spargisale|sószóró|saltspridare|épandeur|posypywarka|sypač)\b/i],
  [['sweeping'], /\b(kost|fejning|sweeper|broom|kehrmaschine|spazzatrice|seprő|sopmaskin|balayeuse|zamiatarka|zametač)\b/i],
  [['snow_plowing', 'snow_blowing', 'de_icing', 'sweeping'], /\b(vinter(?:redskab(?:et|er|erne)?)?|vinterbekæmpelse|winter|winterdienst|inverno|tél|vinterunderhåll|hiver|zima)\b/i],
];

const MACHINE_ALIASES: Array<[MachinePlatform, RegExp]> = [
  ['RC-1000S', /\brc[- ]?1000s?\b/i],
  ['RC-751', /\brc[- ]?751\b/i],
  ['Timan 3330', /\b(?:timan\s*)?3330\b/i],
  ['Timan 2620', /\b(?:timan\s*)?2620\b/i],
  ['Loader Line', /\b(loader line|minilæsser|loader)\b/i],
];
const GENERIC_PRODUCT_WORDS = new Set(['redskab', 'redskaber', 'maskine', 'maskiner', 'tilbehor', 'accessory', 'attachment']);

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function localizedMetaText(meta: ProductRecommendationMeta, language: PortalUiLanguage): string {
  const pitch = meta.shortPitch as Record<string, string | undefined>;
  return pitch[language] || pitch.en || pitch.da;
}

function publishedName(option: PublishedProductOption | undefined, meta: ProductRecommendationMeta, language: PortalUiLanguage): string {
  if (!option) return meta.name;
  const localized = storedProductText(option as ProductTextSource, language);
  const danish = typeof option.item_text_da === 'string' ? option.item_text_da.trim() : '';
  return localized || danish || meta.name;
}

function mentionedMachine(message: string): MachinePlatform | null {
  return MACHINE_ALIASES
    .map(([machine, pattern]) => ({ machine, index: message.search(pattern) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index)[0]?.machine || null;
}

function mentionedAttachment(message: string): ProductRecommendationMeta | null {
  const normalizedMessage = normalize(message);
  const itemNumber = Object.values(PRODUCT_RECOMMENDATION_META)
    .filter((meta) => !meta.category.startsWith('machine_'))
    .find((meta) => new RegExp(`\\b${meta.varenr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(message));
  if (itemNumber) return itemNumber;

  const aliases: Array<[RegExp, string]> = [
    [/\b(sneslynge(?:n|r)?|snow\s*(blower|thrower)|schneefräse)\b/i, '418000'],
    [/\b(v[- ]?plov|sneplov|snow\s*plow|schneepflug)\b/i, '411742'],
    [/\b(centerdrevet.*kost|hydraulisk.*kost|hydraulic.*sweeper)\b/i, '411845'],
  ];
  const alias = aliases.find(([pattern]) => pattern.test(message));
  if (alias) return PRODUCT_RECOMMENDATION_META[alias[1]] || null;

  return Object.values(PRODUCT_RECOMMENDATION_META)
    .filter((meta) => !meta.category.startsWith('machine_'))
    .sort((a, b) => b.name.length - a.name.length)
    .find((meta) => {
      const words = normalize(meta.name).split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 5 && !GENERIC_PRODUCT_WORDS.has(word));
      return words.length > 0 && words.slice(0, 2).every((word) => normalizedMessage.includes(word));
    }) || null;
}

function tasksFromMessage(message: string): Set<WorkTask> {
  const tasks = new Set<WorkTask>();
  for (const [matches, pattern] of TASK_PATTERNS) {
    if (pattern.test(message)) matches.forEach((task) => tasks.add(task));
  }
  return tasks;
}

function toFact(
  meta: ProductRecommendationMeta,
  option: PublishedProductOption | undefined,
  language: PortalUiLanguage,
): SupportProductFact {
  return {
    product_id: meta.productId,
    item_number: meta.varenr,
    name: publishedName(option, meta, language),
    kind: meta.category.startsWith('machine_') ? 'machine' : 'attachment',
    compatible_machines: [...meta.compatibleMachines],
    work_tasks: [...meta.workTasks],
    short_pitch: localizedMetaText(meta, language),
  };
}

export function isProductDiscoveryQuestion(content: string): boolean {
  return PRODUCT_DISCOVERY_PATTERN.test(content) && !TECHNICAL_SUPPORT_PATTERN.test(content);
}

export function buildSupportProductDiscoveryContext(
  content: string,
  language: PortalUiLanguage,
  options: PublishedProductOption[],
): SupportProductDiscoveryContext | null {
  if (!isProductDiscoveryQuestion(content)) return null;
  const published = new Map(options.flatMap((option) => {
    const itemNumber = typeof option.item_number === 'string' ? option.item_number.trim() : '';
    return itemNumber ? [[itemNumber, option] as const] : [];
  }));
  const tasks = tasksFromMessage(content);
  const explicitMachine = mentionedMachine(content);
  const explicitAttachment = mentionedAttachment(content);

  const machineMetas = Object.values(PRODUCT_RECOMMENDATION_META)
    .filter((meta) => meta.category.startsWith('machine_'))
    .filter((meta) => explicitMachine ? meta.platform === explicitMachine : meta.recommendationPriority <= 2)
    .filter((meta) => explicitMachine || tasks.size === 0 || meta.workTasks.some((task) => tasks.has(task)))
    .slice(0, 4);
  const selectedPlatforms = new Set(
    explicitMachine ? [explicitMachine] : machineMetas.flatMap((meta) => meta.platform ? [meta.platform] : []),
  );

  const attachmentMetas = Object.values(PRODUCT_RECOMMENDATION_META)
    .filter((meta) => !meta.category.startsWith('machine_'))
    .filter((meta) => explicitAttachment ? meta.productId === explicitAttachment.productId : true)
    .filter((meta) => tasks.size === 0 || meta.workTasks.some((task) => tasks.has(task)))
    .filter((meta) => selectedPlatforms.size === 0 || meta.compatibleMachines.some((machine) => selectedPlatforms.has(machine)))
    .sort((a, b) => a.recommendationPriority - b.recommendationPriority || a.name.localeCompare(b.name))
    .slice(0, 12);

  const explicitMachineMeta = explicitMachine
    ? Object.values(PRODUCT_RECOMMENDATION_META).find((meta) => meta.platform === explicitMachine && meta.category.startsWith('machine_')) || null
    : null;
  const requestedCompatibility = explicitMachineMeta && explicitAttachment
    ? {
        machine_id: explicitMachineMeta.productId,
        machine_item_number: explicitMachineMeta.varenr,
        attachment_id: explicitAttachment.productId,
        attachment_item_number: explicitAttachment.varenr,
        compatible: explicitAttachment.compatibleMachines.includes(explicitMachine),
      }
    : null;

  if (!machineMetas.length && !attachmentMetas.length && !requestedCompatibility) return null;
  return {
    domain: 'PRODUCT_DISCOVERY',
    catalog_source: 'canonical_configurator_metadata',
    purchase_intent: PURCHASE_INTENT_PATTERN.test(content),
    task_codes: [...tasks],
    machines: machineMetas.map((meta) => toFact(meta, published.get(meta.varenr), language)),
    attachments: attachmentMetas.map((meta) => toFact(meta, published.get(meta.varenr), language)),
    requested_compatibility: requestedCompatibility,
  };
}
