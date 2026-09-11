import { describe, expect, it } from 'vitest';
import {
  getProductBrochureUrl,
  resolveBrochureAsset,
} from '@/data/productRecommendationMeta';

describe('product brochure language resolver', () => {
  it('selects German only for the DE portal and English for every other portal language', () => {
    expect(getProductBrochureUrl('RC-1000S', 'DE')).toBe('/brochures/rc-1000s-de.pdf');
    expect(getProductBrochureUrl('411000', 'DK')).toBe('/brochures/rc-1000s-en.pdf');
    expect(getProductBrochureUrl('RC-1000S', 'FR')).toBe('/brochures/rc-1000s-en.pdf');
    expect(getProductBrochureUrl('RC-751', 'SE')).toBe('/brochures/rc-751-en.pdf');
    expect(getProductBrochureUrl('Timan 3330', 'CZ')).toBe('/brochures/timan-3330-en.pdf');
  });

  it('falls back to English when a product has no German variant', () => {
    expect(resolveBrochureAsset({ en: '/brochures/example-en.pdf' }, 'DE')).toBe('/brochures/example-en.pdf');
  });
});
