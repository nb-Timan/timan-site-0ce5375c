import { describe, expect, it } from 'vitest';
import { ACCESSORIES } from '@/data/machines';

describe('Configurator new-product flags', () => {
  it('marks only the newly added RC-1000s and Timan 3330 products as new', () => {
    const find = (machine: 'RC-1000S' | 'Timan 3330', id: string) => ACCESSORIES[machine].find(item => item.id === id);

    expect(find('RC-1000S', '412051')?.isNew).toBe(true);
    expect(find('RC-1000S', '412050')?.isNew).toBe(true);
    expect(find('Timan 3330', '730035')?.isNew).toBe(true);
    expect(find('Timan 3330', '730036')?.isNew).toBe(true);
    expect(find('RC-1000S', '410910')?.isNew).not.toBe(true);
  });

  it('does not mark corrected Timan 2620 item numbers as new products', () => {
    const itemNumbers = ['744000', '770002', '770003', '770007'];
    for (const varenr of itemNumbers) {
      const item = ACCESSORIES['Timan 2620'].find(accessory => accessory.varenr === varenr);
      expect(item?.isNew).not.toBe(true);
    }
  });
});
