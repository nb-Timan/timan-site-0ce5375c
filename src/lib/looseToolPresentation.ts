import type { Accessory, ConfiguratorLocale, SubItem } from '@/types/configurator';
import { CONSUMABLE_ASSORTMENT, CONSUMABLE_GROUPS, consumableGroups, isLooseConsumable, type LooseToolCategory } from '@/data/looseToolAssortment';
import { getLocalizedName } from '@/data/machines';

export const LOOSE_TOOL_MACHINE_FILTERS = ['all', 'RC-1000S', 'Timan 3330', 'Timan 2620'] as const;
export type LooseToolMachineFilter = typeof LOOSE_TOOL_MACHINE_FILTERS[number] | 'RC-751';

/** Deduplicate presentation only; the full catalog retains every selection/parent ID. */
export function filterLooseToolAccessories(
  catalog: Accessory[],
  filter: LooseToolMachineFilter,
  selectedIds: readonly string[],
): Accessory[] {
  const candidates = catalog.filter(item => filter === 'all' || item.looseToolMachine === filter);
  const selected = new Set(selectedIds);
  type Row = Accessory | SubItem;
  const winners = new Map<string, { item: Row; rank: number }>();
  const key = (item: Row) => String(item.varenr || item.id).trim().toUpperCase();
  const structural = (item: Row) => 'isHeader' in item && item.isHeader
    || 'isProductGroup' in item && item.isProductGroup;

  const visit = (item: Row) => {
    if ('hidden' in item && item.hidden) return;
    if (!structural(item)) {
      const parentId = 'requires' in item ? item.requires : 'parentId' in item ? item.parentId : undefined;
      const rank = selected.has(item.id) ? 2 : parentId && selected.has(parentId) ? 1 : 0;
      const previous = winners.get(key(item));
      if (!previous || rank > previous.rank) winners.set(key(item), { item, rank });
    }
    item.subItems?.forEach(visit);
  };
  candidates.forEach(visit);

  const visible = <T extends Row>(item: T): T[] => {
    if ('hidden' in item && item.hidden) return [];
    if (!structural(item) && winners.get(key(item))?.item !== item) return [];
    return [item.subItems
      ? { ...item, subItems: item.subItems.flatMap(sub => visible(sub)) }
      : item];
  };
  return candidates.flatMap(item => visible(item));
}

export function resolveLooseToolPresentation(
  catalog: Accessory[],
  filter: LooseToolMachineFilter,
  category: LooseToolCategory,
  selectedIds: readonly string[],
  search = '',
  language: ConfiguratorLocale = 'da',
): Accessory[] {
  const query = search.trim().toLocaleLowerCase();
  const matches = (item: Accessory) => !query || [
    item.varenr, getLocalizedName(item.name, language),
    ...consumableGroups(item.varenr), item.looseToolMachine || '',
  ].some(value => value.toLocaleLowerCase().includes(query));

  // Flatten only the loose consumables presentation, never the normal machine catalog.
  const flatten = (items: (Accessory | SubItem)[], source?: Accessory): Accessory[] =>
    items.flatMap(item => {
      const row = item as Accessory;
      const context = {
        ...row,
        looseToolMachine: row.looseToolMachine ?? source?.looseToolMachine,
        sourceMachineType: row.sourceMachineType ?? source?.sourceMachineType ?? source?.looseToolMachine,
      };
      return [context, ...flatten(item.subItems || [], context)];
    });
  const candidates = flatten(catalog).filter(item => !item.isHeader && !item.isProductGroup
    && !item.hidden && isLooseConsumable(item.varenr)
    && (filter === 'all' || consumableGroups(item.varenr).includes(filter)));
  const consumables = filterLooseToolAccessories(
    candidates.map(item => ({ ...item, subItems: undefined, sectionStart: undefined })), 'all', selectedIds,
  ).filter(matches);
  const grouped: Accessory[] = [];
  for (const group of CONSUMABLE_GROUPS) {
    const rows = consumables.filter(item =>
      (filter !== 'all' ? filter : consumableGroups(item.varenr)[0]) === group);
    if (!rows.length) continue;
    rows.sort((a, b) => CONSUMABLE_ASSORTMENT[group].indexOf(a.varenr) - CONSUMABLE_ASSORTMENT[group].indexOf(b.varenr));
    grouped.push({
      id: 'CONSUMABLE_GROUP_' + group, varenr: '', priceDKK: 0, priceEUR: 0, isHeader: true,
      name: group === 'RC-1000S' ? 'RC-1000s' : group === 'Loader Line' ? 'Loader-Line / CS-200' : group,
    }, ...rows);
  }
  if (category === 'consumables') return grouped;

  const prune = <T extends Accessory | SubItem>(item: T): T[] => {
    if (isLooseConsumable(item.varenr)) return [];
    const children = item.subItems?.flatMap(child => prune(child));
    if ('isProductGroup' in item && item.isProductGroup && !children?.length) return [];
    if (!('isHeader' in item && item.isHeader) && !children?.length && !matches(item as Accessory)) return [];
    return [{ ...item, ...(children ? { subItems: children } : {}) }];
  };
  const attachments = filterLooseToolAccessories(catalog, filter, selectedIds).flatMap(item => prune(item));
  // Remove section headings that no longer have a visible commercial row.
  const visibleAttachments = attachments.filter((item, index) => !item.isHeader
    || attachments.slice(index + 1).find(next => !next.isHeader) !== undefined);
  return category === 'attachments' ? visibleAttachments : [...visibleAttachments, ...grouped];
}
