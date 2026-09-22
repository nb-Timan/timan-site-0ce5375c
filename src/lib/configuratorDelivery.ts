import type { ConfiguratorState } from '@/types/configurator';

type DeliveryState = Pick<ConfiguratorState, 'machineConfigs' | 'machineDeliveryDates'>;

export const DELIVERY_DISCOUNT_PERCENT = 2;

export function machineDeliveryDateKey(state: ConfiguratorState, unitNumber: number): string {
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

export function machineDeliveryDate(state: ConfiguratorState, unitNumber: number): string {
  const stableKey = machineDeliveryDateKey(state, unitNumber);
  return state.machineDeliveryDates?.[stableKey]
    || state.machineDeliveryDates?.[`machine_${unitNumber}`]
    || state.date
    || '';
}

export function hasMachineDeliveryOverride(state: ConfiguratorState, unitNumber: number): boolean {
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
