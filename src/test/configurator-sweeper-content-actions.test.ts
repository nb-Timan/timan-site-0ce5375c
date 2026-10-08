import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONFIGURATOR_ALWAYS_VISIBLE_CONTENT_ACTION_SKUS,
  listMarketingConfiguratorCatalog,
  marketingPresentationActions,
  resolveMarketingConfiguratorEditorItem,
} from '@/lib/marketingConfiguratorContentService';

const targetSkus = ['331122', '720131', '720132', '720133'] as const;
const configurator = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
const productGroupBranch = configurator.slice(
  configurator.indexOf('if (a.isProductGroup)'),
  configurator.indexOf('// Qty input items'),
);
const variantRenderer = configurator.slice(
  configurator.indexOf('const renderSubItem'),
  configurator.indexOf('const machineNames'),
);

describe('T2/T3 collection-tank content actions', () => {
  it.each(targetSkus)('keeps Video, Image and Specifikationer visible for %s without fake content', (sku) => {
    expect(CONFIGURATOR_ALWAYS_VISIBLE_CONTENT_ACTION_SKUS.has(sku)).toBe(true);
    expect(marketingPresentationActions(null, sku)).toEqual({
      video: true,
      image: true,
      information: true,
    });
  });

  it('keeps unrelated products on the existing content-driven visibility rule', () => {
    expect(marketingPresentationActions(null, 'UNRELATED')).toEqual({
      video: false,
      image: false,
      information: false,
    });
    expect(configurator).toContain('const showVideoAction = Boolean(videoUrl) || presentationActions.video');
    expect(configurator).toContain('const showImageAction = Boolean(imageUrl) || presentationActions.image');
  });

  it.each(targetSkus)('exposes %s through the canonical Marketing content editor catalog', (sku) => {
    const catalog = listMarketingConfiguratorCatalog('da');
    const item = catalog.find((candidate) => candidate.machineKey === 'Timan 3330' && candidate.itemNumber === sku);
    expect(item).toBeDefined();
    expect(resolveMarketingConfiguratorEditorItem(catalog, [], 'Timan 3330', item?.item.id)).toMatchObject({
      itemNumber: sku,
    });
  });

  it('renders main-product actions in the product-group content area', () => {
    expect(productGroupBranch).toContain('{renderActionLinks(a, machineType)}');
    expect(productGroupBranch).toContain('{marketingEditButton(machineType, a.id)}');
    expect(productGroupBranch.indexOf('{itemNoLabel(uiLanguage)}: {a.varenr}'))
      .toBeLessThan(productGroupBranch.indexOf('{renderActionLinks(a, machineType)}'));
  });

  it('renders variant actions directly after the item number', () => {
    expect(variantRenderer).toContain('{renderActionLinks(sub as any, machineType)}');
    expect(variantRenderer.indexOf('{itemNoLabel(uiLanguage)}: {sub.varenr}'))
      .toBeLessThan(variantRenderer.indexOf('{renderActionLinks(sub as any, machineType)}'));
  });

  it('keeps all populated actions inside the existing Portal flows', () => {
    expect(configurator).toContain('setProductVideoPreview({ url: videoUrl, title: productTitle })');
    expect(configurator).toContain('setProductImagePreview({ src: imageUrl, title: productTitle');
    expect(configurator).toContain('showSpecs(item.id!, machineType)');
    expect(configurator).toContain("toast.info(T('contentComingSoon'))");
  });
});
