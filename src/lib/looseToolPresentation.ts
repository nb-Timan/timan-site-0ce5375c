import type { Accessory, SubItem } from '@/types/configurator';

export const LOOSE_TOOL_MACHINE_FILTERS = ['all', 'RC-751', 'RC-1000S', 'Timan 3330', 'Timan 2620'] as const;
export type LooseToolMachineFilter = typeof LOOSE_TOOL_MACHINE_FILTERS[number];

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
