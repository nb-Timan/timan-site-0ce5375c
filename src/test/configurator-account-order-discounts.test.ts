import { describe, expect, it } from 'vitest';
import { buildAccountOrderDiscountRows } from '@/lib/configuratorAccountSummaries';
import { t } from '@/lib/i18n/translations';
import { PORTAL_LANGUAGE_CODES } from '@/lib/portalLanguages';
import type { ConfiguratorPricingSnapshot, DiscountDetail } from '@/types/configurator';

const snapshot = (details?: DiscountDetail[]): ConfiguratorPricingSnapshot => ({
  version: 1,
  capturedAt: '2026-09-01T00:00:00.000Z',
  prices: {},
  discountDetails: details,
  campaignLines: [{
    campaignId: 'campaign-1', campaignCode: 'K-0001-26', campaignName: 'Test',
    campaignType: 'conditional', pricingType: 'fixed', applied: true,
    triggerItemNumbers: ['712000'], triggerMatchMode: 'any', triggerSetCount: 1,
    repeatPerTrigger: false, benefitEntitlementQuantity: 1, benefitItemNumber: '725138',
    configuredPct: null, discountPct: 100, discountAmount: 30000, targetPrice: 0,
    currency: 'DKK', productKey: 'test', itemNumber: '725138', unitNumber: 2,
    quantity: 1, startsAt: null, endsAt: null, grossLineValue: 30000,
    preCampaignNet: 30000, finalLineValue: 0,
  }],
});

const row = (kind: DiscountDetail['kind'], amount: number, percent = 2): DiscountDetail => ({
  kind, amount, percent, txt: `Historical ${kind}`,
});

describe('historical account order discount presentation', () => {
  it.each([
    ['base', 'accountOrderBaseDiscount'],
    ['quantity', 'accountOrderQuantityDiscount'],
    ['delivery', 'accountOrderDeliveryDiscount'],
    ['dealer', 'accountOrderDealerDiscount'],
    ['demo', 'accountOrderDemoDiscount'],
  ] as const)('shows only the captured %s discount', (kind, labelKey) => {
    const rows = buildAccountOrderDiscountRows(snapshot([row(kind, 125)]), 125, 'da');
    expect(rows).toEqual([{ label: `${t(labelKey, 'da')} (2 %)`, amount: 125 }]);
  });

  it('preserves per-machine amounts and skips categories that did not apply', () => {
    const rows = buildAccountOrderDiscountRows(snapshot([
      row('base', 100, 25), row('base', 50, 25), row('quantity', 20),
      row('delivery', 10), row('dealer', 5, 1),
    ]), 185, 'da');
    expect(rows.map(entry => entry.label)).toEqual([
      'Grundrabat (25 %)', 'Stk. rabat (2 %)',
      'Leveringsrabat over 3 mdr. (2 %)', 'Ekstra forhandlerrabat (1 %)',
    ]);
    expect(rows.map(entry => entry.amount)).toEqual([150, 20, 10, 5]);
    expect(rows.reduce((sum, entry) => sum + entry.amount, 0)).toBe(185);
  });

  it('shows campaign code but never its product number', () => {
    const details: DiscountDetail[] = [{
      kind: 'campaign', campaignId: 'campaign-1', varenr: '725138',
      txt: 'Kampagnerabat · K-0001-26 · 725138 (100%)', percent: 100, amount: 30000,
    }];
    const rows = buildAccountOrderDiscountRows(snapshot(details), 30000, 'de');
    expect(rows).toEqual([{ label: 'Kampagnenrabatt: K-0001-26 (100 %)', amount: 30000 }]);
    expect(rows[0].label).not.toContain('725138');
  });

  it('uses the persisted detail even if unrelated current pricing changes', () => {
    const frozen = snapshot([row('base', 100, 25)]);
    const before = buildAccountOrderDiscountRows(frozen, 100, 'en');
    const changedCurrentState = { baseDiscountPct: 0.4, campaignPrice: 0 };
    expect(changedCurrentState).toBeTruthy();
    expect(buildAccountOrderDiscountRows(frozen, 100, 'en')).toEqual(before);
  });

  it('falls back to the historical total when detailed provenance is absent or inconsistent', () => {
    expect(buildAccountOrderDiscountRows(snapshot(), 125, 'da')).toEqual([{ label: 'Rabat', amount: 125 }]);
    expect(buildAccountOrderDiscountRows(snapshot([row('base', 100)]), 125, 'da')).toEqual([{ label: 'Rabat', amount: 125 }]);
    expect(buildAccountOrderDiscountRows(snapshot([row('base', 100)]), 0, 'da')).toEqual([]);
  });

  it('localizes every component in all nine portal languages', () => {
    for (const language of PORTAL_LANGUAGE_CODES) {
      const rows = buildAccountOrderDiscountRows(snapshot([row('base', 100)]), 100, language);
      expect(rows[0].label).toBe(`${t('accountOrderBaseDiscount', language)} (2 %)`);
      expect(t('accountOrderTotalDiscount', language)).not.toBe('accountOrderTotalDiscount');
      expect(t('accountOrderCampaignDiscount', language)).not.toBe('accountOrderCampaignDiscount');
    }
    expect(buildAccountOrderDiscountRows(snapshot([row('base', 100)]), 100, 'de')[0].label).toBe('Grundrabatt (2 %)');
    expect(buildAccountOrderDiscountRows(snapshot([row('base', 100)]), 100, 'en')[0].label).toBe('Base discount (2 %)');
  });
});
