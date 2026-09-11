import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildMesseBrochureSpreads,
  buildMesseBrochureVirtualPages,
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
  it('splits every interior PDF spread into virtual brochure pages before pairing them', () => {
    expect(buildMesseBrochureVirtualPages(7)).toEqual([
      { number: 1, sourcePage: 1, half: 'full' },
      { number: 2, sourcePage: 2, half: 'left' },
      { number: 3, sourcePage: 2, half: 'right' },
      { number: 4, sourcePage: 3, half: 'left' },
      { number: 5, sourcePage: 3, half: 'right' },
      { number: 6, sourcePage: 4, half: 'left' },
      { number: 7, sourcePage: 4, half: 'right' },
      { number: 8, sourcePage: 5, half: 'left' },
      { number: 9, sourcePage: 5, half: 'right' },
      { number: 10, sourcePage: 6, half: 'left' },
      { number: 11, sourcePage: 6, half: 'right' },
      { number: 12, sourcePage: 7, half: 'full' },
    ]);
    expect(buildMesseBrochureSpreads(1)).toEqual([[1]]);
    expect(buildMesseBrochureSpreads(12)).toEqual([[1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12]]);
    expect(buildMesseBrochureSpreads(16)).toEqual([[1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 13], [14, 15], [16]]);
  });

  it('ships reader pages for every localized and English-fallback brochure variant', () => {
    for (const [product, languages] of Object.entries(readerCases)) {
      for (const [portalLanguage, expectedLanguage] of Object.entries(languages)) {
        const reader = getMesseBrochureReaderAsset(product, portalLanguage);
        expect(reader?.language).toBe(expectedLanguage);
        expect(reader).toBeDefined();
        expect(existsSync(path.resolve(process.cwd(), 'public', reader!.pageBase.replace(/^\//, ''), 'page-1.jpg'))).toBe(true);
        expect(existsSync(path.resolve(process.cwd(), 'public', reader!.pageBase.replace(/^\//, ''), `page-${reader!.rawPageCount}.jpg`))).toBe(true);
      }
    }
  });

  it('accepts the stable Messe route ids as well as canonical product ids', () => {
    expect(getMesseBrochureReaderAsset('rc-751', 'DK')?.pageCount).toBe(12);
    expect(getMesseBrochureReaderAsset('rc-1000s', 'DK')?.pageCount).toBe(12);
    expect(getMesseBrochureReaderAsset('timan-3330', 'DK')?.pageCount).toBe(16);
  });

  it('opens the primary brochure action in the internal modal, not a direct PDF link', () => {
    expect(componentSource).toContain('setBrochureOpen(true)');
    expect(componentSource).not.toContain(') : brochurePdfSrc ? (');
    expect(componentSource).toContain('className="absolute bottom-8 right-8');
    expect(componentSource).toContain('aspect-[1/1.4142]');
    expect(componentSource).toContain("page.half === 'left' ? 'translateX(0)' : 'translateX(-50%)'");
    expect(componentSource).not.toContain('hidden min-h-0 items-center justify-center');
  });
});
