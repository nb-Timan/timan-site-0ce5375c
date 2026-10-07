import { useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import type { ConfiguratorState, MachineDeliveryAddress } from '@/types/configurator';
import { PRODUCTS, getLocalizedName } from '@/data/machines';
import {
  dealerDeliveryAddress, deliveryMachineUnits, formatDeliveryDestination,
  resolveDeliveryDestination, updateMachineDeliveryAddress,
} from '@/lib/configuratorDelivery';

interface ConfiguratorDeliveryAddressProps {
  state: ConfiguratorState;
  variant: 'step2' | 'step4';
  disabled?: boolean;
  T: (key: string) => string;
  onChange: (update: Partial<ConfiguratorState>) => void;
}

const fields = [
  ['address', 'deliveryAddressLine'], ['postalCode', 'deliveryPostalCode'], ['city', 'deliveryCity'],
  ['country', 'deliveryCountry'], ['contactPerson', 'deliveryContactPerson'], ['phone', 'deliveryPhone'],
  ['note', 'deliveryNote'],
] as const;

export function ConfiguratorDeliveryAddress({ state, variant, disabled = false, T, onChange }: ConfiguratorDeliveryAddressProps) {
  const units = deliveryMachineUnits(state);
  const dealer = dealerDeliveryAddress(state);
  const [editorOpen, setEditorOpen] = useState(false);
  const hasMultipleAddresses = variant === 'step2' && units.length > 1;
  return (
    <div className="space-y-3 text-left" data-testid={`delivery-address-${variant}`}>
      {hasMultipleAddresses && (
        <button
          type="button"
          aria-expanded={editorOpen}
          onClick={() => setEditorOpen(open => !open)}
          className="mx-auto flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
        >
          <MapPin aria-hidden="true" className="h-4 w-4" />
          {T('customizeMachineDeliveryAddresses')}
        </button>
      )}
      {(!hasMultipleAddresses || editorOpen) && units.map(unit => {
        const destination = resolveDeliveryDestination(state, unit.unitNumber);
        const snapshot = state.machineDeliveryAddresses?.[unit.key];
        const mode = snapshot?.mode ?? (destination.source === 'alternative' ? 'manual' : destination.source);
        const update = (patch: Partial<MachineDeliveryAddress>) => onChange({ machineDeliveryAddresses: updateMachineDeliveryAddress(state, unit.key, patch) });
        const title = `${T('deliveryAddressSection')} – ${T('machineLabel')} ${unit.unitNumber} – ${getLocalizedName(PRODUCTS[unit.machineType]?.name ?? unit.machineType, state.locale ?? state.language)}`;
        return (
          <details key={unit.key} open={variant === 'step2' && units.length === 1} className="group min-w-0 rounded-lg border border-gray-200 bg-gray-50" data-testid={`machine-delivery-${unit.key}`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-semibold text-gray-900">
              <span className="min-w-0 break-words">{title}</span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180" />
            </summary>
            <div className="border-t border-gray-200 p-3">
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={title}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name={`delivery-${variant}-${unit.key}`} checked={mode === 'dealer'} disabled={disabled || !dealer.address}
                    onChange={() => update(dealer)} />
                  <span>{T('useDealerDeliveryAddress')}</span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name={`delivery-${variant}-${unit.key}`} checked={mode === 'manual'} disabled={disabled}
                    onChange={() => update({ mode: 'manual', company: '' })} />
                  <span>{T('enterDeliveryAddress')}</span>
                </label>
              </div>
              {mode === 'manual' ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="alternative-delivery-fields">
                  {fields.map(([field, label]) => (
                    <label key={field} className={`min-w-0 text-sm font-medium text-gray-700 ${['address', 'country', 'note'].includes(field) ? 'sm:col-span-2' : ''}`}>
                      {T(label)}
                      {field === 'note' ? (
                        <textarea value={destination[field]} onChange={event => update({ [field]: event.target.value })} disabled={disabled} rows={2} className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2 text-sm" />
                      ) : (
                        <input value={destination[field]} onChange={event => update({ [field]: event.target.value })} disabled={disabled} className="mt-1 min-h-10 w-full rounded-md border border-gray-300 bg-white p-2 text-sm" />
                      )}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-3 whitespace-pre-line break-words text-sm text-gray-700">{formatDeliveryDestination(destination) || '—'}</p>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
