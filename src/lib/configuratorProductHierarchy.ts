import type { Accessory, SubItem } from '@/types/configurator';

export type ConfiguratorProductRelationType = 'variant' | 'option';

export interface ConfiguratorProductRelation {
  machine_type: string;
  parent_item_number: string;
  child_item_number: string;
  relation_type: ConfiguratorProductRelationType;
  selection_group: string | null;
  variant_label_key: string | null;
  sort_order: number;
}

/** Compatibility seed matching the additive canonical masterdata migration. */
export const DEFAULT_CONFIGURATOR_PRODUCT_RELATIONS: ConfiguratorProductRelation[] = [
  { machine_type: 'Timan 3330', parent_item_number: '720131', child_item_number: '720125', relation_type: 'variant', selection_group: 'collection_tank_t2', variant_label_key: 'variantWithoutPressureHose', sort_order: 10 },
  { machine_type: 'Timan 3330', parent_item_number: '720131', child_item_number: '720130', relation_type: 'variant', selection_group: 'collection_tank_t2', variant_label_key: 'variantWithPressureHose', sort_order: 20 },
  { machine_type: 'Timan 3330', parent_item_number: '720125', child_item_number: '721122', relation_type: 'option', selection_group: null, variant_label_key: null, sort_order: 10 },
  { machine_type: 'Timan 3330', parent_item_number: '720125', child_item_number: 'V34-029', relation_type: 'option', selection_group: null, variant_label_key: null, sort_order: 20 },
  { machine_type: 'Timan 3330', parent_item_number: '720130', child_item_number: '721122', relation_type: 'option', selection_group: null, variant_label_key: null, sort_order: 10 },
  { machine_type: 'Timan 3330', parent_item_number: '720130', child_item_number: 'V34-029', relation_type: 'option', selection_group: null, variant_label_key: null, sort_order: 20 },
  { machine_type: 'Timan 3330', parent_item_number: '331122', child_item_number: '720132', relation_type: 'variant', selection_group: 'collection_tank_t3', variant_label_key: 'variantWithoutPressureHose', sort_order: 10 },
  { machine_type: 'Timan 3330', parent_item_number: '331122', child_item_number: '720133', relation_type: 'variant', selection_group: 'collection_tank_t3', variant_label_key: 'variantWithPressureHose', sort_order: 20 },
  { machine_type: 'Timan 3330', parent_item_number: '720132', child_item_number: '721122', relation_type: 'option', selection_group: null, variant_label_key: null, sort_order: 10 },
  { machine_type: 'Timan 3330', parent_item_number: '720132', child_item_number: 'V34-029', relation_type: 'option', selection_group: null, variant_label_key: null, sort_order: 20 },
  { machine_type: 'Timan 3330', parent_item_number: '720133', child_item_number: '721122', relation_type: 'option', selection_group: null, variant_label_key: null, sort_order: 10 },
  { machine_type: 'Timan 3330', parent_item_number: '720133', child_item_number: 'V34-029', relation_type: 'option', selection_group: null, variant_label_key: null, sort_order: 20 },
];

let relations = [...DEFAULT_CONFIGURATOR_PRODUCT_RELATIONS];

export function replaceConfiguratorProductRelations(rows: ConfiguratorProductRelation[]): void {
  relations = rows.length > 0 ? [...rows] : [...DEFAULT_CONFIGURATOR_PRODUCT_RELATIONS];
}

export function configuratorProductRelations(machineType: string): ConfiguratorProductRelation[] {
  return relations.filter((row) => row.machine_type === machineType);
}

export function buildConfiguratorProductHierarchy(
  machineType: string,
  items: Accessory[],
  parentProducts: Record<string, Accessory>,
): Accessory[] {
  const machineRelations = configuratorProductRelations(machineType);
  const variantRelations = machineRelations.filter((row) => row.relation_type === 'variant');
  if (variantRelations.length === 0) return items;

  const variants = new Set(variantRelations.map((row) => row.child_item_number));
  const firstVariantIndex = items.findIndex((item) => variants.has(String(item.varenr)));
  if (firstVariantIndex < 0) return items;

  const byItemNumber = new Map(items.map((item) => [String(item.varenr), item]));
  const sourceOrder = new Map(items.map((item, index) => [String(item.varenr), index]));
  const parentNumbers = [...new Set(variantRelations.map((row) => row.parent_item_number))]
    .sort((left, right) => {
      const firstChildIndex = (parentItemNumber: string) => Math.min(
        ...variantRelations
          .filter((row) => row.parent_item_number === parentItemNumber)
          .map((row) => sourceOrder.get(row.child_item_number) ?? Number.MAX_SAFE_INTEGER),
      );
      return firstChildIndex(left) - firstChildIndex(right);
    });
  const groups = parentNumbers.map((parentItemNumber) => {
    const parent = parentProducts[parentItemNumber];
    if (!parent) return null;
    const children = variantRelations
      .filter((row) => row.parent_item_number === parentItemNumber)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((row): SubItem | null => {
        const source = byItemNumber.get(row.child_item_number);
        if (!source) return null;
        const optionRelations = machineRelations
          .filter((option) => option.relation_type === 'option' && option.parent_item_number === row.child_item_number)
          .sort((left, right) => left.sort_order - right.sort_order);
        const options = optionRelations.length > 0
          ? optionRelations.map((option) => source.subItems?.find((item) => item.varenr === option.child_item_number))
            .filter((item): item is SubItem => Boolean(item))
          : source.subItems || [];
        return {
          ...source,
          group: row.selection_group || undefined,
          relationType: 'variant',
          variantLabelKey: row.variant_label_key || undefined,
          subItems: options.map((option) => ({ ...option, relationType: 'option' })),
        };
      })
      .filter((item): item is SubItem => item !== null);
    return { ...parent, isProductGroup: true, subItems: children };
  }).filter((item): item is Accessory => item !== null);

  return [
    ...items.slice(0, firstVariantIndex),
    ...groups,
    ...items.slice(firstVariantIndex).filter((item) => !variants.has(String(item.varenr))),
  ];
}

export function selectedVariantParent(
  machineType: string,
  selectedItemNumbers: Iterable<string>,
): string | null {
  const selected = new Set(selectedItemNumbers);
  return configuratorProductRelations(machineType)
    .find((row) => row.relation_type === 'variant' && selected.has(row.child_item_number))
    ?.parent_item_number ?? null;
}
