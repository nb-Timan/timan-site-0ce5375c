import { describe, expect, it } from 'vitest';
import { getAccessoriesFlat, PRODUCTS } from '@/data/machines';

describe('Timan 2620 product catalog', () => {
  const accessories = getAccessoriesFlat('Timan 2620');

  function accessory(id: string) {
    const item = accessories.find(candidate => candidate.id === id);
    expect(item).toBeDefined();
    return item!;
  }

  it('uses the canonical machine item number', () => {
    expect(PRODUCTS['Timan 2620'].varenr).toBe('761000');
  });

  it('uses the corrected winter and transport item numbers', () => {
    expect(accessory('3000-01').varenr).toBe('744000');
    expect(accessory('3000-06').varenr).toBe('770002');
    expect(accessory('3000-05')).toMatchObject({
      varenr: '770003',
      name: { da: 'Sneplov 1300 mm (skrabeblad)' },
    });
    expect(accessory('4000-01').varenr).toBe('770007');
  });

  it('offers the implement trolley only as an optional sub-item of the spreader', () => {
    const spreader = accessory('3000-01');
    const trolley = spreader.subItems?.find(item => item.id === '3000-01__774005');
    expect(trolley).toMatchObject({ varenr: '774005' });
    expect(trolley?.name).toMatchObject({ da: 'Redskabsvogn' });
  });
});
