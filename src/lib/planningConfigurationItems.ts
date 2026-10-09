import { getAccessoriesFlat } from '@/data/machines';
import { getConfiguratorMachineUnits } from '@/lib/configuratorDomain';
import type { ConfiguratorState } from '@/types/configurator';
import type { PlanningAvailabilityItem } from '@/hooks/usePlanningAvailability';

export function planningSelectedAttachments(state: ConfiguratorState): PlanningAvailabilityItem[] {
  const quantities = new Map<string, number>();
  for (const unit of getConfiguratorMachineUnits(state)) {
    const machine = state.machineConfigs.find((entry) => entry.id === unit.modelId);
    const selected = unit.isSharedUnit
      ? machine?.acc ?? []
      : state.individualUnitConfigs[unit.configKey]?.acc ?? [];
    for (const accessory of getAccessoriesFlat(unit.modelType)) {
      const itemNumber = String(accessory.varenr ?? '').trim();
      if (!itemNumber || itemNumber === 'HEADER') continue;
      const quantity = accessory.isQtyInput
        ? state.accQty[`${unit.configKey}_${accessory.id}`] ?? 0
        : selected.includes(accessory.id) ? 1 : 0;
      if (quantity > 0) quantities.set(itemNumber, (quantities.get(itemNumber) ?? 0) + quantity);
    }
  }
  return [...quantities].map(([itemNumber, quantity]) => ({ itemNumber, quantity }));
}
