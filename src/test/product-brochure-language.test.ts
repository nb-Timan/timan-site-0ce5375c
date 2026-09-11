import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getProductBrochureAsset,
  getProductBrochurePreviewUrl,
  getProductBrochureUrl,
  resolveBrochureAsset,
} from '@/data/productRecommendationMeta';

describe('product brochure language resolver', () => {
  it('selects every available local brochure language and English only as fallback', () => {
    expect(getProductBrochureUrl('RC-1000S', 'DK')).toBe('/brochures/rc-1000s-da.pdf');
    expect(getProductBrochureUrl('RC-1000S', 'DE')).toBe('/brochures/rc-1000s-de.pdf');
    expect(getProductBrochureUrl('RC-1000S', 'SE')).toBe('/brochures/rc-1000s-sv.pdf');
    expect(getProductBrochureUrl('RC-1000S', 'FR')).toBe('/brochures/rc-1000s-en.pdf');
    expect(getProductBrochureUrl('RC-751', 'DK')).toBe('/brochures/rc-751-da.pdf');
    expect(getProductBrochureUrl('RC-751', 'FR')).toBe('/brochures/rc-751-fr.pdf');
    expect(getProductBrochureUrl('RC-751', 'CZ')).toBe('/brochures/rc-751-cs.pdf');
    expect(getProductBrochureUrl('RC-751', 'SE')).toBe('/brochures/rc-751-sv.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'DK')).toBe('/brochures/timan-3330-da.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'FR')).toBe('/brochures/timan-3330-fr.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'CZ')).toBe('/brochures/timan-3330-cs.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'SE')).toBe('/brochures/timan-3330-sv.pdf');
    expect(getProductBrochureUrl('411000', 'GB')).toBe('/brochures/rc-1000s-en.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'PL')).toBe('/brochures/timan-3330-en.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'IT')).toBe('/brochures/timan-3330-en.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'HU')).toBe('/brochures/timan-3330-en.pdf');
    expect(getProductBrochureUrl('CS-200', 'DK')).toBe('/brochures/cs-200-tractor-da.pdf');
    expect(getProductBrochureUrl('CS-200', 'DE')).toBe('/brochures/cs-200-tractor-en.pdf');
  });

  it('falls back to English when a local brochure variant is missing', () => {
    expect(resolveBrochureAsset({ en: '/brochures/example-en.pdf' }, 'FR')).toBe('/brochures/example-en.pdf');
    expect(resolveBrochureAsset({ en: '/brochures/example-en.pdf' }, 'SE')).toBe('/brochures/example-en.pdf');
    expect(getProductBrochureUrl('RC-1000S', 'CZ')).toBe('/brochures/rc-1000s-en.pdf');
  });

  it('keeps the preview synchronized with the resolved brochure language', () => {
    expect(getProductBrochureAsset('RC-751', 'CZ')).toEqual({
      url: '/brochures/rc-751-cs.pdf',
      language: 'cs',
    });
    expect(getProductBrochurePreviewUrl('RC-751', 'CZ')).toBe('/brochures/previews/rc-751/cs.jpg');
    expect(getProductBrochurePreviewUrl('RC-1000S', 'FR')).toBe('/brochures/previews/rc-1000s/en.jpg');
  });

  it('ships every PDF and first-page preview referenced by the Messe brochure matrix', () => {
    const productLanguages = {
      'RC-1000S': ['DK', 'DE', 'FR', 'CZ', 'SE', 'GB'],
      'RC-751': ['DK', 'DE', 'FR', 'CZ', 'SE', 'GB'],
      'Timan 3330': ['DK', 'DE', 'FR', 'CZ', 'SE', 'GB'],
    } as const;

    for (const [product, languages] of Object.entries(productLanguages)) {
      for (const language of languages) {
        const pdf = getProductBrochureUrl(product, language);
        const preview = getProductBrochurePreviewUrl(product, language);
        expect(pdf).toBeTruthy();
        expect(preview).toBeTruthy();
        expect(existsSync(resolve(process.cwd(), 'public', pdf!.replace(/^\//, '')))).toBe(true);
        expect(existsSync(resolve(process.cwd(), 'public', preview!.replace(/^\//, '')))).toBe(true);
      }
    }
  });
});
