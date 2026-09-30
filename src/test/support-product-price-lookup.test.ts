import { afterEach, describe, expect, it } from 'vitest';
import { clearPublishedConfiguratorPricesForTest, replacePublishedConfiguratorPrices } from '@/data/machines';
import {
  buildSupportProductPriceLookupContext,
  isProductPriceQuestion,
} from '@/lib/supportProductPriceLookup';

afterEach(() => clearPublishedConfiguratorPricesForTest());

describe('Support product price lookup', () => {
  it('matches the reported trolley question against the canonical Configurator catalogue', () => {
    const context = buildSupportProductPriceLookupContext('hvad koster en vogn til afmontering?', 'da');

    expect(context).toMatchObject({ domain: 'PRODUCT_PRICE_LOOKUP', lookup_status: 'MATCHED' });
    expect(context?.candidates).toHaveLength(1);
    expect(context?.candidates[0]).toMatchObject({
      item_number: 'V34-029',
      name: 'Ekstra vogn til afmontering af redskaber',
      price_dkk: 6600,
      price_eur: 890,
    });
    expect(context?.candidates[0].machine_families).toContain('Timan 3330');
  });

  it('prioritizes an exact canonical item number', () => {
    const context = buildSupportProductPriceLookupContext('hvad koster varenummer V34-029?', 'da');
    expect(context?.lookup_status).toBe('MATCHED');
    expect(context?.candidates[0].item_number).toBe('V34-029');
  });

  it('uses the current published overlay without duplicating the catalogue', () => {
    replacePublishedConfiguratorPrices([{
      item_number: 'V34-029', item_text_da: 'Canonical QA-vogn',
      price_dkk: 7123, price_eur: 956, price_sek: 10999,
    }]);
    const context = buildSupportProductPriceLookupContext('hvad koster varenummer V34-029?', 'da', [{
      item_number: 'V34-029', item_text_da: 'Canonical QA-vogn',
      price_dkk: 7123, price_eur: 956, price_sek: 10999,
    }]);
    expect(context?.candidates[0]).toMatchObject({ name: 'Canonical QA-vogn', price_dkk: 7123, price_eur: 956, price_sek: 10999 });
  });

  it('asks for clarification instead of guessing a generic trolley', () => {
    const context = buildSupportProductPriceLookupContext('hvad koster en vogn?', 'da');
    expect(context?.lookup_status).toBe('AMBIGUOUS');
    expect(context?.candidates.length).toBeGreaterThan(1);
  });

  it('returns a safe canonical no-match for an unknown product', () => {
    const context = buildSupportProductPriceLookupContext('hvad koster en månefræser?', 'da');
    expect(context).toEqual({
      domain: 'PRODUCT_PRICE_LOOKUP',
      catalog_source: 'canonical_configurator_catalog',
      lookup_status: 'NOT_FOUND',
      candidates: [],
    });
  });

  it('keeps ordinary discovery and quote requests outside the price route', () => {
    expect(isProductPriceQuestion('Hvilke vinterredskaber kan RC-1000s bruge?')).toBe(false);
    expect(isProductPriceQuestion('Opret et tilbud på en Timan 3330')).toBe(false);
    expect(isProductPriceQuestion('Hvad koster CS-200?')).toBe(true);
  });
});

