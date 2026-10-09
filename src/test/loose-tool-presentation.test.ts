import { describe, expect, it } from 'vitest';
import { ACCESSORIES, getAccessoriesFlat, getLooseToolAccessories, getPriceForCurrency, LOOSE_TOOL_KEY } from '@/data/machines';
import { filterLooseToolAccessories, LOOSE_TOOL_MACHINE_FILTERS } from '@/lib/looseToolPresentation';
import { resolveSalesStockCatalogItem } from '@/lib/salesStockConfigurator';
import type { Accessory, SubItem } from '@/types/configurator';

const rc751 = ['411687', '410106', '411571', '411866', '411867', '795015'];
const spreader = ['712902', '725312', '725120', '725747', '725121'];
function flatten(items: (Accessory | SubItem)[]): (Accessory | SubItem)[] {
  return items.flatMap(item => [item, ...flatten(item.subItems || [])]);
}
function products(items: Accessory[]) {
  return flatten(items).filter(item => !('isHeader' in item && item.isHeader)
    && !('isProductGroup' in item && item.isProductGroup));
}

describe('canonical loose-tool filter presentation', () => {
  it('provides explicit all-machines and four machine filters', () => {
    expect(LOOSE_TOOL_MACHINE_FILTERS).toEqual(['all', 'RC-751', 'RC-1000S', 'Timan 3330', 'Timan 2620']);
  });

  it.each(rc751)('exposes canonical RC-751 equipment %s with unchanged identity, price and content', sku => {
    const source = ACCESSORIES['RC-751'].find(item => item.varenr === sku)!;
    const actual = filterLooseToolAccessories(getLooseToolAccessories(), 'RC-751', []).find(item => item.varenr === sku);
    expect(actual).toMatchObject({ ...source, looseToolMachine: 'RC-751' });
    expect(actual?.id).toBe(source.id);
    expect(getAccessoriesFlat(LOOSE_TOOL_KEY)).toContainEqual(expect.objectContaining({ id: source.id }));
  });

  it('reuses the existing translated RC-751 section', () => {
    expect(filterLooseToolAccessories(getLooseToolAccessories(), 'RC-751', [])[0].sectionStart).toBe('rc751EquipmentSection');
  });

  it.each(['DKK', 'EUR', 'SEK'] as const)('preserves original sales-stock identities and prices in %s', currency => {
    for (const sku of ['312010', '411687', '795015']) {
      const machineType = sku === '312010' ? 'Loader Line' : 'RC-751';
      const source = ACCESSORIES[machineType].find(item => item.varenr === sku)!;
      expect(resolveSalesStockCatalogItem(`${sku}-00`, currency)).toMatchObject({
        machineType,
        catalogId: source.id,
        catalogItemNumber: sku,
        listPrice: getPriceForCurrency(source, currency),
      });
    }
    expect(resolveSalesStockCatalogItem('410910-00', currency)?.machineType).toBe(LOOSE_TOOL_KEY);
    expect(resolveSalesStockCatalogItem('411666-00', currency)?.machineType).toBe(LOOSE_TOOL_KEY);
  });

  it.each(spreader)('retains canonical Loader-Line/CS-200 relations for %s, never RC-751', sku => {
    const catalog = getLooseToolAccessories();
    const variants = catalog.filter(item => item.varenr === sku && item.looseToolMachine === 'Loader Line');
    expect(variants.length).toBeGreaterThan(0);
    variants.forEach(item => expect(ACCESSORIES['Loader Line']).toContainEqual(expect.objectContaining({
      id: item.id, varenr: item.varenr, requires: item.requires, priceDKK: item.priceDKK, priceEUR: item.priceEUR,
    })));
    expect(products(filterLooseToolAccessories(catalog, 'all', [])).filter(item => item.varenr === sku)).toHaveLength(1);
    expect(filterLooseToolAccessories(catalog, 'RC-751', []).some(item => item.varenr === sku)).toBe(false);
  });

  it.each(LOOSE_TOOL_MACHINE_FILTERS)('shows every SKU at most once under %s without mutating the catalog or selection', filter => {
    const catalog = getLooseToolAccessories();
    const before = JSON.stringify(catalog);
    const selected = ['411687', '725162__725121'];
    const visible = products(filterLooseToolAccessories(catalog, filter, selected));
    const skus = visible.map(item => item.varenr);
    expect(new Set(skus).size).toBe(skus.length);
    expect(JSON.stringify(catalog)).toBe(before);
    expect(selected).toEqual(['411687', '725162__725121']);
  });

  it('preserves a selected canonical alias and its parent/price rather than replacing it with the first duplicate', () => {
    const selectedId = '725162__725121';
    const catalog = getLooseToolAccessories();
    const source = catalog.find(item => item.id === selectedId)!;
    expect(products(filterLooseToolAccessories(catalog, 'all', [selectedId])).find(item => item.varenr === '725121')).toEqual(source);
  });

  it('retains the option associated with the selected spreader when no alias is selected', () => {
    const canonical: Accessory[] = [
      { id: 'a', varenr: '123', name: 'A', priceDKK: 10, priceEUR: 2, requires: 'parent-a' },
      { id: 'b', varenr: '123', name: 'B', priceDKK: 10, priceEUR: 2, requires: 'parent-b' },
    ];
    expect(filterLooseToolAccessories(canonical, 'all', ['parent-b'])).toEqual([canonical[1]]);
  });

  it('does not remove nested hierarchy nodes or selected nested option identities', () => {
    const catalog = getLooseToolAccessories();
    const group = catalog.find(item => item.isProductGroup && item.subItems?.length);
    expect(group).toBeDefined();
    const variant = group!.subItems![0];
    const visible = filterLooseToolAccessories(catalog, 'all', [variant.id]);
    expect(visible.find(item => item.id === group!.id)?.subItems).toContainEqual(expect.objectContaining({ id: variant.id }));
  });

  it('excludes inactive/hidden rows rather than letting them suppress an active alias', () => {
    const canonical: Accessory[] = [
      { id: 'hidden', varenr: '123', name: 'Hidden', priceDKK: 10, priceEUR: 2, hidden: true },
      { id: 'active', varenr: '123', name: 'Active', priceDKK: 10, priceEUR: 2 },
    ];
    expect(filterLooseToolAccessories(canonical, 'all', [])).toEqual([canonical[1]]);
  });
});
