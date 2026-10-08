// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  downloadCanonicalPdfDocument,
  materializeCanonicalPdfDocument,
  resolveCanonicalPdfDocument,
} from '@/lib/canonicalPdfDocument';

function validPdfBytes(label = 'canonical'): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n${label}\n${'x'.repeat(1500)}\n%%EOF`);
}

describe('canonical Configurator PDF document', () => {
  it('materializes once and gives download, blob and n8n base64 identical bytes', async () => {
    const expected = validPdfBytes();
    const output = vi.fn(() => expected.buffer.slice(0));
    const documentFile = materializeCanonicalPdfDocument({ output }, 'Timan_Tilbud_T-4011_2026-10-07.pdf');

    expect(output).toHaveBeenCalledTimes(1);
    expect(output).toHaveBeenCalledWith('arraybuffer');
    expect([...documentFile.bytes]).toEqual([...expected]);
    const blobBytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
      reader.readAsArrayBuffer(documentFile.blob);
    });
    expect([...blobBytes]).toEqual([...expected]);
    expect([...Uint8Array.from(atob(documentFile.base64), char => char.charCodeAt(0))]).toEqual([...expected]);
  });

  it('downloads the exact already-materialized blob and canonical filename', () => {
    const documentFile = materializeCanonicalPdfDocument(
      { output: () => validPdfBytes().buffer.slice(0) },
      'Timan_Ordre_O-7030_2026-10-07.pdf',
    );
    const createObjectURL = vi.fn(() => 'blob:canonical');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadCanonicalPdfDocument(documentFile);

    expect(createObjectURL).toHaveBeenCalledWith(documentFile.blob);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('reuses one document for an unchanged retry and rebuilds a changed snapshot', () => {
    const create = vi.fn(() => materializeCanonicalPdfDocument(
      { output: () => validPdfBytes().buffer.slice(0) },
      'Timan_Tilbud_T-4011_2026-10-07.pdf',
    ));
    const first = resolveCanonicalPdfDocument(null, 'quote:T-4011:revision-1', create);
    const retry = resolveCanonicalPdfDocument(first, 'quote:T-4011:revision-1', create);
    const changed = resolveCanonicalPdfDocument(retry, 'quote:T-4011:revision-2', create);

    expect(retry.documentFile).toBe(first.documentFile);
    expect(changed.documentFile).not.toBe(first.documentFile);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('rejects the former synthetic placeholder before download or transport', () => {
    const placeholder = validPdfBytes('Timan internal QA only');
    expect(() => materializeCanonicalPdfDocument(
      { output: () => placeholder.buffer.slice(0) },
      'Timan_Tilbud_T-QA.pdf',
    )).toThrow('PDF_PLACEHOLDER_REJECTED');
  });
});
