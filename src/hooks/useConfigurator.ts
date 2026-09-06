import { useState, useCallback, useMemo } from 'react';
import { ConfiguratorState, Language, FlowType, DeliveryMethod, CalcResult, LineItem, DiscountDetail } from '@/types/configurator';
import { PRODUCTS, ACCESSORIES, getAccessoriesFlat, getPrice, getLocalizedName, ACC_ID_WIRE_HARNESS, ACC_ID_VPLOW, ACC_ID_WEEDBRUSH, ACC_ID_FLASH_LIGHT, ACC_ID_WORK_LIGHT, ACC_ID_OIL_NORMAL, ACC_ID_OIL_BIO, LOOSE_TOOL_KEY, DEMO_ELIGIBLE_VARENR, DEMO_FEE_DKK, DEMO_FEE_EUR, PACKAGING_COST_ID, PACKAGING_TRIGGER_IDS, getLooseToolAccessories } from '@/data/machines';
import { createEmptyConfiguratorState, normalizeConfiguratorState } from '@/lib/configuratorState';
import { t } from '@/data/translations';
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
  const [rawState, setRawState] = useState<ConfiguratorState>(createEmptyConfiguratorState());

  const state = useMemo(() => normalizeConfiguratorState(rawState), [rawState]);

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
        config = { id: `m${configs.length}`, type: machineType, qty: 0, configMode: 'individual', acc: [] };
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
  const calcResult = useMemo((): CalcResult | null => {
    const allUnits = getGlobalMachineUnits();
    if (allUnits.length === 0) return null;
    const lang = state.language;
    const T = (key: string) => t(key, lang);

    let subtotal = 0;
    const lineItems: LineItem[] = [];

    // Track per-unit subtotals and demo status
    const unitSubtotals: { unitNumber: number; total: number; isDemo: boolean; modelType: string; isDiscountEligible: boolean }[] = [];

    allUnits.forEach(unit => {
      const mach = PRODUCTS[unit.modelType];
      if (!mach) return;
      const machPrice = getPrice(mach, state.language);
      lineItems.push({ txt: `${T('machineLabel')} ${unit.unitNumber} (${getLocalizedName(mach.name, state.language)})`, price: machPrice, varenr: mach.varenr, bold: true, isMachine: true, index: unit.unitNumber });
      let unitTotal = machPrice;

      // Get selected accessories
      let accIds: string[] = [];
      if (unit.isSharedUnit) {
        const mc = state.machineConfigs.find(c => c.id === unit.modelId);
        accIds = mc?.acc || [];
      } else {
        accIds = state.individualUnitConfigs[unit.configKey]?.acc || [];
      }

      const flatAccs = getAccessoriesFlat(unit.modelType);
      const selectedAccs = flatAccs.filter(a => accIds.includes(a.id) && !a.isHeader);

      // Include qty-input items that have qty > 0 even if not toggled (e.g. sidekost børster).
      // Their parent (`requires`) must still be selected for them to count.
      const qtyOnlyAccs = flatAccs.filter(a => {
        if (!a.isQtyInput || a.isHeader) return false;
        if (accIds.includes(a.id)) return false; // already counted via selectedAccs
        if (a.requires && !accIds.includes(a.requires)) return false; // parent not selected
        const q = state.accQty[`${unit.configKey}_${a.id}`] || 0;
        return q > 0;
      });

      [...selectedAccs, ...qtyOnlyAccs].forEach(a => {
        const qty = state.accQty[`${unit.configKey}_${a.id}`] || 1;
        const accPrice = getPrice(a, state.language) * qty;
        unitTotal += accPrice;
        const label = getLocalizedName(a.name, state.language);
        lineItems.push({
          txt: `- ${label}${qty > 1 ? ` x${qty}` : ''}`,
          price: accPrice,
          varenr: a.varenr,
          sub: true,
          isAutoAdded: !!a.hidden,
        });
      });

      // Check if this unit is marked as demo and add demo fee to its subtotal
      const demoKey = `${mach.varenr}_${unit.unitNumber}`;
      const isDemo = !!state.demoMachines[demoKey];
      if (isDemo) {
        const demoFee = lang === 'da' ? DEMO_FEE_DKK : DEMO_FEE_EUR;
        unitTotal += demoFee;
        lineItems.push({
          txt: `- ${T('demoMachineLabel')}`,
          price: demoFee,
          varenr: 'DEMO',
          sub: true,
        });
      }

      subtotal += unitTotal;
      lineItems.push({ txt: `${T('subtotalMachine')} ${unit.unitNumber}:`, price: unitTotal, varenr: 'SUBTOTAL', subtotal: true, index: unit.unitNumber });

      unitSubtotals.push({ unitNumber: unit.unitNumber, total: unitTotal, isDemo, modelType: unit.modelType, isDiscountEligible: mach.isDiscountEligible === true });
    });

    // Startup pricing for "Timan leverer"
    if (state.deliveryMethod === 'deliver' && state.deliveryDeliverStartup) {
      let startupPrice = 0;
      let startupTxt = '';
      if (state.deliveryDeliverStartup === 'no_bridge') {
        startupPrice = lang === 'da' ? 1500 : 200;
        startupTxt = T('startupNoBridgeCalc');
      } else if (state.deliveryDeliverStartup === 'with_bridge') {
        startupPrice = lang === 'da' ? 2500 : 335;
        startupTxt = T('startupWithBridgeCalc');
      } else {
        startupPrice = 0;
        startupTxt = T('startupOtherCalc');
      }
      lineItems.push({ txt: `- ${startupTxt}`, price: startupPrice, varenr: '795050', sub: true });
      subtotal += startupPrice;
    }

    // Split into demo vs non-demo subtotals
    const demoSubtotal = unitSubtotals.filter(u => u.isDemo).reduce((sum, u) => sum + u.total, 0);
    const nonDemoSubtotal = subtotal - demoSubtotal; // includes startup costs with non-demo
    const discountEligibleQty = unitSubtotals.filter(u => !u.isDemo && u.isDiscountEligible).length;
    const discountEligibleSubtotal = unitSubtotals
      .filter(u => !u.isDemo && u.isDiscountEligible)
      .reduce((sum, u) => sum + u.total, 0);

    // Discount chain
    let disc = 0;
    const details: DiscountDetail[] = [];
    let price = subtotal;

    // --- Demo machines: fixed 32.5% total discount ---
    if (demoSubtotal > 0) {
      const demoDisc = demoSubtotal * 0.325;
      price -= demoDisc;
      disc += demoDisc;
      details.push({ txt: T('demoDiscount'), amount: demoDisc });
    }

    // --- Non-demo machines: normal discount chain ---
    if (nonDemoSubtotal > 0) {
      // 1. Base discount (25% default, 30% for importør — Phase 63).
      const baseDiscountPct = typeof state.baseDiscountPct === 'number' ? state.baseDiscountPct : 0.25;
      const basePctLabel = Math.round(baseDiscountPct * 1000) / 10; // 25, 30, 27.5 ...
      const d1 = nonDemoSubtotal * baseDiscountPct;
      price -= d1;
      disc += d1;
      const baseLabelRaw = T('baseDiscountLabel');
      const baseLabel = /\(\s*\d+(?:[.,]\d+)?\s*%\s*\)/.test(baseLabelRaw)
        ? baseLabelRaw.replace(/\(\s*\d+(?:[.,]\d+)?\s*%\s*\)/, `(${basePctLabel}%)`)
        : `${baseLabelRaw} (${basePctLabel}%)`;
      details.push({ txt: baseLabel, amount: d1 });

      // 2. Qty discount (based only on non-demo discount-eligible real machines)
      let qtyPct = discountEligibleQty >= 4 ? 0.04 : (discountEligibleQty >= 2 ? 0.02 : 0);
      let qtyDiscountAmount = 0;
      if (qtyPct > 0) {
        const eligibleBaseDiscount = discountEligibleSubtotal * baseDiscountPct;
        const d2 = (discountEligibleSubtotal - eligibleBaseDiscount) * qtyPct;
        qtyDiscountAmount = d2;
        price -= d2;
        disc += d2;
        details.push({ txt: `${T('qtyDiscountLabel')} (${qtyPct * 100}%)`, amount: d2, varenr: '795043' });
      }

      // 3. Delivery discount
      let delActive = false;
      if (state.date) {
        const threeMonths = new Date();
        threeMonths.setMonth(threeMonths.getMonth() + 3);
        const deliveryDate = new Date(state.date);
        if (deliveryDate > threeMonths) delActive = true;
      }
      if (delActive) {
        const nonDemoDiscSoFar = d1 + qtyDiscountAmount;
        const d3 = (nonDemoSubtotal - nonDemoDiscSoFar) * 0.02;
        price -= d3;
        disc += d3;
        details.push({ txt: `${T('deliveryDiscountLabel')} (2%)`, amount: d3, varenr: '795045' });
      }
    }

    // 4. Manual dealer discount (on remaining price)
    if (state.step === 4 && state.manualDealerDiscountPct > 0) {
      const d4 = (subtotal - disc) * (state.manualDealerDiscountPct / 100);
      price -= d4;
      disc += d4;
      details.push({ txt: `${T('extraDealerDiscountLabel')} (${state.manualDealerDiscountPct}%)`, amount: d4, varenr: '795042' });
    }

    const totalPct = subtotal > 0 ? (disc / subtotal) * 100 : 0;
    const qtyPct = discountEligibleQty >= 4 ? 0.04 : (discountEligibleQty >= 2 ? 0.02 : 0);

    return { lineItems, subtotal, discountDetails: details, totalDiscount: disc, currentPrice: price, totalPct, qtyPct };
  }, [state, getGlobalMachineUnits]);

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
