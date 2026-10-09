import type { ChangeEventHandler } from 'react';

interface PurchaseOrderFieldProps {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

export function ConfiguratorPurchaseOrderField({ label, value, onChange }: PurchaseOrderFieldProps) {
  return (
    <div data-testid="configurator-purchase-order-control">
      <label htmlFor="configurator-purchase-order-reference" className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id="configurator-purchase-order-reference"
        type="text"
        value={value}
        onChange={onChange}
        className="w-full p-2 border rounded-lg"
      />
    </div>
  );
}

interface MachineReferenceFieldProps {
  machineNumber: number;
  value: string;
  placeholder: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

export function ConfiguratorMachineReferenceField({
  machineNumber,
  value,
  placeholder,
  onChange,
}: MachineReferenceFieldProps) {
  return (
    <div className="mt-2 mb-3 pl-2" data-testid="configurator-machine-reference-control">
      <input
        id={`configurator-machine-reference-${machineNumber}`}
        type="text"
        maxLength={20}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-700 placeholder-gray-400"
      />
    </div>
  );
}

interface DemoMachineControlProps {
  machineNumber: number;
  checked: boolean;
  disabled: boolean;
  label: string;
  formattedFee: string;
  indentClassName: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

export function ConfiguratorDemoMachineControl({
  machineNumber,
  checked,
  disabled,
  label,
  formattedFee,
  indentClassName,
  onChange,
}: DemoMachineControlProps) {
  return (
    <div
      className={`flex justify-between items-center text-xs ${indentClassName} mt-1`}
      data-testid="configurator-demo-control"
    >
      <label
        htmlFor={`configurator-demo-machine-${machineNumber}`}
        className={`flex items-center gap-2 select-none ${disabled ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer text-gray-700'}`}
      >
        <input
          id={`configurator-demo-machine-${machineNumber}`}
          type="checkbox"
          disabled={disabled}
          checked={checked}
          onChange={onChange}
        />
        <span>{label} <span className="text-gray-500">(+{formattedFee})</span></span>
      </label>
    </div>
  );
}
