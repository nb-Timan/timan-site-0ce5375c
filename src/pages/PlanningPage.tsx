import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Boxes, ClipboardList, Clock3, Search, Truck } from 'lucide-react';
import PortalHeader from '@/components/portal/PortalHeader';
import PortalFooter from '@/components/portal/PortalFooter';
import PlanningIncomingView from '@/components/planning/PlanningIncomingView';
import PlanningMachineWorkspace from '@/components/planning/PlanningMachineWorkspace';
import PlanningTimelineView from '@/components/planning/PlanningTimelineView';
import { useAppUser } from '@/context/AppUserContext';
import { useEffectivePortalUser } from '@/lib/viewAsUser';
import { derivePortalRole } from '@/lib/portalAccess';
import { useLanguage } from '@/context/LanguageContext';
import { ACCESSORIES, PRODUCTS } from '@/data/machines';
import { t } from '@/lib/i18n/translations';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  loadPlanningData, planningExceptions, planningItemSummary, planningSourceState,
  isPlanningSourceFresh, loadPlanningUnitPrivateDetail, planningUnitMatchesQuery, searchPlanningPrivateUnits,
  filterPlanningReservations,
  type PlanningData, type PlanningExceptionKind, type PlanningUnitPrivateDetail,
  type PlanningReservation, type PlanningDeliveryRequest, type PlanningReservationFilter,
} from '@/lib/planningService';

type PlanningTab = 'overview' | 'attachments' | 'incoming' | 'reservations' | 'orders' | 'quotes' | 'timeline';

const MACHINE_KEYS = ['RC-751', 'RC-1000S', 'Timan 3330', 'Timan 2620'] as const;
const TABS: { id: PlanningTab; label: string }[] = [
  { id: 'overview', label: 'planningMachines' },
  { id: 'attachments', label: 'planningAttachments' },
  { id: 'incoming', label: 'planningDeliveries' },
  { id: 'reservations', label: 'planningReservations' },
  { id: 'orders', label: 'planningOrdersTab' },
  { id: 'quotes', label: 'planningQuotesTab' },
  { id: 'timeline', label: 'planningCalendarView' },
];
const MACHINE_IMAGES: Record<(typeof MACHINE_KEYS)[number], string> = {
  'RC-751': '/messe/machines/rc-751-tile.png',
  'RC-1000S': '/messe/machines/rc-1000s-tile.png',
  'Timan 3330': '/messe/machines/timan-3330-tile.png',
  'Timan 2620': '/messe/machines/timan-2620-tile.png',
};
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
  const [search, setSearch] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<string>('RC-751');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [focusedExceptionKey, setFocusedExceptionKey] = useState<string | null>(null);
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
    const name = typeof product.name === 'string' ? product.name : (product.name[uiLanguage] ?? product.name.en ?? product.name.da);
    return { key, product, itemNumber: product.varenr, name, imageUrl: MACHINE_IMAGES[key],
      summary: data ? planningItemSummary(data, product.varenr) : null };
  });
  const stock = machineRows.reduce((sum, row) => sum + (row.summary?.stock ?? 0), 0);
  const incoming = machineRows.reduce((sum, row) => sum + (row.summary?.incoming ?? 0), 0);
  const activeReservations = data?.reservations.filter((row) => row.status === 'active') ?? [];
  const filteredReservations = data ? (tab === 'orders'
    ? filterPlanningReservations(data, 'order')
    : tab === 'quotes'
      ? filterPlanningReservations(data, 'all').filter((row) => row.reservation_type !== 'order')
      : filterPlanningReservations(data, reservationFilter)) : [];
  const machineItemNumbers = new Set(machineRows.map((row) => row.itemNumber));
  const reservedMachines = activeReservations.filter((row) => machineItemNumbers.has(row.item_number)).length;
  const averageLeadTimeDays = (() => {
    const durations = data?.units.map((unit) => {
      const start = unit.production_completed_at;
      const end = unit.confirmed_customer_delivery_date ?? unit.current_planned_delivery_date
        ?? unit.expected_delivery_at ?? unit.available_at;
      if (!start || !end) return null;
      const startTime = Date.parse(start.length === 10 ? `${start}T12:00:00Z` : start);
      const endTime = Date.parse(end.length === 10 ? `${end}T12:00:00Z` : end);
      const days = Math.round((endTime - startTime) / 86_400_000);
      return Number.isFinite(days) && days >= 0 ? days : null;
    }).filter((value): value is number => value !== null) ?? [];
    return durations.length > 0 ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
  })();
  const attachmentRows = selectedMachine
    ? (ACCESSORIES[selectedMachine] ?? []).filter((item) => item.varenr && item.varenr !== 'HEADER' && !item.isHeader)
    : Object.values(ACCESSORIES).flat().filter((item) => item.varenr && item.varenr !== 'HEADER' && !item.isHeader);
  const dedupedAttachments = [...new Map(attachmentRows.map((item) => [item.varenr, item])).values()];
  const itemLabel = (itemNumber: string) => {
    const item = machineRows.find((row) => row.product.varenr === itemNumber)?.product
      ?? Object.values(ACCESSORIES).flat().find((candidate) => candidate.varenr === itemNumber);
    const name = item?.name;
    const localized = typeof name === 'string' ? name : name?.[uiLanguage] ?? name?.en ?? name?.da;
    return localized ? `${localized} · ${itemNumber}` : itemNumber;
  };
  const timelineRows = machineRows.map((row) => ({
    key: row.key, itemNumber: row.product.varenr, name: row.key,
    attachments: [...new Map((ACCESSORIES[row.key] ?? [])
      .filter((item) => item.varenr && item.varenr !== 'HEADER' && !item.isHeader)
      .map((item) => [item.varenr, { itemNumber: item.varenr, name: itemLabel(item.varenr) }])).values()],
  }));
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
                {!completeSupply && tab !== 'incoming' && tab !== 'timeline' && (
                  <div role="status" className="mb-5 flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{sourceState === 'missing' ? label('planningNoSupply') : label('planningStaleSupply')}</span>
                  </div>
                )}
                <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                  {[
                    { title: 'planningMachinesInStock', value: completeSupply ? stock : '—', icon: Boxes, target: 'overview' as PlanningTab },
                    { title: 'planningReserved', value: reservedMachines, icon: ClipboardList, target: 'reservations' as PlanningTab },
                    { title: 'planningOutOfStockAction', value: completeSupply ? exceptions.length : '—', icon: AlertTriangle, target: 'overview' as PlanningTab },
                    { title: 'planningIncoming', value: completeSupply ? incoming : '—', icon: Truck, target: 'incoming' as PlanningTab },
                    { title: 'planningAverageDeliveryTime', value: averageLeadTimeDays === null ? '—' : `${averageLeadTimeDays} ${label('planningDays')}`, icon: Clock3, target: 'timeline' as PlanningTab },
                  ].map((card) => (
                    <button key={card.title} type="button" onClick={() => setTab(card.target)}
                      className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
                      <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
                        <span>{label(card.title)}</span><card.icon className="h-4 w-4 shrink-0" aria-hidden />
                      </div>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{card.value}</p>
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

                {tab === 'overview' && <PlanningMachineWorkspace
                  data={data} completeSupply={completeSupply} language={uiLanguage} label={label}
                  machines={machineRows} selectedMachine={selectedMachine} selectedUnitId={selectedUnitId}
                  privateDetail={privateDetail} query={search} onQueryChange={setSearch} matches={matches}
                  onSelectMachine={setSelectedMachine} onSelectUnit={setSelectedUnitId}
                  onShowAttachments={() => setTab('attachments')}
                  onShowReservations={(itemNumber) => { setSearch(itemNumber); setTab('reservations'); }}
                  onShowIncoming={() => setTab('incoming')} onShowTimeline={() => setTab('timeline')} />}

                {tab === 'overview' && (
                  <section className="mt-5" aria-labelledby="planning-action-heading">
                    <h2 id="planning-action-heading" className="mb-2 text-base font-semibold text-slate-900">{label('planningRequiresAction')}</h2>
                    {exceptions.length === 0
                      ? <p className="text-sm text-slate-600">{label('planningNoRecords')}</p>
                      : <ul className="divide-y divide-slate-200 border-y border-slate-200 bg-white">
                        {exceptions.map((item) => (
                          <li key={`${item.kind}:${item.key}`} aria-current={focusedExceptionKey === item.key ? 'true' : undefined}
                            className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${focusedExceptionKey === item.key ? 'bg-red-50' : ''}`}>
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

                {['attachments', 'incoming', 'timeline'].includes(tab) && (
                  <>
                    <div className="mb-3">
                      <label className="relative block w-full max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
                        <span className="sr-only">{label('planningSearch')}</span>
                        <input value={search} onChange={(event) => setSearch(event.target.value)}
                          placeholder={label('planningSearch')} className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm" />
                      </label>
                    </div>
                    {tab === 'attachments' && (
                      <div className="max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white">
                        <table className="w-full min-w-[720px] text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                            <tr>{['planningItemNumber', 'planningDescription', 'planningStock', 'planningSoftQuotes', 'planningLockedQuotes',
                              'planningOrders', 'planningIncomingUnits', 'planningNextAvailable'].map((key) =>
                              <th key={key} scope="col" className="whitespace-nowrap px-3 py-2">{label(key)}</th>)}</tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {dedupedAttachments.map((item) => ({ key: item.varenr, itemNumber: item.varenr, name: typeof item.name === 'string' ? item.name : (item.name[uiLanguage] ?? item.name.en ?? item.name.da) }))
                              .filter((row) => matches(row.itemNumber, row.name)).map((row) => {
                              const summary = planningItemSummary(data, row.itemNumber);
                              return (
                                <tr key={row.key} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium tabular-nums">{row.itemNumber}</td>
                                  <td className="px-3 py-2">{row.name}</td>
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
                    )}
                    {tab === 'incoming' && <PlanningIncomingView data={data} language={uiLanguage} label={label}
                      itemLabel={itemLabel} query={search} selectedUnitId={selectedUnitId}
                      onSelectUnit={setSelectedUnitId} privateDetail={privateDetail} />}
                    {tab === 'timeline' && <PlanningTimelineView data={data} language={uiLanguage} label={label}
                      rows={timelineRows.filter((row) => matches(row.itemNumber, row.name))}
                      selectedUnitId={selectedUnitId} onSelectUnit={setSelectedUnitId} privateDetail={privateDetail}
                      onShowException={(key) => { setFocusedExceptionKey(key); setTab('overview'); }}
                      onShowReservations={() => setTab('reservations')} />}
                  </>
                )}

                {['reservations', 'orders', 'quotes'].includes(tab) && (
                  <section>
                    {tab === 'reservations' && <div className="mb-3 flex flex-wrap gap-1" aria-label={label('planningReservations')}>
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
                    </div>}
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
