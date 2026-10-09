import { afterEach, describe, expect, it } from 'vitest';
import {
  clearPublishedConfiguratorPricesForTest,
  getPrice,
  replacePublishedConfiguratorPrices,
} from '@/data/machines';
import { snapshotAccessoryPrice } from '@/lib/configuratorPricing';
import type { ConfiguratorState } from '@/types/configurator';

const cs200Manual = { varenr: '725135', priceDKK: 40900, priceEUR: 0, id: '725135' };

afterEach(() => clearPublishedConfiguratorPricesForTest());

describe('published Configurator prices', () => {
  it('uses an approved DKK and EUR overlay for a new catalog calculation', () => {
    replacePublishedConfiguratorPrices([{ item_number: '725135', price_dkk: 60800, price_eur: 8155 }]);

    expect(getPrice(cs200Manual, 'da')).toBe(60800);
    expect(getPrice(cs200Manual, 'de')).toBe(8155);
  });

  it('keeps the static catalog price when an item has not been published', () => {
    expect(getPrice(cs200Manual, 'da')).toBe(40900);
  });

  it('keeps a submitted snapshot price after the current catalog changes', () => {
    replacePublishedConfiguratorPrices([{ item_number: '725135', price_dkk: 60800, price_eur: 8155 }]);
    const state = {
      pricingSnapshot: { version: 1, capturedAt: '2026-09-01T00:00:00.000Z', prices: { 'accessory:Loader Line:725135': 40900 } },
    } as ConfiguratorState;

    expect(snapshotAccessoryPrice(state, 'Loader Line', cs200Manual, getPrice(cs200Manual, 'da'))).toBe(40900);
  });
});
