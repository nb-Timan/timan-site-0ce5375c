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
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import {
  EMPTY_CONTENT,
  listMarketingConfiguratorCatalog,
  saveMarketingConfiguratorContent,
} from '@/lib/marketingConfiguratorContentService';
import { shouldRenderAccessory } from '@/lib/looseToolDependencies';
import { publishedProduct } from '@/lib/publishedProductMaster';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { listVideoProductOptions } from '@/lib/videoProductCatalog';

const RETIRED_SAFETY_KIT = '712187';

const activateRetirement = () => replacePublishedConfiguratorPrices([{
  item_number: RETIRED_SAFETY_KIT,
  item_text_da: 'Sikkerhedskit førstehjælp og trekant.',
  item_text_en: 'Safety kit: first aid and warning triangle',
  item_text_de: 'Sicherheitskit: Erste Hilfe und Warndreieck',
  item_text_it: 'Kit sicurezza: primo soccorso e triangolo',
  item_text_hu: 'Biztonsági készlet: elsősegély és elakadásjelző háromszög',
  price_dkk: 1250,
  price_eur: 160,
  is_active: false,
}]);

const state = () => ({
  ...createEmptyConfiguratorState('da'),
  machineConfigs: [{
    id: 'm0',
    type: 'Timan 3330',
    qty: 1,
    configMode: 'shared' as const,
    acc: [RETIRED_SAFETY_KIT],
  }],
});

afterEach(() => {
  cleanup();
  act(() => clearPublishedConfiguratorPricesForTest());
});

it('keeps 712187 as an inactive historical Product Master identity', () => {
  activateRetirement();
  expect(publishedProduct(RETIRED_SAFETY_KIT)).toMatchObject({
    item_number: RETIRED_SAFETY_KIT,
    price_dkk: 1250,
    price_eur: 160,
    is_active: false,
  });

  const historicalItem = getAccessoriesFlat('Timan 3330')
    .find(item => item.varenr === RETIRED_SAFETY_KIT)!;
  expect(historicalItem).toBeDefined();
  expect(historicalItem.hidden).toBe(true);
});

it('excludes 712187 from every current Product Master-backed catalog and search source', () => {
  activateRetirement();
  const item = getAccessoriesFlat('Timan 3330')
    .find(accessory => accessory.varenr === RETIRED_SAFETY_KIT)!;

  expect(shouldRenderAccessory('Timan 3330', item, [])).toBe(false);
  expect(buildConfiguratorSeed().some(row => row.item_number === RETIRED_SAFETY_KIT)).toBe(false);
  expect(listMarketingConfiguratorCatalog().some(row => row.itemNumber === RETIRED_SAFETY_KIT)).toBe(false);
  expect(listVideoProductOptions().some(row => row.itemNumber === RETIRED_SAFETY_KIT)).toBe(false);

  for (const neighbour of ['712176', '712180']) {
    const currentItem = getAccessoriesFlat('Timan 3330').find(accessory => accessory.varenr === neighbour)!;
    expect(currentItem).toBeDefined();
    expect(shouldRenderAccessory('Timan 3330', currentItem, [])).toBe(true);
  }
});

it('blocks stale add attempts and published Marketing content for 712187', async () => {
  activateRetirement();
  const { result } = renderHook(() => useConfigurator());
  act(() => result.current.setState({
    ...state(),
    machineConfigs: [{ ...state().machineConfigs[0], acc: [] }],
  }));
  act(() => result.current.toggleAcc(RETIRED_SAFETY_KIT));
  expect(result.current.state.machineConfigs[0].acc).toEqual([]);

  await expect(saveMarketingConfiguratorContent({
    productKey: `Timan 3330::${RETIRED_SAFETY_KIT}`,
    machineKey: 'Timan 3330',
    itemNumber: RETIRED_SAFETY_KIT,
  }, EMPTY_CONTENT, 'published')).resolves.toMatchObject({
    row: null,
    error: expect.stringContaining(RETIRED_SAFETY_KIT),
  });
});

it.each(['quote', 'order'] as const)('preserves 712187 description, price and PDF in a historical %s', async flowType => {
  const historical = await finalizeConfiguratorPricingSnapshot({ ...state(), flowType });
  const frozen = JSON.stringify(historical);
  activateRetirement();

  const document = buildSubmittedOrderDocument(historical);
  expect(document.lines.find(line => line.itemNo === RETIRED_SAFETY_KIT)).toMatchObject({
    description: 'Sikkerhedskit førstehjælp og trekant.',
    unitPrice: 1250,
    total: 1250,
  });
  expect(await finalizeConfiguratorPricingSnapshot(historical)).toEqual(historical);

  const pdf = buildConfiguratorPdf({
    jsPDF,
    state: historical,
    calcResult: document.calcResult,
    flowType,
    quoteNumber: flowType === 'quote' ? 'QA-T' : null,
    orderNumber: flowType === 'order' ? 'QA-O' : null,
    showPrices: true,
    uiLanguage: 'da',
    contentLanguage: 'da',
    T: key => t(key, 'da'),
    TC: key => t(key, 'da'),
  });
  expect(pdf.output()).toContain(RETIRED_SAFETY_KIT);
  expect(JSON.stringify(historical)).toBe(frozen);
});

it('uses the shared filtered Configurator in Portal, Academy and Messe', () => {
  const messe = readFileSync('src/pages/messe/MesseWrappers.tsx', 'utf8');
  const academy = readFileSync('src/pages/AcademyPage.tsx', 'utf8');
  expect(messe).toContain('return <ConfiguratorPage />;');
  expect(academy).toContain("navigate('/configurator?academy_mode=true');");
});

it('ships an additive inactive Product Master migration without rewriting history', () => {
  const migration = readFileSync(
    'supabase/migrations/20261008102144_retire_712187_safety_kit.sql',
    'utf8',
  );
  expect(migration).toContain("'712187'");
  expect(migration).toContain('is_active');
  expect(migration).toContain('false');
  expect(migration).not.toMatch(/delete\s+from/i);
  expect(migration).not.toMatch(/update\s+public\.configurations/i);
  expect(migration).not.toMatch(/update\s+public\.configuration_items/i);
  expect(migration).not.toMatch(/update\s+public\.price_list_published/i);
  expect(migration).not.toMatch(/delete\s+from\s+public\.marketing_configurator_product_content/i);
});
