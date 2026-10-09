import {
  ACC_ID_FLASH_LIGHT,
  ACC_ID_VPLOW,
  ACC_ID_WEEDBRUSH,
  ACC_ID_WIRE_HARNESS,
  ACC_ID_WORK_LIGHT,
  LOOSE_TOOL_KEY,
  PACKAGING_COST_ID,
  PACKAGING_TRIGGER_IDS,
  getAccessoriesFlat,
} from '@/data/machines';
import { shouldEnforceAccessoryParentDependency } from '@/lib/looseToolDependencies';
import { isProductActive } from '@/lib/publishedProductMaster';
import type { ConfiguratorState } from '@/types/configurator';
import { normalizeMachineDeliveryAddresses } from '@/lib/configuratorDelivery';

const SINGLETON_VARENR = new Set(['721059', '721122']);

export interface ConfiguratorMachineUnit {
  globalIndex: number;
  modelId: string;
  modelType: string;
  configKey: string;
  isSharedUnit: boolean;
  isBaseUnit: boolean;
  unitNumber: number;
}

export interface ConfiguratorDomainResult {
  state: ConfiguratorState;
  changed: boolean;
  autoAdded: string[];
  autoRemoved: string[];
  blockedReason?: 'INACTIVE_PRODUCT' | 'SINGLETON_LIMIT' | 'UNKNOWN_UNIT';
}

function accessoryItemNumber(machineType: string, accessoryId: string): string | null {
  const accessory = getAccessoriesFlat(machineType).find((item) => item.id === accessoryId);
  return accessory ? String(accessory.varenr || '') : null;
}

function selectedAccessoryIds(state: ConfiguratorState, unit: ConfiguratorMachineUnit): string[] {
  if (unit.isSharedUnit) {
    return state.machineConfigs.find((machine) => machine.id === unit.modelId)?.acc || [];
  }
  return state.individualUnitConfigs[unit.configKey]?.acc || [];
}

function countSelectionsForItemNumber(state: ConfiguratorState, itemNumber: string): number {
  return getConfiguratorMachineUnits(state).reduce((count, unit) => (
    count + selectedAccessoryIds(state, unit)
      .filter((id) => accessoryItemNumber(unit.modelType, id) === itemNumber).length
  ), 0);
}

export function getConfiguratorMachineUnits(state: ConfiguratorState): ConfiguratorMachineUnit[] {
  const units: ConfiguratorMachineUnit[] = [];
  let globalIndex = 0;
  for (const machine of state.machineConfigs) {
    const isShared = machine.configMode === 'shared';
    for (let index = 1; index <= machine.qty; index += 1) {
      units.push({
        globalIndex,
        modelId: machine.id,
        modelType: machine.type,
        configKey: isShared ? machine.id : `${machine.id}_${index}`,
        isSharedUnit: isShared,
        isBaseUnit: !isShared || index === 1,
        unitNumber: globalIndex + 1,
      });
      globalIndex += 1;
    }
  }
  return units;
}

export function setConfiguratorMachineQuantity(
  state: ConfiguratorState,
  machineType: string,
  delta: number,
): ConfiguratorState {
  const configs = state.machineConfigs.map((machine) => ({ ...machine, acc: [...machine.acc] }));
  let config = configs.find((machine) => machine.type === machineType);
  if (!config) {
    const usedIds = new Set(configs.map((item) => item.id));
    let nextId = 0;
    while (usedIds.has(`m${nextId}`)) nextId += 1;
    config = { id: `m${nextId}`, type: machineType, qty: 0, configMode: 'individual', acc: [] };
    configs.push(config);
  }
  const nextQuantity = Math.max(0, config.qty + delta);
  if (nextQuantity === 0) {
    const next = { ...state, machineConfigs: configs.filter((machine) => machine.type !== machineType), currentMachineIndex: 0 };
    return { ...next, machineDeliveryAddresses: normalizeMachineDeliveryAddresses(next) };
  }
  config.qty = nextQuantity;
  const next = { ...state, machineConfigs: configs, currentMachineIndex: 0 };
  return { ...next, machineDeliveryAddresses: normalizeMachineDeliveryAddresses(next) };
}

export function setConfiguratorMode(
  state: ConfiguratorState,
  machineType: string,
  mode: 'shared' | 'individual',
): ConfiguratorState {
  return {
    ...state,
    machineConfigs: state.machineConfigs.map((machine) => (
      machine.type === machineType ? { ...machine, configMode: mode } : machine
    )),
  };
}

function removeDependents(machineType: string, accessories: string[], parentId: string): void {
  if (!shouldEnforceAccessoryParentDependency(machineType)) return;
  const flat = getAccessoriesFlat(machineType);
  flat.filter((item) => (
    item.requires === parentId
    || (item as typeof item & { parentId?: string }).parentId === parentId
  )).forEach((dependent) => {
    const index = accessories.indexOf(dependent.id);
    if (index !== -1) {
      accessories.splice(index, 1);
      removeDependents(machineType, accessories, dependent.id);
    }
  });
}

function applyAutomaticDependencies(machineType: string, accessories: string[]): void {
  if (machineType === 'RC-1000S') {
    const hasLight = accessories.includes(ACC_ID_FLASH_LIGHT) || accessories.includes(ACC_ID_WORK_LIGHT);
    const hasAttachment = accessories.includes(ACC_ID_VPLOW)
      || accessories.includes(ACC_ID_WEEDBRUSH)
      || accessories.includes('418000');
    const needsHarness = hasLight && hasAttachment;
    const harnessIndex = accessories.indexOf(ACC_ID_WIRE_HARNESS);
    if (needsHarness && harnessIndex === -1) accessories.push(ACC_ID_WIRE_HARNESS);
    if (!needsHarness && harnessIndex !== -1) accessories.splice(harnessIndex, 1);
  }

  if (machineType === LOOSE_TOOL_KEY) {
    const triggerCount = accessories.filter((id) => PACKAGING_TRIGGER_IDS.includes(String(id))).length;
    for (let index = accessories.length - 1; index >= 0; index -= 1) {
      if (String(accessories[index]) === String(PACKAGING_COST_ID)) accessories.splice(index, 1);
    }
    for (let index = 0; index < triggerCount; index += 1) accessories.push(String(PACKAGING_COST_ID));
  }
}

export function toggleConfiguratorAccessory(
  state: ConfiguratorState,
  accessoryId: string,
  unitIndex = state.currentMachineIndex,
): ConfiguratorDomainResult {
  const unit = getConfiguratorMachineUnits(state)[unitIndex];
  if (!unit) return { state, changed: false, autoAdded: [], autoRemoved: [], blockedReason: 'UNKNOWN_UNIT' };

  const before = [...selectedAccessoryIds(state, unit)];
  const wasSelected = before.includes(accessoryId);
  const itemNumber = accessoryItemNumber(unit.modelType, accessoryId);
  if (!wasSelected && !isProductActive(itemNumber)) {
    return { state, changed: false, autoAdded: [], autoRemoved: [], blockedReason: 'INACTIVE_PRODUCT' };
  }
  if (!wasSelected && itemNumber && SINGLETON_VARENR.has(itemNumber)
    && countSelectionsForItemNumber(state, itemNumber) >= 1) {
    return { state, changed: false, autoAdded: [], autoRemoved: [], blockedReason: 'SINGLETON_LIMIT' };
  }

  const next: ConfiguratorState = {
    ...state,
    machineConfigs: state.machineConfigs.map((machine) => ({ ...machine, acc: [...machine.acc] })),
    individualUnitConfigs: Object.fromEntries(Object.entries(state.individualUnitConfigs)
      .map(([key, value]) => [key, { acc: [...value.acc] }])),
  };
  const accessories = [...before];
  const flat = getAccessoriesFlat(unit.modelType);
  const clicked = flat.find((item) => item.id === accessoryId);
  const preservedCompatibleOptions = new Set<string>();

  const removeVariantOptions = (variantId: string, preserve: boolean) => {
    flat.filter((item) => item.parentId === variantId).forEach((option) => {
      const index = accessories.indexOf(option.id);
      if (index === -1) return;
      if (preserve) preservedCompatibleOptions.add(String(option.varenr || ''));
      accessories.splice(index, 1);
    });
  };

  if (clicked?.group) {
    flat.filter((item) => item.group === clicked.group).forEach((item) => {
      const index = accessories.indexOf(item.id);
      if (index !== -1) {
        accessories.splice(index, 1);
        if (item.relationType === 'variant') removeVariantOptions(item.id, !wasSelected);
        removeDependents(unit.modelType, accessories, item.id);
      }
    });
  }

  if (!wasSelected) {
    accessories.push(accessoryId);
    if (clicked?.relationType === 'variant' && preservedCompatibleOptions.size > 0) {
      flat.filter((item) => item.parentId === clicked.id && preservedCompatibleOptions.has(String(item.varenr || '')))
        .forEach((item) => accessories.push(item.id));
    }
  }
  else {
    const index = accessories.indexOf(accessoryId);
    if (index !== -1) accessories.splice(index, 1);
    if (clicked?.relationType === 'variant') removeVariantOptions(clicked.id, false);
    removeDependents(unit.modelType, accessories, accessoryId);
  }
  applyAutomaticDependencies(unit.modelType, accessories);

  if (unit.isSharedUnit) {
    const machine = next.machineConfigs.find((item) => item.id === unit.modelId);
    if (machine) machine.acc = accessories;
  } else {
    next.individualUnitConfigs[unit.configKey] = { acc: accessories };
  }

  const explicitChange = new Set([accessoryId]);
  const autoAdded = accessories.filter((id) => !before.includes(id) && !explicitChange.has(id));
  const autoRemoved = before.filter((id) => !accessories.includes(id) && !explicitChange.has(id));
  return {
    state: next,
    changed: before.length !== accessories.length || before.some((id, index) => accessories[index] !== id),
    autoAdded,
    autoRemoved,
  };
}
