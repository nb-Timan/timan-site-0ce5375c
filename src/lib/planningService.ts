import { supabase } from '@/lib/supabase';

export interface PlanningSource {
  source_system: string;
  connected: boolean;
  last_synced_at: string | null;
  freshness_limit_hours: number;
}

export interface PlanningUnit {
  id: string;
  source_system: string;
  item_number: string;
  serial_number: string | null;
  machine_ident_number: string | null;
  production_reference?: string | null;
  production_series?: number | null;
  production_series_position?: number | null;
  production_order_number?: string | null;
  erp_order_number?: string | null;
  slot_number?: string | null;
  production_completed_at?: string | null;
  production_completed_week?: number | null;
  production_completed_year?: number | null;
  first_planned_delivery_date?: string | null;
  current_planned_delivery_date?: string | null;
  confirmed_customer_delivery_date?: string | null;
  source_status?: string | null;
  available_at: string | null;
  expected_delivery_at: string | null;
  supply_status: 'available' | 'incoming' | 'in_production' | 'blocked' | 'demo' | 'unavailable';
  warehouse_location: string | null;
  source_updated_at: string;
}

export interface PlanningUnitPrivateDetail {
  dealer_name: string | null;
  customer_name: string | null;
  source_comment: string | null;
  production_notes: string | null;
  responsible_initials: string | null;
}

export async function loadPlanningUnitPrivateDetail(unitId: string): Promise<PlanningUnitPrivateDetail | null> {
  const { data, error } = await supabase.rpc('planning_get_unit_private_details', { p_unit_id: unitId });
  if (error) throw error;
  return (data?.[0] as PlanningUnitPrivateDetail | undefined) ?? null;
}

export async function searchPlanningPrivateUnits(query: string): Promise<Set<string>> {
  if (query.trim().length < 2) return new Set();
  const { data, error } = await supabase.rpc('planning_search_private_units', { p_query: query.trim() });
  if (error) throw error;
  return new Set((data ?? []).map((row: { unit_id: string }) => row.unit_id));
}

interface PlanningSupplyUnitRow extends Omit<PlanningUnit, 'erp_order_number'> {
  sales_order_number: string | null;
}

export function normalizePlanningUnit(row: PlanningSupplyUnitRow): PlanningUnit {
  const { sales_order_number, ...unit } = row;
  return { ...unit, erp_order_number: sales_order_number };
}

export function planningUnitMatchesQuery(
  unit: PlanningUnit,
  query: string,
  portalOrderNumbers: readonly string[] = [],
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [
    unit.item_number, unit.serial_number, unit.machine_ident_number,
    unit.production_reference, unit.production_series, unit.production_series_position,
    unit.production_order_number, unit.erp_order_number, unit.slot_number,
    ...portalOrderNumbers,
  ].some((value) => value != null && String(value).toLocaleLowerCase().includes(needle));
}

export interface PlanningLot {
  id: string;
  source_system: string;
  item_number: string;
  quantity: number;
  available_at: string | null;
  supply_status: 'available' | 'incoming' | 'in_production' | 'blocked' | 'unavailable';
}

export interface PlanningReservation {
  id: string;
  configuration_id: string;
  demand_key: string;
  item_number: string;
  item_kind: 'serialized' | 'quantity';
  supply_unit_id: string | null;
  supply_lot_id: string | null;
  quantity: number;
  reservation_type: 'soft_quote' | 'locked_quote' | 'order';
  status: 'active' | 'released';
  requested_delivery_date: string | null;
  lock_review_date: string | null;
  created_at: string;
}

export interface PlanningDeliveryRequest {
  id: string;
  configuration_id: string;
  demand_key: string;
  item_number: string;
  requested_delivery_date: string | null;
  request_status: 'open' | 'answered' | 'closed';
  response_note: string | null;
  expected_available_at: string | null;
}

export interface PlanningEvent {
  id: string;
  configuration_id: string | null;
  event_type: string;
  previous_supply_unit_id: string | null;
  next_supply_unit_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface PlanningConflict {
  id: string;
  supply_unit_id: string;
  field_name: string;
  existing_value: string;
  incoming_value: string;
  existing_source_system: string;
  incoming_source_system: string;
  status: 'open' | 'resolved';
}

export interface PlanningData {
  sources: PlanningSource[];
  units: PlanningUnit[];
  lots: PlanningLot[];
  reservations: PlanningReservation[];
  requests: PlanningDeliveryRequest[];
  events: PlanningEvent[];
  conflicts?: PlanningConflict[];
  orderNumbers?: Record<string, string>;
  documents?: Record<string, PlanningDocument>;
  truncated: boolean;
}

export interface PlanningDocument {
  quoteNumber: string | null;
  orderNumber: string | null;
  seller: string | null;
  dealer: string | null;
  customer: string | null;
}

export type PlanningReservationFilter = 'all' | 'soft_quote' | 'locked_quote' | 'order' | 'problem';

export function filterPlanningReservations(
  data: PlanningData, filter: PlanningReservationFilter,
): PlanningReservation[] {
  const active = data.reservations.filter((row) => row.status === 'active');
  if (filter === 'all') return active;
  if (filter === 'problem') {
    const problemIds = new Set(planningExceptions(data).map((item) => item.key));
    return active.filter((row) => problemIds.has(row.id));
  }
  return active.filter((row) => row.reservation_type === filter);
}

const PAGE_SIZE = 500;
const MAX_ROWS = 5000;

async function loadRows<T>(table: string, columns: string, orderColumn = 'id'): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let offset = 0; offset <= MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns).order(orderColumn).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }
  return { rows: rows.slice(0, MAX_ROWS), truncated: true };
}

export async function loadPlanningData(): Promise<PlanningData> {
  const [sources, unitRows, lots, reservations, requests, events, conflicts] = await Promise.all([
    loadRows<PlanningSource>('planning_supply_sources', 'source_system,connected,last_synced_at,freshness_limit_hours', 'source_system'),
    loadRows<PlanningSupplyUnitRow>('planning_supply_units',
      'id,source_system,item_number,serial_number,machine_ident_number,production_reference,production_series,production_series_position,production_order_number,sales_order_number,slot_number,production_completed_at,production_completed_week,production_completed_year,first_planned_delivery_date,current_planned_delivery_date,confirmed_customer_delivery_date,source_status,available_at,expected_delivery_at,supply_status,warehouse_location,source_updated_at'),
    loadRows<PlanningLot>('planning_supply_lots', 'id,source_system,item_number,quantity,available_at,supply_status'),
    loadRows<PlanningReservation>('planning_reservations', 'id,configuration_id,demand_key,item_number,item_kind,supply_unit_id,supply_lot_id,quantity,reservation_type,status,requested_delivery_date,lock_review_date,created_at'),
    loadRows<PlanningDeliveryRequest>('planning_delivery_requests', 'id,configuration_id,demand_key,item_number,requested_delivery_date,request_status,response_note,expected_available_at'),
    loadRows<PlanningEvent>('planning_events', 'id,configuration_id,event_type,previous_supply_unit_id,next_supply_unit_id,reason,created_at'),
    loadRows<PlanningConflict>('planning_supply_conflicts',
      'id,supply_unit_id,field_name,existing_value,incoming_value,existing_source_system,incoming_source_system,status'),
  ]);
  const units = unitRows.rows.map(normalizePlanningUnit);
  const orderNumbers: Record<string, string> = {};
  const documents: Record<string, PlanningDocument> = {};
  const configurationIds = [...new Set(reservations.rows.filter((row) => row.status === 'active')
    .map((row) => row.configuration_id))];
  for (let index = 0; index < configurationIds.length; index += PAGE_SIZE) {
    const { data: configurations, error } = await supabase.from('configurations')
      .select('id,quote_number,order_number,assigned_seller_id,dealer_number,customer_name')
      .in('id', configurationIds.slice(index, index + PAGE_SIZE));
    if (error) throw error;
    const sellerIds = [...new Set((configurations ?? [])
      .map((row) => row.assigned_seller_id).filter((id): id is string => !!id))];
    const sellerNames: Record<string, string> = {};
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabase.from('app_users')
        .select('id,initials').in('id', sellerIds);
      for (const seller of sellers ?? []) sellerNames[seller.id] = seller.initials ?? '';
    }
    for (const configuration of configurations ?? []) {
      documents[configuration.id] = {
        quoteNumber: configuration.quote_number,
        orderNumber: configuration.order_number,
        seller: sellerNames[configuration.assigned_seller_id ?? ''] || null,
        dealer: configuration.dealer_number,
        customer: configuration.customer_name,
      };
      if (configuration.order_number) orderNumbers[configuration.id] = configuration.order_number;
    }
  }
  return {
    sources: sources.rows,
    units,
    lots: lots.rows,
    reservations: reservations.rows,
    requests: requests.rows,
    events: events.rows,
    conflicts: conflicts.rows,
    orderNumbers,
    documents,
    truncated: [sources, unitRows, lots, reservations, requests, events, conflicts].some((result) => result.truncated),
  };
}

export function isPlanningSourceFresh(source: PlanningSource, now = new Date()): boolean {
  if (!source.connected || !source.last_synced_at || !Number.isFinite(source.freshness_limit_hours)) return false;
  const synced = Date.parse(source.last_synced_at);
  return Number.isFinite(synced)
    && synced <= now.getTime()
    && now.getTime() - synced <= source.freshness_limit_hours * 3_600_000;
}

export function planningSourceState(data: PlanningData, now = new Date()): 'missing' | 'stale' | 'fresh' {
  if (!data.sources.some((source) => source.connected)) return 'missing';
  return data.sources.some((source) => isPlanningSourceFresh(source, now)) ? 'fresh' : 'stale';
}

export interface PlanningItemSummary {
  itemNumber: string;
  stock: number;
  incoming: number;
  softQuotes: number;
  lockedQuotes: number;
  orders: number;
  nextAvailable: string | null;
}

export function planningItemSummary(data: PlanningData, itemNumber: string, now = new Date()): PlanningItemSummary | null {
  if (data.truncated || planningSourceState(data, now) !== 'fresh') return null;
  const freshSources = new Set(data.sources.filter((source) => isPlanningSourceFresh(source, now)).map((source) => source.source_system));
  const active = data.reservations.filter((reservation) => reservation.item_number === itemNumber && reservation.status === 'active');
  const reservedUnits = new Set(active.map((reservation) => reservation.supply_unit_id).filter(Boolean));
  const reservedLots = new Map<string, number>();
  for (const reservation of active) {
    if (!reservation.supply_lot_id) continue;
    reservedLots.set(reservation.supply_lot_id, (reservedLots.get(reservation.supply_lot_id) ?? 0) + reservation.quantity);
  }
  const units = data.units.filter((unit) => unit.item_number === itemNumber && freshSources.has(unit.source_system));
  const lots = data.lots.filter((lot) => lot.item_number === itemNumber && freshSources.has(lot.source_system));
  if (units.length === 0 && lots.length === 0) return null;
  const today = now.toISOString().slice(0, 10);
  const stock = units.filter((unit) =>
    unit.supply_status === 'available' && (unit.available_at ?? today) <= today,
  ).length + lots.filter((lot) => lot.supply_status === 'available' && (lot.available_at ?? today) <= today)
    .reduce((sum, lot) => sum + lot.quantity, 0);
  const incoming = units.filter((unit) => ['incoming', 'in_production'].includes(unit.supply_status)).length
    + lots.filter((lot) => ['incoming', 'in_production'].includes(lot.supply_status))
      .reduce((sum, lot) => sum + lot.quantity, 0);
  const dates = [
    ...units.filter((unit) => !reservedUnits.has(unit.id) && ['available', 'incoming', 'in_production'].includes(unit.supply_status))
      .map((unit) => unit.available_at ?? today),
    ...lots.filter((lot) => lot.quantity > (reservedLots.get(lot.id) ?? 0)
      && ['available', 'incoming', 'in_production'].includes(lot.supply_status))
      .map((lot) => lot.available_at ?? today),
  ].sort();
  return {
    itemNumber, stock, incoming,
    softQuotes: active.filter((reservation) => reservation.reservation_type === 'soft_quote').length,
    lockedQuotes: active.filter((reservation) => reservation.reservation_type === 'locked_quote').length,
    orders: active.filter((reservation) => reservation.reservation_type === 'order').length,
    nextAvailable: dates[0] ?? null,
  };
}

export function planningTimelineUnits(data: PlanningData, itemNumber: string, start: Date, end: Date, now = new Date()): number | null {
  if (data.truncated || planningSourceState(data, now) !== 'fresh') return null;
  const freshSources = new Set(data.sources.filter((source) => isPlanningSourceFresh(source, now)).map((source) => source.source_system));
  const units = data.units.filter((unit) => unit.item_number === itemNumber
    && freshSources.has(unit.source_system)
    && ['available', 'incoming', 'in_production'].includes(unit.supply_status)
    && unit.available_at
    && new Date(`${unit.available_at}T12:00:00Z`) >= start
    && new Date(`${unit.available_at}T12:00:00Z`) < end).length;
  const lots = data.lots.filter((lot) => lot.item_number === itemNumber
    && freshSources.has(lot.source_system)
    && ['available', 'incoming', 'in_production'].includes(lot.supply_status)
    && lot.available_at
    && new Date(`${lot.available_at}T12:00:00Z`) >= start
    && new Date(`${lot.available_at}T12:00:00Z`) < end)
    .reduce((sum, lot) => sum + lot.quantity, 0);
  return units + lots;
}

export interface PlanningTimelineBucket {
  available: number;
  incoming: number;
  soft: number;
  locked: number;
  orders: number;
  problems: number;
}

export function planningTimelineBucket(
  data: PlanningData, itemNumber: string, start: Date, end: Date, now = new Date(),
): PlanningTimelineBucket | null {
  if (data.truncated || planningSourceState(data, now) !== 'fresh') return null;
  const freshSources = new Set(data.sources.filter((source) => isPlanningSourceFresh(source, now))
    .map((source) => source.source_system));
  const inPeriod = (date: string | null) => !!date && Date.parse(`${date}T12:00:00Z`) >= start.getTime()
    && Date.parse(`${date}T12:00:00Z`) < end.getTime();
  const units = data.units.filter((unit) => unit.item_number === itemNumber && freshSources.has(unit.source_system)
    && inPeriod(unit.available_at));
  const lots = data.lots.filter((lot) => lot.item_number === itemNumber && freshSources.has(lot.source_system)
    && inPeriod(lot.available_at));
  const reservations = data.reservations.filter((row) => row.item_number === itemNumber
    && row.status === 'active' && inPeriod(row.requested_delivery_date));
  const periodKeys = new Set([
    ...units.map((unit) => unit.id),
    ...reservations.map((row) => row.id),
    ...data.requests.filter((row) => row.item_number === itemNumber && inPeriod(row.requested_delivery_date))
      .map((row) => row.id),
  ]);
  return {
    available: units.filter((unit) => unit.supply_status === 'available').length
      + lots.filter((lot) => lot.supply_status === 'available').reduce((sum, lot) => sum + lot.quantity, 0),
    incoming: units.filter((unit) => ['incoming', 'in_production'].includes(unit.supply_status)).length
      + lots.filter((lot) => ['incoming', 'in_production'].includes(lot.supply_status))
        .reduce((sum, lot) => sum + lot.quantity, 0),
    soft: reservations.filter((row) => row.reservation_type === 'soft_quote').length,
    locked: reservations.filter((row) => row.reservation_type === 'locked_quote').length,
    orders: reservations.filter((row) => row.reservation_type === 'order').length,
    problems: new Set(planningExceptions(data, now).filter((item) => item.itemNumber === itemNumber
      && periodKeys.has(item.key)).map((item) => item.key)).size,
  };
}

export type PlanningExceptionKind = 'source_stale' | 'order_unassigned' | 'quote_unassigned'
  | 'delivery_late' | 'lock_review' | 'incoming_without_serial' | 'delivery_request_open' | 'source_conflict';
export interface PlanningException {
  kind: PlanningExceptionKind;
  key: string;
  itemNumber?: string;
  configurationId?: string;
}

export function planningExceptions(data: PlanningData, now = new Date()): PlanningException[] {
  const exceptions: PlanningException[] = [];
  for (const source of data.sources) {
    if (source.connected && !isPlanningSourceFresh(source, now)) {
      exceptions.push({ kind: 'source_stale', key: source.source_system });
    }
  }
  for (const unit of data.units) {
    if (!unit.serial_number && ['incoming', 'in_production'].includes(unit.supply_status)) {
      exceptions.push({ kind: 'incoming_without_serial', key: unit.id, itemNumber: unit.item_number });
    }
  }
  for (const conflict of data.conflicts ?? []) {
    if (conflict.status !== 'open') continue;
    const unit = data.units.find((row) => row.id === conflict.supply_unit_id);
    exceptions.push({ kind: 'source_conflict', key: conflict.id, itemNumber: unit?.item_number });
  }
  const unitById = new Map(data.units.map((unit) => [unit.id, unit]));
  const lotById = new Map(data.lots.map((lot) => [lot.id, lot]));
  for (const reservation of data.reservations) {
    if (reservation.status !== 'active') continue;
    const base = { key: reservation.id, itemNumber: reservation.item_number, configurationId: reservation.configuration_id };
    if (!reservation.supply_unit_id && !reservation.supply_lot_id) {
      exceptions.push({ ...base, kind: reservation.reservation_type === 'order' ? 'order_unassigned' : 'quote_unassigned' });
    } else if (reservation.supply_unit_id && reservation.requested_delivery_date) {
      const unit = unitById.get(reservation.supply_unit_id);
      if (unit?.available_at && unit.available_at > reservation.requested_delivery_date) {
        exceptions.push({ ...base, kind: 'delivery_late' });
      }
    } else if (reservation.supply_lot_id && reservation.requested_delivery_date) {
      const lot = lotById.get(reservation.supply_lot_id);
      if (lot?.available_at && lot.available_at > reservation.requested_delivery_date) {
        exceptions.push({ ...base, kind: 'delivery_late' });
      }
    }
    if (reservation.reservation_type === 'locked_quote' && reservation.lock_review_date
      && reservation.lock_review_date < now.toISOString().slice(0, 10)) {
      exceptions.push({ ...base, kind: 'lock_review' });
    }
  }
  for (const request of data.requests) {
    if (request.request_status === 'open') {
      exceptions.push({ kind: 'delivery_request_open', key: request.id,
        itemNumber: request.item_number, configurationId: request.configuration_id });
    }
  }
  return exceptions;
}
