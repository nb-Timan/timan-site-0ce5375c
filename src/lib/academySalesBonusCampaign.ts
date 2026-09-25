import type { ProductCampaign } from '@/lib/configuratorCampaigns';

export const ACADEMY_SALES_BONUS_CASE_2 = 'sales.bonus_case_2_3330_cs200_campaign';
export const ACADEMY_SALES_BONUS_CAMPAIGN_ID = 'academy-3330-cs200-tractor';
export const ACADEMY_SALES_BONUS_CAMPAIGN_CODE = 'ACADEMY-3330-CS200';
export const ACADEMY_SALES_BONUS_CUSTOMER = {
  firmanavn: 'Academy Park & Drift',
  kontaktperson: 'Anna Academy',
  telefon: '+45 12 34 56 78',
  email: 'academy.sales@example.invalid',
  emailRecipient: 'academy.customer@example.invalid',
  address: 'Academyvej 1',
  postalCode: '9999',
  city: 'Academyby',
  country: 'DK',
} as const;

export function isAcademySalesBonusCustomer(value: Record<string, unknown>) {
  return Object.entries(ACADEMY_SALES_BONUS_CUSTOMER).every(([key, expected]) => value[key] === expected);
}

/** Local training data only. It is never stored in Marketing or Product Master. */
export const ACADEMY_SALES_BONUS_CAMPAIGN: ProductCampaign = {
  id: ACADEMY_SALES_BONUS_CAMPAIGN_ID,
  code: ACADEMY_SALES_BONUS_CAMPAIGN_CODE,
  name: 'Køb en Timan 3330 - få en CS-200',
  status: 'published',
  type: 'conditional',
  benefitPricingType: 'fixed',
  discountPct: null,
  targetPriceDkk: 0,
  targetPriceEur: 0,
  triggerMinQuantity: 1,
  triggerMatchMode: 'all',
  benefitQuantity: 1,
  scaleBenefitWithTrigger: false,
  audience: 'qa',
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2100-01-01T00:00:00.000Z',
  badge_starts_at: '2026-01-01T00:00:00.000Z',
  badge_ends_at: '2100-01-01T00:00:00.000Z',
  badge_show_countdown: false,
  products: [
    {
      campaignId: ACADEMY_SALES_BONUS_CAMPAIGN_ID,
      productKey: 'Timan 3330::Timan 3330',
      machineKey: 'Timan 3330',
      itemNumber: '712000',
      role: 'trigger',
      quantity: 1,
    },
    {
      campaignId: ACADEMY_SALES_BONUS_CAMPAIGN_ID,
      productKey: 'Loader Line::725142',
      machineKey: 'Loader Line',
      itemNumber: '725142',
      role: 'benefit',
      quantity: 1,
      targetPriceDkk: 0,
      targetPriceEur: 0,
    },
  ],
};

export function withAcademySalesBonusCampaign(
  campaigns: ProductCampaign[],
  activeCase: string | null,
) {
  const productionCampaigns = campaigns.filter(campaign => campaign.id !== ACADEMY_SALES_BONUS_CAMPAIGN_ID);
  return activeCase === ACADEMY_SALES_BONUS_CASE_2
    ? [...productionCampaigns, ACADEMY_SALES_BONUS_CAMPAIGN]
    : productionCampaigns;
}
