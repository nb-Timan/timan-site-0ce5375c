import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MachineInterestPicker } from '@/pages/crm/CrmNewLeadPage';
import {
  canonicalCrmLeadInterestFromLegacyValue,
  type CrmLeadMachineInterestItem,
} from '@/lib/crmLeadMachineInterest';

const machineValue = 'RC-1000s';
const equipmentValue = 'Equipment: RC-1000s - Slagleklipper inkl. Y-slagle sæt';

function canonical(value: string, quantity: number): CrmLeadMachineInterestItem {
  const item = canonicalCrmLeadInterestFromLegacyValue(value);
  if (!item) throw new Error(`Missing canonical fixture for ${value}`);
  return { ...item, quantity };
}

function Harness() {
  const [values, setValues] = useState([machineValue, equipmentValue]);
  const [items, setItems] = useState([
    canonical(machineValue, 2),
    canonical(equipmentValue, 3),
  ]);

  return (
    <MachineInterestPicker
      value={values}
      items={items}
      language="da"
      onChange={(nextValues, nextItems) => {
        setValues(nextValues);
        setItems(nextItems);
      }}
    />
  );
}

describe('CRM lead machine-interest quantity UI', () => {
  it('uses the same compact touch-friendly stepper for machines and equipment', () => {
    render(<Harness />);

    const machine = screen.getByTestId('lead-interest-quantity-411000');
    const equipment = screen.getByTestId('lead-interest-quantity-410910');

    for (const stepper of [machine, equipment]) {
      expect(stepper).toHaveClass('h-8', 'justify-self-start', 'grid-cols-[32px_minmax(40px,56px)_32px]');
      expect(within(stepper).getByRole('spinbutton')).toHaveClass('px-0.5', 'text-xs');
      for (const button of within(stepper).getAllByRole('button')) {
        expect(button).toHaveClass('touch-manipulation');
      }
    }

    fireEvent.click(within(machine).getAllByRole('button')[1]);
    expect(within(screen.getByTestId('lead-interest-quantity-411000')).getByRole('spinbutton')).toHaveValue(3);
    expect(within(screen.getByTestId('lead-interest-quantity-410910')).getByRole('spinbutton')).toHaveValue(3);
  });
});
