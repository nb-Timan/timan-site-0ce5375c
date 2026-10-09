import { getAccessoriesFlat, getLocalizedName, getPriceForCurrency, PRODUCTS, DEMO_FEE_DKK, DEMO_FEE_EUR, DEMO_FEE_ITEM_NUMBER } from '@/data/machines';
import type { Accessory, ConfiguratorPricingSnapshot, ConfiguratorState, Language } from '@/types/configurator';
import type { PortalUiLanguage } from '@/lib/portalLanguages';
import { convertCurrency, currencyFromLanguage, isCurrency, type Currency } from '@/lib/currency';
import { publishedProduct, publishedProductStoredText } from '@/lib/publishedProductMaster';
import { isConfiguratorPartnerAccountType } from '@/lib/importerDiscount';

const machineKey = (machineType: string) => `machine:${machineType}`;
const accessoryKey = (machineType: string, accessoryId: string) => `accessory:${machineType}:${accessoryId}`;
const demoKey = (currency: Currency) => `demo:${currency}`;
const startupKey = (currency: Currency, option: string) => `startup:${currency}:${option}`;

const NETTO_ITEM_NUMBERS = new Set(['795050', '795015', '795016', '795017', '795018']);
export const isConfiguratorNettoSku = (itemNumber: string): boolean => NETTO_ITEM_NUMBERS.has(itemNumber);

export function configuratorCurrency(state: Pick<ConfiguratorState, 'currency' | 'language'>): Currency {
  return isCurrency(state.currency) ? state.currency : currencyFromLanguage(state.language);
}

export function snapshotProductName(state: ConfiguratorState, itemNumber: string, currentName: string): string {
  return state.pricingSnapshot?.names?.[itemNumber]
    ?? state.pricingSnapshot?.lines?.find(line => line.itemNo === itemNumber)?.description
    ?? currentProductDescription(itemNumber, state.language, currentName);
}

/** Commercial identity excludes catalog/Marketing presentation suffixes. */
export function currentProductDescription(itemNumber: string, language: PortalUiLanguage, fallback: string): string {
  const row = publishedProduct(itemNumber);
  if (!row?.item_text_da?.trim()) return fallback;
  return publishedProductStoredText(itemNumber, language) ?? fallback;
}

/** Explicit edit boundary only. Historical readers retain the original snapshot. */
export function refreshConfiguratorProductDescriptions(state: ConfiguratorState): ConfiguratorState {
  const snapshot = state.pricingSnapshot;
  if (!snapshot) return state;
  const names = { ...snapshot.names };
  const lines = snapshot.lines?.map(line => ({
    ...line,
    description: currentProductDescription(line.itemNo, state.language, line.description),
  }));
  for (const line of lines ?? []) names[line.itemNo] ??= line.description;
  for (const itemNumber of Object.keys(names)) {
    names[itemNumber] = currentProductDescription(itemNumber, state.language, names[itemNumber]);
  }
  return { ...state, pricingSnapshot: { ...snapshot, names, ...(lines ? { lines } : {}) } };
}

function positivePrice(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function signatureCurrency(signature?: string): Currency | null {
  if (!signature) return null;
  try {
    const parsed = JSON.parse(signature) as { currency?: unknown; language?: unknown };
    if (isCurrency(parsed.currency)) return parsed.currency;
    const language = parsed.language;
    return typeof language === 'string' ? currencyFromLanguage(language) : null;
  } catch {
    return null;
  }
}

/** Legacy snapshots identify their currency through the language in the signature. */
export function configuratorSnapshotCurrency(state: ConfiguratorState): Currency | null {
  const snapshot = state.pricingSnapshot;
  if (!snapshot) return null;
  return snapshot.currency ?? signatureCurrency(snapshot.signature) ?? configuratorCurrency(state);
}

function snapshotUsesCurrentCurrency(state: ConfiguratorState): boolean {
  return configuratorSnapshotCurrency(state) === configuratorCurrency(state);
}

export function snapshotMachinePrice(state: ConfiguratorState, machineType: string, currentPrice: number): number {
  if (!snapshotUsesCurrentCurrency(state)) return currentPrice;
  return positivePrice(state.pricingSnapshot?.prices[machineKey(machineType)]) ?? currentPrice;
}

export function snapshotAccessoryPrice(
  state: ConfiguratorState,
  machineType: string,
  accessory: Pick<Accessory, 'id'>,
  currentPrice: number,
): number {
  if (!snapshotUsesCurrentCurrency(state)) return currentPrice;
  return positivePrice(state.pricingSnapshot?.prices[accessoryKey(machineType, accessory.id)]) ?? currentPrice;
}

export function snapshotDemoFee(state: ConfiguratorState, currency: Currency = configuratorCurrency(state)): number {
  if (!snapshotUsesCurrentCurrency(state)) return currentDemoFee(currency);
  const legacyKey = `demo:${state.language}`;
  return positivePrice(state.pricingSnapshot?.prices[demoKey(currency)])
    ?? positivePrice(state.pricingSnapshot?.prices[legacyKey])
    ?? currentDemoFee(currency);
}

export function currentDemoFee(currency: Currency): number {
  const published = publishedProduct(DEMO_FEE_ITEM_NUMBER);
  const currentPrice = currency === 'DKK' ? published?.price_dkk : currency === 'SEK' ? published?.price_sek : published?.price_eur;
  if (positivePrice(currentPrice) != null) return positivePrice(currentPrice)!;
  if (currency === 'DKK') return DEMO_FEE_DKK;
  if (currency === 'EUR') return DEMO_FEE_EUR;
  return convertCurrency(DEMO_FEE_DKK, 'DKK', 'SEK');
}

export function snapshotStartupPrice(state: ConfiguratorState, currency: Currency, option: string, currentPrice: number): number {
  if (!snapshotUsesCurrentCurrency(state)) return currentPrice;
  return positivePrice(state.pricingSnapshot?.prices[startupKey(currency, option)])
    ?? positivePrice(state.pricingSnapshot?.prices[`startup:${state.language}:${option}`])
    ?? currentPrice;
}

function pricingSignature(state: ConfiguratorState, identity: { currency: Currency } | { language: Language }): string {
  const machineDeliveryDates = Object.entries(state.machineDeliveryDates ?? {})
    .filter(([, value]) => Boolean(value))
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify({
    ...identity,
    ...(state.pricingMode === 'direct' ? { pricingMode: 'direct' } : {}),
    ...(state.campaignDisabled ? { campaignDisabled: true } : {}),
    ...(isConfiguratorPartnerAccountType(state.partnerAccountType) ? { partnerAccountType: state.partnerAccountType } : {}),
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
    ...(machineDeliveryDates.length ? { machineDeliveryDates } : {}),
    baseDiscountPct: state.baseDiscountPct ?? 0.25,
    manualDealerDiscountPct: state.manualDealerDiscountPct ?? 0,
  });
}

/** Stable identity for choices that affect the commercial calculation. */
export function configuratorPricingSignature(state: ConfiguratorState): string {
  return pricingSignature(state, { currency: configuratorCurrency(state) });
}

function legacyConfiguratorPricingSignature(state: ConfiguratorState): string {
  return pricingSignature(state, { language: state.language });
}

export function hasFrozenConfiguratorPricing(state: ConfiguratorState): boolean {
  const snapshot = state.pricingSnapshot;
  return Boolean(
    snapshot?.totals
    && snapshot.signature
    && (snapshot.signature === configuratorPricingSignature(state)
      || snapshot.signature === legacyConfiguratorPricingSignature(state)),
  );
}

/**
 * Protect legacy submitted orders without inventing historical catalogue prices.
 *
 * A sent quote is still an editable working case. Its previously sent PDF remains
 * immutable in Storage, while the next explicit save captures a complete current
 * pricing snapshot on the same T-number. Treating quote_sent_at as an order lock
 * leaves the quote in a totals-only state that cannot be edited or saved.
 */
export function protectLegacySentPricing(state: ConfiguratorState, row: { quote_sent_at?: unknown; order_sent_at?: unknown; submitted_at?: unknown; subtotal?: unknown; total_price?: unknown }): ConfiguratorState {
  const sentAt = row.order_sent_at || row.submitted_at;
  if (state.pricingSnapshot || !sentAt) return state;
  const subtotal = Number(row.subtotal);
  const finalPrice = Number(row.total_price);
  const valid = row.subtotal != null && row.total_price != null && Number.isFinite(subtotal) && Number.isFinite(finalPrice) && subtotal >= finalPrice && finalPrice >= 0;
  return { ...state, pricingSnapshot: {
    version: 1, totalsOnly: true, capturedAt: String(sentAt), currency: configuratorCurrency(state), prices: {},
    signature: configuratorPricingSignature(state),
    ...(valid ? { totals: { subtotal, totalDiscount: subtotal - finalPrice, finalPrice } } : {}),
  } };
}

/** Capture every selected product's unit price at the explicit commercial boundary. */
export function createConfiguratorPricingSnapshot(state: ConfiguratorState): ConfiguratorPricingSnapshot {
  const prices: Record<string, number> = {};
  const names: Record<string, string> = {};
  const language = state.language;
  const currency = configuratorCurrency(state);

  for (const machine of state.machineConfigs ?? []) {
    const product = PRODUCTS[machine.type];
    if (product) prices[machineKey(machine.type)] = getPriceForCurrency(product, currency);
    if (product?.varenr) names[product.varenr] = currentProductDescription(product.varenr, language, getLocalizedName(product.name, language));

    for (const accessory of getAccessoriesFlat(machine.type)) {
      if (accessory.isHeader) continue;
      const selected = machine.acc?.includes(accessory.id)
        || Object.keys(state.individualUnitConfigs ?? {}).some(key => state.individualUnitConfigs[key]?.acc?.includes(accessory.id))
        || Object.keys(state.accQty ?? {}).some(key => key.endsWith(`_${accessory.id}`) && (state.accQty[key] ?? 0) > 0);
      if (selected) prices[accessoryKey(machine.type, accessory.id)] = getPriceForCurrency(accessory, currency);
      if (selected && accessory.varenr) names[accessory.varenr] = currentProductDescription(accessory.varenr, language, getLocalizedName(accessory.name, language));
    }
  }

  if (state.pricingMode !== 'direct' && Object.values(state.demoMachines ?? {}).some(Boolean)) {
    prices[demoKey(currency)] = currentDemoFee(currency);
    names[DEMO_FEE_ITEM_NUMBER] = currentProductDescription(DEMO_FEE_ITEM_NUMBER, language, 'Demo machine');
  }
  if (state.deliveryMethod === 'deliver' && state.deliveryDeliverStartup) {
    const dkkPrice = state.deliveryDeliverStartup === 'no_bridge' ? 1500
      : state.deliveryDeliverStartup === 'with_bridge' ? 2500 : 0;
    const currentPrice = currency === 'DKK' ? dkkPrice
      : currency === 'EUR' ? (state.deliveryDeliverStartup === 'no_bridge' ? 200 : state.deliveryDeliverStartup === 'with_bridge' ? 335 : 0)
        : convertCurrency(dkkPrice, 'DKK', 'SEK');
    prices[startupKey(currency, state.deliveryDeliverStartup)] = currentPrice;
  }

  return {
    version: 1,
    discountEngineVersion: 2,
    nettoPricingVersion: 1,
    capturedAt: new Date().toISOString(),
    currency,
    prices,
    names,
  };
}
