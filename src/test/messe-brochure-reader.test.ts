import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMesseBrochureSpreads,
  getMesseBrochureReaderAsset,
} from '@/lib/messeBrochureReader';

const componentSource = readFileSync(
  path.resolve(process.cwd(), 'src/pages/messe/MesseMachineBrochurePage.tsx'),
  'utf8',
);

const readerCases = {
  'RC-751': { DK: 'da', DE: 'de', FR: 'fr', CZ: 'cs', SE: 'sv', GB: 'en', IT: 'en', HU: 'en', PL: 'en' },
  'RC-1000S': { DK: 'da', DE: 'de', FR: 'en', CZ: 'en', SE: 'sv', GB: 'en', IT: 'en', HU: 'en', PL: 'en' },
  'Timan 3330': { DK: 'da', DE: 'de', FR: 'fr', CZ: 'cs', SE: 'sv', GB: 'en', IT: 'en', HU: 'en', PL: 'en' },
} as const;

describe('Messe brochure reader', () => {
  it('shows the cover alone, then pairs real PDF pages without blank placeholders', () => {
    expect(buildMesseBrochureSpreads(1)).toEqual([[1]]);
    expect(buildMesseBrochureSpreads(7)).toEqual([[1], [2, 3], [4, 5], [6, 7]]);
    expect(buildMesseBrochureSpreads(9)).toEqual([[1], [2, 3], [4, 5], [6, 7], [8, 9]]);
    expect(buildMesseBrochureSpreads(8)).toEqual([[1], [2, 3], [4, 5], [6, 7], [8]]);
  });

  it('ships reader pages for every localized and English-fallback brochure variant', () => {
    for (const [product, languages] of Object.entries(readerCases)) {
      for (const [portalLanguage, expectedLanguage] of Object.entries(languages)) {
        const reader = getMesseBrochureReaderAsset(product, portalLanguage);
        expect(reader?.language).toBe(expectedLanguage);
        expect(reader).toBeDefined();
        expect(existsSync(path.resolve(process.cwd(), 'public', reader!.pageBase.replace(/^\//, ''), 'page-1.jpg'))).toBe(true);
        expect(existsSync(path.resolve(process.cwd(), 'public', reader!.pageBase.replace(/^\//, ''), `page-${reader!.pageCount}.jpg`))).toBe(true);
      }
    }
  });

  it('accepts the stable Messe route ids as well as canonical product ids', () => {
    expect(getMesseBrochureReaderAsset('rc-751', 'DK')?.pageCount).toBe(7);
    expect(getMesseBrochureReaderAsset('rc-1000s', 'DK')?.pageCount).toBe(7);
    expect(getMesseBrochureReaderAsset('timan-3330', 'DK')?.pageCount).toBe(9);
  });

  it('opens the primary brochure action in the internal modal, not a direct PDF link', () => {
    expect(componentSource).toContain('setBrochureOpen(true)');
    expect(componentSource).not.toContain(') : brochurePdfSrc ? (');
    expect(componentSource).toContain('className="absolute bottom-8 right-8');
  });
});
