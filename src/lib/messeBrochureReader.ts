import {
  getProductBrochureAsset,
  type BrochureLanguage,
} from '@/data/productRecommendationMeta';

export type MesseBrochureReaderAsset = {
  pdfUrl: string;
  language: BrochureLanguage;
  pageBase: string;
  /** How the reader turns rasterized PDF pages into portal pages. */
  renderMode: MesseBrochureRenderMode;
  /** Raw PDF/raster page count. Interior pages are landscape double-page spreads. */
  rawPageCount: number;
  /** Number of virtual brochure pages shown by the portal reader. */
  pageCount: number;
};

type ReaderPageSet = {
  pageBase: string;
  rawPageCount: number;
  renderMode?: MesseBrochureRenderMode;
};

export type MesseBrochureRenderMode = 'virtualSplit' | 'physicalPdfPage';

export type MesseBrochureVirtualPage = {
  number: number;
  sourcePage: number;
  half: 'full' | 'left' | 'right';
};

const READER_PAGE_SETS: Record<string, Partial<Record<BrochureLanguage, ReaderPageSet>>> = {
  'RC-751': {
    da: { pageBase: '/brochures/reader/rc-751/da', rawPageCount: 7 },
    de: { pageBase: '/brochures/reader/rc-751/de', rawPageCount: 7 },
    en: { pageBase: '/brochures/reader/rc-751/en', rawPageCount: 7 },
    fr: { pageBase: '/brochures/reader/rc-751/fr', rawPageCount: 7 },
    cs: { pageBase: '/brochures/reader/rc-751/cs', rawPageCount: 7 },
    sv: { pageBase: '/brochures/reader/rc-751/sv', rawPageCount: 7 },
  },
  'RC-1000S': {
    da: { pageBase: '/brochures/reader/rc-1000s/da', rawPageCount: 7 },
    de: { pageBase: '/brochures/reader/rc-1000s/de', rawPageCount: 7 },
    en: { pageBase: '/brochures/reader/rc-1000s/en', rawPageCount: 7 },
    sv: { pageBase: '/brochures/reader/rc-1000s/sv', rawPageCount: 7 },
  },
  'Timan 3330': {
    da: { pageBase: '/brochures/reader/timan-3330/da', rawPageCount: 9, renderMode: 'physicalPdfPage' },
    de: { pageBase: '/brochures/reader/timan-3330/de', rawPageCount: 9, renderMode: 'physicalPdfPage' },
    en: { pageBase: '/brochures/reader/timan-3330/en', rawPageCount: 9, renderMode: 'physicalPdfPage' },
    fr: { pageBase: '/brochures/reader/timan-3330/fr', rawPageCount: 7, renderMode: 'physicalPdfPage' },
    cs: { pageBase: '/brochures/reader/timan-3330/cs', rawPageCount: 9, renderMode: 'physicalPdfPage' },
    sv: { pageBase: '/brochures/reader/timan-3330/sv', rawPageCount: 9, renderMode: 'physicalPdfPage' },
  },
};

const READER_PRODUCT_IDS: Record<string, string> = {
  'rc-751': 'RC-751',
  'rc-1000s': 'RC-1000S',
  'timan-3330': 'Timan 3330',
};

/**
 * Keeps the PDF language resolver and the image reader on the same document
 * variant. The PDF remains available as a secondary action inside the reader.
 */
export function getMesseBrochureReaderAsset(
  productId: string,
  portalLanguage?: string | null,
): MesseBrochureReaderAsset | undefined {
  const canonicalProductId = READER_PRODUCT_IDS[productId.trim().toLowerCase()] ?? productId;
  const brochure = getProductBrochureAsset(canonicalProductId, portalLanguage);
  if (!brochure) return undefined;

  const pageSet = READER_PAGE_SETS[canonicalProductId]?.[brochure.language];
  if (!pageSet) return undefined;

  return {
    pdfUrl: brochure.url,
    language: brochure.language,
    ...pageSet,
    renderMode: pageSet.renderMode ?? 'virtualSplit',
    pageCount: buildMesseBrochureVirtualPages(
      pageSet.rawPageCount,
      pageSet.renderMode ?? 'virtualSplit',
    ).length,
  };
}

/**
 * Converts a brochure PDF structure into the pages that readers expect.
 * Page one and the final page are single covers; every raw page in between is
 * a two-page landscape spread split down the actual centre line.
 */
export function buildMesseBrochureVirtualPages(
  rawPageCount: number,
  renderMode: MesseBrochureRenderMode = 'virtualSplit',
): MesseBrochureVirtualPage[] {
  if (!Number.isInteger(rawPageCount) || rawPageCount <= 0) return [];
  if (renderMode === 'physicalPdfPage') {
    return Array.from({ length: rawPageCount }, (_, index) => ({
      number: index + 1,
      sourcePage: index + 1,
      half: 'full' as const,
    }));
  }
  if (rawPageCount === 1) return [{ number: 1, sourcePage: 1, half: 'full' }];

  const pages: MesseBrochureVirtualPage[] = [{ number: 1, sourcePage: 1, half: 'full' }];
  for (let sourcePage = 2; sourcePage < rawPageCount; sourcePage += 1) {
    pages.push({ number: pages.length + 1, sourcePage, half: 'left' });
    pages.push({ number: pages.length + 1, sourcePage, half: 'right' });
  }
  pages.push({ number: pages.length + 1, sourcePage: rawPageCount, half: 'full' });
  return pages;
}

/** A cover followed by deterministic virtual brochure-page spreads. */
export function buildMesseBrochureSpreads(
  pageCount: number,
  renderMode: MesseBrochureRenderMode = 'virtualSplit',
): number[][] {
  if (!Number.isInteger(pageCount) || pageCount <= 0) return [];
  if (renderMode === 'physicalPdfPage') {
    return Array.from({ length: pageCount }, (_, index) => [index + 1]);
  }

  const spreads: number[][] = [[1]];
  for (let page = 2; page <= pageCount; page += 2) {
    spreads.push(page + 1 <= pageCount ? [page, page + 1] : [page]);
  }
  return spreads;
}
