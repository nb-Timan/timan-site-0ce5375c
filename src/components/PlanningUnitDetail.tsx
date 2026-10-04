import type { PlanningUnit, PlanningUnitPrivateDetail } from '@/lib/planningService';

interface Props {
  unit: PlanningUnit;
  portalOrderNumber?: string;
  language: string;
  label: (key: string) => string;
  privateDetail?: PlanningUnitPrivateDetail | null;
}

function formatDate(value: string | null | undefined, language: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
    : value;
}

export default function PlanningUnitDetail({ unit, portalOrderNumber, language, label, privateDetail }: Props) {
  const productionWeek = unit.production_completed_week
    ? `${label('planningWeek')} ${unit.production_completed_week}${unit.production_completed_year ? ` / ${unit.production_completed_year}` : ''}`
    : null;
  const fields: Array<[string, string | number | null | undefined]> = [
    ['planningSerial', unit.serial_number],
    ['planningMachineIdentity', unit.machine_ident_number],
    ['planningProductionReference', unit.production_reference],
    ['planningProductionSeries', unit.production_series],
    ['planningProductionPosition', unit.production_series_position],
    ['planningProductionOrder', unit.production_order_number],
    ['planningErpOrder', unit.erp_order_number],
    ['planningPortalOrder', portalOrderNumber],
    ['planningSlot', unit.slot_number],
    ['planningProductionEnd', formatDate(unit.production_completed_at, language)],
    ['planningProductionWeek', productionWeek],
    ['planningFirstPlannedDelivery', formatDate(unit.first_planned_delivery_date, language)],
    ['planningCurrentPlannedDelivery', formatDate(unit.current_planned_delivery_date, language)],
    ['planningConfirmedDelivery', formatDate(unit.confirmed_customer_delivery_date, language)],
    ['planningDealer', privateDetail?.dealer_name],
    ['planningCustomer', privateDetail?.customer_name],
    ['planningSourceComment', privateDetail?.source_comment],
    ['planningProductionNotes', privateDetail?.production_notes],
    ['planningResponsible', privateDetail?.responsible_initials],
    ['planningSourceStatus', unit.source_status],
    ['planningSource', unit.source_system],
    ['planningUpdated', formatDate(unit.source_updated_at.slice(0, 10), language)],
  ];
  const knownFields = fields.filter(([, value]) => value !== null && value !== undefined && value !== '');

  return (
    <section aria-label={label('planningProductionErp')} className="mt-4 border-t border-slate-200 pt-4">
      <h4 className="text-sm font-semibold text-slate-900">{label('planningProductionErp')}</h4>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {knownFields.map(([key, value]) => (
          <div key={key} className="min-w-0 border-b border-slate-100 pb-2 text-sm">
            <dt className="text-xs text-slate-600">{label(key)}</dt>
            <dd className="mt-0.5 break-words font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
