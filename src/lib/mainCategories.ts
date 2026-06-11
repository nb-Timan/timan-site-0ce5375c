/**
 * Build the `main_categories` payload sent to the n8n quote/order webhooks.
 *
 * Each entry represents a selected main product/category as shown in the
 * portal — NOT accessories or sub-options. Quantities are aggregated across
 * configurator entries that share the same category.
 */

import type { ConfiguratorState } from '@/types/configurator';
import { LOOSE_TOOL_KEY } from '@/data/machines';

export interface MainCategoryLine {
  name: string;
  quantity: number;
}

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'RC-1000S': 'RC-1000s',
  'RC-751': 'RC-751',
  'Timan 3330': 'Timan 3330',
  'Timan 2620': 'Timan 2620',
  'Loader Line': 'Loader-Line & CS-200 Traktor',
  [LOOSE_TOOL_KEY]: 'Løs redskab',
};

export function mainCategoryDisplayName(type: string): string {
  return CATEGORY_DISPLAY_NAMES[type] ?? type;
}

export function buildMainCategories(state: ConfiguratorState): MainCategoryLine[] {
  const totals = new Map<string, number>();
  const order: string[] = [];
  for (const mc of state.machineConfigs ?? []) {
    const qty = Number(mc?.qty) || 0;
    if (qty <= 0) continue;
    const name = mainCategoryDisplayName(mc.type);
    if (!totals.has(name)) order.push(name);
    totals.set(name, (totals.get(name) ?? 0) + qty);
  }
  return order.map((name) => ({ name, quantity: totals.get(name) ?? 0 }));
}
