import {
  isPlanningSourceFresh, planningExceptions, planningSourceState,
  type PlanningData, type PlanningLot, type PlanningReservation, type PlanningUnit,
} from '@/lib/planningService';

export type PlanningTimelineScale = 'week' | 'month';
export type PlanningTimelineHorizon = 3 | 6 | 12;
export type PlanningTimelineState = 'available' | 'incoming' | 'soft_quote' | 'locked_quote' | 'order' | 'problem';

export interface PlanningPeriod {
  start: Date;
  end: Date;
}

export interface PlanningIncomingSupply {
  units: PlanningUnit[];
  lots: PlanningLot[];
}

export interface PlanningTimelineEntry {
  key: string;
  itemNumber: string;
  date: string;
  state: PlanningTimelineState;
  unit?: PlanningUnit;
  lot?: PlanningLot;
  reservation?: PlanningReservation;
}

const planningSerialCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function comparePlanningSerialNumbers(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftSerial = left?.trim() ?? '';
  const rightSerial = right?.trim() ?? '';
  if (!leftSerial) return rightSerial ? 1 : 0;
  if (!rightSerial) return -1;
  return planningSerialCollator.compare(leftSerial, rightSerial);
}

export function sortPlanningUnitsBySerial(units: PlanningUnit[]): PlanningUnit[] {
  return [...units].sort((left, right) => comparePlanningSerialNumbers(left.serial_number, right.serial_number)
    || left.id.localeCompare(right.id));
}

export function planningSupplyDate(unit: PlanningUnit): string | null {
  return unit.available_at ?? unit.current_planned_delivery_date
    ?? unit.expected_delivery_at ?? unit.first_planned_delivery_date ?? null;
}

function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function freshSourceNames(data: PlanningData, now: Date): Set<string> {
  return new Set(data.sources.filter((source) => isPlanningSourceFresh(source, now))
    .map((source) => source.source_system));
}

export function planningIncomingSupply(data: PlanningData, now = new Date()): PlanningIncomingSupply | null {
  if (data.truncated || planningSourceState(data, now) !== 'fresh') return null;
  const sources = freshSourceNames(data, now);
  const today = localDate(now);
  const units = data.units.filter((unit) => {
    const date = planningSupplyDate(unit);
    return sources.has(unit.source_system) && date !== null && date > today
      && ['available', 'incoming', 'in_production'].includes(unit.supply_status);
  }).sort((a, b) => planningSupplyDate(a)!.localeCompare(planningSupplyDate(b)!) || a.id.localeCompare(b.id));
  const lots = data.lots.filter((lot) => sources.has(lot.source_system)
    && lot.available_at !== null && lot.available_at > today && lot.quantity > 0
    && ['available', 'incoming', 'in_production'].includes(lot.supply_status))
    .sort((a, b) => a.available_at!.localeCompare(b.available_at!) || a.id.localeCompare(b.id));
  return { units, lots };
}

export function planningTimelinePeriods(
  scale: PlanningTimelineScale, horizon: PlanningTimelineHorizon, now = new Date(),
): PlanningPeriod[] {
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const limit = new Date(Date.UTC(now.getFullYear(), now.getMonth() + horizon, 1));
  const first = new Date(monthStart);
  if (scale === 'week') first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7));
  const periods: PlanningPeriod[] = [];
  for (let start = first; start < limit;) {
    const end = new Date(start);
    if (scale === 'week') end.setUTCDate(end.getUTCDate() + 7);
    else end.setUTCMonth(end.getUTCMonth() + 1);
    periods.push({ start: new Date(start), end });
    start = end;
  }
  return periods;
}

export function planningTimelineEntries(
  data: PlanningData, itemNumber: string, start: Date, end: Date, now = new Date(),
): PlanningTimelineEntry[] | null {
  if (data.truncated || planningSourceState(data, now) !== 'fresh') return null;
  const sources = freshSourceNames(data, now);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);
  const today = localDate(now);
  const inRange = (date: string | null): date is string => date !== null && date >= startDate && date < endDate;
  const active = data.reservations.filter((row) => row.item_number === itemNumber && row.status === 'active');
  const reservationByUnit = new Map(active.filter((row) => row.supply_unit_id)
    .map((row) => [row.supply_unit_id, row]));
  const exceptions = planningExceptions(data, now).filter((row) => row.itemNumber === itemNumber);
  const problemKeys = new Set(exceptions.map((row) => row.key));
  for (const conflict of data.conflicts ?? []) {
    if (conflict.status === 'open' && problemKeys.has(conflict.id)) problemKeys.add(conflict.supply_unit_id);
  }
  const entries: PlanningTimelineEntry[] = [];
  for (const unit of data.units) {
    if (unit.item_number !== itemNumber || !sources.has(unit.source_system)) continue;
    const reservation = reservationByUnit.get(unit.id);
    const date = planningSupplyDate(unit)
      ?? (unit.supply_status === 'available' ? today : reservation?.requested_delivery_date ?? null);
    if (!inRange(date)) continue;
    const state = problemKeys.has(unit.id) || (reservation && problemKeys.has(reservation.id))
      || ['blocked', 'unavailable'].includes(unit.supply_status) ? 'problem'
      : reservation?.reservation_type ?? (unit.supply_status === 'available' ? 'available' : 'incoming');
    entries.push({ key: `unit:${unit.id}`, itemNumber, date, state, unit, reservation });
  }
  for (const lot of data.lots) {
    if (lot.item_number !== itemNumber || !sources.has(lot.source_system)) continue;
    const date = lot.available_at ?? (lot.supply_status === 'available' ? today : null);
    if (!inRange(date)) continue;
    const state = ['blocked', 'unavailable'].includes(lot.supply_status) ? 'problem'
      : lot.supply_status === 'available' ? 'available' : 'incoming';
    entries.push({ key: `lot:${lot.id}`, itemNumber, date, state, lot });
  }
  for (const reservation of active) {
    if (reservation.supply_unit_id) continue;
    const date = reservation.requested_delivery_date;
    if (!inRange(date)) continue;
    entries.push({ key: `reservation:${reservation.id}`, itemNumber, date,
      state: problemKeys.has(reservation.id) ? 'problem' : reservation.reservation_type,
      reservation });
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
