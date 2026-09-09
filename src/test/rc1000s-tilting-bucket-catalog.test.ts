import { describe, expect, it } from 'vitest';
import { ACCESSORIES, getAccessoriesFlat } from '@/data/machines';

describe('RC-1000s tilting bucket catalog entry', () => {
  const accessories = ACCESSORIES['RC-1000S'];

  it('is listed after the weed brush block and before other equipment', () => {
    const weedBrushIndex = accessories.findIndex(item => item.id === '730600');
    const bucketIndex = accessories.findIndex(item => item.id === '412050');
    const otherEquipmentIndex = accessories.findIndex(item => item.sectionStart === 'Øvrigt Udstyr');

    expect(bucketIndex).toBeGreaterThan(weedBrushIndex);
    expect(bucketIndex).toBeLessThan(otherEquipmentIndex);
  });

  it('uses the supplied item number and prices in the flattened quote catalog', () => {
    const bucket = getAccessoriesFlat('RC-1000S').find(item => item.id === '412050');

    expect(bucket).toMatchObject({
      varenr: '412050',
      name: { da: 'Skovl RC-1000' },
      priceDKK: 11800,
      priceEUR: 1610,
    });
    expect(bucket?.varenr).not.toContain('-00');
  });
});
