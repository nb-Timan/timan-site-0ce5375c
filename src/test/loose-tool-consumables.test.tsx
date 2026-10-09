import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ACCESSORIES, getAccessoriesFlat, getLooseToolAccessories, getPriceForCurrency, LOOSE_TOOL_KEY } from '@/data/machines';
import { CONSUMABLE_ASSORTMENT, CONSUMABLE_GROUPS, isLooseConsumable } from '@/data/looseToolAssortment';
import { t } from '@/data/translations';
import { resolveLooseToolPresentation, LOOSE_TOOL_MACHINE_FILTERS } from '@/lib/looseToolPresentation';
import { LooseToolFilters } from '@/components/configurator/LooseToolFilters';
import { useConfigurator } from '@/hooks/useConfigurator';
import type { Accessory, SubItem } from '@/types/configurator';

const resolve = (filter: Parameters<typeof resolveLooseToolPresentation>[1] = 'all',
  category: Parameters<typeof resolveLooseToolPresentation>[2] = 'consumables', search = '', selected: string[] = []) =>
  resolveLooseToolPresentation(getLooseToolAccessories(), filter, category, selected, search);
const products = (rows: (Accessory | SubItem)[]): (Accessory | SubItem)[] =>
  rows.flatMap(row => [...(!('isHeader' in row && row.isHeader) && !('isProductGroup' in row && row.isProductGroup) ? [row] : []), ...products(row.subItems || [])]);

describe('canonical loose consumable assortment', () => {
  it.each(CONSUMABLE_GROUPS)('resolves every explicit canonical SKU for %s', group => {
    const rows = resolveLooseToolPresentation(getLooseToolAccessories(), group === 'Loader Line' ? 'all' : group, 'consumables', []);
    const available = rows.filter(row => !row.isHeader).map(row => row.varenr);
    for (const sku of CONSUMABLE_ASSORTMENT[group]) expect(available, sku).toContain(sku);
  });

  it('groups six RC-751 products in approved manual order with an explicit machine filter', () => {
    const rows = resolve();
    expect(rows[0].name).toBe('RC-751');
    expect(rows.slice(1, 7).map(row => row.varenr)).toEqual(CONSUMABLE_ASSORTMENT['RC-751']);
    expect(LOOSE_TOOL_MACHINE_FILTERS).toContain('RC-751');
    expect(rows.filter(row => row.isHeader).map(row => row.name)).toEqual(['RC-751', 'RC-1000s', 'Timan 3330', 'Timan 2620', 'Loader-Line / CS-200']);
  });

  it('uses the exact three canonical 410910 children and existing RC-1000s warranty', () => {
    expect(getAccessoriesFlat('RC-1000S').filter(row => row.requires === '410910').map(row => row.varenr)).toEqual(['411701', '412585', '411594']);
    expect(resolve('RC-1000S').map(row => row.varenr)).toEqual(expect.arrayContaining(['411701', '412585', '411594', '795016', '412603']));
  });

  it('preserves the real front coupling identity rather than fabricating V35-503', () => {
    expect(resolve('Timan 3330').map(row => row.varenr)).toEqual(expect.arrayContaining(['V35-502', 'V35-300', '795018']));
    expect(getAccessoriesFlat(LOOSE_TOOL_KEY).some(row => row.varenr === 'V35-503')).toBe(false);
  });

  it.each(['410910', '411742', '411845', '730030', '730114', '730036', '730600', '725131', '725161', 'V34-055'])(
    'keeps complete attachment %s out of consumables', sku => {
      expect(isLooseConsumable(sku)).toBe(false);
      expect(resolve().some(row => row.varenr === sku)).toBe(false);
    });

  it.each(['all', 'attachments', 'consumables'] as const)('shows one visible row per SKU in %s for every filter', category => {
    for (const filter of LOOSE_TOOL_MACHINE_FILTERS) {
      const rows = products(resolve(filter, category)).map(row => row.varenr);
      expect(new Set(rows).size).toBe(rows.length);
    }
  });

  it('consumables are flat while the original normal hierarchy and prices/content remain intact', () => {
    const before = JSON.stringify(ACCESSORIES);
    const catalog = getLooseToolAccessories();
    const catalogBefore = JSON.stringify(catalog);
    const rows = resolveLooseToolPresentation(catalog, 'all', 'consumables', []);
    for (const row of rows.filter(row => !row.isHeader)) {
      expect(row.subItems).toBeUndefined();
      expect(row.sectionStart).toBeUndefined();
      const source = getAccessoriesFlat(LOOSE_TOOL_KEY).find(item => item.id === row.id)!;
      expect(row).toMatchObject({ id: source.id, varenr: source.varenr, name: source.name,
        priceDKK: source.priceDKK, priceEUR: source.priceEUR });
      for (const key of ['videoUrl', 'imageUrl', 'videos', 'images', 'specs'] as const) expect(row[key]).toEqual(source[key]);
      for (const currency of ['DKK', 'EUR', 'SEK'] as const) expect(getPriceForCurrency(row, currency)).toBe(getPriceForCurrency(source, currency));
    }
    expect(JSON.stringify(ACCESSORIES)).toBe(before);
    expect(JSON.stringify(catalog)).toBe(catalogBefore);
    expect(getAccessoriesFlat('Timan 3330').find(row => row.varenr === 'V34-055')?.subItems?.map(row => row.varenr)).toEqual(expect.arrayContaining(['712903', '725126']));
  });

  it('preserves selected aliases across grouping, filters and search', () => {
    const selected = ['725162__725121'];
    expect(resolve('all', 'consumables', '', selected).find(row => row.varenr === '725121')?.id).toBe(selected[0]);
    expect(resolve('Timan 3330', 'consumables', '725121', selected).find(row => row.varenr === '725121')?.id).toBe(selected[0]);
    expect(selected).toEqual(['725162__725121']);
  });

  it('searches exact SKU, localized product text and shared machine membership', () => {
    expect(resolve('all', 'consumables', '411866').filter(row => !row.isHeader).map(row => row.varenr)).toEqual(['411866']);
    expect(resolve('all', 'consumables', 'Rustbeskyttelse').filter(row => !row.isHeader).length).toBeGreaterThan(3);
    expect(resolve('all', 'consumables', 'børste').filter(row => !row.isHeader).length).toBeGreaterThan(3);
    expect(resolve('all', 'consumables', 'Timan 3330').filter(row => !row.isHeader).map(row => row.varenr)).toContain('725312');
    expect(resolve('all', 'consumables', 'no matching sku')).toEqual([]);
  });

  it('hidden products cannot win deduplication or leave empty group headings', () => {
    const rows = getLooseToolAccessories().map(row => ({ ...row, hidden: row.looseToolMachine === 'RC-751' || row.hidden }));
    expect(resolveLooseToolPresentation(rows, 'all', 'consumables', []).some(row => row.name === 'RC-751')).toBe(false);
  });

  it('an independently selected consumable uses the existing cart without its parent', () => {
    const item = resolve('Timan 3330', 'consumables', '725312').find(row => !row.isHeader)!;
    const { result } = renderHook(() => useConfigurator());
    act(() => result.current.setState(state => ({ ...state, flowType: 'quote', step: 3,
      machineConfigs: [{ id: 'm0', type: LOOSE_TOOL_KEY, qty: 1, configMode: 'shared', acc: [] }] })));
    act(() => result.current.toggleAcc(item.id));
    expect(result.current.state.machineConfigs[0].acc).toEqual([item.id]);
    expect(result.current.calcResult?.lineItems).toContainEqual(expect.objectContaining({
      varenr: item.varenr, price: getPriceForCurrency(item, 'DKK'),
    }));
  });
});

describe('loose-tool filter controls', () => {
  it('renders separate categories, established machine filters and responsive wrapping', () => {
    const changes: string[] = [];
    const { container } = render(<LooseToolFilters category="consumables" machine={null} search=""
      onCategory={value => changes.push(value)} onMachine={value => changes.push(value)}
      onSearch={value => changes.push(value)} translate={t} />);
    expect(screen.getByRole('button', { name: 'Forbrugsvarer' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'RC-751' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'RC-1000s' }));
    fireEvent.click(screen.getByRole('button', { name: 'Redskaber' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '411866' } });
    expect(changes).toEqual(['RC-1000S', 'attachments', '411866']);
    expect(container.querySelectorAll('[role="group"].flex-wrap')).toHaveLength(2);
    expect(screen.getByRole('searchbox')).toHaveClass('min-w-0', 'w-full');
  });

  it.each(['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'])('localizes category/search controls in %s', lang => {
    for (const key of ['looseAssortmentAll', 'looseAssortmentAttachments', 'looseAssortmentConsumables', 'looseAssortmentSearch']) expect(t(key, lang)).not.toBe(key);
  });
});
