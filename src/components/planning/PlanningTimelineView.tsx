import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ClipboardList, LockKeyhole, Package, Truck } from 'lucide-react';
import PlanningUnitDetail from '@/components/PlanningUnitDetail';
import { planningExceptions, planningSourceState,
  type PlanningData, type PlanningUnitPrivateDetail } from '@/lib/planningService';
import { planningSupplyDate, planningTimelineEntries, planningTimelinePeriods,
  type PlanningTimelineEntry, type PlanningTimelineHorizon, type PlanningTimelineScale,
  type PlanningTimelineState } from '@/lib/planningViews';

interface TimelineRow {
  key: string;
  itemNumber: string;
  name: string;
  attachments: Array<{ itemNumber: string; name: string }>;
}

interface Props {
  data: PlanningData;
  rows: TimelineRow[];
  language: string;
  label: (key: string) => string;
  selectedUnitId: string | null;
  onSelectUnit: (id: string) => void;
  privateDetail: PlanningUnitPrivateDetail | null;
  onShowException: (key: string) => void;
  onShowReservations: () => void;
}

const STATE: Record<PlanningTimelineState, { label: string; color: string; icon: typeof Check }> = {
  available: { label: 'planningGreen', color: 'border-emerald-500 bg-emerald-50 text-emerald-900', icon: Check },
  incoming: { label: 'planningSupplyIncoming', color: 'border-orange-500 bg-orange-50 text-orange-900', icon: Truck },
  soft_quote: { label: 'planningSoftQuotes', color: 'border-amber-500 bg-amber-50 text-amber-900', icon: ClipboardList },
  locked_quote: { label: 'planningLockedQuotes', color: 'border-violet-500 bg-violet-50 text-violet-900', icon: LockKeyhole },
  order: { label: 'planningOrders', color: 'border-sky-600 bg-sky-50 text-sky-900', icon: Package },
  problem: { label: 'planningRequiresAction', color: 'border-red-600 bg-red-50 text-red-900', icon: AlertTriangle },
};

function formatDate(value: string | null | undefined, language: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(`${value}T12:00:00Z`));
}

export default function PlanningTimelineView({ data, rows, language, label, selectedUnitId,
  onSelectUnit, privateDetail, onShowException, onShowReservations }: Props) {
  const [scale, setScale] = useState<PlanningTimelineScale>('month');
  const [horizon, setHorizon] = useState<PlanningTimelineHorizon>(6);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const periods = planningTimelinePeriods(scale, horizon);
  const first = periods[0].start;
  const last = periods[periods.length - 1].end;
  const sourceReady = !data.truncated && planningSourceState(data) === 'fresh';
  const selectedUnit = data.units.find((unit) => unit.id === selectedUnitId);
  const selectedReservation = data.reservations.find((row) => row.status === 'active'
    && row.supply_unit_id === selectedUnitId);
  const exceptions = planningExceptions(data);
  const exceptionKey = (entry: PlanningTimelineEntry) => {
    if (entry.reservation && exceptions.some((item) => item.key === entry.reservation!.id)) return entry.reservation.id;
    if (entry.unit) {
      const exception = exceptions.find((item) => item.key === entry.unit!.id)
        ?? exceptions.find((item) => data.conflicts?.some((conflict) => conflict.id === item.key
          && conflict.supply_unit_id === entry.unit!.id));
      return exception?.key;
    }
    return undefined;
  };
  const rowHasData = (itemNumber: string) => data.units.some((unit) => unit.item_number === itemNumber)
    || data.lots.some((lot) => lot.item_number === itemNumber)
    || data.reservations.some((reservation) => reservation.item_number === itemNumber);
  const visibleRows = rows.flatMap((row) => [row, ...(expanded.has(row.key)
    ? row.attachments.filter((item) => rowHasData(item.itemNumber))
      .map((item) => ({ key: `${row.key}:${item.itemNumber}`, itemNumber: item.itemNumber,
        name: item.name, attachments: [] })) : [])]);
  const gridStyle = { gridTemplateColumns: `180px repeat(${periods.length}, minmax(135px, 1fr))`,
    minWidth: `${180 + periods.length * 135}px` };

  const renderEntry = (entry: PlanningTimelineEntry) => {
    const state = STATE[entry.state];
    const Icon = state.icon;
    const reference = entry.unit?.production_reference ?? entry.unit?.serial_number
      ?? (entry.lot ? `${label('planningQuantity')}: ${entry.lot.quantity}`
        : data.documents?.[entry.reservation!.configuration_id]?.orderNumber
          ?? data.documents?.[entry.reservation!.configuration_id]?.quoteNumber
          ?? entry.reservation!.configuration_id.slice(0, 8));
    const available = entry.unit ? planningSupplyDate(entry.unit) : entry.lot?.available_at ?? null;
    const requested = entry.reservation?.requested_delivery_date;
    const stateLabel = requested && available && requested < available ? 'planningDelayed' : state.label;
    const document = entry.reservation && data.documents?.[entry.reservation.configuration_id];
    const context = [reference, label(stateLabel),
      `${label('planningExpectedAvailability')}: ${formatDate(available ?? entry.date, language)}`,
      requested ? `${label('planningRequestedDate')}: ${formatDate(requested, language)}` : null,
      document?.orderNumber ?? document?.quoteNumber,
      entry.unit?.serial_number && entry.unit.serial_number !== reference ? entry.unit.serial_number : null,
      entry.unit?.production_series ? `${label('planningProductionSeries')}: ${entry.unit.production_series}` : null,
      entry.unit?.production_series_position ? `${label('planningProductionPosition')}: ${entry.unit.production_series_position}` : null,
      entry.unit?.production_order_number ? `${label('planningProductionOrder')}: ${entry.unit.production_order_number}` : null,
      entry.unit?.erp_order_number ? `${label('planningErpOrder')}: ${entry.unit.erp_order_number}` : null,
    ].filter(Boolean).join(' · ');
    const onClick = () => entry.unit ? onSelectUnit(entry.unit.id)
      : entry.state === 'problem' && exceptionKey(entry) ? onShowException(exceptionKey(entry)!) : onShowReservations();
    return <button key={entry.key} type="button" onClick={onClick} title={context} aria-label={context}
      className={`flex w-full items-start gap-1 rounded border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight ${state.color}`}>
      <Icon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span className="min-w-0 break-words"><span className="block font-semibold">{reference}</span>
        <span>{label(stateLabel)}</span></span>
    </button>;
  };

  return <section aria-label={label('planningTimeline')} className="min-w-0">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex rounded border border-slate-300 bg-white" aria-label={label('planningTimelineHorizon')}>
        {([3, 6, 12] as const).map((months) => <button key={months} type="button" onClick={() => setHorizon(months)}
          aria-pressed={horizon === months} className={`px-2.5 py-1.5 text-xs ${horizon === months ? 'bg-emerald-50 font-semibold text-emerald-800' : 'text-slate-600'}`}>
          {label(`planningHorizon${months}`)}
        </button>)}
      </div>
      <div className="flex rounded border border-slate-300 bg-white" aria-label={label('planningTimelineScale')}>
        {(['week', 'month'] as const).map((value) => <button key={value} type="button" onClick={() => setScale(value)}
          aria-pressed={scale === value} className={`px-2.5 py-1.5 text-xs ${scale === value ? 'bg-emerald-50 font-semibold text-emerald-800' : 'text-slate-600'}`}>
          {label(value === 'week' ? 'planningWeek' : 'planningMonth')}
        </button>)}
      </div>
    </div>
    <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
      {(Object.keys(STATE) as PlanningTimelineState[]).map((key) => {
        const state = STATE[key];
        const Icon = state.icon;
        return <span key={key} className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" aria-hidden />
          {label(state.label)}</span>;
      })}
    </div>
    <div className="max-w-full overflow-x-auto border border-slate-200 bg-white" data-testid="planning-timeline-scroll">
      <div className="grid border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-700" style={gridStyle}>
        <span className="sticky left-0 z-10 border-r border-slate-200 bg-slate-50 p-2">{label('planningMachines')}</span>
        {periods.map((period) => <span key={period.start.toISOString()} className="border-r border-slate-200 p-2">
          {new Intl.DateTimeFormat(language, scale === 'week'
            ? { day: 'numeric', month: 'short' } : { month: 'short', year: 'numeric' }).format(period.start)}
        </span>)}
      </div>
      {visibleRows.map((row) => {
        const entries = planningTimelineEntries(data, row.itemNumber, first, last) ?? [];
        const related = row.attachments.filter((item) => rowHasData(item.itemNumber));
        const isAttachment = row.key.includes(':');
        return <div key={row.key} className="grid border-b border-slate-100" style={gridStyle}>
          <div className={`sticky left-0 z-10 flex min-w-0 items-start gap-1 border-r border-slate-200 bg-white p-2 text-xs ${isAttachment ? 'pl-5' : 'font-semibold'}`}>
            {related.length > 0 && <button type="button" onClick={() => setExpanded((current) => {
              const next = new Set(current);
              if (next.has(row.key)) next.delete(row.key); else next.add(row.key);
              return next;
            })} aria-expanded={expanded.has(row.key)} aria-label={`${label('planningAttachments')}: ${row.name}`}>
              <ChevronDown className={`h-4 w-4 shrink-0 ${expanded.has(row.key) ? '' : '-rotate-90'}`} aria-hidden />
            </button>}
            <span className="min-w-0 break-words">{row.name}<span className="block font-normal text-slate-500">{row.itemNumber}</span></span>
          </div>
          {periods.map((period) => {
            const startDate = period.start.toISOString().slice(0, 10);
            const endDate = period.end.toISOString().slice(0, 10);
            return <div key={startDate} className="min-h-[70px] space-y-1 border-r border-slate-100 p-1">
              {entries.filter((entry) => entry.date >= startDate && entry.date < endDate).map(renderEntry)}
            </div>;
          })}
        </div>;
      })}
    </div>
    {!sourceReady && <p role="status" className="mt-3 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
      {label(data.sources.some((source) => source.connected) ? 'planningStaleSupply' : 'planningNoSupply')}
    </p>}
    {selectedUnit && <div className="mt-4"><PlanningUnitDetail unit={selectedUnit}
      portalOrderNumber={selectedReservation?.reservation_type === 'order'
        ? data.orderNumbers?.[selectedReservation.configuration_id] : undefined}
      language={language} label={label} privateDetail={privateDetail} />
      {planningTimelineEntries(data, selectedUnit.item_number, first, last)?.some((entry) =>
        entry.unit?.id === selectedUnit.id && entry.state === 'problem') &&
        <button type="button" onClick={() => {
          const entry = planningTimelineEntries(data, selectedUnit.item_number, first, last)?.find((item) =>
            item.unit?.id === selectedUnit.id && item.state === 'problem');
          const key = entry && exceptionKey(entry);
          if (key) onShowException(key);
        }} className="mt-3 text-sm text-red-700 underline">
          {label('planningRequiresAction')}
        </button>}
    </div>}
  </section>;
}
