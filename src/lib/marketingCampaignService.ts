import { supabase } from '@/lib/supabase';
import {
  campaignError,
  replacePublishedCampaigns,
  type CampaignProductLink,
  type ProductCampaign,
} from '@/lib/configuratorCampaigns';

const CAMPAIGN_SELECT = `
  id, campaign_code, campaign_name, status, campaign_type, benefit_pricing_type,
  discount_pct, target_price_dkk, target_price_eur, trigger_min_quantity,
  benefit_quantity, scale_benefit_with_trigger, starts_at, ends_at,
  created_at, updated_at, published_at,
  marketing_campaign_products (
    id, campaign_id, product_key, machine_key, item_number, product_role,
    quantity, discount_pct, target_price_dkk, target_price_eur
  )
`;

const numberOrNull = (value: unknown) => value === null || value === undefined || value === ''
  ? null
  : Number.isFinite(Number(value)) ? Number(value) : null;

function parseLink(value: Record<string, unknown>): CampaignProductLink {
  return {
    id: String(value.id || ''),
    campaignId: String(value.campaign_id || ''),
    productKey: String(value.product_key || ''),
    machineKey: String(value.machine_key || ''),
    itemNumber: String(value.item_number || ''),
    role: value.product_role === 'trigger' || value.product_role === 'benefit' ? value.product_role : 'linked',
    quantity: Math.max(1, Number(value.quantity) || 1),
    discountPct: numberOrNull(value.discount_pct),
    targetPriceDkk: numberOrNull(value.target_price_dkk),
    targetPriceEur: numberOrNull(value.target_price_eur),
  };
}

function parseCampaign(value: Record<string, unknown>): ProductCampaign {
  const products = Array.isArray(value.marketing_campaign_products)
    ? value.marketing_campaign_products.map(row => parseLink(row as Record<string, unknown>))
    : [];
  return {
    id: String(value.id || ''),
    code: String(value.campaign_code || ''),
    name: String(value.campaign_name || ''),
    status: value.status === 'published' || value.status === 'archived' ? value.status : 'draft',
    type: value.campaign_type === 'percentage' || value.campaign_type === 'fixed' || value.campaign_type === 'conditional' ? value.campaign_type : 'badge',
    benefitPricingType: value.benefit_pricing_type === 'percentage' || value.benefit_pricing_type === 'fixed' ? value.benefit_pricing_type : null,
    discountPct: numberOrNull(value.discount_pct),
    targetPriceDkk: numberOrNull(value.target_price_dkk),
    targetPriceEur: numberOrNull(value.target_price_eur),
    triggerMinQuantity: Math.max(1, Number(value.trigger_min_quantity) || 1),
    benefitQuantity: Math.max(1, Number(value.benefit_quantity) || 1),
    scaleBenefitWithTrigger: value.scale_benefit_with_trigger === true,
    startsAt: String(value.starts_at || ''),
    endsAt: String(value.ends_at || ''),
    badge_starts_at: String(value.starts_at || '') || null,
    badge_ends_at: String(value.ends_at || '') || null,
    badge_show_countdown: true,
    products,
  };
}

export function emptyMarketingCampaign(): ProductCampaign {
  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  endsAt.setMonth(endsAt.getMonth() + 1);
  return {
    id: '', code: '', name: '', status: 'draft', type: 'badge', benefitPricingType: null,
    discountPct: null, targetPriceDkk: null, targetPriceEur: null,
    triggerMinQuantity: 1, benefitQuantity: 1, scaleBenefitWithTrigger: false,
    startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
    badge_starts_at: startsAt.toISOString(), badge_ends_at: endsAt.toISOString(), badge_show_countdown: true,
    products: [],
  };
}

export async function listMarketingCampaigns(): Promise<{ rows: ProductCampaign[]; error: string | null }> {
  const { data, error } = await supabase.from('marketing_campaigns').select(CAMPAIGN_SELECT).order('starts_at', { ascending: false });
  return { rows: error ? [] : ((data || []) as unknown as Record<string, unknown>[]).map(parseCampaign), error: error?.message || null };
}

export async function loadPublishedMarketingCampaigns(): Promise<ProductCampaign[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase.from('marketing_campaigns').select(CAMPAIGN_SELECT)
    .eq('status', 'published').not('published_at', 'is', null).lte('published_at', now).lte('starts_at', now).gt('ends_at', now);
  if (error) {
    console.warn('[marketingCampaigns] published lookup failed:', error.message);
    replacePublishedCampaigns([]);
    return [];
  }
  const rows = ((data || []) as unknown as Record<string, unknown>[]).map(parseCampaign);
  replacePublishedCampaigns(rows);
  return rows;
}

export async function saveMarketingCampaign(campaign: ProductCampaign, status: 'draft' | 'published') {
  const next = { ...campaign, status };
  const validationError = campaignError(next);
  if (validationError) return { id: null as string | null, error: validationError };
  const products = next.products.map(product => ({
    product_key: product.productKey,
    machine_key: product.machineKey,
    item_number: product.itemNumber,
    product_role: product.role,
    quantity: product.quantity,
    discount_pct: product.discountPct ?? null,
    target_price_dkk: product.targetPriceDkk ?? null,
    target_price_eur: product.targetPriceEur ?? null,
  }));
  const { data, error } = await supabase.rpc('save_marketing_campaign', {
    p_campaign: {
      id: next.id || null, campaign_code: next.code || null, campaign_name: next.name,
      status, campaign_type: next.type, benefit_pricing_type: next.benefitPricingType,
      discount_pct: next.discountPct, target_price_dkk: next.targetPriceDkk,
      target_price_eur: next.targetPriceEur, trigger_min_quantity: next.triggerMinQuantity,
      benefit_quantity: next.benefitQuantity, scale_benefit_with_trigger: next.scaleBenefitWithTrigger,
      starts_at: next.startsAt, ends_at: next.endsAt,
    },
    p_products: products,
  });
  return { id: error ? null : String(data), error: error?.message || null };
}

export async function deleteMarketingCampaign(id: string) {
  const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id).neq('status', 'published');
  return { error: error?.message || null };
}
