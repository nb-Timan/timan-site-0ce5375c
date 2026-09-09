import { LOOSE_TOOL_KEY } from '@/data/machines';
import type { Accessory } from '@/types/configurator';

export function isLooseToolMode(machineType: string): boolean {
  return machineType === LOOSE_TOOL_KEY;
}

export function shouldEnforceAccessoryParentDependency(machineType: string): boolean {
  return !isLooseToolMode(machineType);
}

export function shouldRenderAccessory(machineType: string, accessory: Accessory, selectedIds: string[]): boolean {
  if (accessory.hidden) return false;
  return !shouldEnforceAccessoryParentDependency(machineType)
    || !accessory.requires
    || selectedIds.includes(accessory.requires);
}

export function shouldIncludeQuantityAccessory(
  machineType: string,
  accessory: Accessory,
  selectedIds: string[],
  quantity: number,
): boolean {
  if (!accessory.isQtyInput || accessory.isHeader || selectedIds.includes(accessory.id)) return false;
  if (shouldEnforceAccessoryParentDependency(machineType) && accessory.requires && !selectedIds.includes(accessory.requires)) return false;
  return quantity > 0;
}
