import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { jsPDF } from 'jspdf';
import { calculateConfiguration, calcConfigurationTotals, configurationCampaignSelection, roundPricingMoney as money } from '@/lib/calcConfiguration';
import { campaignTriggerSetCount, replacePublishedCampaigns, type ProductCampaign } from '@/lib/configuratorCampaigns';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { buildSubmittedOrderDocument, buildSubmittedOrderMailSummary } from '@/lib/submittedOrderConfirmation';
import { buildConfiguratorPdf } from '@/lib/configuratorPdf';
import { MarketingConfiguratorBadge } from '@/components/configurator/MarketingConfiguratorBadge';
import { useConfigurator } from '@/hooks/useConfigurator';
import { t } from '@/data/translations';
import type { ConfiguratorState } from '@/types/configurator';

const now = Date.parse('2026-09-24T12:00:00Z');
const campaign = (conditional = false): ProductCampaign => ({
  id: 'qa-demo-precedence', code: 'QA-DEMO', name: 'Local test campaign', status: 'published',
  type: conditional ? 'conditional' : 'fixed', benefitPricingType: conditional ? 'fixed' : null,
  discountPct: null, targetPriceDkk: 0, targetPriceEur: 0,
  triggerMinQuantity: 1, triggerMatchMode: 'any', benefitQuantity: 1, scaleBenefitWithTrigger: false,
  audience: 'qa', startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z',
  products: [
    ...(conditional ? [{ campaignId: 'qa-demo-precedence', productKey: 'Timan 3330::Timan 3330', machineKey: 'Timan 3330', itemNumber: '712000', role: 'trigger' as const, quantity: 1 }] : []),
    { campaignId: 'qa-demo-precedence', productKey: 'Timan 3330::725138', machineKey: 'Timan 3330', itemNumber: '725138', role: conditional ? 'benefit' : 'linked', quantity: 1 },
  ],
});
const input = (demo = true): ConfiguratorState => ({
  ...createEmptyConfiguratorState('da'),
  machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: 1, configMode: 'shared' as const, acc: ['725138'] }],
  demoMachines: { '712000_1': demo },
});

afterEach(() => { cleanup(); act(() => replacePublishedCampaigns([])); vi.restoreAllMocks(); });

describe('exclusive per-machine demo pricing', () => {
  it('preserves normal base pricing', () => {
    const result = calculateConfiguration(input(false), { now });
    expect(result.discountDetails.map(row => row.kind)).toEqual(['base']);
    expect(result.currentPrice).toBe(money(result.subtotal * 0.75));
  });
  it.each(['none', 'delivery', 'extra', 'campaign', 'all'])('applies only 32.5 percent for demo with %s', mode => {
    const state = input();
    if (mode === 'delivery' || mode === 'all') state.date = '2098-01-01';
    if (mode === 'extra' || mode === 'all') state.manualDealerDiscountPct = 10;
    if (mode === 'campaign' || mode === 'all') replacePublishedCampaigns([campaign()]);
    const result = calculateConfiguration(state, { now });
    expect(result.discountDetails).toHaveLength(1);
    expect(result.discountDetails[0]).toMatchObject({ kind: 'demo', percent: 32.5, basis: result.subtotal });
    expect(result.totalDiscount).toBe(money(result.subtotal * 0.325));
    expect(result.currentPrice).toBe(money(result.subtotal - result.totalDiscount));
    expect(result.deliveryDiscounts?.[0].amount).toBe(0);
    expect(result.campaignLines?.every(row => row.discountAmount === 0 && !row.applied)).toBe(true);
  });
  it('preserves the 75 DKK demo line and its existing discount basis', () => {
    const demo = calculateConfiguration(input(), { now });
    const normal = calculateConfiguration(input(false), { now });
    expect(demo.lineItems.find(row => row.varenr === 'DEMO')?.price).toBe(75);
    expect(demo.subtotal).toBe(normal.subtotal + 75);
  });
  it('preserves the existing quantity threshold: demo units do not count or receive it', () => {
    const state = input(); state.machineConfigs[0].qty = 4;
    const result = calculateConfiguration(state, { now });
    expect(result.qtyPct).toBe(0.02);
    const demoGross = result.lineItems.find(row => row.subtotal && row.index === 1)!.price;
    expect(result.discountDetails.find(row => row.kind === 'quantity')?.basis).toBe(money((result.subtotal - demoGross) * 0.75));
  });
  it('aggregates mixed machines without allocating normal discounts to the demo', () => {
    const state = input(); state.machineConfigs[0].qty = 3; state.date = '2098-01-01'; state.manualDealerDiscountPct = 7;
    replacePublishedCampaigns([campaign()]);
    const result = calculateConfiguration(state, { now });
    const demoGross = result.lineItems.find(row => row.subtotal && row.index === 1)!.price;
    const normalGross = money(result.subtotal - demoGross);
    const base = money(normalGross * 0.25);
    const delivery = money((normalGross - base) * 0.02);
    const quantity = money((normalGross - base - delivery) * 0.02);
    const dealer = money((normalGross - base - delivery - quantity) * 0.07);
    expect(result.discountDetails.find(row => row.kind === 'dealer')?.amount).toBe(dealer);
    expect(result.campaignLines?.filter(row => row.applied).map(row => row.unitNumber)).toEqual([2, 3]);
    const campaigns = result.campaignLines!.reduce((sum, row) => sum + row.discountAmount, 0);
    expect(result.currentPrice).toBe(money(demoGross - money(demoGross * 0.325) + normalGross - base - delivery - quantity - dealer - campaigns));
    expect(money(result.discountDetails.reduce((sum, row) => sum + row.amount, 0))).toBe(result.totalDiscount);
  });
  it('retains campaign identity with explicitly suppressed, zero economic contribution', () => {
    replacePublishedCampaigns([campaign()]);
    const result = calculateConfiguration(input(), { now });
    expect(result.campaignLines?.[0]).toMatchObject({
      campaignId: 'qa-demo-precedence', itemNumber: '725138', productKey: 'Timan 3330::725138',
      applied: false, suppressedReason: 'demo_machine', discountAmount: 0, discountPct: 0,
    });
    expect(result.campaignLines?.[0].preCampaignNet).toBe(result.campaignLines?.[0].finalLineValue);
  });
  it('does not grant a free benefit in another slot from a demo trigger', () => {
    const state = input(); state.machineConfigs[0].acc = [];
    state.machineConfigs.push({ id: 'm1', type: 'Loader Line', qty: 1, configMode: 'shared', acc: ['725161'] });
    const rule = campaign(true);
    rule.products[1] = { ...rule.products[1], machineKey: 'Loader Line', productKey: 'Loader Line::725161', itemNumber: '725161' };
    replacePublishedCampaigns([rule]);
    expect(campaignTriggerSetCount(rule, configurationCampaignSelection(state))).toBe(0);
    expect(calculateConfiguration(state, { now }).campaignLines?.filter(row => row.applied)).toEqual([]);
    state.demoMachines['712000_1'] = false;
    expect(calculateConfiguration(state, { now }).campaignLines?.filter(row => row.applied)).toHaveLength(1);
  });
  it('does not let a suppressed demo benefit consume a normal unit entitlement', () => {
    const state = input(); state.machineConfigs[0].qty = 2;
    replacePublishedCampaigns([campaign(true)]);
    const result = calculateConfiguration(state, { now });
    expect(result.campaignLines?.find(row => row.unitNumber === 1)?.applied).toBe(false);
    expect(result.campaignLines?.find(row => row.unitNumber === 2)).toMatchObject({ applied: true, quantity: 1, finalLineValue: 0 });
  });
  it('excludes demo quantities from ANY/ALL and repeat trigger counts', () => {
    const state = input(); state.machineConfigs[0].qty = 3;
    const rule = { ...campaign(true), triggerMinQuantity: 2, scaleBenefitWithTrigger: true };
    expect(campaignTriggerSetCount(rule, configurationCampaignSelection(state))).toBe(1);
    state.demoMachines['712000_2'] = true;
    expect(campaignTriggerSetCount(rule, configurationCampaignSelection(state))).toBe(0);
    expect(campaignTriggerSetCount({ ...rule, triggerMatchMode: 'all' }, configurationCampaignSelection(state))).toBe(0);
  });
  it('recalculates immediately and restores normal pricing after toggling demo off', () => {
    const { result } = renderHook(() => useConfigurator());
    act(() => { replacePublishedCampaigns([campaign()]); result.current.setState(input(false)); });
    const normalPrice = result.current.calcResult!.currentPrice;
    expect(result.current.calcResult!.campaignLines?.[0].applied).toBe(true);
    act(() => result.current.setState(input()));
    expect(result.current.calcResult!.discountDetails.map(row => row.kind)).toEqual(['demo']);
    act(() => result.current.setState(input(false)));
    expect(result.current.calcResult!.currentPrice).toBe(normalPrice);
  });
  it('suppresses campaign badges for a demo without hiding unrelated marketing labels', () => {
    const { rerender } = render(<MarketingConfiguratorBadge badge="Kampagne" campaign={campaign()} suppressCampaign />);
    expect(screen.queryByText(/Kampagne/)).toBeNull();
    rerender(<MarketingConfiguratorBadge badge="Ny" suppressCampaign />);
    expect(screen.getByText('Nyhed')).toBeTruthy();
  });
  it.each(['quote', 'order'] as const)('freezes the corrected %s breakdown for documents, mail and PDF', async flowType => {
    replacePublishedCampaigns([campaign()]);
    const state = input(); state.flowType = flowType; state.manualDealerDiscountPct = 10;
    const saved = await finalizeConfiguratorPricingSnapshot(state);
    const before = JSON.stringify(saved);
    const document = buildSubmittedOrderDocument(saved);
    expect(document.calcResult.discountDetails.map(row => row.kind)).toEqual(['demo']);
    expect(saved.pricingSnapshot?.campaignLines?.[0].discountAmount).toBe(0);
    expect(buildSubmittedOrderMailSummary(saved).machines[0].units[0].is_demo).toBe(true);
    // Inspect the actual vector PDF stream; never save/send a business document.
    const pdf = buildConfiguratorPdf({ jsPDF, state: saved, calcResult: document.calcResult, flowType,
      quoteNumber: 'QA-T', orderNumber: flowType === 'order' ? 'QA-O' : null,
      showPrices: true, uiLanguage: 'da', contentLanguage: 'da', T: key => t(key, 'da'), TC: key => t(key, 'da') });
    expect(pdf.output()).toContain('Demomaskinerabat');
    expect(pdf.getNumberOfPages()).toBeGreaterThan(0);
    expect(calcConfigurationTotals(saved).finalPrice).toBe(document.calcResult.currentPrice);
    expect(JSON.stringify(saved)).toBe(before);
  });
  it('never retroactively corrects a frozen historical stacked discount', async () => {
    const saved = await finalizeConfiguratorPricingSnapshot(input());
    const snapshot = saved.pricingSnapshot!;
    snapshot.totals = { subtotal: snapshot.totals!.subtotal, totalDiscount: 100, finalPrice: snapshot.totals!.subtotal - 100 };
    snapshot.discountDetails = [{ kind: 'dealer', percent: 1, basis: 10000, amount: 100, txt: 'Historic discount' }];
    const original = JSON.stringify(saved);
    replacePublishedCampaigns([campaign()]);
    expect(await finalizeConfiguratorPricingSnapshot(saved)).toEqual(saved);
    expect(buildSubmittedOrderDocument(saved).calcResult.discountDetails).toEqual(snapshot.discountDetails);
    expect(calcConfigurationTotals(saved).finalPrice).toBe(snapshot.totals.finalPrice);
    expect(JSON.stringify(saved)).toBe(original);
  });
});
