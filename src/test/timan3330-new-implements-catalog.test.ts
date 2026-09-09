import { describe, expect, it } from 'vitest';
import { ACCESSORIES, getAccessoriesFlat } from '@/data/machines';

describe('Timan 3330 new implements catalog entries', () => {
  const accessories = ACCESSORIES['Timan 3330'];

  it('places the scraper blade between the specified winter implements', () => {
    const dozerIndex = accessories.findIndex(item => item.id === '730105');
    const scraperIndex = accessories.findIndex(item => item.id === '730036');
    const snowBlowerIndex = accessories.findIndex(item => item.id === '730106');

    expect(scraperIndex).toBe(dozerIndex + 1);
    expect(scraperIndex).toBe(snowBlowerIndex - 1);
  });

  it('places the Timan 3330 bucket directly after item 730107', () => {
    const hydraulicBucketIndex = accessories.findIndex(item => item.id === '730107');
    const bucketIndex = accessories.findIndex(item => item.id === '730035');

    expect(bucketIndex).toBe(hydraulicBucketIndex + 1);
  });

  it('exposes the supplied item numbers and prices to quote lines', () => {
    const flat = getAccessoriesFlat('Timan 3330');

    expect(flat.find(item => item.id === '730035')).toMatchObject({
      varenr: '730035', priceDKK: 12500, priceEUR: 1695,
    });
    expect(flat.find(item => item.id === '730036')).toMatchObject({
      varenr: '730036', priceDKK: 18500, priceEUR: 2550,
    });
  });
});
