import type { ConfiguratorState } from '@/types/configurator';

export type ConfiguratorCustomerMode = 'dealer' | 'manual';

export type ConfiguratorCustomerSnapshot = Pick<
  ConfiguratorState,
  | 'firmanavn'
  | 'kontaktperson'
  | 'telefon'
  | 'emailRecipient'
  | 'address'
  | 'postalCode'
  | 'city'
  | 'country'
>;

export const EMPTY_CONFIGURATOR_CUSTOMER_SNAPSHOT: ConfiguratorCustomerSnapshot = {
  firmanavn: '',
  kontaktperson: '',
  telefon: '',
  emailRecipient: '',
  address: '',
  postalCode: '',
  city: '',
  country: '',
};

export const CONFIGURATOR_CUSTOMER_FIELDS = Object.keys(
  EMPTY_CONFIGURATOR_CUSTOMER_SNAPSHOT,
) as Array<keyof ConfiguratorCustomerSnapshot>;

export type ConfiguratorCustomerDraftState = {
  customerMode: ConfiguratorCustomerMode;
  manualCustomerDraft: ConfiguratorCustomerSnapshot;
  dealerCustomerData: ConfiguratorCustomerSnapshot;
  dealerContactId: string;
};

function snapshotFrom(value: Partial<ConfiguratorCustomerSnapshot> | null | undefined): ConfiguratorCustomerSnapshot {
  return CONFIGURATOR_CUSTOMER_FIELDS.reduce((snapshot, field) => {
    snapshot[field] = typeof value?.[field] === 'string' ? value[field] : '';
    return snapshot;
  }, { ...EMPTY_CONFIGURATOR_CUSTOMER_SNAPSHOT });
}

function hasSnapshotValue(snapshot: ConfiguratorCustomerSnapshot): boolean {
  return CONFIGURATOR_CUSTOMER_FIELDS.some((field) => Boolean(snapshot[field].trim()));
}

export function snapshotFromConfiguratorState(
  state: Partial<ConfiguratorState>,
): ConfiguratorCustomerSnapshot {
  return snapshotFrom(state);
}

/**
 * Legacy configurations only have the active customer fields. They remain
 * manual-customer configurations until somebody explicitly selects dealer mode.
 */
export function normalizeConfiguratorCustomerDraftState(
  state: Partial<ConfiguratorState>,
): ConfiguratorCustomerDraftState {
  const legacySnapshot = snapshotFromConfiguratorState(state);
  const customerMode: ConfiguratorCustomerMode = state.customerMode === 'dealer' ? 'dealer' : 'manual';
  const storedManualDraft = snapshotFrom(state.manualCustomerDraft);
  const storedDealerDraft = snapshotFrom(state.dealerCustomerData);
  // A few existing Configurator entry paths set the legacy active fields
  // directly. Treat an otherwise-empty draft as legacy rather than dropping
  // visible customer data during the transition to the two-draft model.
  const manualCustomerDraft = !hasSnapshotValue(storedManualDraft) && customerMode === 'manual' && hasSnapshotValue(legacySnapshot)
    ? legacySnapshot
    : storedManualDraft;
  const dealerCustomerData = !hasSnapshotValue(storedDealerDraft) && customerMode === 'dealer' && hasSnapshotValue(legacySnapshot)
    ? legacySnapshot
    : storedDealerDraft;

  return {
    customerMode,
    manualCustomerDraft,
    dealerCustomerData,
    dealerContactId: typeof state.dealerContactId === 'string' ? state.dealerContactId : '',
  };
}

export function activeConfiguratorCustomerSnapshot(
  draft: ConfiguratorCustomerDraftState,
): ConfiguratorCustomerSnapshot {
  return draft.customerMode === 'dealer'
    ? draft.dealerCustomerData
    : draft.manualCustomerDraft;
}

export function withActiveConfiguratorCustomerSnapshot(
  state: ConfiguratorState,
  draft: ConfiguratorCustomerDraftState,
): ConfiguratorState {
  return {
    ...state,
    ...activeConfiguratorCustomerSnapshot(draft),
    ...draft,
  };
}

export function selectConfiguratorCustomerMode(
  state: ConfiguratorState,
  customerMode: ConfiguratorCustomerMode,
): ConfiguratorState {
  const draft = normalizeConfiguratorCustomerDraftState(state);
  return withActiveConfiguratorCustomerSnapshot(state, { ...draft, customerMode });
}

/** Dealer changes only replace dealer-derived data; the manual draft survives. */
export function replaceConfiguratorDealerCustomerData(
  state: ConfiguratorState,
  dealerCustomerData: ConfiguratorCustomerSnapshot,
  dealerContactId: string,
): ConfiguratorState {
  const draft = normalizeConfiguratorCustomerDraftState(state);
  return withActiveConfiguratorCustomerSnapshot(state, {
    ...draft,
    dealerCustomerData: snapshotFrom(dealerCustomerData),
    dealerContactId,
  });
}

/** Editing the visible customer fields updates only the currently active draft. */
export function updateConfiguratorCustomerDraftField(
  state: ConfiguratorState,
  field: keyof ConfiguratorCustomerSnapshot,
  value: string,
): ConfiguratorState {
  const draft = normalizeConfiguratorCustomerDraftState(state);
  const next = draft.customerMode === 'dealer'
    ? { ...draft, dealerCustomerData: { ...draft.dealerCustomerData, [field]: value } }
    : { ...draft, manualCustomerDraft: { ...draft.manualCustomerDraft, [field]: value } };
  return withActiveConfiguratorCustomerSnapshot(state, next);
}
