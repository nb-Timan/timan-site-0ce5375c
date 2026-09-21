import { getAccessoriesFlat, getLocalizedName, getPrice, PRODUCTS, DEMO_FEE_DKK, DEMO_FEE_EUR } from '@/data/machines';
import type { Accessory, ConfiguratorPricingSnapshot, ConfiguratorState, Language } from '@/types/configurator';

const machineKey = (machineType: string) => `machine:${machineType}`;
const accessoryKey = (machineType: string, accessoryId: string) => `accessory:${machineType}:${accessoryId}`;
const demoKey = (language: Language) => `demo:${language}`;
const startupKey = (language: Language, option: string) => `startup:${language}:${option}`;

export function snapshotProductName(state: ConfiguratorState, itemNumber: string, currentName: string): string {
  return state.pricingSnapshot?.names?.[itemNumber]
    ?? state.pricingSnapshot?.lines?.find(line => line.itemNo === itemNumber)?.description
    ?? currentName;
}

function positivePrice(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function snapshotMachinePrice(state: ConfiguratorState, machineType: string, currentPrice: number): number {
  return positivePrice(state.pricingSnapshot?.prices[machineKey(machineType)]) ?? currentPrice;
}

export function snapshotAccessoryPrice(
  state: ConfiguratorState,
  machineType: string,
  accessory: Pick<Accessory, 'id'>,
  currentPrice: number,
): number {
  return positivePrice(state.pricingSnapshot?.prices[accessoryKey(machineType, accessory.id)]) ?? currentPrice;
}

export function snapshotDemoFee(state: ConfiguratorState, language: Language): number {
  const currentPrice = language === 'da' ? DEMO_FEE_DKK : DEMO_FEE_EUR;
  return positivePrice(state.pricingSnapshot?.prices[demoKey(language)]) ?? currentPrice;
}

export function snapshotStartupPrice(state: ConfiguratorState, language: Language, option: string, currentPrice: number): number {
  return positivePrice(state.pricingSnapshot?.prices[startupKey(language, option)]) ?? currentPrice;
}

/** Stable identity for choices that affect the commercial calculation. */
export function configuratorPricingSignature(state: ConfiguratorState): string {
  return JSON.stringify({
    language: state.language,
    machines: (state.machineConfigs ?? []).map(machine => ({
      type: machine.type,
      qty: machine.qty,
      mode: machine.configMode,
      accessories: [...(machine.acc ?? [])].sort(),
    })),
    individual: Object.entries(state.individualUnitConfigs ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, [...(value.acc ?? [])].sort()]),
    quantities: Object.entries(state.accQty ?? {}).filter(([, value]) => value > 0).sort(([a], [b]) => a.localeCompare(b)),
    demos: Object.entries(state.demoMachines ?? {}).filter(([, value]) => value).sort(([a], [b]) => a.localeCompare(b)),
    deliveryMethod: state.deliveryMethod,
    deliveryStartup: state.deliveryDeliverStartup,
    deliveryDate: state.date,
    baseDiscountPct: state.baseDiscountPct ?? 0.25,
    manualDealerDiscountPct: state.manualDealerDiscountPct ?? 0,
  });
}

export function hasFrozenConfiguratorPricing(state: ConfiguratorState): boolean {
  const snapshot = state.pricingSnapshot;
  return Boolean(
    snapshot?.totals
    && snapshot.signature
    && snapshot.signature === configuratorPricingSignature(state),
  );
}

/** Protect old sent documents without inventing historical catalogue prices. */
export function protectLegacySentPricing(state: ConfiguratorState, row: { quote_sent_at?: unknown; order_sent_at?: unknown; submitted_at?: unknown; subtotal?: unknown; total_price?: unknown }): ConfiguratorState {
  const sentAt = row.order_sent_at || row.submitted_at || row.quote_sent_at;
  if (state.pricingSnapshot || !sentAt) return state;
  const subtotal = Number(row.subtotal);
  const finalPrice = Number(row.total_price);
  const valid = row.subtotal != null && row.total_price != null && Number.isFinite(subtotal) && Number.isFinite(finalPrice) && subtotal >= finalPrice && finalPrice >= 0;
  return { ...state, pricingSnapshot: {
    version: 1, totalsOnly: true, capturedAt: String(sentAt), prices: {},
    signature: configuratorPricingSignature(state),
    ...(valid ? { totals: { subtotal, totalDiscount: subtotal - finalPrice, finalPrice } } : {}),
  } };
}

/** Capture every selected product's unit price at the explicit commercial boundary. */
export function createConfiguratorPricingSnapshot(state: ConfiguratorState): ConfiguratorPricingSnapshot {
  const prices: Record<string, number> = {};
  const names: Record<string, string> = {};
  const language = state.language;

  for (const machine of state.machineConfigs ?? []) {
    const product = PRODUCTS[machine.type];
    if (product) prices[machineKey(machine.type)] = getPrice(product, language);
    if (product?.varenr) names[product.varenr] = snapshotProductName(state, product.varenr, getLocalizedName(product.name, language));

    for (const accessory of getAccessoriesFlat(machine.type)) {
      if (accessory.isHeader) continue;
      const selected = machine.acc?.includes(accessory.id)
        || Object.keys(state.individualUnitConfigs ?? {}).some(key => state.individualUnitConfigs[key]?.acc?.includes(accessory.id))
        || Object.keys(state.accQty ?? {}).some(key => key.endsWith(`_${accessory.id}`) && (state.accQty[key] ?? 0) > 0);
      if (selected) prices[accessoryKey(machine.type, accessory.id)] = getPrice(accessory, language);
      if (selected && accessory.varenr) names[accessory.varenr] = snapshotProductName(state, accessory.varenr, getLocalizedName(accessory.name, language));
    }
  }

  if (Object.values(state.demoMachines ?? {}).some(Boolean)) prices[demoKey(language)] = language === 'da' ? DEMO_FEE_DKK : DEMO_FEE_EUR;
  if (state.deliveryMethod === 'deliver' && state.deliveryDeliverStartup) {
    const currentPrice = state.deliveryDeliverStartup === 'no_bridge'
      ? (language === 'da' ? 1500 : 200)
      : state.deliveryDeliverStartup === 'with_bridge'
        ? (language === 'da' ? 2500 : 335)
        : 0;
    prices[startupKey(language, state.deliveryDeliverStartup)] = currentPrice;
  }

  return { version: 1, discountEngineVersion: 2, capturedAt: new Date().toISOString(), prices, names };
}
