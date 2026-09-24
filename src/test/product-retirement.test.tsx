import { afterEach, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { jsPDF } from 'jspdf';
import { clearPublishedConfiguratorPricesForTest, getAccessoriesFlat, getLocalizedName, replacePublishedConfiguratorPrices } from '@/data/machines';
import { t } from '@/data/translations';
import { publishedProduct } from '@/lib/publishedProductMaster';
import { listMarketingConfiguratorCatalog, resolveMarketingProductIdentity, saveMarketingConfiguratorContent, EMPTY_CONTENT } from '@/lib/marketingConfiguratorContentService';
import { buildConfiguratorSeed } from '@/lib/configuratorPriceSeed';
import { listVideoProductOptions } from '@/lib/videoProductCatalog';
import { shouldRenderAccessory } from '@/lib/looseToolDependencies';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { useConfigurator } from '@/hooks/useConfigurator';

const activate = () => replacePublishedConfiguratorPrices([
  { item_number: '730035', item_text_da: 'Skovl Timan 3330', item_text_en: 'Bucket Timan 3330', item_text_de: null, price_dkk: 12500, price_eur: 1695, is_active: true },
  { item_number: '730107', item_text_da: 'Skovl med hydraulisk tip', price_dkk: 19500, price_eur: 2625, is_active: false },
]);
const state = (item: string) => ({ ...createEmptyConfiguratorState('da'), machineConfigs: [
  { id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'shared' as const, acc: [item] },
] });
afterEach(() => { cleanup(); act(() => clearPublishedConfiguratorPricesForTest()); });

it('resolves the current shovel consistently in Product Master, Configurator and Marketing', () => {
  activate();
  expect(publishedProduct('730035')).toMatchObject({ price_dkk: 12500, price_eur: 1695, is_active: true });
  const shovel = getAccessoriesFlat('Timan 3330').find(item => item.varenr === '730035')!;
  expect(shouldRenderAccessory('Timan 3330', shovel, [])).toBe(true);
  expect(getLocalizedName(shovel.name, 'da')).toBe('Skovl Timan 3330');
  expect(getLocalizedName(shovel.name, 'en')).toBe('Bucket Timan 3330');
  expect(getLocalizedName(shovel.name, 'de')).toBe('Skovl Timan 3330');
  const rows = listMarketingConfiguratorCatalog().filter(item => item.machineKey === 'Timan 3330' && item.itemNumber === '730035');
  expect(rows).toHaveLength(1);
  expect(resolveMarketingProductIdentity('730035', rows[0].defaults).title).toBe('Skovl Timan 3330');
});

it('excludes the retired shovel from current selections while retaining its historical catalogue identity', () => {
  activate();
  for (const group of ['Timan 3330', 'LOOSE_TOOL']) {
    const old = getAccessoriesFlat(group).find(item => item.varenr === '730107')!;
    expect(old).toBeDefined();
    expect(shouldRenderAccessory(group, old, [])).toBe(false);
  }
  expect(listMarketingConfiguratorCatalog().some(item => item.itemNumber === '730107')).toBe(false);
  expect(listVideoProductOptions().some(item => item.itemNumber === '730107')).toBe(false);
  expect(buildConfiguratorSeed().some(item => item.item_number === '730107')).toBe(false);
});

it('blocks adding or publishing a retired item, including a stale unsent draft', async () => {
  activate();
  const { result } = renderHook(() => useConfigurator());
  act(() => result.current.setState(state('730035')));
  act(() => result.current.toggleAcc('730107'));
  expect(result.current.state.machineConfigs[0].acc).toEqual(['730035']);
  await expect(finalizeConfiguratorPricingSnapshot(state('730107'))).rejects.toThrow('730107');
  await expect(saveMarketingConfiguratorContent({ productKey: 'Timan 3330::730107', machineKey: 'Timan 3330', itemNumber: '730107' }, EMPTY_CONTENT, 'published')).resolves.toMatchObject({ row: null, error: expect.stringContaining('730107') });
});

it.each(['quote', 'order'] as const)('preserves the retired SKU, frozen price and text in a historical %s and PDF', async flowType => {
  const historical = await finalizeConfiguratorPricingSnapshot({ ...state('730107'), flowType });
  const before = JSON.stringify(historical);
  activate();
  const document = buildSubmittedOrderDocument(historical);
  expect(document.lines.find(line => line.itemNo === '730107')).toMatchObject({ description: 'Skovl med hydraulisk tip', unitPrice: 19500, total: 19500 });
  expect(document.lines.some(line => line.itemNo === '730035')).toBe(false);
  expect(await finalizeConfiguratorPricingSnapshot(historical)).toEqual(historical);
  const pdf = buildConfiguratorPdf({ jsPDF, state: historical, calcResult: document.calcResult, flowType, quoteNumber: 'QA-T', orderNumber: flowType === 'order' ? 'QA-O' : null, showPrices: true, uiLanguage: 'da', contentLanguage: 'da', T: key => t(key, 'da'), TC: key => t(key, 'da') });
  expect(pdf.output()).toContain('730107');
  expect(JSON.stringify(historical)).toBe(before);
});
