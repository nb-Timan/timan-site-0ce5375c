import { useSyncExternalStore } from 'react';
import type { Currency } from '@/lib/currency';
import type { MarketingBadgeSchedule } from '@/lib/marketingBadgeSchedule';

export type CampaignType = 'badge' | 'percentage' | 'fixed' | 'conditional';
export type CampaignBenefitPricingType = 'percentage' | 'fixed';
export type CampaignProductRole = 'linked' | 'trigger' | 'benefit';
export type CampaignPricingType = 'none' | 'percentage' | 'fixed';
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
  benefitQuantity: number;
  scaleBenefitWithTrigger: boolean;
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
  triggerItemNumbers: string[];
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
export function campaignError(campaign: Pick<ProductCampaign, 'name' | 'type' | 'benefitPricingType' | 'discountPct' | 'targetPriceDkk' | 'targetPriceEur' | 'triggerMinQuantity' | 'benefitQuantity' | 'startsAt' | 'endsAt' | 'products'>): string | null {
  if (!campaign.name.trim()) return 'Angiv et kampagnenavn.';
  if (!['badge', 'percentage', 'fixed', 'conditional'].includes(campaign.type)) return 'Ugyldig kampagnetype.';
  if (!(campaign.triggerMinQuantity > 0) || !(campaign.benefitQuantity > 0)) return 'Antal skal være mindst 1.';
  const start = Date.parse(campaign.startsAt);
  const end = Date.parse(campaign.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Kampagnens slutdato skal være efter startdatoen.';
  if (!campaign.products.length) return 'Tilføj mindst ét produkt.';
  const pricing = campaign.type === 'conditional' ? campaign.benefitPricingType : campaign.type;
  if (pricing === 'percentage' && (!finite(campaign.discountPct) || campaign.discountPct <= 0 || campaign.discountPct > 100)) return 'Kampagnerabat skal være større end 0 og højst 100 %.';
  if (pricing === 'fixed' && [campaign.targetPriceDkk, campaign.targetPriceEur].some(value => !finite(value) || value < 0)) return 'Angiv en kampagnepris på mindst 0 i både DKK og EUR.';
  if (campaign.type === 'conditional' && !campaign.products.some(product => product.role === 'trigger')) return 'Tilføj mindst ét triggerprodukt.';
  if (campaign.type === 'conditional' && !campaign.products.some(product => product.role === 'benefit')) return 'Tilføj mindst ét benefitprodukt.';
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
