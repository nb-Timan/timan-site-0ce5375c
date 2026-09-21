import { afterEach, describe, expect, it } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { calculateConfiguration, calcConfigurationTotals, roundPricingMoney } from '@/lib/calcConfiguration';
import { campaignError, replacePublishedCampaigns, type CampaignProductLink, type ProductCampaign } from '@/lib/configuratorCampaigns';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import { useConfigurator } from '@/hooks/useConfigurator';
import { MarketingConfiguratorBadge } from '@/components/configurator/MarketingConfiguratorBadge';
import { convertCurrency } from '@/lib/currency';
import { configuratorPricingSignature, protectLegacySentPricing } from '@/lib/configuratorPricing';
import type { ConfiguratorState } from '@/types/configurator';

const now = Date.parse('2026-09-21T12:00:00Z');
const link = (patch: Partial<CampaignProductLink> = {}): CampaignProductLink => ({
  campaignId: 'qa-campaign', productKey: 'Timan 3330::725138', machineKey: 'Timan 3330', itemNumber: '725138', role: 'linked', quantity: 1, ...patch,
});
const campaign = (patch: Partial<ProductCampaign> = {}): ProductCampaign => ({
  id: 'qa-campaign', code: 'K09-2026-01', name: 'QA CS-200', status: 'published', type: 'percentage', benefitPricingType: null,
  discountPct: 25, targetPriceDkk: null, targetPriceEur: null, triggerMinQuantity: 1, benefitQuantity: 1, scaleBenefitWithTrigger: false,
  startsAt: '2026-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', badge_starts_at: '2026-01-01T00:00:00Z', badge_ends_at: '2099-01-01T00:00:00Z', badge_show_countdown: true,
  products: [link()], ...patch,
});
const state = (): ConfiguratorState => ({ ...createEmptyConfiguratorState('da'), step: 4,
  machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'shared' as const, acc: ['725138'] }],
});
afterEach(() => act(() => replacePublishedCampaigns([])));

describe('canonical multi-product campaigns', () => {
  it('keeps badge-only campaigns financially unchanged', () => {
    const baseline = calculateConfiguration(state(), { now });
    replacePublishedCampaigns([campaign({ type: 'badge', discountPct: null })]);
    expect(calculateConfiguration(state(), { now })).toEqual(baseline);
  });
  it.each(['none', 'base', 'delivery', 'quantity', 'dealer', 'all'])('preserves independent %s normal discounts', mode => {
    const input = state();
    input.baseDiscountPct = mode === 'none' ? 0 : 0.25;
    if (mode === 'delivery' || mode === 'all') input.date = '2098-01-01';
    if (mode === 'quantity' || mode === 'all') input.machineConfigs[0].qty = 2;
    if (mode === 'dealer' || mode === 'all') input.manualDealerDiscountPct = 1.6;
    const result = calculateConfiguration(input, { now });
    const expected = result.subtotal * (mode === 'none' ? 1 : 0.75) * (input.date ? 0.98 : 1) * (input.machineConfigs[0].qty === 2 ? 0.98 : 1) * (input.manualDealerDiscountPct ? 0.984 : 1);
    expect(result.currentPrice).toBeCloseTo(expected, 1);
    expect(result.discountDetails.reduce((sum, detail) => sum + detail.amount, 0)).toBeCloseTo(result.totalDiscount, 2);
  });
  it('applies percentage last and only to linked benefit products', () => {
    const input = state(); input.machineConfigs[0].qty = 2; input.date = '2098-01-01'; input.manualDealerDiscountPct = 1.6;
    const baseline = calculateConfiguration(input, { now });
    replacePublishedCampaigns([campaign()]);
    const result = calculateConfiguration(input, { now });
    expect(result.discountDetails.map(detail => detail.kind)).toEqual(['base', 'delivery', 'quantity', 'dealer', 'campaign', 'campaign']);
    expect(result.discountDetails.slice(0, 4)).toEqual(baseline.discountDetails);
    expect(result.campaignLines).toHaveLength(2);
    expect(result.campaignLines?.every(line => line.campaignCode === 'K09-2026-01' && line.benefitItemNumber === '725138')).toBe(true);
    expect(result.currentPrice).toBeCloseTo(baseline.currentPrice - result.campaignLines!.reduce((sum, line) => sum + line.discountAmount, 0), 2);
    expect(result.totalPct).toBeCloseTo((result.subtotal - result.currentPrice) / result.subtotal * 100, 8);
  });
  it('supports a zero fixed target without changing the canonical list price', () => {
    replacePublishedCampaigns([campaign({ type: 'fixed', discountPct: null, targetPriceDkk: 0, targetPriceEur: 0 })]);
    const result = calculateConfiguration(state(), { now });
    expect(result.lineItems.find(item => item.varenr === '725138')?.price).toBe(58350);
    expect(result.campaignLines?.[0]).toMatchObject({ targetPrice: 0, preCampaignNet: 43762.5, discountAmount: 43762.5, finalLineValue: 0 });
  });
  it('never raises a lower discounted price to a fixed target', () => {
    replacePublishedCampaigns([campaign({ type: 'fixed', discountPct: null, targetPriceDkk: 50000, targetPriceEur: 7000 })]);
    expect(calculateConfiguration(state(), { now }).campaignLines?.[0]).toMatchObject({ applied: false, discountAmount: 0, finalLineValue: 43762.5 });
  });
  it('requires trigger product for conditional buy-X-get-Y', () => {
    const conditional = campaign({ type: 'conditional', benefitPricingType: 'fixed', discountPct: null, targetPriceDkk: 0, targetPriceEur: 0,
      products: [link({ role: 'trigger', productKey: 'RC-751::RC-751', machineKey: 'RC-751', itemNumber: '410040' }), link({ role: 'benefit' })] });
    replacePublishedCampaigns([conditional]);
    expect(calculateConfiguration(state(), { now }).campaignLines).toEqual([]);
    const withTriggerState = state();
    withTriggerState.machineConfigs.push({ id: 'trigger', type: 'RC-751', qty: 1, configMode: 'shared', acc: [] });
    const withTrigger = calculateConfiguration(withTriggerState, { now });
    expect(withTrigger.campaignLines?.[0]).toMatchObject({ campaignType: 'conditional', benefitItemNumber: '725138', finalLineValue: 0, quantity: 1 });
  });
  it('does not grant unlimited free benefits unless scaling is explicit', () => {
    const input = state(); input.machineConfigs[0].qty = 2;
    replacePublishedCampaigns([campaign({ type: 'conditional', benefitPricingType: 'fixed', discountPct: null, targetPriceDkk: 0, targetPriceEur: 0,
      products: [link({ role: 'trigger', productKey: 'Timan 3330::Timan 3330', itemNumber: '712000' }), link({ role: 'benefit' })] })]);
    const result = calculateConfiguration(input, { now });
    expect(result.campaignLines).toHaveLength(1);
    expect(result.campaignLines?.[0].quantity).toBe(1);
  });
  it('supports explicit benefit scaling by trigger quantity', () => {
    const input = state(); input.machineConfigs[0].qty = 2;
    replacePublishedCampaigns([campaign({ type: 'conditional', benefitPricingType: 'fixed', discountPct: null, targetPriceDkk: 0, targetPriceEur: 0, scaleBenefitWithTrigger: true,
      products: [link({ role: 'trigger', productKey: 'Timan 3330::Timan 3330', itemNumber: '712000' }), link({ role: 'benefit' })] })]);
    expect(calculateConfiguration(input, { now }).campaignLines).toHaveLength(2);
  });
  it('supports several products under one campaign id and code', () => {
    const input = state(); input.machineConfigs[0].acc.push('725132');
    replacePublishedCampaigns([campaign({ products: [link(), link({ productKey: 'Timan 3330::725132', itemNumber: '725132' })] })]);
    const rows = calculateConfiguration(input, { now }).campaignLines || [];
    expect(new Set(rows.map(row => row.campaignId))).toEqual(new Set(['qa-campaign']));
    expect(new Set(rows.map(row => row.itemNumber))).toEqual(new Set(['725138', '725132']));
  });
  it('applies the safe benefit quantity independently to each conditional benefit product', () => {
    const input = state();
    input.machineConfigs[0].acc.push('725132');
    replacePublishedCampaigns([campaign({
      type: 'conditional', benefitPricingType: 'fixed', discountPct: null,
      targetPriceDkk: 0, targetPriceEur: 0,
      products: [
        link({ role: 'trigger', productKey: 'Timan 3330::Timan 3330', itemNumber: '712000' }),
        link({ role: 'benefit' }),
        link({ role: 'benefit', productKey: 'Timan 3330::725132', itemNumber: '725132' }),
      ],
    })]);
    const rows = calculateConfiguration(input, { now }).campaignLines || [];
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.quantity === 1 && row.finalLineValue === 0)).toBe(true);
  });
  it.each(['DKK', 'EUR', 'SEK'] as const)('keeps %s currency conversion finite', currency => {
    const input = state(); input.language = currency === 'DKK' ? 'da' : 'en';
    replacePublishedCampaigns([campaign({ type: 'fixed', discountPct: null, targetPriceDkk: 40000.19, targetPriceEur: 5000.19 })]);
    const row = calculateConfiguration(input, { now }).campaignLines![0];
    expect(Number.isFinite(convertCurrency(row.finalLineValue, row.currency, currency))).toBe(true);
    expect(roundPricingMoney(row.preCampaignNet - row.discountAmount)).toBe(row.finalLineValue);
  });
  it.each([{ endsAt: '2026-09-20T00:00:00Z' }, { startsAt: '2026-10-01T00:00:00Z' }, { status: 'draft' as const }])('does not apply inactive rules: %j', patch => {
    replacePublishedCampaigns([campaign(patch)]);
    expect(calculateConfiguration(state(), { now }).campaignLines).toEqual([]);
  });
  it('freezes metadata and document totals after campaign changes', async () => {
    replacePublishedCampaigns([campaign()]);
    const input = state(); const live = calculateConfiguration(input); const saved = await finalizeConfiguratorPricingSnapshot(input);
    expect(saved.pricingSnapshot?.campaignLines).toEqual(live.campaignLines);
    const serialized = JSON.stringify(saved);
    replacePublishedCampaigns([campaign({ discountPct: 90 })]);
    const reopened = JSON.parse(serialized);
    expect(await finalizeConfiguratorPricingSnapshot(reopened)).toEqual(saved);
    expect(buildSubmittedOrderDocument(reopened).calcResult.currentPrice).toBe(live.currentPrice);
    expect(calcConfigurationTotals(reopened).finalPrice).toBe(live.currentPrice);
  });
  it('does not retrofit historical snapshots or legacy sent offers', async () => {
    const input = state(); const original = calculateConfiguration(input);
    input.pricingSnapshot = { version: 1, capturedAt: '2026-01-01', prices: {}, signature: configuratorPricingSignature(input), totals: { subtotal: original.subtotal, totalDiscount: original.totalDiscount, finalPrice: original.currentPrice } };
    replacePublishedCampaigns([campaign()]);
    expect(calcConfigurationTotals(input).finalPrice).toBe(original.currentPrice);
    const legacy = protectLegacySentPricing(state(), { quote_sent_at: '2026-09-16', subtotal: 61470, total_price: 40801 });
    expect(calcConfigurationTotals(legacy).finalPrice).toBe(40801);
    await expect(finalizeConfiguratorPricingSnapshot(legacy)).rejects.toThrow('Historiske');
  });
  it('updates the one shared live calculation store', () => {
    const { result } = renderHook(() => useConfigurator());
    act(() => result.current.setState(state()));
    act(() => replacePublishedCampaigns([campaign()]));
    expect(result.current.calcResult).toEqual(calculateConfiguration(result.current.state));
  });
  it('shows code, percentage and zero-price badge variants', () => {
    const { rerender } = render(<MarketingConfiguratorBadge badge="Kampagne" campaign={campaign()} />);
    expect(screen.getByText(/Kampagne · 25%/)).toBeInTheDocument();
    rerender(<MarketingConfiguratorBadge badge="Kampagne" campaign={campaign({ type: 'fixed', discountPct: null, targetPriceDkk: 0, targetPriceEur: 0 })} />);
    expect(screen.getByText(/Kampagne · 0 kr\./)).toBeInTheDocument();
  });
  it.each([0, -1, 101, NaN, Infinity])('rejects invalid percentage %s', value => {
    expect(campaignError(campaign({ discountPct: value }))).not.toBeNull();
  });
  it('accepts zero target and rejects incomplete conditional rules', () => {
    expect(campaignError(campaign({ type: 'fixed', discountPct: null, targetPriceDkk: 0, targetPriceEur: 0 }))).toBeNull();
    expect(campaignError(campaign({ type: 'conditional', benefitPricingType: 'fixed', targetPriceDkk: 0, targetPriceEur: 0 }))).not.toBeNull();
  });
});
