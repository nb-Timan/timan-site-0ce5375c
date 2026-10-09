import { describe, expect, it } from 'vitest';
import { PRODUCT_RECOMMENDATION_META } from '@/data/productRecommendationMeta';
import {
  buildSupportProductDiscoveryContext,
  isProductDiscoveryQuestion,
} from '@/lib/supportProductDiscovery';

const published = Object.values(PRODUCT_RECOMMENDATION_META).map((meta) => ({
  item_number: meta.varenr,
  item_text_da: meta.name,
  item_text_en: meta.name,
  item_text_de: meta.name,
}));

describe('Support product discovery', () => {
  it('uses canonical winter metadata without exposing prices', () => {
    const context = buildSupportProductDiscoveryContext(
      'Jeg skal bruge en maskine og redskab til noget til vinterbekæmpelse',
      'da',
      published,
    );
    expect(context?.domain).toBe('PRODUCT_DISCOVERY');
    expect(context?.machines.map((machine) => machine.product_id)).toEqual(expect.arrayContaining(['RC-1000S', 'Timan 3330']));
    expect(context?.attachments.map((attachment) => attachment.item_number)).toEqual(expect.arrayContaining(['411742', '418000', '725131']));
    expect(JSON.stringify(context)).not.toMatch(/price|rabat|discount/i);
  });

  it('keeps advice separate from purchase intent', () => {
    expect(buildSupportProductDiscoveryContext('Hvilke vinterredskaber kan RC-1000s bruge?', 'da', published)?.purchase_intent).toBe(false);
    expect(buildSupportProductDiscoveryContext('Kan du sælge mig en maskine til vinterbekæmpelse?', 'da', published)?.purchase_intent).toBe(true);
  });

  it('blocks an invalid machine and attachment combination from canonical compatibility', () => {
    const context = buildSupportProductDiscoveryContext(
      'Kan Timan 3330 bruge sneslyngen 418000 til RC-1000s?',
      'da',
      published,
    );
    expect(context?.requested_compatibility).toMatchObject({
      machine_id: 'Timan 3330',
      attachment_item_number: '418000',
      compatible: false,
    });
    expect(context?.attachments).toEqual([]);
  });

  it('does not reroute restricted technical questions as product discovery', () => {
    expect(isProductDiscoveryQuestion('Hvad er hydrauliktrykket på RC-1000s under service?')).toBe(false);
  });

  it('uses the canonical Configurator catalogue when a price-list text overlay is absent', () => {
    const withoutSnowThrower = published.filter((item) => item.item_number !== '418000');
    const context = buildSupportProductDiscoveryContext('Hvilke vinterredskaber kan RC-1000s bruge?', 'da', withoutSnowThrower);
    expect(context?.attachments.some((attachment) => attachment.item_number === '418000')).toBe(true);
  });
});
