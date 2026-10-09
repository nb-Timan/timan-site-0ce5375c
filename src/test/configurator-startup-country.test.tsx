import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfiguratorStartupOptions } from '@/components/configurator/ConfiguratorStartupOptions';
import {
  configuratorStartupOptionsForCountry,
  reconcileConfiguratorStartupOption,
  resolveConfiguratorMarketCountry,
} from '@/lib/configuratorStartup';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { t } from '@/data/translations';

describe('Configurator startup country rule', () => {
  it('shows both paid netto choices and Other agreement in DK', () => {
    render(<ConfiguratorStartupOptions country="DK" value={null} translate={key => t(key, 'da')} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Opstart af maskine / uden bro (1.500 kr. netto)')).toBeInTheDocument();
    expect(screen.getByLabelText('Opstart af maskine / med bro (2.500 kr. netto)')).toBeInTheDocument();
    expect(screen.getByLabelText('Opstart af maskine / Anden aftale (se kommentar)')).toBeInTheDocument();
  });

  it.each(['DE', 'GB', 'IT', 'HU', 'SE', 'FR', 'PL', 'CZ'])(
    '%s sees only Other agreement',
    country => {
      expect(configuratorStartupOptionsForCountry(country)).toEqual(['other']);
    },
  );

  it('uses country independently from UI language', () => {
    const { rerender } = render(
      <ConfiguratorStartupOptions country="DK" value={null} translate={key => t(key, 'de')} onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText('Maschinenstart / ohne Brücke (200 €)')).toBeInTheDocument();
    rerender(<ConfiguratorStartupOptions country="DE" value={null} translate={key => t(key, 'da')} onChange={vi.fn()} />);
    expect(screen.queryByLabelText(/uden bro/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Opstart af maskine / Anden aftale (se kommentar)')).toBeInTheDocument();
  });

  it('clears a paid option when the country changes away from DK', () => {
    expect(reconcileConfiguratorStartupOption('DK', 'no_bridge')).toBe('no_bridge');
    expect(reconcileConfiguratorStartupOption('DE', 'no_bridge')).toBeNull();
    expect(reconcileConfiguratorStartupOption('GB', 'with_bridge')).toBeNull();
    expect(reconcileConfiguratorStartupOption('DE', 'other')).toBe('other');
  });

  it('normalizes canonical DK aliases without involving language', () => {
    expect(resolveConfiguratorMarketCountry('', 'Danmark')).toBe('DK');
    expect(resolveConfiguratorMarketCountry('Denmark')).toBe('DK');
    expect(resolveConfiguratorMarketCountry('DE', 'DK')).toBe('DE');
  });

  it('keeps the real 795050 startup fee full-price under all ordinary discounts', () => {
    const state = createEmptyConfiguratorState('da');
    state.currency = 'DKK';
    state.machineConfigs = [{ id: 'm0', type: 'Timan 3330', qty: 2, configMode: 'shared', acc: ['725138'] }];
    state.date = '2098-01-06';
    state.deliveryMethod = 'deliver';
    state.deliveryDeliverStartup = 'no_bridge';
    state.manualDealerDiscountPct = 10;
    const result = calculateConfiguration(state, { now: Date.parse('2026-10-07T12:00:00Z') });
    expect(result.commercialLines?.find(line => line.itemNo === '795050')).toMatchObject({
      grossAmount: 1500,
      finalNetAmount: 1500,
      discountApplications: [],
    });
    expect(result.lineItems.find(line => line.varenr === '795050')).toMatchObject({ isNetto: true });
  });

  it('keeps the Other agreement selectable and interactive outside DK', async () => {
    const onChange = vi.fn();
    render(<ConfiguratorStartupOptions country="DE" value={null} translate={key => t(key, 'da')} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Opstart af maskine / Anden aftale (se kommentar)'));
    expect(onChange).toHaveBeenCalledWith('other');
  });
});
