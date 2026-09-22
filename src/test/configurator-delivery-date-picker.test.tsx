import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { da } from 'date-fns/locale';
import { ConfiguratorDeliveryDatePicker } from '@/components/configurator/ConfiguratorDeliveryDatePicker';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ConfiguratorDeliveryDatePicker', () => {
  it('uses the same disabled weekends and yellow discount dates for global and machine dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:00:00+02:00'));
    const onGlobalChange = vi.fn();
    const onMachineChange = vi.fn();

    render(
      <>
        <ConfiguratorDeliveryDatePicker
          value="2027-01-07"
          onChange={onGlobalChange}
          locale={da}
          placeholder="Vælg dato"
          ariaLabel="Ønsket Leveringsdato"
          discountLegend="Gul markering = 2% ekstra rabat"
          weekendError="Leveringsdato kan ikke være en weekend."
        />
        <ConfiguratorDeliveryDatePicker
          value="2027-01-07"
          onChange={onMachineChange}
          locale={da}
          placeholder="Vælg dato"
          ariaLabel="Individuel dato – Maskine 1"
          discountLegend="Gul markering = 2% ekstra rabat"
          weekendError="Leveringsdato kan ikke være en weekend."
        />
      </>,
    );

    const assertCalendarRules = (onChange: ReturnType<typeof vi.fn>) => {
      const weekend = Array.from(document.querySelectorAll<HTMLButtonElement>('button:disabled'))
        .find(button => button.textContent === '2');
      expect(weekend).toBeDefined();
      expect(weekend).not.toHaveClass('delivery-discount-date');
      expect(document.querySelectorAll('.delivery-discount-date').length).toBeGreaterThan(0);
      fireEvent.click(weekend!);
      expect(onChange).not.toHaveBeenCalled();
    };

    fireEvent.click(screen.getByRole('button', { name: 'Ønsket Leveringsdato' }));
    assertCalendarRules(onGlobalChange);
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Individuel dato – Maskine 1' }));
    assertCalendarRules(onMachineChange);
    const friday = Array.from(document.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      .find(button => button.textContent === '8');
    expect(friday).toBeDefined();
    fireEvent.click(friday!);
    expect(onMachineChange).toHaveBeenCalledWith('2027-01-08');
  });
});
