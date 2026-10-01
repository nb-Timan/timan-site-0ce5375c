export const SUPPORT_KNOWLEDGE_BUCKET = 'support-knowledge';
export const SUPPORT_MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const SUPPORT_PROCESSOR_VERSION = 'knowledge-quality-v1';
export const SUPPORT_CHUNK_TARGET_WORDS = 650;
export const SUPPORT_CHUNK_OVERLAP_WORDS = 80;

export type SupportedSourceKind = 'pdf' | 'text';

export interface ValidatedSourceFile {
  kind: SupportedSourceKind;
  mimeType: 'application/pdf' | 'text/plain';
  sanitizedFilename: string;
}

export interface ExtractedPage {
  page: number;
  text: string;
}

export interface KnowledgeChunkDraft {
  chunkIndex: number;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  heading: string | null;
  sectionPath: string[];
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function sanitizeKnowledgeFilename(filename: string): string {
  const trimmed = filename.trim().normalize('NFKC');
  const extensionMatch = trimmed.match(/\.[a-z0-9]+$/i);
  const extension = extensionMatch?.[0]?.toLowerCase() || '';
  const stem = trimmed.slice(0, extension ? -extension.length : undefined)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'source';
  return `${stem}${extension}`;
}

export function validateKnowledgeFile(
  filename: string,
  browserMime: string,
  bytes: Uint8Array,
): ValidatedSourceFile {
  if (bytes.byteLength === 0) throw new Error('EMPTY_CONTENT');
  if (bytes.byteLength > SUPPORT_MAX_SOURCE_BYTES) throw new Error('INVALID_FILE');

  const sanitizedFilename = sanitizeKnowledgeFilename(filename);
  const extension = sanitizedFilename.split('.').pop()?.toLowerCase();
  const isPdf = startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  const hasNullByte = bytes.subarray(0, Math.min(bytes.length, 4096)).includes(0);

  if (extension === 'pdf') {
    if (!isPdf || (browserMime && browserMime !== 'application/pdf')) throw new Error('INVALID_FILE');
    return { kind: 'pdf', mimeType: 'application/pdf', sanitizedFilename };
  }

  if (extension === 'txt') {
    if (isPdf || hasNullByte || (browserMime && !browserMime.startsWith('text/plain'))) throw new Error('INVALID_FILE');
    return { kind: 'text', mimeType: 'text/plain', sanitizedFilename };
  }

  throw new Error('UNSUPPORTED_FORMAT');
}

export async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeExtractedText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function likelyHeading(line: string): boolean {
  const value = line.trim();
  if (!value || value.length > 100 || /[.!?]$/.test(value)) return false;
  const words = value.split(/\s+/);
  return words.length <= 12 && (value === value.toUpperCase() || /^\d+(?:\.\d+)*\s+/.test(value) || words.length <= 6);
}

export function detectKnowledgeSections(pages: ExtractedPage[]): Array<{ heading: string; page: number }> {
  const found: Array<{ heading: string; page: number }> = [];
  for (const page of pages) {
    for (const line of page.text.split('\n')) {
      if (likelyHeading(line)) found.push({ heading: line.trim(), page: page.page });
      if (found.length >= 250) return found;
    }
  }
  return found;
}

interface WordRef {
  word: string;
  page: number;
  heading: string | null;
}

export function chunkKnowledgePages(
  pages: ExtractedPage[],
  targetWords = SUPPORT_CHUNK_TARGET_WORDS,
  overlapWords = SUPPORT_CHUNK_OVERLAP_WORDS,
): KnowledgeChunkDraft[] {
  if (targetWords < 100 || overlapWords < 0 || overlapWords >= targetWords) {
    throw new Error('INVALID_CHUNK_CONFIG');
  }
  const words: WordRef[] = [];
  let heading: string | null = null;
  for (const page of pages) {
    for (const line of normalizeExtractedText(page.text).split('\n')) {
      if (likelyHeading(line)) heading = line.trim();
      for (const word of line.split(/\s+/).filter(Boolean)) words.push({ word, page: page.page, heading });
    }
  }

  const chunks: KnowledgeChunkDraft[] = [];
  const step = targetWords - overlapWords;
  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + targetWords);
    if (!slice.length) break;
    const firstHeading = slice.find((entry) => entry.heading)?.heading || null;
    chunks.push({
      chunkIndex: chunks.length,
      content: slice.map((entry) => entry.word).join(' '),
      pageStart: slice[0]?.page ?? null,
      pageEnd: slice[slice.length - 1]?.page ?? null,
      heading: firstHeading,
      sectionPath: firstHeading ? [firstHeading] : [],
    });
    if (start + targetWords >= words.length) break;
  }
  return chunks;
}

export function knowledgeStoragePath(input: {
  knowledgeItemId: string;
  sourceId: string;
  revision: number;
  filename: string;
}): string {
  return `knowledge/${input.knowledgeItemId}/sources/${input.sourceId}/v${input.revision}/${sanitizeKnowledgeFilename(input.filename)}`;
}
