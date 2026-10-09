import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/machines';
import { translateSpecLabel } from '@/data/translations';

describe('Timan 2620 Configurator card', () => {
  const specs = PRODUCTS['Timan 2620'].techSpecs;

  it('uses the same compact six-row rhythm as the Timan 3330 card', () => {
    expect(specs).toHaveLength(6);
    expect(specs.map((spec) => spec.label)).toEqual([
      'Motor', 'HK', 'Cylindre / Træk', 'Brændstof', 'Tophastighed', 'Bredde',
    ]);
    expect(specs.find((spec) => spec.label === 'Cylindre / Træk')?.value).toMatchObject({
      da: '3 / 4-hjulstræk',
      en: '3 / 4-wheel drive',
      de: '3 / Allradantrieb',
    });
    expect(specs.some((spec) => spec.label === 'Cylindre')).toBe(false);
    expect(specs.some((spec) => spec.label === 'Træk')).toBe(false);
  });

  it('localizes the combined card label for every portal language', () => {
    expect(translateSpecLabel('Cylindre / Træk', 'da')).toBe('Cylindre / Træk');
    expect(translateSpecLabel('Cylindre / Træk', 'en')).toBe('Cylinders / Drive');
    expect(translateSpecLabel('Cylindre / Træk', 'de')).toBe('Zylinder / Antrieb');
    expect(translateSpecLabel('Cylindre / Træk', 'it')).toBe('Cilindri / Trazione');
    expect(translateSpecLabel('Cylindre / Træk', 'hu')).toBe('Hengerek / Hajtás');
    expect(translateSpecLabel('Cylindre / Træk', 'sv')).toBe('Cylindrar / Drift');
    expect(translateSpecLabel('Cylindre / Træk', 'fr')).toBe('Cylindres / Transmission');
    expect(translateSpecLabel('Cylindre / Træk', 'pl')).toBe('Cylindry / Napęd');
    expect(translateSpecLabel('Cylindre / Træk', 'cs')).toBe('Válce / Pohon');
  });

  it('keeps the marketing description in the shared information modal, not on the card', () => {
    const page = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    expect(page).toContain("!machine || !content || key === 'Timan 2620'");
    expect(page).toContain("description={key === 'Timan 2620' ? undefined : marketingContent?.description}");
    expect(page).toMatch(/key === 'Timan 2620'\r?\n\s+\? p\.techSpecs/);
  });
});
