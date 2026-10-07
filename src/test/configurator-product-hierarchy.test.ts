import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCESSORIES, getAccessoriesFlat, getLocalizedName, PRODUCTS } from '@/data/machines';
import { t } from '@/data/translations';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { toggleConfiguratorAccessory } from '@/lib/configuratorDomain';
import { selectedVariantParent } from '@/lib/configuratorProductHierarchy';
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
    expect(t2.isProductGroup).toBe(true);
    expect(t3.isProductGroup).toBe(true);
    expect(t2.subItems?.map((item) => item.varenr)).toEqual(['720125', '720130']);
    expect(t3.subItems?.map((item) => item.varenr)).toEqual(['720132', '720133']);
    expect(ACCESSORIES['Timan 3330'].filter((item) => ['720125', '720130', '720132', '720133'].includes(item.varenr))).toHaveLength(0);
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

  it('keeps T3 variants mutually exclusive', () => {
    let current = toggleConfiguratorAccessory(state(), '720132', 0).state;
    current = toggleConfiguratorAccessory(current, '720133', 0).state;
    expect(current.machineConfigs[0].acc).toContain('720133');
    expect(current.machineConfigs[0].acc).not.toContain('720132');
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
