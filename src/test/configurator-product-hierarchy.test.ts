import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCESSORIES, getAccessoriesFlat, getLocalizedName, PRODUCTS } from '@/data/machines';
import { t } from '@/data/translations';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { toggleConfiguratorAccessory } from '@/lib/configuratorDomain';
import {
  DEFAULT_CONFIGURATOR_PRODUCT_RELATIONS,
  buildConfiguratorProductHierarchy,
  replaceConfiguratorProductRelations,
  selectedVariantParent,
} from '@/lib/configuratorProductHierarchy';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import type { Accessory, ConfiguratorState } from '@/types/configurator';

const LANGUAGES: PortalUiLanguage[] = ['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs'];

function group(itemNumber: string): Accessory {
  return ACCESSORIES['Timan 3330'].find((item) => item.varenr === itemNumber)!;
}

function state(selected: string[] = []): ConfiguratorState {
  return {
    ...createEmptyConfiguratorState('da', 'quote'),
    pricingMode: 'direct',
    machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'shared', acc: selected }],
  };
}

describe('canonical T2/T3 product hierarchy', () => {
  it('exposes two top-level family products and exactly two variants under each', () => {
    const t2 = group('720131');
    const t3 = group('331122');
    const rootOrder = ACCESSORIES['Timan 3330']
      .filter((item) => item.isProductGroup)
      .map((item) => item.varenr);
    expect(rootOrder).toEqual(['720131', '331122']);
    expect(t2.isProductGroup).toBe(true);
    expect(t3.isProductGroup).toBe(true);
    expect(t2.subItems?.map((item) => item.varenr)).toEqual(['720125', '720130']);
    expect(t3.subItems?.map((item) => item.varenr)).toEqual(['720132', '720133']);
    expect(ACCESSORIES['Timan 3330'].filter((item) => ['720125', '720130', '720132', '720133'].includes(item.varenr))).toHaveLength(0);
  });

  it('keeps T2 before T3 when canonical relation rows arrive in another order', () => {
    const reversedRelations = [...DEFAULT_CONFIGURATOR_PRODUCT_RELATIONS].reverse();
    const variants = ['720125', '720130', '720132', '720133']
      .map((itemNumber) => getAccessoriesFlat('Timan 3330').find((item) => item.varenr === itemNumber)!)
      .filter(Boolean);
    const parents = Object.fromEntries(['720131', '331122'].map((itemNumber) => [itemNumber, group(itemNumber)]));

    replaceConfiguratorProductRelations(reversedRelations);
    try {
      const hierarchy = buildConfiguratorProductHierarchy('Timan 3330', variants, parents);
      expect(hierarchy.filter((item) => item.isProductGroup).map((item) => item.varenr)).toEqual(['720131', '331122']);
    } finally {
      replaceConfiguratorProductRelations(DEFAULT_CONFIGURATOR_PRODUCT_RELATIONS);
    }
  });

  it.each(['720125', '720130', '720132', '720133'])('%s exposes the two canonical optional children', (itemNumber) => {
    const variant = getAccessoriesFlat('Timan 3330').find((item) => item.varenr === itemNumber)!;
    expect(variant.subItems?.map((item) => item.varenr)).toEqual(['721122', 'V34-029']);
  });

  it('keeps T2 variants mutually exclusive and preserves compatible selected options', () => {
    let current = toggleConfiguratorAccessory(state(), '720125', 0).state;
    current = toggleConfiguratorAccessory(current, '721122_720125', 0).state;
    current = toggleConfiguratorAccessory(current, 'V34-029_720125', 0).state;
    current = toggleConfiguratorAccessory(current, '720130', 0).state;
    expect(current.machineConfigs[0].acc).toEqual(expect.arrayContaining([
      '720130', '721122_720130', 'V34-029_720130',
    ]));
    expect(current.machineConfigs[0].acc).not.toEqual(expect.arrayContaining([
      '720125', '721122_720125', 'V34-029_720125',
    ]));
  });

  it.each(['720125', '720130'])('keeps both T2 alternatives visible after selecting %s', (selectedVariant) => {
    const current = toggleConfiguratorAccessory(state(), selectedVariant, 0).state;
    expect(current.machineConfigs[0].acc.filter((id) => ['720125', '720130'].includes(id))).toEqual([selectedVariant]);
    expect(group('720131').subItems?.map((item) => item.varenr)).toEqual(['720125', '720130']);
  });

  it('keeps T3 variants mutually exclusive', () => {
    let current = toggleConfiguratorAccessory(state(), '720132', 0).state;
    current = toggleConfiguratorAccessory(current, '721122_720132', 0).state;
    current = toggleConfiguratorAccessory(current, '720133', 0).state;
    expect(current.machineConfigs[0].acc).toContain('720133');
    expect(current.machineConfigs[0].acc).not.toContain('720132');
    expect(current.machineConfigs[0].acc).not.toContain('721122_720132');
    expect(current.machineConfigs[0].acc).toContain('721122_720133');
  });

  it.each(['720132', '720133'])('keeps both T3 alternatives visible after selecting %s', (selectedVariant) => {
    const current = toggleConfiguratorAccessory(state(), selectedVariant, 0).state;
    expect(current.machineConfigs[0].acc.filter((id) => ['720132', '720133'].includes(id))).toEqual([selectedVariant]);
    expect(group('331122').subItems?.map((item) => item.varenr)).toEqual(['720132', '720133']);
  });

  it('uses checkbox styling while keeping canonical single-select behaviour', () => {
    const configurator = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    const variantRenderer = configurator.slice(
      configurator.indexOf('const renderSubItem'),
      configurator.indexOf('// ======== Confirmation modal builder'),
    );
    expect(variantRenderer).toContain('rounded border-2');
    expect(variantRenderer).toContain('d="M5 13l4 4L19 7"');
    expect(variantRenderer).not.toContain("isVariant ? 'rounded-full'");
    expect(variantRenderer).not.toContain('h-2 w-2 rounded-full');
    expect(variantRenderer).toContain('renderNestedOptions && (isSelected || (isLooseToolMode(machineType) && !isVariant)) && hasNestedSubs');

    const productGroupRenderer = configurator.slice(
      configurator.indexOf('if (a.isProductGroup)'),
      configurator.indexOf('// Qty input items'),
    );
    const variantsIndex = productGroupRenderer.indexOf('a.subItems?.map((variant) => renderSubItem(variant, selectedIds, machineType, 1, false))');
    const sharedOptionsIndex = productGroupRenderer.indexOf('data-testid={`product-group-shared-options-${a.varenr}`}');
    expect(variantsIndex).toBeGreaterThan(-1);
    expect(sharedOptionsIndex).toBeGreaterThan(variantsIndex);
    expect(productGroupRenderer).toContain('activeVariant.subItems.map((option) => renderSubItem(option as SubItem, selectedIds, machineType, 2))');
    expect(productGroupRenderer).not.toContain('a.subItems?.filter');
  });

  it.each([
    ['720131', '720125', '720130'],
    ['331122', '720132', '720133'],
  ])('renders one shared options section after both %s variants', (rootItemNumber, firstVariant, secondVariant) => {
    const productGroup = group(rootItemNumber);
    expect(productGroup.subItems?.map((item) => item.varenr)).toEqual([firstVariant, secondVariant]);
    expect(productGroup.subItems?.[0].subItems?.map((item) => item.varenr)).toEqual(['721122', 'V34-029']);
    expect(productGroup.subItems?.[1].subItems?.map((item) => item.varenr)).toEqual(['721122', 'V34-029']);

    const configurator = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    const productGroupRenderer = configurator.slice(
      configurator.indexOf('if (a.isProductGroup)'),
      configurator.indexOf('// Qty input items'),
    );
    expect(productGroupRenderer.match(/product-group-shared-options/g)).toHaveLength(1);
  });

  it('prices only the selected commercial child and each optional line once', () => {
    const configured = state(['720125', '721122_720125', 'V34-029_720125']);
    const result = calculateConfiguration(configured);
    const selected = result.lineItems.filter((line) => ['720131', '720125', '721122', 'V34-029'].includes(line.varenr));
    expect(selected.map((line) => line.varenr)).toEqual(['720125', '721122', 'V34-029']);
    expect(selected.map((line) => line.price)).toEqual([94_860, 3_100, 6_600]);
    expect(result.subtotal).toBe(PRODUCTS['Timan 3330'].priceDKK + 94_860 + 3_100 + 6_600);
  });

  it.each([
    ['720125', '720131'], ['720130', '720131'], ['720132', '331122'], ['720133', '331122'],
  ])('hydrates a flat saved %s selection under parent %s without rewriting it', (variant, parent) => {
    const normalized = normalizeConfiguratorState(state([variant]));
    expect(normalized.machineConfigs[0].acc).toEqual([variant]);
    expect(selectedVariantParent('Timan 3330', [variant])).toBe(parent);
  });

  it.each(LANGUAGES)('resolves hierarchy labels in %s without returning a key or Danish fallback', (language) => {
    expect(t('chooseVariant', language)).not.toBe('chooseVariant');
    expect(t('variantWithoutPressureHose', language)).not.toBe('variantWithoutPressureHose');
    expect(t('variantWithPressureHose', language)).not.toBe('variantWithPressureHose');
    expect(getLocalizedName(group('720131').name, language)).toBeTruthy();
    expect(getLocalizedName(group('331122').name, language)).toBeTruthy();
    if (language !== 'da') expect(t('chooseVariant', language)).not.toBe(t('chooseVariant', 'da'));
  });

  it('keeps normal, Messe and Academy on the shared ConfiguratorPage', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const messe = readFileSync('src/pages/messe/MesseWrappers.tsx', 'utf8');
    const academy = readFileSync('src/pages/AcademyPage.tsx', 'utf8');
    expect(app).toContain('<ConfiguratorPage />');
    expect(messe).toContain('return <ConfiguratorPage />;');
    expect(academy).toContain("navigate('/configurator?academy_mode=true');");
  });

  it('ships the canonical relation read model without a duplicate price source', () => {
    const migration = readFileSync('supabase/migrations/20261007055020_configurator_product_hierarchy.sql', 'utf8');
    expect(migration).toContain('create table if not exists public.configurator_product_relations');
    expect(migration).toContain('alter table public.configurator_product_relations enable row level security');
    expect(migration).toContain('list_published_configurator_product_relations');
    const relationTable = migration.slice(
      migration.indexOf('create table if not exists public.configurator_product_relations'),
      migration.indexOf('alter table public.configurator_product_relations'),
    );
    expect(relationTable).not.toContain('price_dkk');
  });
});
