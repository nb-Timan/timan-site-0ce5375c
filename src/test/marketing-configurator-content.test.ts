import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  listMarketingConfiguratorCatalog,
  mergeMarketingConfiguratorContent,
  productContentKey,
} from '@/lib/marketingConfiguratorContentService';
import { canManageMarketingConfiguratorContent } from '@/lib/portalAccess';
import { resolveMarketingBadge } from '@/components/configurator/MarketingConfiguratorBadge';
import { t } from '@/lib/i18n/translations';

const seller: any = {
  email: 'seller@timan.dk',
  role: 'timan_saelger',
  partner_type: null,
  portal_role: 'timan_seller',
};

describe('Marketing configurator content', () => {
  it('indexes canonical machines, accessories and nested options with stable product keys', () => {
    const catalog = listMarketingConfiguratorCatalog('da');
    const scraper = catalog.find((item) => item.itemNumber === '412051');
    const workLight = catalog.find((item) => item.itemNumber === '412594');

    expect(catalog.some((item) => item.kind === 'machine' && item.machineKey === 'RC-1000S')).toBe(true);
    expect(scraper?.productKey).toBe(productContentKey('RC-1000S', scraper?.item.id || ''));
    expect(workLight?.defaults.title).toContain('Arbejdslamper');
  });

  it('uses a published override only for presentation fields and preserves canonical defaults as fallback', () => {
    const defaults = {
      title: 'RC-1000s Basismaskine', description: 'Canonical description', key_features: ['Canonical feature'], image_url: 'image', video_url: 'video', specification_url: '', specs: [], badge: '',
    };
    const merged = mergeMarketingConfiguratorContent(defaults, {
      title: 'RC-1000s', description: '', key_features: ['Marketing feature'], image_url: '', video_url: 'new-video', specification_url: '', specs: [], badge: 'Ny',
    });
    expect(merged.title).toBe('RC-1000s');
    expect(merged.description).toBe('Canonical description');
    expect(merged.key_features).toEqual(['Marketing feature']);
    expect(merged.video_url).toBe('new-video');
  });

  it('maps legacy badge values to the premium badge types and translates labels for every portal language', () => {
    expect(resolveMarketingBadge('Ny')?.kind).toBe('new');
    expect(resolveMarketingBadge('Godt køb')?.kind).toBe('offer');
    expect(resolveMarketingBadge('Kampagne')?.kind).toBe('campaign');
    expect(t('marketingBadgeOffer', 'da')).toBe('Tilbud');
    expect(t('marketingBadgeOffer', 'en')).toBe('Offer');
    expect(t('marketingBadgeOffer', 'de')).toBe('Angebot');
    expect(t('marketingBadgeNew', 'cs')).toBe('Novinka');
  });

  it('keeps the editor out of Timan Seller sessions, even with a Marketing permission', () => {
    expect(canManageMarketingConfiguratorContent({ ...seller, allowed_areas: ['marketing'], permissions: {} })).toBe(false);
    expect(canManageMarketingConfiguratorContent({ ...seller, allowed_areas: ['marketing'], permissions: { marketing_configurator_manage: true } })).toBe(false);
    expect(canManageMarketingConfiguratorContent({ ...seller, permissions: { marketing_configurator_manage: true } })).toBe(false);
    expect(canManageMarketingConfiguratorContent({ ...seller, portal_role: 'timan_backend', allowed_areas: [], permissions: {} })).toBe(true);
    expect(canManageMarketingConfiguratorContent({ ...seller, portal_role: 'timan_service', allowed_areas: ['marketing'], permissions: { marketing_configurator_manage: true } })).toBe(true);
  });

  it('keeps draft and published content separated by RLS and uses the existing Configurator sales page', () => {
    const migration = readFileSync('supabase/migrations/20260909140017_marketing_configurator_content.sql', 'utf8');
    const page = readFileSync('src/pages/MarketingConfiguratorPage.tsx', 'utf8');
    const configurator = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    const editor = readFileSync('src/components/configurator/MarketingConfiguratorContentEditor.tsx', 'utf8');
    const bulkTools = readFileSync('src/components/configurator/MarketingConfiguratorBulkTools.tsx', 'utf8');
    const app = readFileSync('src/App.tsx', 'utf8');
    const marketingArea = readFileSync('src/pages/PortalAreaPage.tsx', 'utf8');

    expect(migration).toContain("unique (product_key, status)");
    expect(migration).toContain("status = 'published'");
    expect(migration).toContain('can_manage_marketing_configurator_content');
    expect(migration).not.toContain("in ('timan_seller', 'timan_service')");
    expect(migration).toContain("name like 'marketing-configurator/%'");
    expect(page).toContain('return <ConfiguratorPage marketingEditMode />');
    expect(configurator).toContain('listPublishedMarketingConfiguratorContent');
    expect(configurator).toContain('MarketingConfiguratorContentEditor');
    expect(configurator).toContain('marketingEditMode');
    expect(configurator).toContain('renderMarketingContentState');
    expect(configurator).toContain("state === 'draft' ? 'Kladde'");
    expect(configurator).toContain('marketingContent?.description');
    expect(editor).toContain("save('draft')");
    expect(editor).toContain("save('published')");
    expect(editor).toMatch(/onSaved\(result\.row\);\s+onClose\(\);/);
    expect(editor).toContain('MARKETING_BADGE_OPTIONS');
    expect(editor).not.toContain('Specifikationslink');
    expect(editor).toContain('Nøglefunktioner');
    expect(editor).toContain('Dimensioner & tekniske specifikationer');
    expect(configurator).toContain('showMarketingInformation');
    expect(configurator).toContain("state === 'missing'");
    expect(bulkTools).toContain('Vis kun mangler');
    expect(bulkTools).toContain('Vis kun kladder');
    expect(bulkTools).toContain('Upload billeder');
    expect(bulkTools).toContain('Tilføj videolinks');
    expect(bulkTools).toContain('Batch redigér');
    expect(bulkTools).toContain("saveMarketingConfiguratorContent(item, content, 'draft')");
    expect(app).toContain('/portal/marketing/configurator');
    expect(marketingArea).toContain('canManageMarketingConfiguratorContent');
  });
});
