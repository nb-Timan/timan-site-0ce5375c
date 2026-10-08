import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { jsPDF } from 'jspdf';
import {
  clearPublishedConfiguratorPricesForTest,
  getAccessoriesFlat,
  replacePublishedConfiguratorPrices,
} from '@/data/machines';
import { t } from '@/data/translations';
import { useConfigurator } from '@/hooks/useConfigurator';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { buildConfiguratorSeed } from '@/lib/configuratorPriceSeed';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { listMarketingConfiguratorCatalog } from '@/lib/marketingConfiguratorContentService';
import { shouldRenderAccessory } from '@/lib/looseToolDependencies';
import { publishedProduct } from '@/lib/publishedProductMaster';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { listVideoProductOptions } from '@/lib/videoProductCatalog';

const NEW_SNOW_BLOWER = '730016-00-SAM';
const OLD_SNOW_BLOWER = '730106';
const RETIRED_DOZER = '730105';

const activate = () => replacePublishedConfiguratorPrices([
  {
    item_number: NEW_SNOW_BLOWER,
    item_text_da: 'Sneslynge, 110 cm arbejdsbredde',
    item_text_en: 'Snow blower, 110 cm working width',
    item_text_de: 'Schneefräse, 110 cm Arbeitsbreite',
    price_dkk: 49_500,
    price_eur: 6_665,
    is_active: true,
  },
  { item_number: OLD_SNOW_BLOWER, item_text_da: 'Sneslynge, 110 cm arbejdsbredde', price_dkk: 49_500, price_eur: 6_665, is_active: false },
  { item_number: RETIRED_DOZER, item_text_da: 'Dozerblad 130 cm med gummiskær', price_dkk: 19_000, price_eur: 2_560, is_active: false },
]);

const state = (item: string) => ({
  ...createEmptyConfiguratorState('da'),
  machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'shared' as const, acc: item ? [item] : [] }],
});

afterEach(() => {
  cleanup();
  act(() => clearPublishedConfiguratorPricesForTest());
});

it('uses exactly one active current snow blower across Configurator, Price List and content catalogs', () => {
  activate();
  const catalog = getAccessoriesFlat('Timan 3330');
  const replacement = catalog.find(item => item.varenr === NEW_SNOW_BLOWER)!;

  expect(publishedProduct(NEW_SNOW_BLOWER)).toMatchObject({ is_active: true, price_dkk: 49_500, price_eur: 6_665 });
  expect(shouldRenderAccessory('Timan 3330', replacement, [])).toBe(true);
  expect(buildConfiguratorSeed().filter(item => [NEW_SNOW_BLOWER, OLD_SNOW_BLOWER, RETIRED_DOZER].includes(item.item_number)))
    .toEqual([expect.objectContaining({ item_number: NEW_SNOW_BLOWER, price_dkk: 49_500, price_eur: 6_665 })]);

  const marketingSkus = listMarketingConfiguratorCatalog().map(item => item.itemNumber);
  const videoSkus = listVideoProductOptions().map(item => item.itemNumber);
  expect(marketingSkus).toContain(NEW_SNOW_BLOWER);
  expect(videoSkus).toContain(NEW_SNOW_BLOWER);
  expect(marketingSkus).not.toContain(OLD_SNOW_BLOWER);
  expect(marketingSkus).not.toContain(RETIRED_DOZER);
  expect(videoSkus).not.toContain(OLD_SNOW_BLOWER);
  expect(videoSkus).not.toContain(RETIRED_DOZER);
});

it.each([OLD_SNOW_BLOWER, RETIRED_DOZER])('keeps %s for history but blocks it in every current shared Configurator flow', itemNumber => {
  activate();
  const historicalItem = getAccessoriesFlat('Timan 3330').find(item => item.varenr === itemNumber)!;
  expect(historicalItem).toBeDefined();
  expect(historicalItem.hidden).toBe(true);
  expect(shouldRenderAccessory('Timan 3330', historicalItem, [])).toBe(false);

  const { result } = renderHook(() => useConfigurator());
  act(() => result.current.setState(state('')));
  act(() => result.current.toggleAcc(itemNumber));
  expect(result.current.state.machineConfigs[0].acc).toEqual([]);
});

it.each([
  [OLD_SNOW_BLOWER, 'Sneslynge, 110 cm arbejdsbredde', 49_500],
  [RETIRED_DOZER, 'Dozerblad 130 cm med gummiskær', 19_000],
] as const)('preserves historical %s identity, price, order line and PDF', async (itemNumber, description, price) => {
  const historical = await finalizeConfiguratorPricingSnapshot({ ...state(itemNumber), flowType: 'order' });
  activate();

  const document = buildSubmittedOrderDocument(historical);
  expect(document.lines.find(line => line.itemNo === itemNumber)).toMatchObject({ description, unitPrice: price, total: price });
  expect(await finalizeConfiguratorPricingSnapshot(historical)).toEqual(historical);

  const pdf = buildConfiguratorPdf({
    jsPDF,
    state: historical,
    calcResult: document.calcResult,
    flowType: 'order',
    quoteNumber: null,
    orderNumber: 'QA-O',
    showPrices: true,
    uiLanguage: 'da',
    contentLanguage: 'da',
    T: key => t(key, 'da'),
    TC: key => t(key, 'da'),
  });
  expect(pdf.output()).toContain(itemNumber);
});

it('uses the same filtered Configurator for Portal, Academy and Messe', () => {
  const hierarchyTest = readFileSync('src/test/configurator-product-hierarchy.test.ts', 'utf8');
  const messe = readFileSync('src/pages/messe/MesseWrappers.tsx', 'utf8');
  const academy = readFileSync('src/pages/AcademyPage.tsx', 'utf8');
  expect(hierarchyTest).toContain('keeps normal, Messe and Academy on the shared ConfiguratorPage');
  expect(messe).toContain('return <ConfiguratorPage />;');
  expect(academy).toContain("navigate('/configurator?academy_mode=true');");
});

it('ships an additive migration that keeps old SKUs inactive and publishes only the replacement', () => {
  const migration = readFileSync('supabase/migrations/20261008100330_replace_3330_snow_blower_and_retire_dozer.sql', 'utf8');
  expect(migration).toContain("'730016-00-SAM', '730106'");
  expect(migration).toContain("where item_number = '730016-00-SAM'");
  expect(migration).toContain("('730106', 'Sneslynge, 110 cm arbejdsbredde'");
  expect(migration).toContain("('730105', 'Dozerblad 130 cm med gummiskær'");
  expect(migration).toContain('set is_active = false');
  expect(migration).not.toMatch(/delete\s+from/i);
  const searchMigration = readFileSync('supabase/migrations/20261008100727_remove_retired_snow_blower_search_alias.sql', 'utf8');
  expect(searchMigration).toContain('set renamed_from_item_number = null');
  expect(searchMigration).not.toMatch(/delete\s+from/i);
  const planningMigration = readFileSync('supabase/migrations/20261008101119_map_replacement_snow_blower_to_planning.sql', 'utf8');
  expect(planningMigration).toContain("('Timan 3330', '730016-00-SAM', '730016-00-SAM', false)");
  expect(planningMigration).toContain("('LOOSE_TOOL', '730016-00-SAM', '730016-00-SAM', false)");
});
