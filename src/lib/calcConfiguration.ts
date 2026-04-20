import { ConfiguratorState } from '@/types/configurator';
import { PRODUCTS, getAccessoriesFlat, getPrice, LOOSE_TOOL_KEY } from '@/data/machines';

/**
 * Pure calculation of subtotal, total discount and final price for a saved configuration.
 * Mirrors the logic in useConfigurator.calcResult but works on any ConfiguratorState
 * snapshot (used by AccountPanel statistics).
 */
export function calcConfigurationTotals(state: ConfiguratorState): {
  subtotal: number;
  totalDiscount: number;
  finalPrice: number;
} {
  if (!state || !Array.isArray(state.machineConfigs) || state.machineConfigs.length === 0) {
    return { subtotal: 0, totalDiscount: 0, finalPrice: 0 };
  }

  // Build units
  type Unit = { modelId: string; modelType: string; configKey: string; isSharedUnit: boolean; unitNumber: number };
  const units: Unit[] = [];
  let gi = 0;
  state.machineConfigs.forEach(mc => {
    const isShared = mc.configMode === 'shared';
    for (let i = 1; i <= mc.qty; i++) {
      units.push({
        modelId: mc.id,
        modelType: mc.type,
        configKey: isShared ? mc.id : `${mc.id}_${i}`,
        isSharedUnit: isShared,
        unitNumber: gi + 1,
      });
      gi++;
    }
  });

  if (units.length === 0) return { subtotal: 0, totalDiscount: 0, finalPrice: 0 };

  let subtotal = 0;
  const unitSubtotals: { unitNumber: number; total: number; isDemo: boolean; modelType: string }[] = [];

  units.forEach(unit => {
    const mach = PRODUCTS[unit.modelType];
    if (!mach) return;
    const machPrice = getPrice(mach, state.language);
    let unitTotal = machPrice;

    let accIds: string[] = [];
    if (unit.isSharedUnit) {
      const mc = state.machineConfigs.find(c => c.id === unit.modelId);
      accIds = mc?.acc || [];
    } else {
      accIds = state.individualUnitConfigs?.[unit.configKey]?.acc || [];
    }

    const flatAccs = getAccessoriesFlat(unit.modelType);
    const selectedAccs = flatAccs.filter(a => accIds.includes(a.id) && !a.isHeader);

    // Also include qty-input items with qty > 0 whose parent (requires) is selected
    const qtyOnlyAccs = flatAccs.filter(a => {
      if (!a.isQtyInput || a.isHeader) return false;
      if (accIds.includes(a.id)) return false;
      if (a.requires && !accIds.includes(a.requires)) return false;
      const q = state.accQty?.[`${unit.configKey}_${a.id}`] || 0;
      return q > 0;
    });

    [...selectedAccs, ...qtyOnlyAccs].forEach(a => {
      const qty = state.accQty?.[`${unit.configKey}_${a.id}`] || 1;
      unitTotal += getPrice(a, state.language) * qty;
    });

    subtotal += unitTotal;

    const demoKey = `${mach.varenr}_${unit.unitNumber}`;
    const isDemo = !!state.demoMachines?.[demoKey];
    unitSubtotals.push({ unitNumber: unit.unitNumber, total: unitTotal, isDemo, modelType: unit.modelType });
  });

  // Startup pricing for "Timan leverer"
  if (state.deliveryMethod === 'deliver' && state.deliveryDeliverStartup) {
    let startupPrice = 0;
    if (state.deliveryDeliverStartup === 'no_bridge') {
      startupPrice = state.language === 'da' ? 1500 : 200;
    } else if (state.deliveryDeliverStartup === 'with_bridge') {
      startupPrice = state.language === 'da' ? 2500 : 335;
    }
    subtotal += startupPrice;
  }

  const demoSubtotal = unitSubtotals.filter(u => u.isDemo).reduce((s, u) => s + u.total, 0);
  const nonDemoSubtotal = subtotal - demoSubtotal;
  const nonDemoMachineCount = unitSubtotals.filter(u => !u.isDemo && u.modelType !== LOOSE_TOOL_KEY).length;

  let disc = 0;
  let price = subtotal;

  if (demoSubtotal > 0) {
    const demoDisc = demoSubtotal * 0.325;
    price -= demoDisc;
    disc += demoDisc;
  }

  if (nonDemoSubtotal > 0) {
    const d1 = nonDemoSubtotal * 0.25;
    price -= d1;
    disc += d1;

    const qtyPct = nonDemoMachineCount >= 4 ? 0.04 : (nonDemoMachineCount >= 2 ? 0.02 : 0);
    if (qtyPct > 0) {
      const d2 = (nonDemoSubtotal - d1) * qtyPct;
      price -= d2;
      disc += d2;
    }

    let delActive = false;
    if (state.date) {
      const threeMonths = new Date();
      threeMonths.setMonth(threeMonths.getMonth() + 3);
      const deliveryDate = new Date(state.date);
      if (deliveryDate > threeMonths) delActive = true;
    }
    if (delActive) {
      const qPct = nonDemoMachineCount >= 4 ? 0.04 : (nonDemoMachineCount >= 2 ? 0.02 : 0);
      const nonDemoDiscSoFar = d1 + (qPct > 0 ? (nonDemoSubtotal - d1) * qPct : 0);
      const d3 = (nonDemoSubtotal - nonDemoDiscSoFar) * 0.02;
      price -= d3;
      disc += d3;
    }
  }

  if ((state.manualDealerDiscountPct || 0) > 0) {
    const d4 = (subtotal - disc) * ((state.manualDealerDiscountPct || 0) / 100);
    price -= d4;
    disc += d4;
  }

  return { subtotal, totalDiscount: disc, finalPrice: Math.max(0, price) };
}

/**
 * Format a money amount based on language. DK shows DKK, others EUR.
 */
export function formatMoney(amount: number, language: string): string {
  const isDk = language === 'da';
  const locale = { da: 'da-DK', en: 'en-GB', de: 'de-DE', it: 'it-IT', hu: 'hu-HU' }[language] || 'en-GB';
  const currency = isDk ? 'DKK' : 'EUR';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString()} ${currency}`;
  }
}
