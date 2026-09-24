import { useSyncExternalStore } from 'react';
import type { Currency } from '@/lib/currency';
import type { MarketingBadgeSchedule } from '@/lib/marketingBadgeSchedule';

export type CampaignType = 'badge' | 'percentage' | 'fixed' | 'conditional';
export type CampaignBenefitPricingType = 'percentage' | 'fixed';
export type CampaignProductRole = 'linked' | 'trigger' | 'benefit';
export type CampaignPricingType = 'none' | 'percentage' | 'fixed';
export type CampaignTriggerMatchMode = 'any' | 'all';
export type CampaignAudience = 'public' | 'qa';
export interface CampaignPricingFields {
  campaign_pricing_type?: CampaignPricingType;
  campaign_discount_pct?: number | null;
  campaign_target_dkk?: number | null;
  campaign_target_eur?: number | null;
}
export interface CampaignProductLink {
  id?: string;
  campaignId: string;
  productKey: string;
  machineKey: string;
  itemNumber: string;
  role: CampaignProductRole;
  quantity: number;
  discountPct?: number | null;
  targetPriceDkk?: number | null;
  targetPriceEur?: number | null;
}
export interface ProductCampaign extends MarketingBadgeSchedule {
  id: string;
  code: string;
  name: string;
  status: 'draft' | 'published' | 'archived';
  type: CampaignType;
  benefitPricingType: CampaignBenefitPricingType | null;
  discountPct: number | null;
  targetPriceDkk: number | null;
  targetPriceEur: number | null;
  triggerMinQuantity: number;
  triggerMatchMode: CampaignTriggerMatchMode;
  benefitQuantity: number;
  scaleBenefitWithTrigger: boolean;
  audience: CampaignAudience;
  startsAt: string;
  endsAt: string;
  products: CampaignProductLink[];
}
export interface CampaignLineSnapshot {
  campaignId: string;
  campaignCode: string;
  campaignName: string;
  campaignType: CampaignType;
  pricingType: CampaignBenefitPricingType;
  applied: boolean;
  suppressedReason?: 'demo_machine';
  triggerItemNumbers: string[];
  triggerMatchMode: CampaignTriggerMatchMode;
  triggerSetCount: number;
  repeatPerTrigger: boolean;
  benefitEntitlementQuantity: number | null;
  benefitItemNumber: string;
  configuredPct: number | null;
  discountPct: number;
  discountAmount: number;
  targetPrice: number | null;
  currency: Currency;
  productKey: string;
  itemNumber: string;
  unitNumber: number;
  quantity: number;
  startsAt: string | null;
  endsAt: string | null;
  grossLineValue: number;
  preCampaignNet: number;
  finalLineValue: number;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function campaignError(campaign: Pick<ProductCampaign, 'name' | 'type' | 'benefitPricingType' | 'discountPct' | 'targetPriceDkk' | 'targetPriceEur' | 'triggerMinQuantity' | 'triggerMatchMode' | 'benefitQuantity' | 'audience' | 'startsAt' | 'endsAt' | 'products'>): string | null {
  if (!campaign.name.trim()) return 'Angiv et kampagnenavn.';
  if (!['badge', 'percentage', 'fixed', 'conditional'].includes(campaign.type)) return 'Ugyldig kampagnetype.';
  if (!['any', 'all'].includes(campaign.triggerMatchMode)) return 'Ugyldig triggergruppe.';
  if (!['public', 'qa'].includes(campaign.audience)) return 'Ugyldig kampagnemålgruppe.';
  if (!Number.isInteger(campaign.triggerMinQuantity) || !Number.isInteger(campaign.benefitQuantity) || !(campaign.triggerMinQuantity > 0) || !(campaign.benefitQuantity > 0)) return 'Antal skal være et helt tal på mindst 1.';
  const start = Date.parse(campaign.startsAt);
  const end = Date.parse(campaign.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Kampagnens slutdato skal være efter startdatoen.';
  if (!campaign.products.length) return 'Tilføj mindst ét produkt.';
  const pricing = campaign.type === 'conditional' ? campaign.benefitPricingType : campaign.type;
  if (pricing === 'percentage' && (!finite(campaign.discountPct) || campaign.discountPct <= 0 || campaign.discountPct > 100)) return 'Kampagnerabat skal være større end 0 og højst 100 %.';
  if (pricing === 'fixed' && [campaign.targetPriceDkk, campaign.targetPriceEur].some(value => !finite(value) || value < 0)) return 'Angiv en kampagnepris på mindst 0 i både DKK og EUR.';
  if (campaign.type === 'conditional' && !campaign.products.some(product => product.role === 'trigger')) return 'Tilføj mindst ét triggerprodukt.';
  if (campaign.type === 'conditional' && !campaign.products.some(product => product.role === 'benefit')) return 'Tilføj mindst ét benefitprodukt.';
  for (const product of campaign.products) {
    if (product.discountPct != null && (!finite(product.discountPct) || product.discountPct <= 0 || product.discountPct > 100)) return 'Kampagnerabat skal være større end 0 og højst 100 %.';
    if ([product.targetPriceDkk, product.targetPriceEur].some(value => value != null && (!finite(value) || value < 0))) return 'Kampagnepris skal være mindst 0.';
    if (product.discountPct != null && (product.targetPriceDkk != null || product.targetPriceEur != null)) return 'Vælg enten procent eller fast pris pr. produkt.';
  }
  return null;
}

/** Legacy product-content validation. New economic rules live on Campaign entities. */
export function campaignPricingError(fields: CampaignPricingFields): string | null {
  const type = fields.campaign_pricing_type ?? 'none';
  if (type === 'none') return null;
  if (type === 'percentage' && (!finite(fields.campaign_discount_pct) || fields.campaign_discount_pct <= 0 || fields.campaign_discount_pct > 100)) return 'Kampagnerabat skal være større end 0 og højst 100 %.';
  if (type === 'fixed' && [fields.campaign_target_dkk, fields.campaign_target_eur].some(value => !finite(value) || value < 0)) return 'Angiv en kampagnepris på mindst 0 i både DKK og EUR.';
  return null;
}

export function isCampaignActive(campaign: ProductCampaign, now = Date.now()) {
  return campaign.status === 'published' && Date.parse(campaign.startsAt) <= now && Date.parse(campaign.endsAt) > now && !campaignError(campaign);
}

export type CampaignSelectionLine = { productKey: string; itemNumber?: string; quantity: number; demo?: boolean };

const campaignProductIdentity = (product: Pick<CampaignProductLink, 'productKey' | 'itemNumber'>) => product.itemNumber.trim() || product.productKey;

function selectedCampaignQuantity(product: CampaignProductLink, selection: CampaignSelectionLine[]) {
  const identity = campaignProductIdentity(product);
  return selection.reduce((sum, item) => {
    if (item.demo) return sum;
    const itemIdentity = item.itemNumber?.trim() || item.productKey;
    return sum + (itemIdentity === identity ? Math.max(0, item.quantity) : 0);
  }, 0);
}

/** Number of complete trigger groups across the entire canonical cart. */
export function campaignTriggerSetCount(campaign: ProductCampaign, selection: CampaignSelectionLine[]) {
  if (campaign.type !== 'conditional') return 1;
  const triggers = campaign.products.filter(product => product.role === 'trigger');
  if (!triggers.length) return 0;
  const uniqueTriggers = [...new Map(triggers.map(product => [campaignProductIdentity(product), product])).values()];
  const quantities = uniqueTriggers.map(product => selectedCampaignQuantity(product, selection));
  if (campaign.triggerMatchMode === 'all') {
    return Math.min(...quantities.map(quantity => Math.floor(quantity / campaign.triggerMinQuantity)));
  }
  return Math.max(...quantities.map(quantity => Math.floor(quantity / campaign.triggerMinQuantity)));
}

export function campaignBenefitEntitlement(campaign: ProductCampaign, selection: CampaignSelectionLine[]) {
  if (campaign.type !== 'conditional') return Number.POSITIVE_INFINITY;
  const triggerSets = campaignTriggerSetCount(campaign, selection);
  if (triggerSets < 1) return 0;
  return campaign.benefitQuantity * (campaign.scaleBenefitWithTrigger ? triggerSets : 1);
}

/** Product overrides use the existing mutually exclusive percentage/target fields. */
export function campaignProductPricing(campaign: ProductCampaign, product?: CampaignProductLink) {
  if (campaign.type === 'badge') return { type: 'badge', discountPct: null, targetPriceDkk: null, targetPriceEur: null };
  const type = product?.discountPct != null ? 'percentage'
    : product?.targetPriceDkk != null || product?.targetPriceEur != null ? 'fixed'
      : campaign.type === 'conditional' ? campaign.benefitPricingType : campaign.type;
  return {
    type,
    discountPct: product?.discountPct ?? campaign.discountPct,
    targetPriceDkk: product?.targetPriceDkk ?? campaign.targetPriceDkk,
    targetPriceEur: product?.targetPriceEur ?? campaign.targetPriceEur,
  };
}

export function eligibleCampaignFor(productKey: string, selection: CampaignSelectionLine[], now = Date.now()) {
  return publishedCampaignsFor(productKey).find(campaign => {
    if (!isCampaignActive(campaign, now)) return false;
    if (campaign.type !== 'conditional') return true;
    if (!campaign.products.some(product => product.productKey === productKey && product.role === 'benefit')) return false;
    return campaignTriggerSetCount(campaign, selection) > 0;
  });
}

let campaigns: ProductCampaign[] = [];
let revision = 0;
const listeners = new Set<() => void>();
export function replacePublishedCampaigns(next: ProductCampaign[]) {
  campaigns = [...next].sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.code.localeCompare(right.code));
  revision += 1;
  listeners.forEach(listener => listener());
}
export function publishedCampaignDefinitions() { return campaigns; }
export function publishedCampaignsFor(productKey: string) {
  return campaigns.filter(campaign => campaign.products.some(product => product.productKey === productKey));
}
export function publishedCampaignFor(productKey: string): ProductCampaign | undefined {
  return publishedCampaignsFor(productKey)[0];
}
export function useCampaignRevision() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => revision, () => revision);
}
