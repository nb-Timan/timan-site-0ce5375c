import { CalendarDays } from 'lucide-react';
import type { Locale } from 'date-fns';
import type { ConfiguratorState } from '@/types/configurator';
import { productDeliveryDate, productDeliveryUnits } from '@/lib/configuratorDelivery';
import { ConfiguratorDeliveryDatePicker } from './ConfiguratorDeliveryDatePicker';

interface Props {
  state: ConfiguratorState;
  T: (key: string) => string;
  locale: Locale;
  disabled?: boolean;
  canSelectPastDate?: boolean;
  onChange?: (dates: Record<string, string>) => void;
}

export function ConfiguratorProductDeliveryDates({ state, T, locale, disabled, canSelectPastDate, onChange }: Props) {
  const groups = new Map<string, ReturnType<typeof productDeliveryUnits>>();
  for (const unit of productDeliveryUnits(state)) groups.set(unit.groupKey, [...(groups.get(unit.groupKey) ?? []), unit]);
  const splitGroups = [...groups.entries()].filter(([, units]) => units.length > 1);
  if (!splitGroups.length || !state.date) return null;
  return <div className="mx-auto my-4 max-w-2xl space-y-3 text-left" data-testid="product-delivery-date-editor">
    {splitGroups.map(([key, units]) => <details key={key} open={!onChange || units.some(unit => Boolean(state.machineDeliveryDates?.[unit.key]))}
      className="rounded-md border border-gray-200 px-3 py-2">
      <summary className="cursor-pointer text-sm font-semibold text-emerald-700">
        <CalendarDays className="mr-2 inline h-4 w-4" />
        {onChange ? T('customizeProductDeliveryDates') : T('deliveryDate')} - {units[0].name} ({units[0].itemNumber}) - {T('machineLabel')} {units[0].parentUnitNumber}
      </summary>
      <div className="mt-3 space-y-3">
        {units.map(unit => <div key={unit.key} className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
          <span className="text-sm">{T('pdfQuantity')} {unit.ordinal}</span>
          {onChange ? <ConfiguratorDeliveryDatePicker
            value={productDeliveryDate(state, unit)}
            onChange={date => onChange({ ...(state.machineDeliveryDates ?? {}), [unit.key]: date })}
            locale={locale} placeholder={T('datePlaceholder')}
            ariaLabel={`${units[0].itemNumber} - ${T('pdfQuantity')} ${unit.ordinal}`}
            discountLegend={T('calendarDiscountNote')}
            weekendError={T('weekendDateError')} canSelectPastDate={canSelectPastDate} disabled={disabled}
            triggerClassName="min-h-9 w-full rounded-md bg-white px-2 py-1.5 text-sm"
          /> : <span className="text-sm">{productDeliveryDate(state, unit)}</span>}
        </div>)}
      </div>
    </details>)}
  </div>;
}
