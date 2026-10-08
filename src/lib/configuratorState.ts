import { ConfiguratorState, FlowType, Language, type SalesStockAssetSnapshot } from '@/types/configurator';
import { DEFAULT_PAYMENT_TERMS, resolvePaymentTerms } from '@/lib/paymentTerms';
import {
  EMPTY_CONFIGURATOR_CUSTOMER_SNAPSHOT,
  normalizeConfiguratorCustomerDraftState,
} from '@/lib/configuratorCustomerMode';
import { normalizeMachineDeliveryDates, normalizeMachineDeliveryAddresses } from '@/lib/configuratorDelivery';
import { isConfiguratorPartnerAccountType } from '@/lib/importerDiscount';
import { currencyFromLanguage, isCurrency } from '@/lib/currency';

const CONFIGURATOR_LOCALES = new Set(['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']);

function normalizeSalesStockAssets(value: unknown): SalesStockAssetSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((asset): asset is SalesStockAssetSnapshot => Boolean(asset)
    && typeof asset === 'object'
    && typeof asset.sourceAssetId === 'string'
    && typeof asset.assetInstanceId === 'string'
    && typeof asset.itemNumber === 'string'
    && typeof asset.catalogItemNumber === 'string'
    && (asset.itemType === 'machine' || asset.itemType === 'equipment'))
    .map((asset) => ({
      ...asset,
      serialNumber: typeof asset.serialNumber === 'string' && asset.serialNumber.trim() ? asset.serialNumber.trim() : null,
      brikNumber: Number.isInteger(asset.brikNumber) && Number(asset.brikNumber) > 0 ? Number(asset.brikNumber) : null,
      adjustedBasePrice: typeof asset.adjustedBasePrice === 'number' && Number.isFinite(asset.adjustedBasePrice)
        ? Math.max(0, asset.adjustedBasePrice)
        : null,
      salesStockDiscountPct: typeof asset.salesStockDiscountPct === 'number' && Number.isFinite(asset.salesStockDiscountPct)
        ? Math.min(100, Math.max(0, asset.salesStockDiscountPct))
        : null,
      pricingReason: typeof asset.pricingReason === 'string' ? asset.pricingReason : '',
    }));
}

export const createEmptyConfiguratorState = (
  language: Language = 'da',
  flowType: FlowType = 'quote',
): ConfiguratorState => ({
  step: 1,
  flowType,
  salesChannel: 'standard',
  salesStockAssets: [],
  pricingMode: 'partner',
  campaignDisabled: false,
  locale: language,
  currency: currencyFromLanguage(language),
  language,
  machineConfigs: [],
  individualUnitConfigs: {},
  ralCodes: {},
  accQty: {},
  date: '',
  machineDeliveryDates: {},
  machineDeliveryAddresses: {},
  deliveryMethod: '',
  deliveryDeliverStartup: null,
  manualDealerDiscountPct: 0,
  baseDiscountPct: 0.25,
  demoMachines: {},
  reqNumbers: {},
  currentMachineIndex: 0,
  firmanavn: '',
  kontaktperson: '',
  telefon: '',
  email: '',
  emailRecipient: '',
  customerMode: 'manual',
  manualCustomerDraft: { ...EMPTY_CONFIGURATOR_CUSTOMER_SNAPSHOT },
  dealerCustomerData: { ...EMPTY_CONFIGURATOR_CUSTOMER_SNAPSHOT },
  dealerContactId: '',
  address: '',
  postalCode: '',
  city: '',
  country: '',
  alternativeDeliveryAddress: '',
  useAlternativeDeliveryAddress: false,
  alternativeDeliveryPostalCode: '',
  alternativeDeliveryCity: '',
  alternativeDeliveryCountry: '',
  alternativeDeliveryContactPerson: '',
  alternativeDeliveryPhone: '',
  alternativeDeliveryNote: '',
  purchaseOrderNumber: '',
  comment: '',
  internalNote: '',
  paymentTerms: DEFAULT_PAYMENT_TERMS,
  customerNeeds: { tasks: [], focus: [] },
});

export function normalizeConfiguratorState(value?: Partial<ConfiguratorState> | null): ConfiguratorState {
  const flowType = value?.flowType === 'order' ? 'order' : 'quote';
  const base = createEmptyConfiguratorState(value?.language ?? 'da', flowType);
  const requestedDirect = value?.pricingMode === 'direct';
  const pricingMode = flowType === 'quote' && requestedDirect ? 'direct' : 'partner';
  const invalidOrderDirect = flowType === 'order' && requestedDirect;
  const customerDraft = normalizeConfiguratorCustomerDraftState(value ?? base);
  const salesChannel = value?.salesChannel === 'sales_stock_demo' ? 'sales_stock_demo' : 'standard';
  const salesStockAssets = salesChannel === 'sales_stock_demo'
    ? normalizeSalesStockAssets(value?.salesStockAssets)
    : [];
  const activeCustomer = customerDraft.customerMode === 'dealer'
    ? customerDraft.dealerCustomerData
    : customerDraft.manualCustomerDraft;

  return {
    ...base,
    ...value,
    flowType,
    salesChannel,
    salesStockAssets,
    pricingMode,
    locale: typeof value?.locale === 'string' && CONFIGURATOR_LOCALES.has(value.locale)
      ? value.locale
      : value?.language ?? 'da',
    currency: isCurrency(value?.currency)
      ? value.currency
      : isCurrency(value?.pricingSnapshot?.currency)
        ? value.pricingSnapshot.currency
        : currencyFromLanguage(value?.language),
    pricingSnapshot: invalidOrderDirect ? undefined : value?.pricingSnapshot,
    campaignDisabled: salesChannel === 'sales_stock_demo' ? true : value?.campaignDisabled === true,
    partnerAccountType: isConfiguratorPartnerAccountType(value?.partnerAccountType)
      ? value.partnerAccountType
      : undefined,
    machineConfigs: Array.isArray(value?.machineConfigs) ? value.machineConfigs : [],
    individualUnitConfigs: value?.individualUnitConfigs ?? {},
    ralCodes: value?.ralCodes ?? {},
    accQty: value?.accQty ?? {},
    date: value?.date ?? '',
    machineDeliveryDates: normalizeMachineDeliveryDates({
      machineConfigs: Array.isArray(value?.machineConfigs) ? value.machineConfigs : [],
      machineDeliveryDates: value?.machineDeliveryDates,
    }),
    machineDeliveryAddresses: normalizeMachineDeliveryAddresses({ ...base, ...value, machineDeliveryAddresses: value?.machineDeliveryAddresses }),
    deliveryMethod: value?.deliveryMethod ?? '',
    deliveryDeliverStartup: value?.deliveryDeliverStartup ?? null,
    manualDealerDiscountPct: typeof value?.manualDealerDiscountPct === 'number' ? value.manualDealerDiscountPct : 0,
    baseDiscountPct: typeof value?.baseDiscountPct === 'number' && value.baseDiscountPct >= 0 && value.baseDiscountPct <= 1
      ? value.baseDiscountPct
      : 0.25,
    demoMachines: pricingMode === 'direct' || salesChannel === 'sales_stock_demo' ? {} : value?.demoMachines ?? {},
    reqNumbers: value?.reqNumbers ?? {},
    currentMachineIndex: typeof value?.currentMachineIndex === 'number' ? value.currentMachineIndex : 0,
    firmanavn: activeCustomer.firmanavn,
    kontaktperson: activeCustomer.kontaktperson,
    telefon: activeCustomer.telefon,
    email: value?.email ?? '',
    emailRecipient: activeCustomer.emailRecipient,
    customerMode: customerDraft.customerMode,
    manualCustomerDraft: customerDraft.manualCustomerDraft,
    dealerCustomerData: customerDraft.dealerCustomerData,
    dealerContactId: customerDraft.dealerContactId,
    address: activeCustomer.address,
    postalCode: activeCustomer.postalCode,
    city: activeCustomer.city,
    country: activeCustomer.country,
    alternativeDeliveryAddress: value?.alternativeDeliveryAddress ?? '',
    useAlternativeDeliveryAddress: value?.useAlternativeDeliveryAddress === true,
    alternativeDeliveryPostalCode: value?.alternativeDeliveryPostalCode ?? '',
    alternativeDeliveryCity: value?.alternativeDeliveryCity ?? '',
    alternativeDeliveryCountry: value?.alternativeDeliveryCountry ?? '',
    alternativeDeliveryContactPerson: value?.alternativeDeliveryContactPerson ?? '',
    alternativeDeliveryPhone: value?.alternativeDeliveryPhone ?? '',
    alternativeDeliveryNote: value?.alternativeDeliveryNote ?? '',
    purchaseOrderNumber: value?.purchaseOrderNumber ?? '',
    comment: value?.comment ?? '',
    internalNote: value?.internalNote ?? '',
    paymentTerms: resolvePaymentTerms(value?.paymentTerms),
    customerNeeds: value?.customerNeeds ?? { tasks: [], focus: [] },
  };
}

/** The only valid commercial transition between quote and order modes. */
export function transitionConfiguratorFlowType(state: ConfiguratorState, flowType: FlowType): ConfiguratorState {
  if (state.flowType === flowType && !(flowType === 'order' && state.pricingMode === 'direct')) return state;
  return normalizeConfiguratorState({
    ...state,
    flowType,
    ...(flowType === 'order' ? { pricingMode: 'partner' as const } : {}),
    pricingSnapshot: undefined,
  });
}

export function assertValidConfiguratorCommercialState(state: Pick<ConfiguratorState, 'flowType' | 'pricingMode'>): void {
  if (state.flowType === 'order' && state.pricingMode === 'direct') {
    throw new Error('ORDER_DIRECT_NOT_ALLOWED');
  }
}

export function assertValidSalesStockState(state: Pick<ConfiguratorState, 'salesChannel' | 'salesStockAssets'>): void {
  if (state.salesChannel !== 'sales_stock_demo') return;
  if (!state.salesStockAssets?.length) throw new Error('SALES_STOCK_ASSETS_REQUIRED');
  const ids = new Set<string>();
  for (const asset of state.salesStockAssets) {
    if (!asset.sourceAssetId || !asset.assetInstanceId || !asset.itemNumber || !asset.catalogItemNumber || ids.has(asset.sourceAssetId)) {
      throw new Error('SALES_STOCK_ASSET_IDENTITY_INVALID');
    }
    ids.add(asset.sourceAssetId);
    if (asset.pricingMethod !== 'adjusted_base' && asset.pricingMethod !== 'sales_stock_discount') {
      throw new Error('SALES_STOCK_PRICING_METHOD_INVALID');
    }
    if (asset.pricingMethod === 'adjusted_base') {
      if (asset.adjustedBasePrice === null || asset.adjustedBasePrice < 0 || asset.adjustedBasePrice > asset.originalListPrice) {
        throw new Error('SALES_STOCK_ADJUSTED_BASE_INVALID');
      }
      if (asset.salesStockDiscountPct !== null) throw new Error('SALES_STOCK_PRICING_METHOD_CONFLICT');
      if (!asset.pricingReason.trim()) throw new Error('SALES_STOCK_PRICING_REASON_REQUIRED');
    } else {
      if (asset.adjustedBasePrice !== null) throw new Error('SALES_STOCK_PRICING_METHOD_CONFLICT');
      if (asset.salesStockDiscountPct !== null
        && (asset.salesStockDiscountPct < 0 || asset.salesStockDiscountPct > 100 || !asset.pricingReason.trim())) {
        throw new Error('SALES_STOCK_PRICING_REASON_REQUIRED');
      }
    }
  }
}
