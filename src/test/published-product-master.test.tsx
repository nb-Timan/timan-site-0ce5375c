import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ACCESSORIES, PRODUCTS, clearPublishedConfiguratorPricesForTest, getAccessoriesFlat, getLocalizedName, getPrice, replacePublishedConfiguratorPrices } from '@/data/machines';
import { publishedProduct, resolvePublishedTitle } from '@/lib/publishedProductMaster';
import { listMarketingConfiguratorCatalog, resolveMarketingProductIdentity } from '@/lib/marketingConfiguratorContentService';
import { listVideoProductOptions } from '@/lib/videoProductCatalog';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { createConfiguratorPricingSnapshot, configuratorPricingSignature } from '@/lib/configuratorPricing';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { buildAccountCaseLines } from '@/lib/configuratorAccountSummaries';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { useProductMasterRevision } from '@/hooks/useProductMasterRevision';
import { BUDGET_PRODUCTS } from '@/lib/crmBudgetService';

afterEach(() => act(() => clearPublishedConfiguratorPricesForTest()));
const oldTitle = 'CS-200 Combi, for lad, manuel reg.';
const title = 'CS-200 Combi, for lad, manuel regulering.';
const publish = () => replacePublishedConfiguratorPrices([
  { item_number: '725132', item_text_da: title, item_text_de: 'CS-200 Kombi-Streuer, manuelle Regulierung', item_text_en: null, identity_aliases: [oldTitle], price_dkk: 60000, price_eur: 8050, price_sek: 91000 },
]);
const state = () => ({ ...createEmptyConfiguratorState('da'), machineConfigs: [
  { id: 'qa', type: 'Timan 3330', qty: 1, configMode: 'shared' as const, acc: ['725132'] },
] });

describe('published Product Master propagation', () => {
  it('replaces canonical wording and preserves an exact documented enrichment suffix', () => {
    publish();
    for (const group of ['Timan 3330', 'LOOSE_TOOL']) {
      const item = getAccessoriesFlat(group).find(item => item.varenr === '725132')!;
      expect(getLocalizedName(item.name, 'da')).toBe(`${title} Husk lad og vogn`);
      expect(getPrice(item, 'da')).toBe(60000);
      expect(getPrice(item, 'de')).toBe(8050);
    }
    expect(publishedProduct('725132')?.price_sek).toBe(91000);
  });

  it.each(['725131', '725138', '412594'])('supports price and text changes for %s without item-specific rules', itemNumber => {
    const base = getAccessoriesFlat(itemNumber === '412594' ? 'RC-1000S' : 'Timan 3330').find(item => item.varenr === itemNumber)!;
    const before = getLocalizedName(base.name, 'da');
    replacePublishedConfiguratorPrices([{ item_number: itemNumber, item_text_da: 'QA new canonical name', identity_aliases: [before], price_dkk: 12345, price_eur: 2000 }]);
    const current = getAccessoriesFlat(itemNumber === '412594' ? 'RC-1000S' : 'Timan 3330').find(item => item.varenr === itemNumber)!;
    expect(getLocalizedName(current.name, 'da')).toBe('QA new canonical name');
    expect(current.priceDKK).toBe(12345);
    expect(base.name).not.toBe(current.name);
  });

  it('null price is not zero; text-only publishing preserves catalog prices', () => {
    const base = ACCESSORIES['Timan 3330'].find(item => item.varenr === '725132')!;
    replacePublishedConfiguratorPrices([{ item_number: '725132', item_text_da: title, identity_aliases: [oldTitle], price_dkk: null, price_eur: null }]);
    expect(getPrice(base, 'da')).toBe(base.priceDKK);
    expect(getAccessoriesFlat('Timan 3330').find(item => item.varenr === '725132')?.name).not.toEqual(base.name);
  });

  it('price-only publishing does not change identity, translations or structural relationships', () => {
    const base = PRODUCTS['Timan 3330'];
    replacePublishedConfiguratorPrices([{ item_number: base.varenr, price_dkk: 1, price_eur: 2 }]);
    expect(PRODUCTS['Timan 3330'].name).toEqual(base.name);
    expect(PRODUCTS['Timan 3330'].id).toBe(base.id);
    expect(BUDGET_PRODUCTS.find(item => item.varenr === base.varenr)?.priceDKK).toBe(1);
  });

  it('Marketing and Video selectors share the same resolved catalog', () => {
    publish();
    expect(listVideoProductOptions('da').find(item => item.itemNumber === '725132')?.label).toBe(`${title} Husk lad og vogn`);
    const catalog = listMarketingConfiguratorCatalog().find(item => item.itemNumber === '725132')!;
    const content = resolveMarketingProductIdentity('725132', { ...catalog.defaults, title: `${oldTitle} Husk lad og vogn`, badge: 'Kampagne', image_url: 'https://example.invalid/image.jpg' });
    expect(content.title).toBe(`${title} Husk lad og vogn`);
    expect(content.badge).toBe('Kampagne');
    expect(content.image_url).toBe('https://example.invalid/image.jpg');
    const german = resolveMarketingProductIdentity('725132', { ...content, title: `${oldTitle} Husk lad og vogn` }, 'de');
    expect(german.title).toBe('CS-200 Kombi-Streuer, manuelle Regulierung. Husk lad og vogn');
    const englishFallback = resolveMarketingProductIdentity('725132', { ...content, title: oldTitle }, 'en');
    expect(englishFallback.title).toBe(title);
    const custom = resolveMarketingProductIdentity('725132', { ...content, title: 'Independent editorial tagline' });
    expect(custom.title).toBe(title);
    expect(custom.description).toContain('Independent editorial tagline');
  });

  it('does not guess identity prefixes or discard unrelated editorial words', () => {
    publish();
    expect(resolvePublishedTitle('725132', oldTitle + 'X')).toBe(title);
    expect(resolvePublishedTitle('725132', title)).toBe(title);
    expect(resolvePublishedTitle('725132', title + ' Husk lad og vogn')).toBe(title + ' Husk lad og vogn');
  });

  it('new calculations change while a saved snapshot keeps both historic name and price', () => {
    const original = state();
    const snapshot = createConfiguratorPricingSnapshot(original);
    const saved = { ...original, pricingSnapshot: snapshot };
    const old = calculateConfiguration(saved);
    const historicalLines = buildAccountCaseLines(saved, 'da');
    publish();
    expect(calculateConfiguration(original).lineItems.find(item => item.varenr === '725132')?.txt).toContain(title);
    expect(calculateConfiguration(saved)).toEqual(old);
    const frozen = { ...saved, pricingSnapshot: { ...snapshot, signature: configuratorPricingSignature(saved), lines: historicalLines,
      totals: { subtotal: old.subtotal, totalDiscount: old.totalDiscount, finalPrice: old.currentPrice } } };
    expect(buildSubmittedOrderDocument(frozen).lines).toEqual(historicalLines);
  });

  it('notifies open consumers after publish, including a second changed value', () => {
    const { result } = renderHook(useProductMasterRevision);
    const initial = result.current;
    act(publish);
    expect(result.current).toBeGreaterThan(initial);
    act(() => replacePublishedConfiguratorPrices([{ item_number: '725132', price_dkk: 1, price_eur: 1 }]));
    expect(getPrice(ACCESSORIES['Timan 3330'].find(item => item.varenr === '725132')!, 'da')).toBe(1);
  });
});
