import type { ConfiguratorState, MachineDeliveryAddress } from '@/types/configurator';
import { LOOSE_TOOL_KEY } from '@/data/machines';

type DeliveryState = Pick<ConfiguratorState, 'machineConfigs' | 'machineDeliveryDates'> & Partial<Pick<ConfiguratorState, 'date'>>;

export const DELIVERY_DISCOUNT_PERCENT = 2;

export interface ConfiguratorDeliveryDestination {
  source: 'customer' | 'alternative' | 'dealer';
  company: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  contactPerson: string;
  phone: string;
  note: string;
}

export function baseMachineQuantity(state: Pick<ConfiguratorState, 'machineConfigs'>): number {
  return (state.machineConfigs ?? [])
    .filter(machine => machine.type !== LOOSE_TOOL_KEY)
    .reduce((sum, machine) => sum + Math.max(0, machine.qty || 0), 0);
}

export function hasAlternativeDeliveryAddress(state: ConfiguratorState): boolean {
  return state.useAlternativeDeliveryAddress === true;
}

export function resolveDeliveryDestination(state: ConfiguratorState, unitNumber?: number): ConfiguratorDeliveryDestination {
  const unit = unitNumber === undefined ? deliveryMachineUnits(state)[0] : deliveryMachineUnits(state).find(item => item.unitNumber === unitNumber);
  const snapshot = unit && state.machineDeliveryAddresses?.[unit.key];
  if (snapshot) {
    const { mode, ...destination } = snapshot;
    return { ...destination, source: mode === 'manual' ? 'alternative' : mode };
  }
  if (hasAlternativeDeliveryAddress(state)) {
    return {
      source: 'alternative',
      company: '',
      address: state.alternativeDeliveryAddress?.trim() ?? '',
      postalCode: state.alternativeDeliveryPostalCode?.trim() ?? '',
      city: state.alternativeDeliveryCity?.trim() ?? '',
      country: state.alternativeDeliveryCountry?.trim() ?? '',
      contactPerson: state.alternativeDeliveryContactPerson?.trim() ?? '',
      phone: state.alternativeDeliveryPhone?.trim() ?? '',
      note: state.alternativeDeliveryNote?.trim() ?? '',
    };
  }
  return {
    source: 'customer',
    company: state.firmanavn?.trim() ?? '',
    address: state.address?.trim() ?? '',
    postalCode: state.postalCode?.trim() ?? '',
    city: state.city?.trim() ?? '',
    country: state.country?.trim() ?? '',
    contactPerson: state.kontaktperson?.trim() ?? '',
    phone: state.telefon?.trim() ?? '',
    note: '',
  };
}

export function deliveryMachineUnits(state: Pick<ConfiguratorState, 'machineConfigs'>) {
  let unitNumber = 0;
  return state.machineConfigs.flatMap(machine => Array.from({ length: Math.max(0, machine.qty) }, (_, index) => {
    unitNumber += 1;
    return { key: `${machine.id}_${index + 1}`, unitNumber, machineType: machine.type };
  })).filter(unit => unit.machineType !== LOOSE_TOOL_KEY);
}

export function emptyMachineDeliveryAddress(): MachineDeliveryAddress {
  return { mode: 'manual', company: '', address: '', postalCode: '', city: '', country: '', contactPerson: '', phone: '', note: '' };
}

export function dealerDeliveryAddress(state: ConfiguratorState): MachineDeliveryAddress {
  const dealer = state.dealerCustomerData;
  return { mode: 'dealer', company: dealer.firmanavn, address: dealer.address, postalCode: dealer.postalCode,
    city: dealer.city, country: dealer.country, contactPerson: dealer.kontaktperson, phone: dealer.telefon, note: '' };
}

/** Legacy snapshots stay untouched until an explicit delivery edit. */
export function normalizeMachineDeliveryAddresses(state: ConfiguratorState): Record<string, MachineDeliveryAddress> | undefined {
  if (state.machineDeliveryAddresses === undefined) return undefined;
  return Object.fromEntries(deliveryMachineUnits(state).map(unit => [unit.key, {
    ...emptyMachineDeliveryAddress(), ...state.machineDeliveryAddresses?.[unit.key],
  }]));
}

export function updateMachineDeliveryAddress(state: ConfiguratorState, key: string, update: Partial<MachineDeliveryAddress>): Record<string, MachineDeliveryAddress> {
  // Explicit editing upgrades legacy delivery fields once, not on historical reads.
  const addresses = state.machineDeliveryAddresses ?? Object.fromEntries(deliveryMachineUnits(state).map(unit => {
    const { source, ...destination } = resolveDeliveryDestination(state, unit.unitNumber);
    return [unit.key, { ...destination, mode: source === 'alternative' ? 'manual' as const : source }];
  }));
  return { ...addresses, [key]: { ...emptyMachineDeliveryAddress(), ...addresses[key], ...update } };
}

export function deliveryDestinationSections(state: ConfiguratorState) {
  if (state.machineDeliveryAddresses === undefined) return [{ unit: null, destination: resolveDeliveryDestination(state) }];
  return deliveryMachineUnits(state).map(unit => ({ unit, destination: resolveDeliveryDestination(state, unit.unitNumber) }));
}

export function formatDeliveryDestination(destination: ConfiguratorDeliveryDestination): string {
  return [
    destination.company,
    destination.address,
    [destination.postalCode, destination.city].filter(Boolean).join(' '),
    destination.country,
    destination.contactPerson,
    destination.phone,
    destination.note,
  ].filter(Boolean).join('\n');
}

export function machineDeliveryDateKey(state: DeliveryState, unitNumber: number): string {
  let runningUnit = 0;
  for (const machine of state.machineConfigs ?? []) {
    for (let index = 1; index <= machine.qty; index += 1) {
      runningUnit += 1;
      if (runningUnit === unitNumber) return `${machine.id}_${index}`;
    }
  }
  return `machine_${unitNumber}`;
}

export function normalizeMachineDeliveryDates(state: DeliveryState): Record<string, string> {
  const source = state.machineDeliveryDates ?? {};
  const normalized: Record<string, string> = {};
  let unitNumber = 0;
  for (const machine of state.machineConfigs ?? []) {
    for (let index = 1; index <= machine.qty; index += 1) {
      unitNumber += 1;
      const stableKey = `${machine.id}_${index}`;
      const value = source[stableKey] || source[`machine_${unitNumber}`];
      if (value) normalized[stableKey] = value;
    }
  }
  return normalized;
}

export function machineDeliveryDate(state: DeliveryState, unitNumber: number): string {
  if (baseMachineQuantity(state) <= 1) return state.date || '';
  const stableKey = machineDeliveryDateKey(state, unitNumber);
  return state.machineDeliveryDates?.[stableKey]
    || state.machineDeliveryDates?.[`machine_${unitNumber}`]
    || state.date
    || '';
}

export function hasMachineDeliveryOverride(state: DeliveryState, unitNumber: number): boolean {
  if (baseMachineQuantity(state) <= 1) return false;
  const stableKey = machineDeliveryDateKey(state, unitNumber);
  return Boolean(state.machineDeliveryDates?.[stableKey] || state.machineDeliveryDates?.[`machine_${unitNumber}`]);
}

export function isDeliveryDiscountEligible(date: string, now = Date.now()): boolean {
  if (!date) return false;
  const delivery = new Date(`${date}T12:00:00`);
  if (Number.isNaN(delivery.getTime())) return false;
  const threshold = new Date(now);
  threshold.setMonth(threshold.getMonth() + 3);
  return delivery > threshold;
}

export function isWeekendDeliveryDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isDeliveryDateDisabled(date: Date, canSelectPastDate = false, now = Date.now()): boolean {
  if (isWeekendDeliveryDate(date)) return true;
  if (canSelectPastDate) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export function activeMachineDeliveryDates(state: ConfiguratorState): string[] {
  const dates: string[] = [];
  let unitNumber = 0;
  for (const machine of state.machineConfigs ?? []) {
    for (let index = 0; index < machine.qty; index += 1) {
      unitNumber += 1;
      dates.push(machineDeliveryDate(state, unitNumber));
    }
  }
  return dates;
}

export function commonMachineDeliveryDate(state: ConfiguratorState): string | null {
  const dates = activeMachineDeliveryDates(state).filter(Boolean);
  if (dates.length === 0) return state.date || null;
  return new Set(dates).size === 1 ? dates[0] : null;
}
