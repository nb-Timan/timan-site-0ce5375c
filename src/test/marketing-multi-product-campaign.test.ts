import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAMPAIGN_TRANSLATIONS } from '@/lib/i18n/campaignTranslations';
import { emptyMarketingCampaign } from '@/lib/marketingCampaignService';
import { campaignError } from '@/lib/configuratorCampaigns';

describe('Marketing multi-product campaign model', () => {
  const migration = () => readFileSync('supabase/migrations/20260921163934_canonical_multi_product_campaigns.sql', 'utf8');

  it('uses one campaign entity and role-based product links', () => {
    const sql = migration();
    expect(sql).toContain('create table public.marketing_campaigns');
    expect(sql).toContain('create table public.marketing_campaign_products');
    expect(sql).toContain("product_role in ('linked', 'trigger', 'benefit')");
    expect(sql).toContain('unique (campaign_id, product_key, product_role)');
    expect(sql).toContain('save_marketing_campaign');
  });

  it('generates unique monthly codes under an advisory transaction lock', () => {
    const sql = migration();
    expect(sql).toContain("'K' || to_char(new.starts_at at time zone 'Europe/Copenhagen', 'MM-YYYY-')");
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('campaign_code text not null unique');
  });

  it('enforces existing Marketing capability and published read-only access', () => {
    const sql = migration();
    expect(sql).toContain('can_manage_marketing_configurator_content()');
    expect(sql).toContain('marketing_campaigns_read_active');
    expect(sql).toContain('marketing_campaign_products_read_active');
    expect(sql).toContain('security invoker');
    expect(sql).not.toContain('security definer');
  });

  it('defaults to badge-only and validates conditional trigger/benefit products', () => {
    const draft = emptyMarketingCampaign();
    expect(draft.type).toBe('badge');
    draft.name = 'QA campaign';
    expect(campaignError(draft)).toContain('produkt');
    draft.type = 'conditional'; draft.benefitPricingType = 'fixed'; draft.targetPriceDkk = 0; draft.targetPriceEur = 0;
    draft.products = [{ campaignId: '', productKey: 'a', machineKey: 'm', itemNumber: '1', role: 'benefit', quantity: 1 }];
    expect(campaignError(draft)).toContain('triggerprodukt');
  });

  it('covers every portal language with campaign administration copy', () => {
    expect(Object.keys(CAMPAIGN_TRANSLATIONS).sort()).toEqual(['cs', 'da', 'de', 'en', 'fr', 'hu', 'it', 'pl', 'sv']);
    for (const copy of Object.values(CAMPAIGN_TRANSLATIONS)) {
      expect(copy.campaignManager).toBeTruthy();
      expect(copy.campaignConditional).toBeTruthy();
      expect(copy.campaignSearchProducts).toBeTruthy();
      expect(copy.campaignPublish).toBeTruthy();
    }
  });

  it('keeps economic fields out of product presentation content', () => {
    const editor = readFileSync('src/components/configurator/MarketingConfiguratorContentEditor.tsx', 'utf8');
    const service = readFileSync('src/lib/marketingConfiguratorContentService.ts', 'utf8');
    expect(editor).not.toContain('campaign_pricing_type');
    expect(service).not.toContain('replacePublishedCampaigns');
  });
});
