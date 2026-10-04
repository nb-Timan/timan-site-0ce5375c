import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Boxes, CalendarDays, ClipboardList, LockKeyhole, Package, Search, Table2, Truck } from 'lucide-react';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import PlanningUnitDetail from '@/components/PlanningUnitDetail';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { derivePortalRole } from '@/lib/portalAccess';
import { useLanguage } from '@/context/LanguageContext';
import { ACCESSORIES, PRODUCTS } from '@/data/machines';
import { t } from '@/lib/i18n/translations';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  loadPlanningData, planningExceptions, planningItemSummary, planningSourceState, planningTimelineBucket,
  isPlanningSourceFresh, loadPlanningUnitPrivateDetail, planningUnitMatchesQuery, searchPlanningPrivateUnits,
  filterPlanningReservations,
  type PlanningData, type PlanningExceptionKind, type PlanningUnitPrivateDetail,
  type PlanningReservation, type PlanningDeliveryRequest, type PlanningReservationFilter,
} from '@/lib/planningService';

type PlanningTab = 'overview' | 'attachments' | 'reservations' | 'incoming' | 'timeline';
type DisplayMode = 'table' | 'timeline';

const MACHINE_KEYS = ['RC-751', 'RC-1000S', 'Timan 3330', 'Timan 2620'] as const;
const TABS: { id: PlanningTab; label: string }[] = [
  { id: 'overview', label: 'planningOverview' },
  { id: 'attachments', label: 'planningAttachments' },
  { id: 'reservations', label: 'planningReservations' },
  { id: 'incoming', label: 'planningIncoming' },
  { id: 'timeline', label: 'planningTimeline' },
];
const EXCEPTION_LABEL: Record<PlanningExceptionKind, string> = {
  source_stale: 'planningSourceStale',
  order_unassigned: 'planningOrderUnassigned',
  quote_unassigned: 'planningQuoteUnassigned',
  delivery_late: 'planningDeliveryLate',
  lock_review: 'planningLockReview',
  incoming_without_serial: 'planningIncomingWithoutSerial',
  delivery_request_open: 'planningDeliveryRequestOpen',
  source_conflict: 'planningSourceConflict',
};
const PRODUCTION_FIELD_LABEL: Record<string, string> = {
  serial_number: 'planningSerial', machine_ident_number: 'planningMachineIdentity',
  production_reference: 'planningProductionReference', production_order_number: 'planningProductionOrder',
  sales_order_number: 'planningErpOrder', slot_number: 'planningSlot',
  production_completed_at: 'planningProductionEnd',
  first_planned_delivery_date: 'planningFirstPlannedDelivery',
  current_planned_delivery_date: 'planningCurrentPlannedDelivery',
  confirmed_customer_delivery_date: 'planningConfirmedDelivery',
};

type PlanningAction =
  | { kind: 'serial' | 'lock' | 'unlock' | 'release' | 'delivery'; reservation: PlanningReservation }
  | { kind: 'answer'; request: PlanningDeliveryRequest };

function readableDate(value: string | null, language: string): string {
  if (!value) return '—';
  const date = new Date(value + (value.length === 10 ? 'T12:00:00Z' : ''));
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(language === 'da' ? 'da-DK' : language, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
    : value;
}

function periodStarts(scale: 'week' | 'month'): Date[] {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (scale === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  else start.setDate(1);
  return Array.from({ length: 8 }, (_, index) => {
    const date = new Date(start);
    if (scale === 'week') date.setDate(date.getDate() + index * 7);
    else date.setMonth(date.getMonth() + index);
    return date;
  });
}

export default function PlanningPage() {
  const { appUser, logout } = useAppUser();
  const effectiveUser = useEffectivePortalUser(appUser) ?? appUser;
  const portalRole = derivePortalRole(effectiveUser);
  const canManage = portalRole === 'timan_backend' || portalRole === 'timan_seller';
  const isPlanner = portalRole === 'timan_backend';
  const { language, uiLanguage, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [data, setData] = useState<PlanningData | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<PlanningTab>('overview');
  const [reservationFilter, setReservationFilter] = useState<PlanningReservationFilter>('all');
  const [mode, setMode] = useState<DisplayMode>('table');
  const [scale, setScale] = useState<'week' | 'month'>('week');
  const [search, setSearch] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [privateDetail, setPrivateDetail] = useState<PlanningUnitPrivateDetail | null>(null);
  const [privateSearch, setPrivateSearch] = useState<{ query: string; ids: Set<string> } | null>(null);
  const [action, setAction] = useState<PlanningAction | null>(null);
  const [reason, setReason] = useState('');
  const [serialId, setSerialId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const label = (key: string) => t(key, uiLanguage);

  const refresh = useCallback(() => {
    let cancelled = false;
    loadPlanningData()
      .then((value) => { if (!cancelled) { setData(value); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => refresh(), [refresh]);
  useEffect(() => {
    let cancelled = false;
    setPrivateDetail(null);
    if (isPlanner && selectedUnitId) {
      loadPlanningUnitPrivateDetail(selectedUnitId)
        .then((detail) => { if (!cancelled) setPrivateDetail(detail); })
        .catch(() => { if (!cancelled) setPrivateDetail(null); });
    }
    return () => { cancelled = true; };
  }, [isPlanner, selectedUnitId]);
  useEffect(() => {
    let cancelled = false;
    const query = search.trim();
    setPrivateSearch(null);
    if (isPlanner && query.length >= 2) {
      const timer = window.setTimeout(() => {
        searchPlanningPrivateUnits(query)
          .then((ids) => { if (!cancelled) setPrivateSearch({ query, ids }); })
          .catch(() => { if (!cancelled) setPrivateSearch(null); });
      }, 200);
      return () => { cancelled = true; window.clearTimeout(timer); };
    }
    return () => { cancelled = true; };
  }, [isPlanner, search]);

  const openAction = (next: PlanningAction) => {
    setAction(next);
    setReason('');
    setSerialId('');
    setExpectedDate(next.kind === 'answer' ? '' : next.reservation.requested_delivery_date ?? '');
    setActionError(false);
  };

  const submitAction = async () => {
    if (!action || busy) return;
    setBusy(true);
    setActionError(false);
    try {
      const result = action.kind === 'answer'
      ? await supabase.rpc('planning_answer_delivery_request', {
        p_request_id: action.request.id, p_expected_available_at: expectedDate || null, p_response_note: reason,
      })
      : action.kind === 'delivery'
        ? await supabase.rpc('planning_request_delivery', {
          p_configuration_id: action.reservation.configuration_id,
          p_demand_key: action.reservation.demand_key,
          p_item_number: action.reservation.item_number,
          p_requested_date: expectedDate || null, p_note: reason,
        })
        : action.kind === 'serial'
          ? await supabase.rpc('planning_assign_serial', {
            p_reservation_id: action.reservation.id, p_supply_unit_id: serialId, p_reason: reason,
          })
          : action.kind === 'release'
            ? await supabase.rpc('planning_release_reservation', {
              p_reservation_id: action.reservation.id, p_reason: reason,
            })
            : await supabase.rpc('planning_lock_quote', {
              p_reservation_id: action.reservation.id, p_reason: reason,
              p_review_date: expectedDate || null, p_locked: action.kind === 'lock',
            });
      if (result.error) { setActionError(true); return; }
      setAction(null);
      refresh();
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  };

  const sourceState = data ? planningSourceState(data) : 'missing';
  const completeSupply = sourceState === 'fresh' && !data?.truncated;
  const exceptions = useMemo(() => data ? planningExceptions(data) : [], [data]);
  const machineRows = MACHINE_KEYS.map((key) => {
    const product = PRODUCTS[key];
    return { key, product, summary: data ? planningItemSummary(data, product.varenr) : null };
  });
  const stock = machineRows.reduce((sum, row) => sum + (row.summary?.stock ?? 0), 0);
  const incoming = machineRows.reduce((sum, row) => sum + (row.summary?.incoming ?? 0), 0);
  const activeReservations = data?.reservations.filter((row) => row.status === 'active') ?? [];
  const filteredReservations = data ? filterPlanningReservations(data, reservationFilter) : [];
  const reservationCount = (kind: string) => activeReservations.filter((row) => row.reservation_type === kind).length;
  const attachmentRows = selectedMachine
    ? (ACCESSORIES[selectedMachine] ?? []).filter((item) => item.varenr && item.varenr !== 'HEADER' && !item.isHeader)
    : Object.values(ACCESSORIES).flat().filter((item) => item.varenr && item.varenr !== 'HEADER' && !item.isHeader);
  const dedupedAttachments = [...new Map(attachmentRows.map((item) => [item.varenr, item])).values()];
  const matches = (itemNumber: string, name: string) => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return true;
    return [itemNumber, name].some((value) => value.toLocaleLowerCase().includes(query))
      || (data?.units.some((unit) => {
        if (unit.item_number !== itemNumber) return false;
        const portalOrders = activeReservations.filter((reservation) => reservation.supply_unit_id === unit.id
          && reservation.reservation_type === 'order')
          .map((reservation) => data.orderNumbers?.[reservation.configuration_id]).filter((number): number is string => !!number);
        return planningUnitMatchesQuery(unit, query, portalOrders)
          || (privateSearch?.query === search.trim() && privateSearch.ids.has(unit.id));
      }) ?? false);
  };
  const periods = periodStarts(scale);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <PortalHeader
        user={appUser}
        language={language}
        onLanguageChange={setLanguage}
        onLogout={async () => { await logout(); navigate('/portal', { replace: true }); }}
      />
      <main className="mx-auto w-full max-w-[1700px] min-w-0 flex-1 px-4 py-7 sm:px-6 xl:px-12">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold text-slate-900">{label('area_planning_title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{label('area_planning_desc')}</p>
        </header>

        {error ? <p role="alert" className="border-l-4 border-red-500 bg-red-50 p-3 text-sm text-red-800">{label('planningLoadError')}</p>
          : !data ? <p className="text-sm text-slate-600">{label('planningLoading')}</p>
            : (
              <>
                {!completeSupply && (
                  <div role="status" className="mb-5 flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{sourceState === 'missing' ? label('planningNoSupply') : label('planningStaleSupply')}</span>
                  </div>
                )}
                <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    { title: 'planningStock', value: completeSupply ? stock : '—', icon: Boxes, target: 'overview' as PlanningTab },
                    { title: 'planningSoftQuotes', value: reservationCount('soft_quote'), icon: ClipboardList, target: 'reservations' as PlanningTab },
                    { title: 'planningLockedQuotes', value: reservationCount('locked_quote'), icon: LockKeyhole, target: 'reservations' as PlanningTab },
                    { title: 'planningOrders', value: reservationCount('order'), icon: Package, target: 'reservations' as PlanningTab },
                    { title: 'planningIncomingUnits', value: completeSupply ? incoming : '—', icon: Truck, target: 'incoming' as PlanningTab },
                    { title: 'planningRequiresAction', value: exceptions.length, icon: AlertTriangle, target: 'overview' as PlanningTab },
                  ].map((card) => (
                    <button key={card.title} type="button" onClick={() => setTab(card.target)}
                      className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-3 text-left hover:border-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
                      <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
                        <span>{label(card.title)}</span><card.icon className="h-4 w-4 shrink-0" aria-hidden />
                      </div>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{card.value}</p>
                    </button>
                  ))}
                </div>

                <nav aria-label={label('area_planning_title')} className="mb-5 flex max-w-full gap-1 overflow-x-auto border-b border-slate-200">
                  {TABS.map((item) => (
                    <button key={item.id} type="button" onClick={() => setTab(item.id)}
                      aria-current={tab === item.id ? 'page' : undefined}
                      className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${tab === item.id
                        ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
                      {label(item.label)}
                    </button>
                  ))}
                </nav>

                {tab === 'overview' && (
                  <section className="mb-7" aria-labelledby="planning-action-heading">
                    <h2 id="planning-action-heading" className="mb-2 text-base font-semibold text-slate-900">{label('planningRequiresAction')}</h2>
                    {exceptions.length === 0
                      ? <p className="text-sm text-slate-600">{label('planningNoRecords')}</p>
                      : <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
                        {exceptions.map((item) => (
                          <li key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                            <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden />
                            <span>{label(EXCEPTION_LABEL[item.kind])}</span>
                            {item.itemNumber && <span className="font-medium tabular-nums">{item.itemNumber}</span>}
                            {isPlanner && item.kind === 'source_conflict' && (() => {
                              const conflict = data.conflicts?.find((row) => row.id === item.key);
                              return conflict ? <span className="break-words text-xs text-slate-700">
                                {label(PRODUCTION_FIELD_LABEL[conflict.field_name] ?? 'planningSource')}:
                                {' '}{conflict.existing_source_system} {conflict.existing_value}
                                {' → '}{conflict.incoming_source_system} {conflict.incoming_value}
                              </span> : null;
                            })()}
                            {isPlanner && item.kind === 'delivery_request_open' && data.requests.find((request) => request.id === item.key)
                              && <button type="button" className="ml-auto text-emerald-800 underline"
                                onClick={() => openAction({ kind: 'answer', request: data.requests.find((request) => request.id === item.key)! })}>
                                {label('planningAnswerDelivery')}
                              </button>}
                            {item.configurationId && item.kind !== 'delivery_request_open' && <button type="button" className="ml-auto text-emerald-800 underline"
                              onClick={() => { setSearch(item.itemNumber ?? ''); setTab('reservations'); }}>
                              {label('planningReservations')}
                            </button>}
                          </li>
                        ))}
                      </ul>}
                  </section>
                )}

                {['overview', 'attachments', 'incoming', 'timeline'].includes(tab) && (
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <label className="relative block w-full max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
                        <span className="sr-only">{label('planningSearch')}</span>
                        <input value={search} onChange={(event) => setSearch(event.target.value)}
                          placeholder={label('planningSearch')} className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm" />
                      </label>
                      <div className="flex rounded-md border border-slate-300 bg-white" aria-label={label('planningAvailability')}>
                        <button type="button" onClick={() => setMode('table')} aria-pressed={mode === 'table'}
                          title={label('planningTable')} className={`p-2 ${mode === 'table' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600'}`}>
                          <Table2 className="h-4 w-4" aria-hidden /><span className="sr-only">{label('planningTable')}</span>
                        </button>
                        <button type="button" onClick={() => setMode('timeline')} aria-pressed={mode === 'timeline'}
                          title={label('planningTimelineMode')} className={`border-l border-slate-300 p-2 ${mode === 'timeline' ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600'}`}>
                          <CalendarDays className="h-4 w-4" aria-hidden /><span className="sr-only">{label('planningTimelineMode')}</span>
                        </button>
                      </div>
                    </div>
                    {mode === 'table' ? (
                      <div className="max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white">
                        <table className="w-full min-w-[720px] text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                            <tr>{['planningItemNumber', 'planningDescription', 'planningStock', 'planningSoftQuotes', 'planningLockedQuotes',
                              'planningOrders', 'planningIncomingUnits', 'planningNextAvailable'].map((key) =>
                              <th key={key} scope="col" className="whitespace-nowrap px-3 py-2">{label(key)}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(tab === 'attachments'
                              ? dedupedAttachments.map((item) => ({ key: item.varenr, itemNumber: item.varenr, name: typeof item.name === 'string' ? item.name : (item.name[uiLanguage] ?? item.name.en ?? item.name.da) }))
                              : machineRows.map((row) => ({ key: row.key, itemNumber: row.product.varenr, name: typeof row.product.name === 'string' ? row.product.name : (row.product.name[uiLanguage] ?? row.product.name.en ?? row.product.name.da) }))
                            ).filter((row) => matches(row.itemNumber, row.name)).map((row) => {
                              const summary = planningItemSummary(data, row.itemNumber);
                              return (
                                <tr key={row.key} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium tabular-nums">{row.itemNumber}</td>
                                  <td className="px-3 py-2">{tab === 'overview'
                                    ? <button type="button" className="text-left font-medium text-emerald-800 underline"
                                      onClick={() => { setSelectedMachine(row.key); setSelectedUnitId(null); }}>
                                      {row.name}
                                    </button> : row.name}</td>
                                  <td className="px-3 py-2 tabular-nums">{summary?.stock ?? '—'}</td>
                                  <td className="px-3 py-2 tabular-nums">{summary?.softQuotes ?? '—'}</td>
                                  <td className="px-3 py-2 tabular-nums">{summary?.lockedQuotes ?? '—'}</td>
                                  <td className="px-3 py-2 tabular-nums">{summary?.orders ?? '—'}</td>
                                  <td className="px-3 py-2 tabular-nums">{summary?.incoming ?? '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">{readableDate(summary?.nextAvailable ?? null, uiLanguage)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white">
                        <div className="flex justify-end border-b border-slate-200 p-2">
                          <button type="button" onClick={() => setScale(scale === 'week' ? 'month' : 'week')}
                            className="rounded border border-slate-300 px-3 py-1 text-xs font-medium">
                            {label(scale === 'week' ? 'planningMonth' : 'planningWeek')}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-200 px-2 py-1 text-[11px] text-slate-600">
                          {([
                            ['planningGreen', 'bg-emerald-500'], ['planningSupplyIncoming', 'bg-sky-500'],
                            ['planningSoftQuotes', 'bg-amber-400'], ['planningLockedQuotes', 'bg-orange-500'],
                            ['planningOrders', 'bg-indigo-500'], ['planningRequiresAction', 'bg-rose-500'],
                          ] as const).map(([key, color]) => <span key={key} className="inline-flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />{label(key)}
                          </span>)}
                        </div>
                        <div className="min-w-[1050px]">
                          <div className="grid grid-cols-[170px_repeat(8,minmax(110px,1fr))] border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                            <span className="p-2">{label('planningMachines')}</span>
                            {periods.map((period) => <span key={period.toISOString()} className="p-2">
                              {new Intl.DateTimeFormat(uiLanguage, { month: 'short', day: 'numeric' }).format(period)}
                            </span>)}
                          </div>
                          {machineRows.filter((row) => matches(row.product.varenr, row.key)).map((row) => (
                            <div key={row.key} className="grid grid-cols-[170px_repeat(8,minmax(110px,1fr))] border-b border-slate-100 text-xs">
                              <span className="p-2 font-medium">{row.key}</span>
                              {periods.map((period, index) => {
                                const end = periods[index + 1] ?? (() => {
                                  const next = new Date(period);
                                  if (scale === 'week') next.setDate(next.getDate() + 7);
                                  else next.setMonth(next.getMonth() + 1);
                                  return next;
                                })();
                                const bucket = planningTimelineBucket(data, row.product.varenr, period, end);
                                const values = bucket && ([
                                  ['available', 'planningGreen', 'text-emerald-700'],
                                  ['incoming', 'planningSupplyIncoming', 'text-sky-700'],
                                  ['soft', 'planningSoftQuotes', 'text-amber-700'],
                                  ['locked', 'planningLockedQuotes', 'text-orange-700'],
                                  ['orders', 'planningOrders', 'text-indigo-700'],
                                  ['problems', 'planningRequiresAction', 'text-rose-700'],
                                ] as const).filter(([key]) => bucket[key] > 0);
                                return <span key={period.toISOString()} className="flex flex-wrap content-start gap-x-2 border-l border-slate-100 p-2 tabular-nums">
                                  {values?.length ? values.map(([key, labelKey, color]) =>
                                    <span key={key} title={`${label(labelKey)}: ${bucket[key]}`} className={`font-semibold ${color}`}>
                                      <span className="sr-only">{label(labelKey)}: </span>{bucket[key]}
                                    </span>) : '—'}
                                </span>;
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {tab === 'overview' && (
                      <section className="mt-4">
                        {selectedMachine && (() => {
                          const itemNumber = PRODUCTS[selectedMachine]?.varenr;
                          const units = data.units.filter((unit) => unit.item_number === itemNumber);
                          const unitIds = new Set(units.map((unit) => unit.id));
                          const events = data.events.filter((event) =>
                            (event.previous_supply_unit_id && unitIds.has(event.previous_supply_unit_id))
                            || (event.next_supply_unit_id && unitIds.has(event.next_supply_unit_id)))
                            .sort((left, right) => right.created_at.localeCompare(left.created_at));
                          const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
                          const orderReservation = activeReservations.find((reservation) => reservation.supply_unit_id === selectedUnitId
                            && reservation.reservation_type === 'order');
                          return <div className="mt-4 border-t border-slate-200 pt-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="font-semibold text-slate-900">{selectedMachine} · {itemNumber}</h3>
                              <button type="button" className="text-sm font-medium text-emerald-800 underline"
                                onClick={() => setTab('attachments')}>{label('planningAttachments')}</button>
                            </div>
                            {units.length === 0 ? <p className="mt-2 text-sm text-slate-600">{label('planningNoRecords')}</p>
                              : <div className="mt-3 max-w-full overflow-x-auto border border-slate-200 bg-white">
                                <table className="w-full min-w-[550px] text-left text-sm">
                                  <thead className="bg-slate-50"><tr>
                                    {['planningSerial', 'planningStatus', 'planningAssignedDate', 'planningSource'].map((key) =>
                                      <th key={key} scope="col" className="px-3 py-2 font-medium">{label(key)}</th>)}
                                  </tr></thead>
                                  <tbody className="divide-y divide-slate-100">{units.filter((unit) => {
                                    const portalOrders = activeReservations.filter((reservation) => reservation.supply_unit_id === unit.id
                                      && reservation.reservation_type === 'order')
                                      .map((reservation) => data.orderNumbers?.[reservation.configuration_id])
                                      .filter((number): number is string => !!number);
                                    return planningUnitMatchesQuery(unit, search, portalOrders)
                                      || (privateSearch?.query === search.trim() && privateSearch.ids.has(unit.id));
                                  }).map((unit) =>
                                    <tr key={unit.id}>
                                      <td className="px-3 py-2 tabular-nums"><button type="button"
                                        onClick={() => setSelectedUnitId(unit.id)}
                                        className="text-left text-emerald-800 underline">
                                        {unit.serial_number ?? unit.machine_ident_number ?? label('planningUnassigned')}
                                      </button></td>
                                      <td className="px-3 py-2">{label({
                                        available: 'planningGreen', incoming: 'planningSupplyIncoming',
                                        in_production: 'planningInProduction', blocked: 'planningBlocked',
                                        demo: 'planningDemo', unavailable: 'planningUnavailable',
                                      }[unit.supply_status] ?? 'planningUnknown')}</td>
                                      <td className="px-3 py-2">{readableDate(unit.available_at, uiLanguage)}</td>
                                      <td className="px-3 py-2">{unit.source_system}</td>
                                    </tr>)}</tbody>
                                </table>
                              </div>}
                            {selectedUnit && <PlanningUnitDetail unit={selectedUnit}
                              portalOrderNumber={orderReservation ? data.orderNumbers?.[orderReservation.configuration_id] : undefined}
                              language={uiLanguage} label={label} privateDetail={privateDetail} />}
                            <h4 className="mt-4 text-sm font-semibold">{label('planningTimeline')}</h4>
                            {events.length === 0 ? <p className="mt-1 text-sm text-slate-600">{label('planningNoRecords')}</p>
                              : <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
                                {events.slice(0, 50).map((event) => <li key={event.id} className="flex flex-wrap gap-x-3 px-2 py-2 text-xs">
                                  <time>{readableDate(event.created_at, uiLanguage)}</time>
                                  <span>{label({
                                    quote_reservation: 'planningSoftQuotes', order_allocation: 'planningOrders',
                                    quote_lock: 'planningLock', quote_unlock: 'planningUnlock',
                                    manual_serial_change: 'planningChangeSerial', manual_release: 'planningRelease',
                                    delivery_requested: 'planningRequestDelivery', delivery_answered: 'planningAnswerDelivery',
                                  }[event.event_type] ?? 'planningReservations')}</span>
                                  {event.reason && <span className="text-slate-600">{event.reason}</span>}
                                </li>)}</ul>}
                          </div>;
                        })()}
                      </section>
                    )}
                  </>
                )}

                {tab === 'reservations' && (
                  <section>
                    <div className="mb-3 flex flex-wrap gap-1" aria-label={label('planningReservations')}>
                      {([
                        ['all', 'planningAllReservations'], ['soft_quote', 'planningSoftQuotes'],
                        ['locked_quote', 'planningLockedQuotes'], ['order', 'planningOrders'],
                        ['problem', 'planningRequiresAction'],
                      ] as const).map(([filter, key]) =>
                        <button key={filter} type="button" onClick={() => setReservationFilter(filter)}
                          aria-pressed={reservationFilter === filter}
                          className={`rounded border px-3 py-1.5 text-xs font-medium ${reservationFilter === filter
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700'}`}>
                          {label(key)}
                        </button>)}
                    </div>
                    <div className="max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white">
                    <table className="w-full min-w-[1100px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                        <tr>{['planningStatus', 'planningSource', 'planningResponsible', 'planningDealer',
                          'planningCustomer', 'planningItemNumber', 'planningSerial', 'planningQuantity',
                          'planningRequestedDate', 'planningAvailability', 'planningLockState'].map((key) =>
                          <th key={key} scope="col" className="px-3 py-2">{label(key)}</th>)}
                          {canManage && <th scope="col" className="px-3 py-2"><span className="sr-only">{label('planningRequiresAction')}</span></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredReservations.map((row) => {
                          const unit = data.units.find((candidate) => candidate.id === row.supply_unit_id);
                          const lot = data.lots.find((candidate) => candidate.id === row.supply_lot_id);
                          const document = data.documents?.[row.configuration_id];
                          const status = row.reservation_type === 'order' ? 'planningOrders'
                            : row.reservation_type === 'locked_quote' ? 'planningLockedQuotes' : 'planningSoftQuotes';
                          return <tr key={row.id}>
                            <td className="px-3 py-2">{label(status)}</td>
                            <td className="px-3 py-2"><button type="button"
                              className="text-emerald-800 underline"
                              onClick={() => navigate(`/configurator?configId=${encodeURIComponent(row.configuration_id)}`)}>
                              {document?.orderNumber ?? document?.quoteNumber ?? row.configuration_id.slice(0, 8)}
                            </button></td>
                            <td className="px-3 py-2">{document?.seller ?? '—'}</td>
                            <td className="px-3 py-2">{document?.dealer ?? '—'}</td>
                            <td className="px-3 py-2">{document?.customer ?? '—'}</td>
                            <td className="px-3 py-2 tabular-nums">{row.item_number}</td>
                            <td className="px-3 py-2 tabular-nums">{unit?.serial_number ?? label('planningUnassigned')}</td>
                            <td className="px-3 py-2 tabular-nums">{row.quantity}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{readableDate(row.requested_delivery_date, uiLanguage)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{unit || lot
                              ? <>{label((unit?.supply_status ?? lot?.supply_status) === 'available'
                                ? 'planningGreen' : 'planningSupplyIncoming')} · {readableDate(unit?.available_at ?? lot?.available_at ?? null, uiLanguage)}</>
                              : label('planningUnassigned')}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{row.reservation_type === 'locked_quote'
                              ? readableDate(row.lock_review_date, uiLanguage) : '—'}</td>
                            {canManage && <td className="px-3 py-2"><div className="flex flex-wrap gap-2">
                              {row.item_kind === 'serialized' && (isPlanner || row.reservation_type === 'order') &&
                                <button type="button" className="whitespace-nowrap text-emerald-800 underline"
                                  onClick={() => openAction({ kind: 'serial', reservation: row })}>{label('planningChangeSerial')}</button>}
                              {row.reservation_type === 'soft_quote' &&
                                <button type="button" className="whitespace-nowrap text-emerald-800 underline"
                                  onClick={() => openAction({ kind: 'lock', reservation: row })}>{label('planningLock')}</button>}
                              {row.reservation_type === 'locked_quote' &&
                                <button type="button" className="whitespace-nowrap text-emerald-800 underline"
                                  onClick={() => openAction({ kind: 'unlock', reservation: row })}>{label('planningUnlock')}</button>}
                              <button type="button" className="whitespace-nowrap text-emerald-800 underline"
                                onClick={() => openAction({ kind: 'delivery', reservation: row })}>{label('planningRequestDelivery')}</button>
                              {(row.reservation_type === 'soft_quote' || isPlanner) &&
                                <button type="button" className="whitespace-nowrap text-red-700 underline"
                                  onClick={() => openAction({ kind: 'release', reservation: row })}>{label('planningRelease')}</button>}
                            </div></td>}
                          </tr>;
                        })}
                      </tbody>
                    </table>
                    {filteredReservations.length === 0 && <p className="p-3 text-sm text-slate-600">{label('planningNoRecords')}</p>}
                    </div>
                  </section>
                )}
              </>
            )}
      </main>
      <Dialog open={action !== null} onOpenChange={(open) => { if (!open && !busy) setAction(null); }}>
        <DialogContent className="max-w-md">
          {action && <>
            <DialogHeader><DialogTitle>{label({
              serial: 'planningChangeSerial', lock: 'planningLock', unlock: 'planningUnlock',
              release: 'planningRelease', delivery: 'planningRequestDelivery', answer: 'planningAnswerDelivery',
            }[action.kind])}</DialogTitle></DialogHeader>
            {action.kind === 'serial' && <label className="block text-sm">
              {label('planningSerial')}
              <select value={serialId} onChange={(event) => setSerialId(event.target.value)}
                className="mt-1 h-10 w-full rounded border border-slate-300 px-2">
                <option value="">{label('planningUnassigned')}</option>
                {data?.units.filter((unit) => unit.item_number === action.reservation.item_number
                  && unit.serial_number && ['available', 'incoming', 'in_production'].includes(unit.supply_status)
                  && data.sources.some((source) => source.source_system === unit.source_system
                    && isPlanningSourceFresh(source))).map((unit) =>
                  <option key={unit.id} value={unit.id}>{unit.serial_number} · {unit.available_at ?? '—'}</option>)}
              </select>
            </label>}
            {(action.kind === 'answer' || action.kind === 'delivery' || action.kind === 'lock') &&
              <label className="block text-sm">{label(action.kind === 'lock' ? 'planningReviewDate' : 'planningRequestedDate')}
                <input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded border border-slate-300 px-2" />
              </label>}
            <label className="block text-sm">{label(action.kind === 'answer' ? 'planningResponse' : 'planningReason')}
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3}
                className="mt-1 w-full rounded border border-slate-300 p-2" />
            </label>
            {actionError && <p role="alert" className="text-sm text-red-700">{label('planningActionError')}</p>}
            <button type="button" onClick={submitAction}
              disabled={busy || (action.kind === 'serial' && !serialId)
                || (action.kind !== 'delivery' && !reason.trim())
                || (action.kind === 'answer' && !expectedDate)}
              className="h-10 rounded bg-emerald-700 px-4 text-sm font-medium text-white disabled:opacity-50">
              {label('planningSave')}
            </button>
          </>}
        </DialogContent>
      </Dialog>
      <PortalFooter language={language} />
    </div>
  );
}
