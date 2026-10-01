export const SUPPORT_KNOWLEDGE_QUALITY_VERSION = 'knowledge-quality-v1';

export type KnowledgeQualityStatus =
  | 'READY_FOR_REVIEW'
  | 'REJECTED_EXTRACTION_NOISE'
  | 'DUPLICATE'
  | 'NEAR_DUPLICATE'
  | 'EMPTY_CONTENT'
  | 'LANGUAGE_MISMATCH';

export interface KnowledgeQualityAssessment {
  status: KnowledgeQualityStatus;
  score: number;
  reasons: string[];
  markupResidueCount: number;
  meaningfulCharacterCount: number;
}

export interface SimilarityDocument {
  id: string;
  text: string;
  title?: string | null;
  headings?: string[] | null;
  language?: string | null;
  canonicalUrl?: string | null;
  topicKey?: string | null;
  productRelations?: string[] | null;
  similarityCacheKey?: string | null;
}

export interface SimilarityResult {
  score: number;
  methods: string[];
  matchingHeadings: string[];
  sharedRelations: string[];
}

export interface KnowledgeFact {
  subject: string;
  attribute: string;
  value: string;
  normalizedValue: number;
  unit: string;
  context: string;
}

export interface KnowledgeConflictCandidate {
  left: KnowledgeFact;
  right: KnowledgeFact;
  contextual: boolean;
}

export interface DiverseCandidate {
  knowledge_source_id: string;
  knowledge_item_id: string;
  source_language: string;
  content: string;
  heading?: string | null;
  normalized_content_hash?: string | null;
  topic_key?: string | null;
  authority_tier?: number | null;
  semantic_similarity: number;
  fused_score: number;
}

const SHORTCODE = /\[(?:\/?(?:vc|mk|et_pb|fusion|av|rev_slider|contact-form-7|gallery|caption|embed)[a-z0-9_-]*)(?:\s+[^\]]*)?\]/gi;
const ENCODED_SHORTCODE = /(?:&#91;|&lbrack;)(?:\/?(?:vc|mk|et_pb|fusion|av|rev_slider|contact-form-7|gallery|caption|embed)[\s\S]*?)(?:&#93;|&rbrack;)/gi;
const MARKUP_RESIDUE = /\[(?:\/?(?:vc|mk|et_pb|fusion|av)[a-z0-9_-]*)\b|<\/?[a-z][^>]*>|(?:wp:|vc_|et_pb_)/gi;
const GLOBAL_BOILERPLATE = [
  /^(?:accept|allow|afvis|reject).*(?:cookies?|cookies? settings?)$/i,
  /^(?:cookie|privacy) (?:policy|settings)$/i,
  /^(?:skip to content|gå til indhold|zum inhalt springen)$/i,
  /^(?:menu|navigation|main menu|hovedmenu)$/i,
  /^(?:copyright|©)\s*\d{4}/i,
  /^(?:follow us|følg os|newsletter|nyhedsbrev)$/i,
];
const VALID_LANGUAGES = new Set(['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']);
const FACT_PATTERN = /(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m|kg|g|kw|hp|bar|psi|nm|l|ml|v|a|hz|%|months?|måneder?|monate|hours?|timer|stunden|heures)\b/gi;
const ATTRIBUTE_ALIASES: Array<[RegExp, string]> = [
  [/\b(cutting width|klippebredde|arbejdsbredde|working width)\b/i, 'working_width'],
  [/\b(width|bredde|breite|largeur|larghezza)\b/i, 'width'],
  [/\b(height|højde|hojde|höhe|hauteur|altezza)\b/i, 'height'],
  [/\b(length|længde|laengde|länge|longueur|lunghezza)\b/i, 'length'],
  [/\b(weight|vægt|vaegt|gewicht|poids|peso)\b/i, 'weight'],
  [/\b(warranty|garanti|garantie|garanzia)\b/i, 'warranty'],
  [/\b(discount|rabat|rabatt|remise|sconto)\b/i, 'discount'],
  [/\b(price|pris|preis|prix|prezzo)\b/i, 'price'],
];

function normalizedTokens(value: string): Set<string> {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return new Set((normalized.match(/[a-z0-9]{3,}/g) || []).filter((token) => !['https', 'timan', 'www'].includes(token)));
}

const similarityTokenCache = new Map<string, Set<string>>();

function cachedDocumentTokens(document: SimilarityDocument, field: 'text' | 'title'): Set<string> {
  const value = field === 'text' ? document.text : document.title || '';
  const identity = document.similarityCacheKey || `${document.id}:${value}`;
  const key = `${identity}:${field}`;
  const cached = similarityTokenCache.get(key);
  if (cached) return cached;
  const tokens = normalizedTokens(value);
  similarityTokenCache.set(key, tokens);
  if (similarityTokenCache.size > 3_000) {
    const oldest = similarityTokenCache.keys().next().value;
    if (oldest) similarityTokenCache.delete(oldest);
  }
  return tokens;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export function cleanWordpressText(value: string): string {
  let cleaned = value.normalize('NFKC')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(ENCODED_SHORTCODE, ' ');
  for (let pass = 0; pass < 5; pass += 1) {
    const next = cleaned.replace(SHORTCODE, '\n');
    if (next === cleaned) break;
    cleaned = next;
  }
  const lines = cleaned
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !GLOBAL_BOILERPLATE.some((pattern) => pattern.test(line)));
  const deduplicated: string[] = [];
  for (const line of lines) {
    if (deduplicated[deduplicated.length - 1]?.toLocaleLowerCase() === line.toLocaleLowerCase()) continue;
    deduplicated.push(line);
  }
  return deduplicated.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function canonicalTopicKey(url: string | null | undefined, category = '', productRelations: string[] = []): string {
  let path = '';
  try {
    const parsed = new URL(url || 'https://timan.dk/');
    path = parsed.pathname.toLowerCase()
      .replace(/^\/(?:da|dk|en|gb|de|it|hu|se|sv|fr|pl|cz|cs)(?=\/|$)/, '')
      .replace(/\/(?:index\.html?)?$/, '')
      .replace(/[^a-z0-9/-]+/g, '-')
      .replace(/-+/g, '-');
  } catch {
    path = '';
  }
  const relations = [...new Set(productRelations.map((value) => value.toLowerCase().trim()).filter(Boolean))].sort();
  return `${path || '/'}|${category.toLowerCase().trim()}|${relations.join(',')}`;
}

export function assessKnowledgeQuality(input: {
  text: string;
  language: string;
  canonicalUrl?: string | null;
  duplicate?: boolean;
  nearDuplicate?: boolean;
}): KnowledgeQualityAssessment {
  const text = input.text.trim();
  const markupResidueCount = (text.match(MARKUP_RESIDUE) || []).length;
  const meaningfulCharacterCount = text.replace(/[^\p{L}\p{N}]/gu, '').length;
  const reasons: string[] = [];
  let status: KnowledgeQualityStatus = 'READY_FOR_REVIEW';
  if (!text || meaningfulCharacterCount < 40) {
    status = 'EMPTY_CONTENT'; reasons.push('MEANINGFUL_TEXT_TOO_SHORT');
  } else if (!VALID_LANGUAGES.has(input.language.toLowerCase())) {
    status = 'LANGUAGE_MISMATCH'; reasons.push('INVALID_OR_UNSUPPORTED_LANGUAGE');
  } else if (input.canonicalUrl && !/^https:\/\/(?:www\.)?timan\.dk\//i.test(input.canonicalUrl)) {
    status = 'REJECTED_EXTRACTION_NOISE'; reasons.push('INVALID_CANONICAL_URL');
  } else if (markupResidueCount > Math.max(2, Math.floor(text.length / 1000))) {
    status = 'REJECTED_EXTRACTION_NOISE'; reasons.push('EXCESSIVE_MARKUP_RESIDUE');
  } else if (input.duplicate) {
    status = 'DUPLICATE'; reasons.push('EXACT_CONTENT_DUPLICATE');
  } else if (input.nearDuplicate) {
    status = 'NEAR_DUPLICATE'; reasons.push('SEMANTIC_REVIEW_REQUIRED');
  }
  const lengthScore = Math.min(45, meaningfulCharacterCount / 20);
  const cleanlinessScore = Math.max(0, 35 - markupResidueCount * 8);
  const metadataScore = VALID_LANGUAGES.has(input.language.toLowerCase()) && (!input.canonicalUrl || /^https:\/\//.test(input.canonicalUrl)) ? 20 : 0;
  return { status, score: Math.round(Math.max(0, Math.min(100, lengthScore + cleanlinessScore + metadataScore))), reasons, markupResidueCount, meaningfulCharacterCount };
}

export function compareKnowledgeDocuments(left: SimilarityDocument, right: SimilarityDocument): SimilarityResult {
  const textScore = jaccard(cachedDocumentTokens(left, 'text'), cachedDocumentTokens(right, 'text'));
  const titleScore = jaccard(cachedDocumentTokens(left, 'title'), cachedDocumentTokens(right, 'title'));
  const leftHeadings = new Set((left.headings || []).map((value) => value.toLowerCase().trim()));
  const rightHeadings = new Set((right.headings || []).map((value) => value.toLowerCase().trim()));
  const matchingHeadings = [...leftHeadings].filter((value) => rightHeadings.has(value));
  const sharedRelations = [...new Set(left.productRelations || [])].filter((value) => (right.productRelations || []).includes(value));
  const sameTopic = !!left.topicKey && left.topicKey === right.topicKey;
  const sameLanguage = !left.language || !right.language || left.language === right.language;
  const score = Math.min(1, textScore * 0.72 + titleScore * 0.12 + Math.min(0.08, matchingHeadings.length * 0.02)
    + (sharedRelations.length ? 0.05 : 0) + (sameTopic ? 0.03 : 0));
  const methods = ['NORMALIZED_TEXT'];
  if (matchingHeadings.length) methods.push('HEADINGS');
  if (sharedRelations.length) methods.push('PRODUCT_RELATION');
  if (sameTopic) methods.push('TOPIC_IDENTITY');
  if (!sameLanguage) methods.push('CROSS_LANGUAGE_VARIANT');
  return { score: Math.round(score * 10_000) / 10_000, methods, matchingHeadings, sharedRelations };
}

function factAttribute(context: string): string {
  for (const [pattern, attribute] of ATTRIBUTE_ALIASES) if (pattern.test(context)) return attribute;
  return 'numeric_fact';
}

function factSubject(context: string): string {
  return context.match(/\b(?:rc[- ]?751|rc[- ]?1000s?|timan\s*3330|timan\s*2620)\b/i)?.[0]?.toUpperCase().replace(/\s+/g, '-') || 'UNSPECIFIED';
}

export function extractKnowledgeFacts(text: string): KnowledgeFact[] {
  const result: KnowledgeFact[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    for (const match of sentence.matchAll(FACT_PATTERN)) {
      const normalizedValue = Number(match[1].replace(',', '.'));
      if (!Number.isFinite(normalizedValue)) continue;
      result.push({
        subject: factSubject(sentence),
        attribute: factAttribute(sentence),
        value: `${match[1]} ${match[2]}`,
        normalizedValue,
        unit: match[2].toLowerCase(),
        context: sentence.trim().slice(0, 500),
      });
    }
  }
  return result;
}

export function detectKnowledgeFactConflicts(leftText: string, rightText: string): KnowledgeConflictCandidate[] {
  const conflicts: KnowledgeConflictCandidate[] = [];
  for (const left of extractKnowledgeFacts(leftText)) {
    for (const right of extractKnowledgeFacts(rightText)) {
      if (left.subject !== right.subject || left.attribute !== right.attribute || left.unit !== right.unit) continue;
      if (Math.abs(left.normalizedValue - right.normalizedValue) <= Math.max(0.01, Math.abs(left.normalizedValue) * 0.005)) continue;
      const contextual = left.attribute === 'numeric_fact'
        || jaccard(normalizedTokens(left.context), normalizedTokens(right.context)) < 0.45;
      conflicts.push({ left, right, contextual });
    }
  }
  return conflicts;
}

export function selectDiverseKnowledgeCandidates<T extends DiverseCandidate>(candidates: T[], limit: number, preferredLanguage: string): T[] {
  const ranked = [...candidates].sort((left, right) => {
    const leftLanguage = left.source_language === preferredLanguage ? 1 : 0;
    const rightLanguage = right.source_language === preferredLanguage ? 1 : 0;
    const leftAuthority = 5 - Number(left.authority_tier || 4);
    const rightAuthority = 5 - Number(right.authority_tier || 4);
    return rightLanguage - leftLanguage || rightAuthority - leftAuthority || right.fused_score - left.fused_score
      || right.semantic_similarity - left.semantic_similarity;
  });
  const selected: T[] = [];
  const seenEvidence = new Set<string>();
  const perTopic = new Map<string, number>();
  for (const candidate of ranked) {
    const evidenceKey = candidate.normalized_content_hash || [...normalizedTokens(candidate.content)].sort().slice(0, 80).join('|');
    if (seenEvidence.has(evidenceKey)) continue;
    const topic = candidate.topic_key || candidate.knowledge_item_id;
    if ((perTopic.get(topic) || 0) >= 2) continue;
    selected.push(candidate);
    seenEvidence.add(evidenceKey);
    perTopic.set(topic, (perTopic.get(topic) || 0) + 1);
    if (selected.length >= limit) break;
  }
  return selected;
}
