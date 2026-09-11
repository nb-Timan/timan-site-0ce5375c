import {
  getProductBrochureAsset,
  type BrochureLanguage,
} from '@/data/productRecommendationMeta';

export type MesseBrochureReaderAsset = {
  pdfUrl: string;
  language: BrochureLanguage;
  pageBase: string;
  pageCount: number;
};

type ReaderPageSet = {
  pageBase: string;
  pageCount: number;
};

const READER_PAGE_SETS: Record<string, Partial<Record<BrochureLanguage, ReaderPageSet>>> = {
  'RC-751': {
    da: { pageBase: '/brochures/reader/rc-751/da', pageCount: 7 },
    de: { pageBase: '/brochures/reader/rc-751/de', pageCount: 7 },
    en: { pageBase: '/brochures/reader/rc-751/en', pageCount: 7 },
    fr: { pageBase: '/brochures/reader/rc-751/fr', pageCount: 7 },
    cs: { pageBase: '/brochures/reader/rc-751/cs', pageCount: 7 },
    sv: { pageBase: '/brochures/reader/rc-751/sv', pageCount: 7 },
  },
  'RC-1000S': {
    da: { pageBase: '/brochures/reader/rc-1000s/da', pageCount: 7 },
    de: { pageBase: '/brochures/reader/rc-1000s/de', pageCount: 7 },
    en: { pageBase: '/brochures/reader/rc-1000s/en', pageCount: 7 },
    sv: { pageBase: '/brochures/reader/rc-1000s/sv', pageCount: 7 },
  },
  'Timan 3330': {
    da: { pageBase: '/brochures/reader/timan-3330/da', pageCount: 9 },
    de: { pageBase: '/brochures/reader/timan-3330/de', pageCount: 9 },
    en: { pageBase: '/brochures/reader/timan-3330/en', pageCount: 9 },
    fr: { pageBase: '/brochures/reader/timan-3330/fr', pageCount: 7 },
    cs: { pageBase: '/brochures/reader/timan-3330/cs', pageCount: 9 },
    sv: { pageBase: '/brochures/reader/timan-3330/sv', pageCount: 9 },
  },
};

/**
 * Keeps the PDF language resolver and the image reader on the same document
 * variant. The PDF remains available as a secondary action inside the reader.
 */
export function getMesseBrochureReaderAsset(
  productId: string,
  portalLanguage?: string | null,
): MesseBrochureReaderAsset | undefined {
  const brochure = getProductBrochureAsset(productId, portalLanguage);
  if (!brochure) return undefined;

  const pageSet = READER_PAGE_SETS[productId]?.[brochure.language];
  if (!pageSet) return undefined;

  return { pdfUrl: brochure.url, language: brochure.language, ...pageSet };
}

/** A cover followed by deterministic PDF-page spreads. */
export function buildMesseBrochureSpreads(pageCount: number): number[][] {
  if (!Number.isInteger(pageCount) || pageCount <= 0) return [];

  const spreads: number[][] = [[1]];
  for (let page = 2; page <= pageCount; page += 2) {
    spreads.push(page + 1 <= pageCount ? [page, page + 1] : [page]);
  }
  return spreads;
}
