import { useState, useCallback, useMemo, useEffect } from 'react';
import { useProductMasterRevision } from '@/hooks/useProductMasterRevision';
import { isProductActive } from '@/lib/publishedProductMaster';
import { academySandbox } from '@/lib/academySandbox';
import { academyScopedStorageKey } from '@/lib/academyCycleStorage';
import { ConfiguratorState, Language, FlowType, DeliveryMethod, CalcResult } from '@/types/configurator';
import { PRODUCTS, ACCESSORIES, getAccessoriesFlat, getPrice, getLocalizedName, ACC_ID_WIRE_HARNESS, ACC_ID_VPLOW, ACC_ID_WEEDBRUSH, ACC_ID_FLASH_LIGHT, ACC_ID_WORK_LIGHT, ACC_ID_OIL_NORMAL, ACC_ID_OIL_BIO, LOOSE_TOOL_KEY, DEMO_ELIGIBLE_VARENR, PACKAGING_COST_ID, PACKAGING_TRIGGER_IDS, getLooseToolAccessories } from '@/data/machines';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import { shouldEnforceAccessoryParentDependency } from '@/lib/looseToolDependencies';
import { hasFrozenConfiguratorPricing } from '@/lib/configuratorPricing';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { useCampaignRevision } from '@/lib/configuratorCampaigns';
import { useMarketingBadgeClock } from '@/lib/marketingBadgeSchedule';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { toast } from 'sonner';

// Items capped at max 1 selection per varenr across the whole configuration
const SINGLETON_VARENR = new Set(['721059', '721122']);

function getVarenrForAccId(modelType: string, accId: string): string | null {
  const flat = getAccessoriesFlat(modelType);
  const found = flat.find(a => a.id === accId);
  return found ? String(found.varenr || '') : null;
}

function countSelectionsForVarenr(state: ConfiguratorState, targetVarenr: string): number {
  let count = 0;
  for (const mc of state.machineConfigs) {
    if (mc.configMode === 'shared') {
      for (const id of mc.acc) {
        const v = getVarenrForAccId(mc.type, id);
        if (v === targetVarenr) count++;
      }
    } else {
      for (let i = 1; i <= mc.qty; i++) {
        const key = `${mc.id}_${i}`;
        const list = state.individualUnitConfigs[key]?.acc || [];
        for (const id of list) {
          const v = getVarenrForAccId(mc.type, id);
          if (v === targetVarenr) count++;
        }
      }
    }
  }
  return count;
}

type ConfiguratorStateUpdate =
  | ConfiguratorState
  | Partial<ConfiguratorState>
  | undefined
  | ((prev: ConfiguratorState) => ConfiguratorState | Partial<ConfiguratorState> | undefined);

export function useConfigurator() {
  const [rawState, setRawState] = useState<ConfiguratorState>(() => {
    if (academySandbox.isActive()) {
      try {
        const saved = localStorage.getItem(academyScopedStorageKey('timan.academy.configurator.v1'));
        if (saved) return normalizeConfiguratorState(JSON.parse(saved));
      } catch { /* Invalid local drafts start with the canonical empty state. */ }
    }
    return createEmptyConfiguratorState();
  });

  const state = useMemo(() => normalizeConfiguratorState(rawState), [rawState]);

  useEffect(() => {
    if (academySandbox.isActive()) localStorage.setItem(academyScopedStorageKey('timan.academy.configurator.v1'), JSON.stringify(state));
  }, [state]);

  const setState = useCallback((next: ConfiguratorStateUpdate) => {
    setRawState(prev => {
      const safePrev = normalizeConfiguratorState(prev);
      const resolved = typeof next === 'function'
        ? (next as (prev: ConfiguratorState) => ConfiguratorState | Partial<ConfiguratorState> | undefined)(safePrev)
        : next;

      return normalizeConfiguratorState(resolved);
    });
  }, []);

  const setStep = useCallback((step: number) => setState(s => ({ ...s, step })), []);
  const setLanguage = useCallback((language: Language) => setState(s => ({ ...s, language })), []);
  const setFlowType = useCallback((flowType: FlowType) => setState(s => ({ ...s, flowType })), []);
  const setDeliveryMethod = useCallback((deliveryMethod: DeliveryMethod | '') => setState(s => ({ ...s, deliveryMethod })), []);
  const setDate = useCallback((date: string) => setState(s => ({ ...s, date })), []);

  const setCustomerField = useCallback((field: string, value: string) => {
    setState(s => ({ ...s, [field]: value }));
  }, []);

  // Machine qty from step 1
  const setMachineQty = useCallback((machineType: string, delta: number) => {
    setState(s => {
      const configs = [...s.machineConfigs];
      let config = configs.find(c => c.type === machineType);
      if (!config) {
        const usedIds = new Set(configs.map(item => item.id));
        let nextId = 0;
        while (usedIds.has(`m${nextId}`)) nextId += 1;
        config = { id: `m${nextId}`, type: machineType, qty: 0, configMode: 'individual', acc: [] };
        configs.push(config);
      }
      const newQty = Math.max(0, config.qty + delta);
      if (newQty === 0) {
        return { ...s, machineConfigs: configs.filter(c => c.type !== machineType), currentMachineIndex: 0 };
      }
      config.qty = newQty;
      return { ...s, machineConfigs: configs, currentMachineIndex: 0 };
    });
  }, []);

  const setConfigMode = useCallback((machineType: string, mode: 'shared' | 'individual') => {
    setState(s => {
      const configs = s.machineConfigs.map(c => c.type === machineType ? { ...c, configMode: mode } : c);
      return { ...s, machineConfigs: configs };
    });
  }, []);

  // Get all machine units
  const getGlobalMachineUnits = useCallback(() => {
    const units: Array<{ globalIndex: number; modelId: string; modelType: string; configKey: string; isSharedUnit: boolean; isBaseUnit: boolean; unitNumber: number }> = [];
    let globalIndex = 0;
    state.machineConfigs.forEach(mc => {
      const isShared = mc.configMode === 'shared';
      for (let i = 1; i <= mc.qty; i++) {
        units.push({
          globalIndex,
          modelId: mc.id,
          modelType: mc.type,
          configKey: isShared ? mc.id : `${mc.id}_${i}`,
          isSharedUnit: isShared,
          isBaseUnit: isShared ? (i === 1) : true,
          unitNumber: globalIndex + 1,
        });
        globalIndex++;
      }
    });
    return units;
  }, [state.machineConfigs]);

  const getDisplayMachineUnits = useCallback(() => {
    return getGlobalMachineUnits().filter(u => u.isBaseUnit);
  }, [getGlobalMachineUnits]);

  // Toggle accessory
  const toggleAcc = useCallback((accId: string) => {
    setState(s => {
      const allUnits = (() => {
        const units: Array<{ globalIndex: number; modelId: string; modelType: string; configKey: string; isSharedUnit: boolean; isBaseUnit: boolean; unitNumber: number }> = [];
        let gi = 0;
        s.machineConfigs.forEach(mc => {
          const isShared = mc.configMode === 'shared';
          for (let i = 1; i <= mc.qty; i++) {
            units.push({ globalIndex: gi, modelId: mc.id, modelType: mc.type, configKey: isShared ? mc.id : `${mc.id}_${i}`, isSharedUnit: isShared, isBaseUnit: isShared ? (i === 1) : true, unitNumber: gi + 1 });
            gi++;
          }
        });
        return units;
      })();

      const unit = allUnits[s.currentMachineIndex];
      if (!unit) return s;

      // Per-varenr max-1 guard for 721059 and 721122 across the whole configuration.
      // Resolves accId → varenr (covers generated ids like 721122_<parentId>).
      // Removal is always allowed; only adding is blocked when the varenr is already selected once.
      const clickedVarenr = getVarenrForAccId(unit.modelType, accId);
      const selectedAccessories = unit.isSharedUnit
        ? s.machineConfigs.find(c => c.id === unit.modelId)?.acc || []
        : s.individualUnitConfigs[unit.configKey]?.acc || [];
      if (!selectedAccessories.includes(accId) && !isProductActive(clickedVarenr)) return s;
      if (clickedVarenr && SINGLETON_VARENR.has(clickedVarenr)) {
        const currentList = unit.isSharedUnit
          ? (s.machineConfigs.find(c => c.id === unit.modelId)?.acc || [])
          : (s.individualUnitConfigs[unit.configKey]?.acc || []);
        const isAdding = !currentList.includes(accId);
        if (isAdding && countSelectionsForVarenr(s, clickedVarenr) >= 1) {
          toast.error('Dette varenummer kan kun vælges én gang pr. ordre.');
          return s;
        }
      }

      const newState = { ...s, machineConfigs: [...s.machineConfigs], individualUnitConfigs: { ...s.individualUnitConfigs } };

      let accList: string[];
      if (unit.isSharedUnit) {
        const mc = newState.machineConfigs.find(c => c.id === unit.modelId);
        if (!mc) return s;
        accList = [...mc.acc];
        const wasSelected = accList.includes(accId);

        // Group logic
        const flatAccs = getAccessoriesFlat(unit.modelType);
        const clickedItem = flatAccs.find(a => a.id === accId);
        // Recursively remove all dependents (requires + parentId)
        const removeDependents = (parentId: string) => {
          if (!shouldEnforceAccessoryParentDependency(unit.modelType)) return;
          flatAccs.filter(a => a.requires === parentId || (a as any).parentId === parentId).forEach(dep => {
            const di = accList.indexOf(dep.id);
            if (di !== -1) {
              accList.splice(di, 1);
              removeDependents(dep.id);
            }
          });
        };
        if (clickedItem?.group) {
          // Remove items in same group and any hidden dependents they control.
          flatAccs.filter(a => a.group === clickedItem.group).forEach(a => {
            const gi = accList.indexOf(a.id);
            if (gi !== -1) {
              accList.splice(gi, 1);
              removeDependents(a.id);
            }
          });
        }

        if (!wasSelected) {
          accList.push(accId);
        } else {
          const idx = accList.indexOf(accId);
          if (idx !== -1) accList.splice(idx, 1);
          removeDependents(accId);
        }

        // Wire harness auto-add logic for RC-1000S
        if (unit.modelType === 'RC-1000S') {
          const hasLight = accList.includes(ACC_ID_FLASH_LIGHT) || accList.includes(ACC_ID_WORK_LIGHT);
          const hasAttach = accList.includes(ACC_ID_VPLOW) || accList.includes(ACC_ID_WEEDBRUSH) || accList.includes('418000');
          const needWire = hasLight && hasAttach;
          const hasWire = accList.includes(ACC_ID_WIRE_HARNESS);
          if (needWire && !hasWire) accList.push(ACC_ID_WIRE_HARNESS);
          if (!needWire && hasWire) {
            const wi = accList.indexOf(ACC_ID_WIRE_HARNESS);
            if (wi !== -1) accList.splice(wi, 1);
          }
        }

        // Packaging cost logic for loose tool
        if (unit.modelType === LOOSE_TOOL_KEY) {
          const triggerCount = accList.filter(x => PACKAGING_TRIGGER_IDS.includes(String(x))).length;
          // Remove existing packaging items
          for (let i = accList.length - 1; i >= 0; i--) {
            if (String(accList[i]) === String(PACKAGING_COST_ID)) accList.splice(i, 1);
          }
          // Add one per trigger
          for (let i = 0; i < triggerCount; i++) accList.push(String(PACKAGING_COST_ID));
        }

        mc.acc = accList;
      } else {
        const configKey = unit.configKey;
        if (!newState.individualUnitConfigs[configKey]) {
          newState.individualUnitConfigs[configKey] = { acc: [] };
        }
        accList = [...newState.individualUnitConfigs[configKey].acc];
        const wasSelected = accList.includes(accId);

        const flatAccs = getAccessoriesFlat(unit.modelType);
        const clickedItem = flatAccs.find(a => a.id === accId);
        // Recursively remove all dependents (requires + parentId)
        const removeDependents = (parentId: string) => {
          if (!shouldEnforceAccessoryParentDependency(unit.modelType)) return;
          flatAccs.filter(a => a.requires === parentId || (a as any).parentId === parentId).forEach(dep => {
            const di = accList.indexOf(dep.id);
            if (di !== -1) {
              accList.splice(di, 1);
              removeDependents(dep.id);
            }
          });
        };
        if (clickedItem?.group) {
          flatAccs.filter(a => a.group === clickedItem.group).forEach(a => {
            const gi = accList.indexOf(a.id);
            if (gi !== -1) {
              accList.splice(gi, 1);
              removeDependents(a.id);
            }
          });
        }

        if (!wasSelected) accList.push(accId);
        else {
          const idx = accList.indexOf(accId);
          if (idx !== -1) accList.splice(idx, 1);
          removeDependents(accId);
        }

        if (unit.modelType === 'RC-1000S') {
          const hasLight = accList.includes(ACC_ID_FLASH_LIGHT) || accList.includes(ACC_ID_WORK_LIGHT);
          const hasAttach = accList.includes(ACC_ID_VPLOW) || accList.includes(ACC_ID_WEEDBRUSH) || accList.includes('418000');
          const needWire = hasLight && hasAttach;
          const hasWire = accList.includes(ACC_ID_WIRE_HARNESS);
          if (needWire && !hasWire) accList.push(ACC_ID_WIRE_HARNESS);
          if (!needWire && hasWire) {
            const wi = accList.indexOf(ACC_ID_WIRE_HARNESS);
            if (wi !== -1) accList.splice(wi, 1);
          }
        }

        // Packaging cost logic for loose tool
        if (unit.modelType === LOOSE_TOOL_KEY) {
          const triggerCount = accList.filter(x => PACKAGING_TRIGGER_IDS.includes(String(x))).length;
          for (let i = accList.length - 1; i >= 0; i--) {
            if (String(accList[i]) === String(PACKAGING_COST_ID)) accList.splice(i, 1);
          }
          for (let i = 0; i < triggerCount; i++) accList.push(String(PACKAGING_COST_ID));
        }

        newState.individualUnitConfigs[configKey] = { acc: accList };
      }
      return newState;
    });
  }, []);

  // Calculate prices
  const campaignRevision = useCampaignRevision();
  const productRevision = useProductMasterRevision();
  const campaignClock = useMarketingBadgeClock();
  const calcResult = useMemo((): CalcResult | null => {
    void productRevision;
    void campaignRevision;
    if (state.pricingSnapshot?.totalsOnly) return null;
    if (hasFrozenConfiguratorPricing(state)) {
      try { return buildSubmittedOrderDocument(state).calcResult; }
      catch { return null; }
    }
    if (!state.machineConfigs.length) return null;
    return calculateConfiguration(state, { now: campaignClock });
  }, [state, campaignRevision, campaignClock, productRevision]);

  const resetState = useCallback(() => {
    setState(prev => createEmptyConfiguratorState(prev.language));
  }, [setState]);

  return {
    state,
    setState,
    setStep,
    setLanguage,
    setFlowType,
    setDeliveryMethod,
    setDate,
    setCustomerField,
    setMachineQty,
    setConfigMode,
    toggleAcc,
    calcResult,
    getGlobalMachineUnits,
    getDisplayMachineUnits,
    resetState,
  };
}
