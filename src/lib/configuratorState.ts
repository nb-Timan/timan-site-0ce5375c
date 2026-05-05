import { ConfiguratorState, FlowType, Language } from '@/types/configurator';
import { DEFAULT_PAYMENT_TERMS, resolvePaymentTerms } from '@/lib/paymentTerms';

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
  internalNote: '',
  paymentTerms: DEFAULT_PAYMENT_TERMS,
});

export function normalizeConfiguratorState(value?: Partial<ConfiguratorState> | null): ConfiguratorState {
  const base = createEmptyConfiguratorState(value?.language ?? 'da', value?.flowType ?? 'quote');

  return {
    ...base,
    ...value,
    machineConfigs: Array.isArray(value?.machineConfigs) ? value.machineConfigs : [],
    individualUnitConfigs: value?.individualUnitConfigs ?? {},
    ralCodes: value?.ralCodes ?? {},
    accQty: value?.accQty ?? {},
    date: value?.date ?? '',
    deliveryMethod: value?.deliveryMethod ?? '',
    deliveryDeliverStartup: value?.deliveryDeliverStartup ?? null,
    manualDealerDiscountPct: typeof value?.manualDealerDiscountPct === 'number' ? value.manualDealerDiscountPct : 0,
    demoMachines: value?.demoMachines ?? {},
    reqNumbers: value?.reqNumbers ?? {},
    currentMachineIndex: typeof value?.currentMachineIndex === 'number' ? value.currentMachineIndex : 0,
    firmanavn: value?.firmanavn ?? '',
    kontaktperson: value?.kontaktperson ?? '',
    telefon: value?.telefon ?? '',
    email: value?.email ?? '',
    emailRecipient: value?.emailRecipient ?? '',
    comment: value?.comment ?? '',
    internalNote: value?.internalNote ?? '',
    paymentTerms: resolvePaymentTerms(value?.paymentTerms),
  };
}