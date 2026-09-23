import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { DriftNumericInput } from '@/components/driftberegner/DriftNumericInput';
import {
  formatEditableDanishNumber,
  parseDanishNumericInput,
} from '@/lib/driftberegnerNumericInput';

describe('Driftberegner numeric input behavior', () => {
  it('keeps a blank edit state without committing zero before the replacement is entered', () => {
    function NumericHarness() {
      const [value, setValue] = useState(200);
      return createElement(
        'div',
        null,
        createElement(DriftNumericInput, {
          'aria-label': 'Antal dage',
          value,
          onValueChange: setValue,
        }),
        createElement('output', { 'data-testid': 'committed-value' }, String(value)),
      );
    }

    render(createElement(NumericHarness));
    const input = screen.getByLabelText('Antal dage') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(screen.getByTestId('committed-value')).toHaveTextContent('200');

    fireEvent.blur(input);
    expect(input.value).toBe('200');
    expect(screen.getByTestId('committed-value')).toHaveTextContent('200');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });

    fireEvent.change(input, { target: { value: '45' } });
    expect(input.value).toBe('45');
    expect(screen.getByTestId('committed-value')).toHaveTextContent('45');
  });

  it('allows a Danish decimal replacement and an intentional zero', () => {
    function NumericHarness() {
      const [value, setValue] = useState(13.5);
      return createElement(
        'div',
        null,
        createElement(DriftNumericInput, {
          'aria-label': 'Brændstofpris',
          value,
          onValueChange: setValue,
        }),
        createElement('output', { 'data-testid': 'committed-value' }, String(value)),
      );
    }

    render(createElement(NumericHarness));
    const input = screen.getByLabelText('Brændstofpris') as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '14,2' } });
    expect(screen.getByTestId('committed-value')).toHaveTextContent('14.2');

    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByTestId('committed-value')).toHaveTextContent('0');
  });

  it('keeps blank and partial decimal values as temporary edit states', () => {
    expect(parseDanishNumericInput('')).toBeNull();
    expect(parseDanishNumericInput('13,')).toBeNull();
    expect(parseDanishNumericInput('13,5')).toBe(13.5);
    expect(parseDanishNumericInput('14,2')).toBe(14.2);
  });

  it('distinguishes an intentional zero from an empty input', () => {
    expect(parseDanishNumericInput('0')).toBe(0);
    expect(parseDanishNumericInput('000')).toBe(0);
  });

  it('accepts normal replacements without a leading-zero conversion', () => {
    expect(parseDanishNumericInput('45')).toBe(45);
    expect(parseDanishNumericInput('161.700')).toBe(161700);
    expect(formatEditableDanishNumber(13.5)).toBe('13,5');
  });

  it('uses the same raw-input component for every editable calculator field', () => {
    const page = readFileSync('src/pages/DriftberegnerPage.tsx', 'utf8');

    expect(page.match(/<DriftNumericInput/g)).toHaveLength(8);
    expect(page).toContain("onValueChange={(value) => updateCommon('fuelPrice', value)}");
    expect(page).toContain("onValueChange={(value) => updateMachineField(m, 'purchasePrice', value)}");
    expect(page).toContain("onValueChange={(value) => updateMachineField(m, 'fuelConsumption', value)}");
    expect(page).toContain("onValueChange={(value) => updateMachineField(m, 'residualValuePercent', value)}");
    expect(page).not.toContain("updateCommon('fuelPrice', e.target.value)");
  });
});
