import { describe, expect, it } from 'vitest';
import {
  SUPPORT_CHUNK_OVERLAP_WORDS,
  SUPPORT_CHUNK_TARGET_WORDS,
  chunkKnowledgePages,
  knowledgeStoragePath,
  normalizeExtractedText,
  sanitizeKnowledgeFilename,
  sha256Hex,
  validateKnowledgeFile,
} from '../../supabase/functions/_shared/supportKnowledgeIngestion';

describe('support knowledge source validation', () => {
  it('validates PDF magic bytes instead of trusting the browser MIME', () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(validateKnowledgeFile('Manual.PDF', 'application/pdf', pdf)).toMatchObject({ kind: 'pdf', mimeType: 'application/pdf' });
    expect(() => validateKnowledgeFile('Manual.pdf', 'application/pdf', new TextEncoder().encode('not a PDF'))).toThrow('INVALID_FILE');
  });

  it('accepts safe UTF-8 text and rejects unsupported files', () => {
    expect(validateKnowledgeFile('service note.txt', 'text/plain', new TextEncoder().encode('Timan service'))).toEqual({
      kind: 'text', mimeType: 'text/plain', sanitizedFilename: 'service-note.txt',
    });
    expect(() => validateKnowledgeFile('manual.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', new Uint8Array([1]))).toThrow('UNSUPPORTED_FORMAT');
  });

  it('builds the required immutable storage path', () => {
    expect(knowledgeStoragePath({ knowledgeItemId: 'item', sourceId: 'source', revision: 3, filename: '../My file.pdf' }))
      .toBe('knowledge/item/sources/source/v3/..-My-file.pdf');
    expect(sanitizeKnowledgeFilename('  service / note.txt ')).toBe('service-note.txt');
  });
});

describe('support knowledge extraction preparation', () => {
  it('normalizes text and hashes deterministically', async () => {
    expect(normalizeExtractedText(' A\r\n\r\n\r\nB\u00a0 C ')).toBe('A\n\nB C');
    expect(await sha256Hex('same')).toBe(await sha256Hex(new TextEncoder().encode('same')));
    expect(await sha256Hex('same')).toHaveLength(64);
  });

  it('chunks deterministically with configured overlap and page traceability', () => {
    const pages = [1, 2, 3].map((page) => ({ page, text: `SECTION ${page}\n${Array.from({ length: 500 }, (_, index) => `p${page}w${index}`).join(' ')}` }));
    const first = chunkKnowledgePages(pages);
    const second = chunkKnowledgePages(pages);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first[0].content.split(' ').length).toBe(SUPPORT_CHUNK_TARGET_WORDS);
    expect(first[0].pageStart).toBe(1);
    expect(first.at(-1)?.pageEnd).toBe(3);
    const firstWords = first[0].content.split(' ');
    const secondWords = first[1].content.split(' ');
    expect(secondWords.slice(0, SUPPORT_CHUNK_OVERLAP_WORDS)).toEqual(firstWords.slice(-SUPPORT_CHUNK_OVERLAP_WORDS));
  });
});
