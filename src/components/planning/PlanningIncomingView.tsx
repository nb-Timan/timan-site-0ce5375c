import { useState } from 'react';
import PlanningUnitDetail from '@/components/PlanningUnitDetail';
import type { PlanningData, PlanningUnitPrivateDetail } from '@/lib/planningService';
import { planningIncomingSupply, planningSupplyDate } from '@/lib/planningViews';

type IncomingCategory = 'all' | 'machines' | 'attachments';

interface MachineFamily {
  id: string;
  itemNumber: string;
  label: string;
}

interface Props {
  data: PlanningData;
  language: string;
  label: (key: string) => string;
  itemLabel: (itemNumber: string) => string;
  machineFamilies: MachineFamily[];
  query: string;
  selectedUnitId: string | null;
  onSelectUnit: (id: string) => void;
  privateDetail: PlanningUnitPrivateDetail | null;
}

function formatDate(value: string | null | undefined, language: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(`${value}T12:00:00Z`));
}

export default function PlanningIncomingView({ data, language, label, itemLabel, machineFamilies, query,
  selectedUnitId, onSelectUnit, privateDetail }: Props) {
  const [category, setCategory] = useState<IncomingCategory>('all');
  const [machineFamily, setMachineFamily] = useState('all');
  const supply = planningIncomingSupply(data);
  if (!supply) return <p role="status" className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-900">
    {label(data.sources.some((source) => source.connected) ? 'planningStaleSupply' : 'planningNoSupply')}
  </p>;
  const machineItemNumbers = new Set(machineFamilies.map((family) => family.itemNumber));
  const categoryMatch = (itemNumber: string) => category === 'all'
    || (category === 'machines' ? machineItemNumbers.has(itemNumber) : !machineItemNumbers.has(itemNumber));
  const familyMatch = (itemNumber: string) => category !== 'machines' || machineFamily === 'all'
    || itemNumber === machineFamily;
  const needle = query.trim().toLocaleLowerCase();
  const units = supply.units.filter((unit) => categoryMatch(unit.item_number) && familyMatch(unit.item_number)
    && (!needle || [itemLabel(unit.item_number), unit.item_number, unit.serial_number, unit.production_reference,
      unit.production_order_number, unit.erp_order_number]
      .some((value) => value?.toLocaleLowerCase().includes(needle))));
  const lots = supply.lots.filter((lot) => categoryMatch(lot.item_number) && familyMatch(lot.item_number)
    && (!needle || [itemLabel(lot.item_number), lot.item_number]
      .some((value) => value.toLocaleLowerCase().includes(needle))));

  const active = data.reservations.filter((row) => row.status === 'active');
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
  const reservationForUnit = (id: string) => active.find((row) => row.supply_unit_id === id);
  const reservationLabel = (id: string) => {
    const row = reservationForUnit(id);
    if (!row) return '—';
    const key = row.reservation_type === 'order' ? 'planningOrders'
      : row.reservation_type === 'locked_quote' ? 'planningLockedQuotes' : 'planningSoftQuotes';
    const document = data.documents?.[row.configuration_id];
    return `${label(key)} · ${document?.orderNumber ?? document?.quoteNumber ?? row.configuration_id.slice(0, 8)}`;
  };
  const statusLabel = (status: string) => label(status === 'in_production' ? 'planningInProduction'
    : status === 'incoming' ? 'planningSupplyIncoming' : 'planningGreen');

  const emptyLabel = supply.units.length === 0 && supply.lots.length === 0
    ? 'planningNoIncoming'
    : category === 'attachments' && !needle
      ? 'planningNoIncomingAttachments'
      : category === 'machines' && machineFamily === 'all' && !needle
        ? 'planningNoIncomingMachines'
        : 'planningNoRecords';

  return <div className="space-y-5">
    <div className="flex min-w-0 flex-wrap items-end gap-3">
      <div className="flex max-w-full gap-1 overflow-x-auto" role="group" aria-label={label('planningType')}>
        {([['all', 'planningAllReservations'], ['machines', 'planningMachines'],
          ['attachments', 'planningAttachments']] as const).map(([value, key]) => (
          <button key={value} type="button" onClick={() => setCategory(value)} aria-pressed={category === value}
            className={`h-9 shrink-0 rounded border px-3 text-sm font-medium ${category === value
              ? 'border-emerald-700 bg-emerald-50 text-emerald-800'
              : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-600'}`}>
            {label(key)}
          </button>
        ))}
      </div>
      {category === 'machines' && <label className="min-w-0 text-xs font-medium text-slate-600">
        <span className="sr-only">{label('planningMachineNavigation')}</span>
        <select value={machineFamily} onChange={(event) => setMachineFamily(event.target.value)}
          className="h-9 max-w-full rounded border border-slate-300 bg-white px-3 text-sm text-slate-800">
          <option value="all">{label('planningAllMachines')}</option>
          {machineFamilies.map((family) => <option key={family.id} value={family.itemNumber}>{family.label}</option>)}
        </select>
      </label>}
    </div>

    {units.length === 0 && lots.length === 0 && <p role="status"
      className="border border-slate-200 bg-white p-4 text-sm text-slate-600">{label(emptyLabel)}</p>}

    {units.length > 0 && <section aria-label={label('planningSerializedUnits')}>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{label('planningSerializedUnits')}</h2>
      <div className="space-y-2 md:hidden">
        {units.map((unit) => <article key={unit.id} className="border border-slate-200 bg-white p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><p className="font-semibold text-slate-900">{itemLabel(unit.item_number)}</p>
              <p className="break-all text-xs text-slate-600">{unit.production_reference ?? unit.serial_number ?? label('planningUnassigned')}</p></div>
            <button type="button" onClick={() => onSelectUnit(unit.id)} className="shrink-0 text-emerald-800 underline">
              {label('planningShowDetails')}
            </button>
          </div>
          <p className="mt-2">{label('planningExpectedAvailability')}: {formatDate(planningSupplyDate(unit), language)}</p>
          <p className="text-slate-600">{statusLabel(unit.supply_status)} · {reservationLabel(unit.id)}</p>
        </article>)}
      </div>
      <div className="hidden overflow-x-auto border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>
            {['planningMachines', 'planningSerial', 'planningProductionReference', 'planningProductionOrder',
              'planningErpOrder', 'planningExpectedAvailability', 'planningStatus', 'planningReservations'].map((key) =>
              <th key={key} scope="col" className="px-3 py-2">{label(key)}</th>)}
            <th scope="col" className="px-3 py-2"><span className="sr-only">{label('planningShowDetails')}</span></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{units.map((unit) => <tr key={unit.id}>
            <td className="px-3 py-2 font-medium">{itemLabel(unit.item_number)}</td>
            <td className="px-3 py-2">{unit.serial_number ?? '—'}</td>
            <td className="px-3 py-2">{unit.production_reference ?? '—'}</td>
            <td className="px-3 py-2">{unit.production_order_number ?? '—'}</td>
            <td className="px-3 py-2">{unit.erp_order_number ?? '—'}</td>
            <td className="whitespace-nowrap px-3 py-2">{formatDate(planningSupplyDate(unit), language)}</td>
            <td className="px-3 py-2">{statusLabel(unit.supply_status)}</td>
            <td className="px-3 py-2">{reservationLabel(unit.id)}</td>
            <td className="px-3 py-2"><button type="button" onClick={() => onSelectUnit(unit.id)}
              className="whitespace-nowrap text-emerald-800 underline">{label('planningShowDetails')}</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {selectedUnit && <PlanningUnitDetail unit={selectedUnit}
        portalOrderNumber={(() => {
          const row = reservationForUnit(selectedUnit.id);
          return row?.reservation_type === 'order' ? data.orderNumbers?.[row.configuration_id] : undefined;
        })()}
        language={language} label={label} privateDetail={privateDetail} />}
    </section>}

    {lots.length > 0 && <section aria-label={label('planningQuantityItems')}>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">{label('planningQuantityItems')}</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {lots.map((lot) => {
          const reserved = active.filter((row) => row.supply_lot_id === lot.id)
            .reduce((sum, row) => sum + row.quantity, 0);
          return <article key={lot.id} className="min-w-0 border border-slate-200 bg-white p-3 text-sm">
            <p className="break-words font-semibold text-slate-900">{itemLabel(lot.item_number)}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-600">{label('planningIncomingQuantity')}</dt><dd className="text-right tabular-nums">{lot.quantity}</dd>
              <dt className="text-slate-600">{label('planningReservedQuantity')}</dt><dd className="text-right tabular-nums">{reserved}</dd>
              <dt className="text-slate-600">{label('planningFreeExpected')}</dt><dd className="text-right tabular-nums">{Math.max(0, lot.quantity - reserved)}</dd>
              <dt className="text-slate-600">{label('planningExpectedAvailability')}</dt><dd className="text-right">{formatDate(lot.available_at, language)}</dd>
              <dt className="text-slate-600">{label('planningSource')}</dt><dd className="break-words text-right">{lot.source_system}</dd>
              <dt className="text-slate-600">{label('planningStatus')}</dt><dd className="text-right">{statusLabel(lot.supply_status)}</dd>
            </dl>
          </article>;
        })}
      </div>
    </section>}
  </div>;
}
