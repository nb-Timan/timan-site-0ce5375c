import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/machines';
import { translateSpecLabel } from '@/data/translations';
import type { PortalUiLanguage } from '@/lib/portalLanguages';

const languages: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];

describe('RC-751 machine information modal data', () => {
  it('uses the corrected canonical dimensions in the requested order', () => {
    const details = PRODUCTS['RC-751'].machineDetails;
    const dimensions = details?.dimensions ?? [];

    expect(dimensions.map((spec) => spec.label)).toEqual([
      'Motor',
      'Max. hældning',
      'Vægt (Basis)',
      'Klippebredde',
      'Højde',
      'Længde',
    ]);
    expect(dimensions.at(-2)?.value).toBe('603 mm');
    expect(dimensions.at(-1)?.value).toBe('1876 mm');
    expect(dimensions.some((spec) => spec.value === '600 mm')).toBe(false);
    expect(details?.preferCanonicalDimensions).toBe(true);
  });

  it('translates height and length while preserving their values in all portal languages', () => {
    const expectedLabels: Record<PortalUiLanguage, [string, string]> = {
      da: ['Højde', 'Længde'],
      en: ['Height', 'Length'],
      de: ['Hoehe', 'Laenge'],
      it: ['Altezza', 'Lunghezza'],
      hu: ['Magassag', 'Hossz'],
      sv: ['Höjd', 'Längd'],
      fr: ['Hauteur', 'Longueur'],
      pl: ['Wysokość', 'Długość'],
      cs: ['Výška', 'Délka'],
    };
    const values = new Map(
      (PRODUCTS['RC-751'].machineDetails?.dimensions ?? []).map((spec) => [spec.label, spec.value]),
    );

    for (const language of languages) {
      expect([
        translateSpecLabel('Højde', language),
        translateSpecLabel('Længde', language),
      ]).toEqual(expectedLabels[language]);
      expect([values.get('Højde'), values.get('Længde')]).toEqual(['603 mm', '1876 mm']);
    }
  });

  it('uses the canonical dimensions and selected portal language with published visual content', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

    expect(source).toContain('specs: details?.preferCanonicalDimensions ? details.dimensions : undefined');
    expect(source).toContain("specLabelLanguage: key === 'RC-751' ? uiLanguage : undefined");
    expect(source).toContain('translateSpecLabel(spec.label, options?.specLabelLanguage ?? contentUiLang)');
  });

  it('keeps the neighboring machine specifications unchanged', () => {
    expect(PRODUCTS['RC-1000S'].machineDetails?.dimensions.find((spec) => spec.label === 'Højde (Basis)')?.value).toBe('692 mm');
    expect(PRODUCTS['Timan 3330'].techSpecs.map((spec) => spec.label)).toEqual([
      'Motor', 'HK', 'Brændstof', 'Tophastighed', 'Lydniveau i kabine', 'Køreklar vægt',
    ]);
    expect(PRODUCTS['Timan 2620'].techSpecs.find((spec) => spec.label === 'Bredde')?.value).toEqual({
      da: '1.020 mm uden kabine',
      en: '1,020 mm without cab',
      de: '1.020 mm ohne Kabine',
      it: '1.020 mm senza cabina',
      hu: '1.020 mm fulke nelkul',
    });
  });
});
