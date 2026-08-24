import { describe, expect, it } from 'vitest';
import { PRODUCTS } from '@/data/machines';

describe('Timan 2620 machine information modal data', () => {
  it('provides technical specification sections for the configurator information modal', () => {
    const dimensions = PRODUCTS['Timan 2620'].machineDetails?.dimensions ?? [];
    const headers = dimensions.filter(item => item.isHeader).map(item => item.label);
    const values = dimensions.filter(item => !item.isHeader && item.value);

    expect(headers).toContain('Motor');
    expect(headers).toContain('Transmission');
    expect(headers).toContain('Arbejdshydraulik');
    expect(headers).toContain('Mål og vægt');
    expect(values.length).toBeGreaterThan(10);
  });
});
