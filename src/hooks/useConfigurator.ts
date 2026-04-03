import { useState, useCallback, useMemo } from 'react';
import { ConfiguratorState, Language, FlowType, DeliveryMethod, CalcResult, LineItem, DiscountDetail } from '@/types/configurator';
import { PRODUCTS, ACCESSORIES, getAccessoriesFlat, getPrice, getLocalizedName, ACC_ID_WIRE_HARNESS, ACC_ID_VPLOW, ACC_ID_WEEDBRUSH, ACC_ID_FLASH_LIGHT, ACC_ID_WORK_LIGHT, ACC_ID_OIL_NORMAL, ACC_ID_OIL_BIO, LOOSE_TOOL_KEY, DEMO_ELIGIBLE_VARENR, DEMO_FEE_DKK, DEMO_FEE_EUR, PACKAGING_COST_ID, PACKAGING_TRIGGER_IDS, getLooseToolAccessories } from '@/data/machines';

const initialState: ConfiguratorState = {
  step: 1,
  flowType: 'quote',
  language: 'da',
  machineConfigs: [],
  individualUnitConfigs: {},
  ralCodes: {},
  accQty: {},
  date: '',
  deliveryMethod: '',
  deliveryDeliverStartup: null,
  manualDealerDiscountPct: 0,
  demoMachines: {},
  reqNumbers: {},
  currentMachineIndex: 0,
  firmanavn: '',
  kontaktperson: '',
  telefon: '',
  email: '',
  emailRecipient: '',
  comment: '',
};

export function useConfigurator() {
  const [state, setState] = useState<ConfiguratorState>(initialState);

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

      const newState = { ...s, machineConfigs: [...s.machineConfigs], individualUnitConfigs: { ...s.individualUnitConfigs } };

      let accList: string[];
      if (unit.isSharedUnit) {
        const mc = newState.machineConfigs.find(c => c.id === unit.modelId);
        if (!mc) return s;
        accList = [...mc.acc];
        const idx = accList.indexOf(accId);

        // Group logic
        const flatAccs = getAccessoriesFlat(unit.modelType);
        const clickedItem = flatAccs.find(a => a.id === accId);
        if (clickedItem?.group) {
          // Remove other items in same group
          flatAccs.filter(a => a.group === clickedItem.group).forEach(a => {
            const gi = accList.indexOf(a.id);
            if (gi !== -1) accList.splice(gi, 1);
          });
        }

        if (idx === -1) {
          accList.push(accId);
        } else {
          accList.splice(idx, 1);
          // Remove dependents
          flatAccs.filter(a => a.requires === accId).forEach(dep => {
            const di = accList.indexOf(dep.id);
            if (di !== -1) accList.splice(di, 1);
          });
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
        const idx = accList.indexOf(accId);

        const flatAccs = getAccessoriesFlat(unit.modelType);
        const clickedItem = flatAccs.find(a => a.id === accId);
        if (clickedItem?.group) {
          flatAccs.filter(a => a.group === clickedItem.group).forEach(a => {
            const gi = accList.indexOf(a.id);
            if (gi !== -1) accList.splice(gi, 1);
          });
        }

        if (idx === -1) accList.push(accId);
        else {
          accList.splice(idx, 1);
          flatAccs.filter(a => a.requires === accId).forEach(dep => {
            const di = accList.indexOf(dep.id);
            if (di !== -1) accList.splice(di, 1);
          });
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

    let subtotal = 0;
    const lineItems: LineItem[] = [];
    const totalMachineQty = allUnits.filter(u => u.modelType !== LOOSE_TOOL_KEY).length;

    allUnits.forEach(unit => {
      const mach = PRODUCTS[unit.modelType];
      if (!mach) return;
      const machPrice = getPrice(mach, state.language);
      lineItems.push({ txt: `Maskine ${unit.unitNumber} (${getLocalizedName(mach.name, state.language)})`, price: machPrice, varenr: mach.varenr, bold: true, isMachine: true, index: unit.unitNumber });
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

      selectedAccs.forEach(a => {
        const qty = state.accQty[`${unit.configKey}_${a.id}`] || 1;
        const accPrice = getPrice(a, state.language) * qty;
        unitTotal += accPrice;
        if (!a.hidden) {
          lineItems.push({ txt: `- ${getLocalizedName(a.name, state.language)}${qty > 1 ? ` x${qty}` : ''}`, price: accPrice, varenr: a.varenr, sub: true });
        }
      });

      subtotal += unitTotal;
      lineItems.push({ txt: `Subtotal Maskine ${unit.unitNumber}:`, price: unitTotal, varenr: 'SUBTOTAL', subtotal: true, index: unit.unitNumber });
    });

    // DK: Startup pricing for "Timan leverer"
    if (state.language === 'da' && state.deliveryMethod === 'deliver' && state.deliveryDeliverStartup) {
      let startupPrice = 0;
      let startupTxt = '';
      if (state.deliveryDeliverStartup === 'no_bridge') {
        startupPrice = 1500;
        startupTxt = 'Vare nr 795050 – Opstart af maskine / uden bro';
      } else if (state.deliveryDeliverStartup === 'with_bridge') {
        startupPrice = 2500;
        startupTxt = 'Vare nr 795050 – Opstart af maskine / med bro';
      } else {
        startupPrice = 0;
        startupTxt = 'Vare nr 795050 – Opstart af maskine / Anden aftale (se kommentar)';
      }
      lineItems.push({ txt: `- ${startupTxt}`, price: startupPrice, varenr: '795050', sub: true });
      subtotal += startupPrice;
    }

    // Discount chain
    let disc = 0;
    const details: DiscountDetail[] = [];
    let price = subtotal;

    // 1. Base discount 25%
    const d1 = subtotal * 0.25;
    price -= d1; disc += d1;
    details.push({ txt: `Grund rabat (25%)`, amount: d1 });

    // 2. Qty discount
    let qtyPct = totalMachineQty >= 4 ? 0.04 : (totalMachineQty >= 2 ? 0.02 : 0);
    if (qtyPct > 0) {
      const d2 = (subtotal - d1) * qtyPct;
      price -= d2; disc += d2;
      details.push({ txt: `Stk. rabat (${qtyPct * 100}%)`, amount: d2 });
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
      const d3 = (subtotal - disc) * 0.02;
      price -= d3; disc += d3;
      details.push({ txt: `Leveringsrabat over 3 mdr. (2%)`, amount: d3 });
    }

    // 4. Manual dealer discount
    if (state.step === 4 && state.manualDealerDiscountPct > 0) {
      const d4 = (subtotal - disc) * (state.manualDealerDiscountPct / 100);
      price -= d4; disc += d4;
      details.push({ txt: `Ekstra forhandlerrabat (${state.manualDealerDiscountPct}%)`, amount: d4 });
    }

    const totalPct = subtotal > 0 ? (disc / subtotal) * 100 : 0;

    return { lineItems, subtotal, discountDetails: details, totalDiscount: disc, currentPrice: price, totalPct, qtyPct };
  }, [state, getGlobalMachineUnits]);

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
  };
}
