import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { applyAssistantCustomer } from '@/lib/assistantCanonicalActions';
import { calculateConfiguration } from '@/lib/calcConfiguration';
import {
  campaignError,
  eligibleCampaignFor,
  replacePublishedCampaigns,
  type ProductCampaign,
} from '@/lib/configuratorCampaigns';
import { createEmptyConfiguratorState } from '@/lib/configuratorState';
import { finalizeConfiguratorPricingSnapshot } from '@/lib/configurationsService';
import { canonicalBaseDiscountPct } from '@/lib/importerDiscount';
import { buildSubmittedOrderDocument } from '@/lib/submittedOrderConfirmation';
import type { ConfiguratorState } from '@/types/configurator';

const NOW = Date.parse('2026-09-30T12:00:00Z');
const DELIVERY_DATE = '2027-04-01';
const migration = readFileSync('supabase/migrations/20260930101026_campaign_partner_type_audience.sql', 'utf8');

function state(partnerAccountType: 'dealer' | 'importer' | 'service_partner', quantity = 1): ConfiguratorState {
  return {
    ...createEmptyConfiguratorState('da'),
    step: 4,
    partnerAccountType,
    baseDiscountPct: partnerAccountType === 'importer' ? 0.30 : 0.25,
    machineConfigs: [{ id: 'm0', type: 'Timan 3330', qty: quantity, configMode: 'shared', acc: [] }],
  };
}

function campaign(eligiblePartnerTypes: ProductCampaign['eligiblePartnerTypes']): ProductCampaign {
  return {
    id: 'qa-partner-audience',
    code: 'QA-AUDIENCE',
    name: 'QA partner audience',
    status: 'published',
    type: 'fixed',
    benefitPricingType: null,
    discountPct: null,
    targetPriceDkk: 0,
    targetPriceEur: 0,
    triggerMinQuantity: 1,
    triggerMatchMode: 'any',
    benefitQuantity: 1,
    scaleBenefitWithTrigger: false,
    audience: 'public',
    eligiblePartnerTypes,
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2027-01-01T00:00:00Z',
    products: [{
      campaignId: 'qa-partner-audience',
      productKey: 'Timan 3330::Timan 3330',
      machineKey: 'Timan 3330',
      itemNumber: '712000',
      role: 'linked',
      quantity: 1,
    }],
  };
}

afterEach(() => replacePublishedCampaigns([]));

describe('canonical importer pricing', () => {
  it('normalizes database percentages without changing importer policy', () => {
    expect(canonicalBaseDiscountPct('dealer', 25)).toBe(0.25);
    expect(canonicalBaseDiscountPct('dealer', 0.27)).toBe(0.27);
    expect(canonicalBaseDiscountPct('importer', 99)).toBe(0.30);
  });

  it('uses 30% normal pricing and excludes quantity and delivery discounts', () => {
    const importer = state('importer', 3);
    importer.date = DELIVERY_DATE;
    importer.machineDeliveryDates = { m0_1: DELIVERY_DATE, m0_2: DELIVERY_DATE, m0_3: DELIVERY_DATE };
    const result = calculateConfiguration(importer, { now: NOW });

    expect(result.discountDetails.find(detail => detail.kind === 'base')?.percent).toBe(30);
    expect(result.discountDetails.some(detail => detail.kind === 'quantity')).toBe(false);
    expect(result.discountDetails.some(detail => detail.kind === 'delivery')).toBe(false);
    expect(result.qtyPct).toBe(0);
    expect(result.deliveryDiscounts).toEqual([]);
  });

  it('uses the exclusive 32.5% demo rule without importer discount stacking', () => {
    const importer = state('importer');
    importer.demoMachines = { '712000_1': true };
    importer.date = DELIVERY_DATE;
    const result = calculateConfiguration(importer, { now: NOW });

    expect(result.discountDetails.map(detail => detail.kind)).toEqual(['demo']);
    expect(result.discountDetails[0].percent).toBe(32.5);
    expect(result.deliveryDiscounts).toEqual([]);
    expect(result.qtyPct).toBe(0);
  });

  it('keeps dealer and service-partner pricing unchanged', () => {
    const legacy = calculateConfiguration({ ...state('dealer', 2), partnerAccountType: undefined }, { now: NOW });
    const dealer = calculateConfiguration(state('dealer', 2), { now: NOW });
    const servicePartner = calculateConfiguration(state('service_partner', 2), { now: NOW });

    expect(dealer).toEqual(legacy);
    expect(servicePartner.currentPrice).toBe(dealer.currentPrice);
    expect(servicePartner.discountDetails.map(detail => detail.kind)).toEqual(['base', 'quantity']);
  });
});

describe('canonical campaign partner targeting', () => {
  it('applies all-target campaigns to all supported partner types', () => {
    replacePublishedCampaigns([campaign(['dealer', 'importer', 'service_partner'])]);
    for (const partnerType of ['dealer', 'importer', 'service_partner'] as const) {
      expect(calculateConfiguration(state(partnerType), { now: NOW }).campaignLines?.[0]).toMatchObject({
        applied: true,
        partnerAccountType: partnerType,
      });
    }
  });

  it('blocks an excluded importer while preserving dealer eligibility', () => {
    replacePublishedCampaigns([campaign(['dealer', 'service_partner'])]);
    expect(calculateConfiguration(state('importer'), { now: NOW }).campaignLines).toEqual([]);
    expect(calculateConfiguration(state('importer'), { now: NOW }).currentPrice)
      .toBeCloseTo(calculateConfiguration(state('importer'), { now: NOW }).subtotal * 0.70, 2);
    expect(calculateConfiguration(state('dealer'), { now: NOW }).campaignLines?.[0]?.applied).toBe(true);
    expect(eligibleCampaignFor('Timan 3330::Timan 3330', [], NOW, 'importer')).toBeUndefined();
    expect(eligibleCampaignFor('Timan 3330::Timan 3330', [], NOW, 'dealer')?.id).toBe('qa-partner-audience');
  });

  it('keeps importer quantity and delivery discounts excluded when an eligible campaign applies', () => {
    replacePublishedCampaigns([campaign(['importer'])]);
    const importer = state('importer', 3);
    importer.date = DELIVERY_DATE;
    importer.machineDeliveryDates = { m0_1: DELIVERY_DATE, m0_2: DELIVERY_DATE, m0_3: DELIVERY_DATE };
    const result = calculateConfiguration(importer, { now: NOW });

    expect(result.campaignLines?.[0]?.applied).toBe(true);
    expect(result.qtyPct).toBe(0);
    expect(result.deliveryDiscounts).toEqual([]);
    expect(result.discountDetails.some(detail => detail.kind === 'quantity' || detail.kind === 'delivery')).toBe(false);
  });

  it('ignores a manipulated client campaign id when the canonical campaign excludes importers', () => {
    replacePublishedCampaigns([campaign(['dealer'])]);
    const manipulated = {
      ...state('importer'),
      campaignId: 'qa-partner-audience',
    } as ConfiguratorState & { campaignId: string };

    expect(calculateConfiguration(manipulated, { now: NOW }).campaignLines).toEqual([]);
  });

  it('fully recalculates when the selected account type changes', () => {
    replacePublishedCampaigns([campaign(['dealer', 'service_partner'])]);
    const dealer = state('dealer', 2);
    dealer.date = DELIVERY_DATE;
    const dealerResult = calculateConfiguration(dealer, { now: NOW });
    const importerResult = calculateConfiguration({ ...dealer, partnerAccountType: 'importer', baseDiscountPct: 0.30 }, { now: NOW });

    expect(dealerResult.campaignLines?.some(line => line.applied)).toBe(true);
    expect(importerResult.campaignLines).toEqual([]);
    expect(importerResult.discountDetails.map(detail => detail.kind)).toEqual(['base']);
    expect(importerResult.discountDetails[0].percent).toBe(30);
  });

  it('rejects zero targets and defaults existing campaigns to all targets in the additive migration', () => {
    expect(campaignError({ ...campaign([]), status: 'draft' })).toBe('Vælg mindst én partnertype.');
    expect(migration).toContain("default array['dealer', 'importer', 'service_partner']::text[]");
    expect(migration).toContain('cardinality(eligible_partner_types) > 0');
    expect(migration).toContain("eligible_partner_types = v_eligible_partner_types");
  });
});

describe('quote, Assistant and document parity', () => {
  it('uses the dealer account type in Assistant calculations', () => {
    const portal = state('importer', 3);
    const assistant = applyAssistantCustomer(
      { ...state('dealer', 3), partnerAccountType: undefined },
      { id: 'importer', account_number: 'IMP-1', company_name: 'Importer', customer_type: 'Importør' },
      null,
    );
    expect(assistant.partnerAccountType).toBe('importer');
    expect(calculateConfiguration(assistant, { now: NOW })).toEqual(calculateConfiguration(portal, { now: NOW }));
  });

  it('freezes the same importer result for saved quote and PDF document data', async () => {
    const importer = state('importer', 3);
    const live = calculateConfiguration(importer, { now: NOW });
    const saved = await finalizeConfiguratorPricingSnapshot(importer);
    const document = buildSubmittedOrderDocument(saved);

    expect(saved.pricingSnapshot?.totals).toEqual({
      subtotal: live.subtotal,
      totalDiscount: live.totalDiscount,
      finalPrice: live.currentPrice,
    });
    expect(document.calcResult.currentPrice).toBe(live.currentPrice);
    expect(document.calcResult.discountDetails.map(detail => detail.kind)).toEqual(['base']);
  });
});
