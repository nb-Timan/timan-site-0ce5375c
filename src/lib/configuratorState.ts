import { ConfiguratorState, FlowType, Language } from '@/types/configurator';
import { DEFAULT_PAYMENT_TERMS, resolvePaymentTerms } from '@/lib/paymentTerms';
import {
  EMPTY_CONFIGURATOR_CUSTOMER_SNAPSHOT,
  normalizeConfiguratorCustomerDraftState,
} from '@/lib/configuratorCustomerMode';
import { normalizeMachineDeliveryDates } from '@/lib/configuratorDelivery';

export const createEmptyConfiguratorState = (
  language: Language = 'da',
  flowType: FlowType = 'quote',
): ConfiguratorState => ({
  step: 1,
  flowType,
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
  purchaseOrderNumber: '',
  comment: '',
  internalNote: '',
  paymentTerms: DEFAULT_PAYMENT_TERMS,
  customerNeeds: { tasks: [], focus: [] },
});

export function normalizeConfiguratorState(value?: Partial<ConfiguratorState> | null): ConfiguratorState {
  const base = createEmptyConfiguratorState(value?.language ?? 'da', value?.flowType ?? 'quote');
  const customerDraft = normalizeConfiguratorCustomerDraftState(value ?? base);
  const activeCustomer = customerDraft.customerMode === 'dealer'
    ? customerDraft.dealerCustomerData
    : customerDraft.manualCustomerDraft;

  return {
    ...base,
    ...value,
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
    demoMachines: value?.demoMachines ?? {},
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
    purchaseOrderNumber: value?.purchaseOrderNumber ?? '',
    comment: value?.comment ?? '',
    internalNote: value?.internalNote ?? '',
    paymentTerms: resolvePaymentTerms(value?.paymentTerms),
    customerNeeds: value?.customerNeeds ?? { tasks: [], focus: [] },
  };
}
