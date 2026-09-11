import { describe, expect, it } from 'vitest';
import {
  getProductBrochureUrl,
  resolveBrochureAsset,
} from '@/data/productRecommendationMeta';

describe('product brochure language resolver', () => {
  it('selects DE and FR brochures, and English for every other current portal language', () => {
    expect(getProductBrochureUrl('RC-1000S', 'DK')).toBe('/brochures/rc-1000s-en.pdf');
    expect(getProductBrochureUrl('RC-1000S', 'DE')).toBe('/brochures/rc-1000s-de.pdf');
    expect(getProductBrochureUrl('RC-751', 'FR')).toBe('/brochures/rc-751-fr.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'FR')).toBe('/brochures/timan-3330-fr.pdf');
    expect(getProductBrochureUrl('RC-751', 'CZ')).toBe('/brochures/rc-751-en.pdf');
    expect(getProductBrochureUrl('RC-751', 'TR')).toBe('/brochures/rc-751-en.pdf');
    expect(getProductBrochureUrl('411000', 'GB')).toBe('/brochures/rc-1000s-en.pdf');
    expect(getProductBrochureUrl('RC-751', 'SE')).toBe('/brochures/rc-751-en.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'PL')).toBe('/brochures/timan-3330-en.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'IT')).toBe('/brochures/timan-3330-en.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'HU')).toBe('/brochures/timan-3330-en.pdf');
  });

  it('falls back to English when a local brochure variant is missing', () => {
    expect(resolveBrochureAsset({ en: '/brochures/example-en.pdf' }, 'FR')).toBe('/brochures/example-en.pdf');
    expect(resolveBrochureAsset({ en: '/brochures/example-en.pdf' }, 'TR')).toBe('/brochures/example-en.pdf');
    expect(getProductBrochureUrl('RC-1000S', 'CZ')).toBe('/brochures/rc-1000s-en.pdf');
  });

  it('selects a Turkish brochure when the product has a TR variant', () => {
    expect(resolveBrochureAsset({ tr: '/brochures/example-tr.pdf', en: '/brochures/example-en.pdf' }, 'TR'))
      .toBe('/brochures/example-tr.pdf');
  });
});
