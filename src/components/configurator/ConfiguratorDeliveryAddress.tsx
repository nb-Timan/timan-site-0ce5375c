import type { ConfiguratorState } from '@/types/configurator';
import { formatDeliveryDestination, resolveDeliveryDestination } from '@/lib/configuratorDelivery';

type DeliveryField =
  | 'alternativeDeliveryAddress'
  | 'alternativeDeliveryPostalCode'
  | 'alternativeDeliveryCity'
  | 'alternativeDeliveryCountry'
  | 'alternativeDeliveryContactPerson'
  | 'alternativeDeliveryPhone'
  | 'alternativeDeliveryNote';

interface ConfiguratorDeliveryAddressProps {
  state: ConfiguratorState;
  variant: 'step2' | 'step4';
  disabled?: boolean;
  T: (key: string) => string;
  onChange: (update: Partial<ConfiguratorState>) => void;
}

export function ConfiguratorDeliveryAddress({ state, variant, disabled = false, T, onChange }: ConfiguratorDeliveryAddressProps) {
  const useAlternative = state.useAlternativeDeliveryAddress === true;
  const setField = (field: DeliveryField, value: string) => onChange({ [field]: value });
  const inputClass = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm disabled:bg-gray-100';
  const resolved = resolveDeliveryDestination(state);

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-left" data-testid={`delivery-address-${variant}`}>
      {variant === 'step4' && <h3 className="mb-3 text-base font-bold text-gray-900">{T('deliveryAddressSection')}</h3>}
      {variant === 'step2' ? (
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm font-semibold text-gray-800">
          <input
            type="checkbox"
            checked={useAlternative}
            disabled={disabled}
            onChange={(event) => onChange({ useAlternativeDeliveryAddress: event.target.checked })}
          />
          <span>{T('useAlternativeDeliveryAddress')}</span>
        </label>
      ) : (
        <div className="mb-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={T('deliveryAddressSection')}>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
            <input
              type="radio"
              name="delivery-address-mode"
              checked={!useAlternative}
              disabled={disabled}
              onChange={() => onChange({ useAlternativeDeliveryAddress: false })}
            />
            <span>{T('sameAsCustomerAddress')}</span>
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm">
            <input
              type="radio"
              name="delivery-address-mode"
              checked={useAlternative}
              disabled={disabled}
              onChange={() => onChange({ useAlternativeDeliveryAddress: true })}
            />
            <span>{T('useAlternativeDeliveryAddress')}</span>
          </label>
        </div>
      )}

      {useAlternative ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="alternative-delivery-fields">
          <label className="sm:col-span-2 text-sm font-medium text-gray-700">
            {T('deliveryAddressLine')}
            <input value={state.alternativeDeliveryAddress ?? ''} onChange={(e) => setField('alternativeDeliveryAddress', e.target.value)} disabled={disabled} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            {T('deliveryPostalCode')}
            <input value={state.alternativeDeliveryPostalCode ?? ''} onChange={(e) => setField('alternativeDeliveryPostalCode', e.target.value)} disabled={disabled} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            {T('deliveryCity')}
            <input value={state.alternativeDeliveryCity ?? ''} onChange={(e) => setField('alternativeDeliveryCity', e.target.value)} disabled={disabled} className={`${inputClass} mt-1`} />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-gray-700">
            {T('deliveryCountry')}
            <input value={state.alternativeDeliveryCountry ?? ''} onChange={(e) => setField('alternativeDeliveryCountry', e.target.value)} disabled={disabled} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            {T('deliveryContactPerson')}
            <input value={state.alternativeDeliveryContactPerson ?? ''} onChange={(e) => setField('alternativeDeliveryContactPerson', e.target.value)} disabled={disabled} className={`${inputClass} mt-1`} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            {T('deliveryPhone')}
            <input value={state.alternativeDeliveryPhone ?? ''} onChange={(e) => setField('alternativeDeliveryPhone', e.target.value)} disabled={disabled} className={`${inputClass} mt-1`} />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-gray-700">
            {T('deliveryNote')}
            <textarea value={state.alternativeDeliveryNote ?? ''} onChange={(e) => setField('alternativeDeliveryNote', e.target.value)} disabled={disabled} className={`${inputClass} mt-1`} rows={2} />
          </label>
        </div>
      ) : variant === 'step4' ? (
        <div className="rounded-md border border-emerald-100 bg-white px-3 py-2 text-sm text-gray-700" data-testid="resolved-customer-delivery-address">
          <p className="mb-1 font-semibold text-emerald-800">{T('sameAsCustomerAddress')}</p>
          <p className="whitespace-pre-line">{formatDeliveryDestination(resolved) || T('deliveryAddressDerivedHelp')}</p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-gray-500">{T('deliveryAddressDerivedHelp')}</p>
      )}
    </section>
  );
}
