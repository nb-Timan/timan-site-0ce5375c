import { ConfiguratorState, FlowType, Language } from '@/types/configurator';
import { DEFAULT_PAYMENT_TERMS, resolvePaymentTerms } from '@/lib/paymentTerms';
import {
  EMPTY_CONFIGURATOR_CUSTOMER_SNAPSHOT,
  normalizeConfiguratorCustomerDraftState,
} from '@/lib/configuratorCustomerMode';
import { normalizeMachineDeliveryDates } from '@/lib/configuratorDelivery';
import { isConfiguratorPartnerAccountType } from '@/lib/importerDiscount';
import { currencyFromLanguage, isCurrency } from '@/lib/currency';

const CONFIGURATOR_LOCALES = new Set(['da', 'en', 'de', 'it', 'hu', 'sv', 'fr', 'pl', 'cs']);

export const createEmptyConfiguratorState = (
  language: Language = 'da',
  flowType: FlowType = 'quote',
): ConfiguratorState => ({
  step: 1,
  flowType,
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
  const activeCustomer = customerDraft.customerMode === 'dealer'
    ? customerDraft.dealerCustomerData
    : customerDraft.manualCustomerDraft;

  return {
    ...base,
    ...value,
    flowType,
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
    campaignDisabled: value?.campaignDisabled === true,
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
    deliveryMethod: value?.deliveryMethod ?? '',
    deliveryDeliverStartup: value?.deliveryDeliverStartup ?? null,
    manualDealerDiscountPct: typeof value?.manualDealerDiscountPct === 'number' ? value.manualDealerDiscountPct : 0,
    baseDiscountPct: typeof value?.baseDiscountPct === 'number' && value.baseDiscountPct >= 0 && value.baseDiscountPct <= 1
      ? value.baseDiscountPct
      : 0.25,
    demoMachines: pricingMode === 'direct' ? {} : value?.demoMachines ?? {},
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
