import { describe, expect, it } from 'vitest';
import { ACCESSORIES, getAccessoriesFlat } from '@/data/machines';

describe('RC-1000s scraper blade catalog entry', () => {
  const accessories = ACCESSORIES['RC-1000S'];

  it('is listed between the V-plough block and the centre-driven sweeper', () => {
    const vPloughIndex = accessories.findIndex(item => item.id === '411742');
    const scraperBladeIndex = accessories.findIndex(item => item.id === '412051');
    const sweeperIndex = accessories.findIndex(item => item.id === '411845');

    expect(vPloughIndex).toBeGreaterThanOrEqual(0);
    expect(scraperBladeIndex).toBeGreaterThan(vPloughIndex);
    expect(scraperBladeIndex).toBeLessThan(sweeperIndex);
  });

  it('uses the supplied item number and prices in the flattened quote catalog', () => {
    const scraperBlade = getAccessoriesFlat('RC-1000S').find(item => item.id === '412051');

    expect(scraperBlade).toMatchObject({
      varenr: '412051',
      name: { da: 'Skrabeblad RC-1000' },
      priceDKK: 13500,
      priceEUR: 1825,
    });
    expect(scraperBlade?.varenr).not.toContain('-00');
  });
});
