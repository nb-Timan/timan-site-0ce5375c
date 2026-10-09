import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, History, LayoutGrid, List, PackageSearch, Truck } from 'lucide-react';
import PlanningUnitDetail from '@/components/PlanningUnitDetail';
import { ACCESSORIES } from '@/data/machines';
import {
  planningCommercialConflict, planningItemSummary,
  type PlanningData,
  type PlanningItemSummary,
  type PlanningUnitPrivateDetail,
} from '@/lib/planningService';

type ViewMode = 'table' | 'cards';

interface MachineRow {
  key: string;
  itemNumber: string;
  name: string;
  imageUrl: string;
  summary: PlanningItemSummary | null;
}

interface Props {
  data: PlanningData;
  completeSupply: boolean;
  language: string;
  label: (key: string) => string;
  machines: MachineRow[];
  selectedMachine: string;
  selectedUnitId: string | null;
  privateDetail: PlanningUnitPrivateDetail | null;
  query: string;
  onQueryChange: (value: string) => void;
  matches: (itemNumber: string, name: string) => boolean;
  onSelectMachine: (machine: string) => void;
  onSelectUnit: (unitId: string | null) => void;
  onShowAttachments: () => void;
  onShowReservations: (itemNumber: string) => void;
  onShowIncoming: () => void;
  onShowTimeline: () => void;
}

function readableDate(value: string | null, language: string): string {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(language === 'da' ? 'da-DK' : language, {
      day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(date)
    : value;
}

function localizedName(item: { name: string | Record<string, string> }, language: string): string {
  if (typeof item.name === 'string') return item.name;
  return item.name[language] ?? item.name.en ?? item.name.da ?? '';
}

function statusTone(summary: PlanningItemSummary | null): string {
  if (!summary) return 'bg-slate-400';
  if (summary.stock > 0) return 'bg-emerald-600';
  if (summary.incoming > 0) return 'bg-amber-500';
  return 'bg-red-600';
}

function statusLabel(summary: PlanningItemSummary | null, label: Props['label']): string {
  if (!summary) return label('planningUnavailable');
  if (summary.stock > 0) return label('planningGreen');
  if (summary.incoming > 0) return label('planningSupplyIncoming');
  return label('planningRed');
}

export default function PlanningMachineWorkspace({
  data, completeSupply, language, label, machines, selectedMachine, selectedUnitId, privateDetail,
  query, onQueryChange, matches, onSelectMachine, onSelectUnit, onShowAttachments,
  onShowReservations, onShowIncoming, onShowTimeline,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showHistory, setShowHistory] = useState(false);
  const selected = (machines.find((machine) => machine.key === selectedMachine) ?? machines[0])!;
  const summary = selected?.summary ?? null;
  const units = data.units.filter((unit) => unit.item_number === selected.itemNumber);
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;
  const selectedCommercialConflict = selectedUnit
    ? planningCommercialConflict(data, selectedUnit.id) : null;
  const orderReservation = data.reservations.find((reservation) => reservation.status === 'active'
    && reservation.reservation_type === 'order' && reservation.supply_unit_id === selectedUnitId);
  const unitIds = useMemo(() => new Set(units.map((unit) => unit.id)), [units]);
  const events = data.events.filter((event) =>
    (event.previous_supply_unit_id && unitIds.has(event.previous_supply_unit_id))
    || (event.next_supply_unit_id && unitIds.has(event.next_supply_unit_id)))
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const attachments = [...new Map((ACCESSORIES[selected.key] ?? [])
    .filter((item) => item.varenr && item.varenr !== 'HEADER' && !item.isHeader)
    .map((item) => [item.varenr, item])).values()];

  useEffect(() => {
    setShowHistory(false);
  }, [selected.key]);

  const rows = [
    { key: selected.key, type: label('planningBaseMachine'), itemNumber: selected.itemNumber,
      name: selected.name, summary, units },
    ...attachments.map((item) => ({
      key: item.varenr, type: label('planningAttachments'), itemNumber: item.varenr,
      name: localizedName(item, language), summary: planningItemSummary(data, item.varenr),
      units: data.units.filter((unit) => unit.item_number === item.varenr),
    })),
  ].filter((row) => matches(row.itemNumber, row.name));
  const cardRows = query.trim() ? rows : rows.slice(0, 5);

  const renderAction = (row: (typeof rows)[number]) => {
    if (row.units.length > 0) {
      return <button type="button" onClick={() => onSelectUnit(row.units[0].id)}
        className="font-medium text-emerald-800 underline underline-offset-2">
        {label('planningShowDetails')}
      </button>;
    }
    const hasReservations = data.reservations.some((reservation) => reservation.status === 'active'
      && reservation.item_number === row.itemNumber);
    return hasReservations
      ? <button type="button" onClick={() => onShowReservations(row.itemNumber)}
        className="font-medium text-emerald-800 underline underline-offset-2">
        {label('planningReservations')}
      </button>
      : <span aria-label={label('planningUnavailable')}>—</span>;
  };

  return (
    <section aria-label={label('planningMachines')} data-testid="planning-machine-workspace"
      className="grid min-w-0 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_290px]">
      <aside aria-label={label('planningMachineNavigation')} className="min-w-0">
        <h2 className="mb-2 text-xs font-semibold uppercase text-slate-600">{label('planningMachines')}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-1">
          {machines.map((machine) => (
            <button key={machine.key} type="button" onClick={() => {
              onSelectMachine(machine.key);
              onSelectUnit(null);
            }} aria-current={selected.key === machine.key ? 'true' : undefined}
              className={`min-w-0 overflow-hidden rounded-md border bg-white text-left transition-colors ${selected.key === machine.key
                ? 'border-emerald-700 ring-1 ring-emerald-700' : 'border-slate-200 hover:border-slate-400'}`}>
              <div className="flex min-h-[78px] items-center gap-2 p-2 xl:min-h-0">
                <img src={machine.imageUrl} alt="" className="h-12 w-16 shrink-0 object-contain" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{machine.key}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${statusTone(machine.summary)}`} aria-hidden />
                    <span className="truncate">{completeSupply && machine.summary
                      ? `${machine.summary.stock} ${label('planningStock').toLocaleLowerCase()}`
                      : label('planningUnavailable')}</span>
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{selected.key}</h2>
            <p className="text-sm text-slate-600">{label('planningBaseMachineAndAttachments')}</p>
          </div>
          <div className="flex rounded-md border border-slate-300 bg-slate-50 p-0.5" aria-label={label('planningViewMode')}>
            <button type="button" onClick={() => setViewMode('table')} aria-pressed={viewMode === 'table'}
              title={label('planningTable')}
              className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium ${viewMode === 'table' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}>
              <List className="h-4 w-4" aria-hidden />{label('planningTable')}
            </button>
            <button type="button" onClick={() => setViewMode('cards')} aria-pressed={viewMode === 'cards'}
              title={label('planningCards')}
              className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs font-medium ${viewMode === 'cards' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}>
              <LayoutGrid className="h-4 w-4" aria-hidden />{label('planningCards')}
            </button>
          </div>
          <label className="relative basis-full">
            <PackageSearch className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" aria-hidden />
            <span className="sr-only">{label('planningSearch')}</span>
            <input value={query} onChange={(event) => onQueryChange(event.target.value)}
              placeholder={label('planningSearch')}
              className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm" />
          </label>
        </div>

        {viewMode === 'table' && (
          <div className="hidden max-w-full overflow-x-auto md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                <tr>{['planningType', 'planningItemNumber', 'planningDescription', 'planningStockStatus',
                  'planningReserved', 'planningUpcomingDelivery', 'planningSerialNumbers', 'planningAction']
                  .map((key) => <th key={key} scope="col" className="whitespace-nowrap px-3 py-2">{label(key)}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const reserved = (row.summary?.softQuotes ?? 0) + (row.summary?.lockedQuotes ?? 0) + (row.summary?.orders ?? 0);
                  return <tr key={row.key} className="align-top hover:bg-slate-50">
                    <td className="px-3 py-2 text-xs font-medium uppercase text-slate-500">{row.type}</td>
                    <td className="px-3 py-2 font-medium tabular-nums">{row.itemNumber}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className={`h-2 w-2 rounded-full ${statusTone(row.summary)}`} aria-hidden />
                      {statusLabel(row.summary, label)}</span></td>
                    <td className="px-3 py-2 tabular-nums">{row.summary ? reserved : '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{readableDate(row.summary?.nextAvailable ?? null, language)}</td>
                    <td className="px-3 py-2 text-xs tabular-nums">{row.units.slice(0, 2)
                      .map((unit) => unit.serial_number ?? unit.machine_ident_number).filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-3 py-2">{renderAction(row)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className={`${viewMode === 'cards' ? 'grid' : 'grid md:hidden'} gap-2 p-3 sm:grid-cols-2`}>
          {cardRows.map((row) => {
            const reserved = (row.summary?.softQuotes ?? 0) + (row.summary?.lockedQuotes ?? 0) + (row.summary?.orders ?? 0);
            return <article key={row.key} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="text-xs font-medium uppercase text-slate-500">{row.type}</p>
                  <h3 className="mt-0.5 text-sm font-semibold text-slate-900">{row.name}</h3>
                  <p className="text-xs tabular-nums text-slate-600">{row.itemNumber}</p></div>
                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${statusTone(row.summary)}`} aria-hidden />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-slate-500">{label('planningAvailability')}</dt><dd className="font-medium">{statusLabel(row.summary, label)}</dd></div>
                <div><dt className="text-slate-500">{label('planningReserved')}</dt><dd className="font-medium tabular-nums">{row.summary ? reserved : '—'}</dd></div>
                <div className="col-span-2"><dt className="text-slate-500">{label('planningUpcomingDelivery')}</dt>
                  <dd className="font-medium">{readableDate(row.summary?.nextAvailable ?? null, language)}</dd></div>
              </dl>
              <div className="mt-3 border-t border-slate-100 pt-2 text-sm">{renderAction(row)}</div>
            </article>;
          })}
          {rows.length > cardRows.length && <button type="button" onClick={onShowAttachments}
            className="min-h-10 rounded-md border border-dashed border-emerald-600 px-3 text-sm font-medium text-emerald-800 sm:col-span-2">
            {label('planningShowAllAttachments')}
          </button>}
          {rows.length === 0 && <p className="p-2 text-sm text-slate-600">{label('planningNoRecords')}</p>}
        </div>
      </div>

      <aside aria-label={label('planningMachineDetails')} className="min-w-0 rounded-md border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <img src={selected.imageUrl} alt="" className="h-16 w-20 shrink-0 object-contain" />
          <div className="min-w-0"><h2 className="text-lg font-semibold text-slate-900">{selected.key}</h2>
            <p className="text-sm tabular-nums text-slate-600">{selected.itemNumber}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium">
              <span className={`h-2 w-2 rounded-full ${statusTone(summary)}`} aria-hidden />{statusLabel(summary, label)}
            </p></div>
        </div>
        <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100 text-sm">
          {[
            [label('planningType'), label('planningBaseMachine')],
            [label('planningTotalStock'), summary?.stock ?? '—'],
            [label('planningSoftQuotes'), summary?.softQuotes ?? '—'],
            [label('planningOrders'), summary?.orders ?? '—'],
            [label('planningNextDelivery'), readableDate(summary?.nextAvailable ?? null, language)],
          ].map(([term, value]) => <div key={String(term)} className="flex items-center justify-between gap-3 py-2">
            <dt className="text-slate-600">{term}</dt><dd className="text-right font-medium tabular-nums text-slate-900">{value}</dd>
          </div>)}
        </dl>
        <div className="mt-4 grid gap-1">
          <button type="button" onClick={() => setShowHistory((current) => !current)}
            className="flex min-h-10 items-center gap-2 rounded px-2 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50">
            <History className="h-4 w-4" aria-hidden />{label('planningViewInventoryHistory')}<ChevronRight className="ml-auto h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={onShowAttachments}
            className="flex min-h-10 items-center gap-2 rounded px-2 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50">
            <PackageSearch className="h-4 w-4" aria-hidden />{label('planningRelatedAttachments')}<ChevronRight className="ml-auto h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={onShowIncoming}
            className="flex min-h-10 items-center gap-2 rounded px-2 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50">
            <Truck className="h-4 w-4" aria-hidden />{label('planningIncoming')}<ChevronRight className="ml-auto h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={onShowTimeline}
            className="flex min-h-10 items-center gap-2 rounded px-2 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50">
            <CalendarDays className="h-4 w-4" aria-hidden />{label('planningCalendarView')}<ChevronRight className="ml-auto h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => onShowReservations(selected.itemNumber)}
            className="flex min-h-10 items-center gap-2 rounded px-2 text-left text-sm font-medium text-emerald-800 hover:bg-emerald-50">
            <PackageSearch className="h-4 w-4" aria-hidden />{label('planningRequestDelivery')}<ChevronRight className="ml-auto h-4 w-4" aria-hidden />
          </button>
        </div>
        {showHistory && <section aria-label={label('planningViewInventoryHistory')} className="mt-4 border-t border-slate-200 pt-3">
          {events.length === 0 ? <p className="text-sm text-slate-600">{label('planningNoRecords')}</p>
            : <ul className="max-h-48 space-y-2 overflow-y-auto">{events.slice(0, 50).map((event) => <li key={event.id}
              className="border-l-2 border-slate-200 pl-2 text-xs text-slate-700">
              <time className="font-medium">{readableDate(event.created_at.slice(0, 10), language)}</time>
              {event.reason && <p className="mt-0.5 break-words text-slate-600">{event.reason}</p>}
            </li>)}</ul>}
        </section>}
        {selectedUnit && <PlanningUnitDetail unit={selectedUnit}
          portalOrderNumber={orderReservation ? data.orderNumbers?.[orderReservation.configuration_id] : undefined}
          language={language} label={label} privateDetail={privateDetail}
          unresolvedCommercialRelation={!!selectedCommercialConflict} />}
        {!completeSupply && <p className="mt-4 border-l-2 border-amber-500 pl-2 text-xs text-amber-900">
          {label('planningNoSupply')}
        </p>}
      </aside>
    </section>
  );
}
