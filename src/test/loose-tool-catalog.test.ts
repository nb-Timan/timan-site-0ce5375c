import { describe, expect, it } from 'vitest';
import { getLooseToolAccessories } from '@/data/machines';

describe('loose tool catalog', () => {
  const accessories = getLooseToolAccessories();

  it('uses canonical accessories from all supported loose-tool machines', () => {
    expect(accessories.some(item => item.looseToolMachine === 'RC-1000S' && item.varenr === '412051')).toBe(true);
    expect(accessories.some(item => item.looseToolMachine === 'RC-1000S' && item.varenr === '412050')).toBe(true);
    expect(accessories.some(item => item.looseToolMachine === 'Timan 3330' && item.varenr === '730035')).toBe(true);
    expect(accessories.some(item => item.looseToolMachine === 'Timan 3330' && item.varenr === '730036')).toBe(true);
    expect(accessories.some(item => item.looseToolMachine === 'Timan 2620' && item.varenr === '744000')).toBe(true);
    expect(accessories.some(item => item.looseToolMachine === 'Timan 2620' && item.varenr === '770002')).toBe(true);
    expect(accessories.some(item => item.looseToolMachine === 'Timan 2620' && item.varenr === '770003')).toBe(true);
    expect(accessories.some(item => item.looseToolMachine === 'Timan 2620' && item.varenr === '770007')).toBe(true);
  });

  it('keeps the 2620 trolley nested under the salt and gravel spreader', () => {
    const spreader = accessories.find(item => item.looseToolMachine === 'Timan 2620' && item.varenr === '744000');
    expect(spreader?.subItems).toContainEqual(expect.objectContaining({ varenr: '774005' }));
  });
});
