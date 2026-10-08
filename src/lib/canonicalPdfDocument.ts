export const CANONICAL_PDF_MIME_TYPE = 'application/pdf';

const FORBIDDEN_PLACEHOLDER_MARKERS = [
  'Timan internal QA only',
  'QA placeholder',
];

export interface CanonicalPdfDocument {
  filename: string;
  mimeType: typeof CANONICAL_PDF_MIME_TYPE;
  bytes: Uint8Array;
  blob: Blob;
  base64: string;
}

export interface CanonicalPdfCacheEntry {
  cacheKey: string;
  documentFile: CanonicalPdfDocument;
}

interface PdfArrayBufferSource {
  output(type: 'arraybuffer'): ArrayBuffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function assertCanonicalPdfBytes(bytes: Uint8Array): void {
  const signature = new TextDecoder('latin1').decode(bytes.subarray(0, 8));
  if (!signature.startsWith('%PDF-')) throw new Error('PDF_GENERATION_FAILED');

  const searchable = new TextDecoder('latin1').decode(bytes);
  if (FORBIDDEN_PLACEHOLDER_MARKERS.some(marker => searchable.includes(marker))) {
    throw new Error('PDF_PLACEHOLDER_REJECTED');
  }
}

/** Materialize jsPDF exactly once. Every destination must use this result. */
export function materializeCanonicalPdfDocument(
  pdf: PdfArrayBufferSource,
  filename: string,
): CanonicalPdfDocument {
  const buffer = pdf.output('arraybuffer');
  const bytes = new Uint8Array(buffer.slice(0));
  assertCanonicalPdfBytes(bytes);
  const blob = new Blob([bytes], { type: CANONICAL_PDF_MIME_TYPE });
  return {
    filename,
    mimeType: CANONICAL_PDF_MIME_TYPE,
    bytes,
    blob,
    base64: bytesToBase64(bytes),
  };
}

export function resolveCanonicalPdfDocument(
  cached: CanonicalPdfCacheEntry | null,
  cacheKey: string,
  create: () => CanonicalPdfDocument,
): CanonicalPdfCacheEntry {
  if (cached?.cacheKey === cacheKey) return cached;
  return { cacheKey, documentFile: create() };
}

/** Download the already-materialized document without asking jsPDF to render again. */
export function downloadCanonicalPdfDocument(documentFile: CanonicalPdfDocument): void {
  const url = URL.createObjectURL(documentFile.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = documentFile.filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
