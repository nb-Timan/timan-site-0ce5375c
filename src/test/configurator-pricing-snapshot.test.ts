import { describe, expect, it } from 'vitest';
import { calcConfigurationTotals } from '@/lib/calcConfiguration';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { configuratorPricingSignature } from '@/lib/configuratorPricing';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';

describe('Configurator submitted-order price snapshots', () => {
  it('uses captured unit prices instead of a later catalogue value', () => {
    const state = createEmptyConfiguratorState('da', 'order');
    state.machineConfigs = [{ id: 'm0', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] }];
    state.pricingSnapshot = {
      version: 1,
      capturedAt: '2026-09-17T10:00:00.000Z',
      prices: { 'machine:RC-751': 100000 },
    };

    const totals = calcConfigurationTotals(state);

    expect(totals.subtotal).toBe(100000);
    expect(totals.finalPrice).toBe(75000);
  });

  it('uses the current price only for a new item absent from the historical snapshot', () => {
    const state = createEmptyConfiguratorState('da', 'order');
    state.machineConfigs = [
      { id: 'm0', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] },
      { id: 'm1', type: 'RC-1000S', qty: 1, configMode: 'shared', acc: [] },
    ];
    state.pricingSnapshot = {
      version: 1,
      capturedAt: '2026-09-17T10:00:00.000Z',
      prices: { 'machine:RC-751': 100000 },
    };

    const totals = calcConfigurationTotals(state);

    expect(totals.subtotal).toBeGreaterThan(100000);
  });

  it('keeps an unchanged submitted order on its frozen commercial total', () => {
    const state = createEmptyConfiguratorState('da', 'order');
    state.machineConfigs = [{ id: 'm0', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] }];
    state.pricingSnapshot = {
      version: 1,
      capturedAt: '2026-09-17T10:00:00.000Z',
      prices: { 'machine:RC-751': 100000 },
      signature: configuratorPricingSignature(state),
      totals: { subtotal: 98765, totalDiscount: 23456, finalPrice: 75309 },
    };

    expect(calcConfigurationTotals(state)).toEqual({ subtotal: 98765, totalDiscount: 23456, finalPrice: 75309 });
  });

  it('captures exact commercial line allocations for future order exports', async () => {
    const state = createEmptyConfiguratorState('da', 'order');
    state.machineConfigs = [{ id: 'm0', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] }];

    const frozen = await finalizeConfiguratorPricingSnapshot(state);

    expect(frozen.pricingSnapshot?.lines).toHaveLength(1);
    expect(frozen.pricingSnapshot?.lines?.[0].finalNetAmount).toBeGreaterThan(0);
    expect(frozen.pricingSnapshot?.lines?.[0].discountApplications).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'base', percent: 25 }),
    ]));
    expect(frozen.pricingSnapshot?.lines?.reduce((sum, line) => sum + (line.finalNetAmount ?? 0), 0))
      .toBe(frozen.pricingSnapshot?.totals?.finalPrice);
  });
});
