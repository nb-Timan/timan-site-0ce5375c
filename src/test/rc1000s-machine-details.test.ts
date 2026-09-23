import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PRODUCTS } from '@/data/machines';
import { translateSpecLabel } from '@/data/translations';

describe('RC-1000s machine information modal data', () => {
  it('uses the corrected canonical dimensions in the requested order', () => {
    const details = PRODUCTS['RC-1000S'].machineDetails;
    const dimensions = details?.dimensions ?? [];
    const byLabel = new Map(dimensions.map((item) => [item.label, item.value]));
    const labels = dimensions.map((item) => item.label);

    expect(byLabel.get('Bredde (Basis)')).toBe('995 mm');
    expect(byLabel.get('Højde (Basis)')).toBe('692 mm');
    expect(byLabel.get('Længde (uden slagleklipper)')).toBe('1.313 mm');
    expect(byLabel.get('Længde (med slagleklipper)')).toBe('1.970 mm');
    expect(byLabel.get('Snitbredde')).toBe('1.000 mm');
    expect(byLabel.has('Længde (Basis)')).toBe(false);
    expect(labels.indexOf('Længde (uden slagleklipper)')).toBe(
      labels.indexOf('Længde (med slagleklipper)') - 1,
    );
  });

  it('provides the RC-1000s overview image without changing other machines', () => {
    const rc1000Details = PRODUCTS['RC-1000S'].machineDetails;
    const pageSource = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

    expect(rc1000Details?.overviewImageUrls).toEqual([
      '/images/rc-1000s/rc-1000s-dimensions-overview.png',
      '/images/rc-1000s/rc-1000s-flail-mower-dimensions.png',
    ]);
    expect(rc1000Details?.preferCanonicalDimensions).toBe(true);
    expect(existsSync('public/images/rc-1000s/rc-1000s-dimensions-overview.png')).toBe(true);
    expect(existsSync('public/images/rc-1000s/rc-1000s-flail-mower-dimensions.png')).toBe(true);
    expect(pageSource).toContain('max-h-[60vh] w-full max-w-full object-contain');
    expect(pageSource).toContain('space-y-4');
    expect(PRODUCTS['RC-751'].machineDetails?.overviewImageUrls).toBeUndefined();
  });

  it('translates every RC-1000s modal specification label through the shared portal map', () => {
    const labels = [
      'Bredde (Basis)',
      'Højde (Basis)',
      'Vægt (Basis)',
      'Længde (uden slagleklipper)',
      'Længde (med slagleklipper)',
      'Snitbredde',
      'Teoretisk maks. output',
      'Transmission til bælter/redskab',
    ];
    const nonDanishLanguages = ['en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];

    for (const language of nonDanishLanguages) {
      for (const label of labels) {
        expect(translateSpecLabel(label, language)).not.toBe(label);
      }
    }

    expect(translateSpecLabel('Længde (uden slagleklipper)', 'en')).toBe('Length (without flail mower)');
    expect(translateSpecLabel('Længde (med slagleklipper)', 'de')).toBe('Länge (mit Schlegelmäher)');
    expect(translateSpecLabel('Længde (uden slagleklipper)', 'da')).toBe('Længde (uden slagleklipper)');
  });
});
