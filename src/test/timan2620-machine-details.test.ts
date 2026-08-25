import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/machines';

describe('Timan 2620 machine information modal data', () => {
  it('provides technical specification sections for the configurator information modal', () => {
    const dimensions = PRODUCTS['Timan 2620'].machineDetails?.dimensions ?? [];
    const headers = dimensions.filter(item => item.isHeader).map(item => item.label);
    const values = dimensions.filter(item => !item.isHeader && item.value);
    const labels = values.map(item => item.label);
    const renderedValues = values
      .map(item => {
        if (typeof item.value === 'string') return item.value;
        return Object.values(item.value ?? {}).join(' ');
      })
      .join(' ');

    expect(headers).toContain('Motor');
    expect(headers).toContain('Mål og manøvrering');
    expect(headers).toContain('Arbejdshydraulik');
    expect(headers).not.toContain('Transmission');
    expect(headers).not.toContain('Mål og vægt');

    expect(labels).toContain('Cylindre');
    expect(labels).not.toContain('Slagvolumen');
    expect(labels).not.toContain('Dieseltank');
    expect(labels).not.toContain('Bremser');
    expect(labels).not.toContain('Hjulmotorer');
    expect(labels).not.toContain('Kølesystem');
    expect(labels).not.toContain('Lydniveau');

    expect(renderedValues).toContain('Perkins 403J-11');
    expect(renderedValues).toContain('25 hk / 18,4 kW');
    expect(renderedValues).toContain('3');
    expect(renderedValues).toContain('Diesel / HVO biodiesel');
    expect(renderedValues).toContain('565 mm');
    expect(renderedValues).toContain('40 l/min ved 250 bar');
    expect(renderedValues).not.toMatch(/1131|21 liter|Hydraulisk stempelpumpe|På forreste aksel|orbitmotor|Vandkølet|dB/i);
  });
});
