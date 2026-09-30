import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const endpoint = readFileSync(resolve('supabase/functions/support-chat/index.ts'), 'utf8');
const actionEndpoint = readFileSync(resolve('supabase/functions/support-actions/index.ts'), 'utf8');
const assistant = readFileSync(resolve('src/lib/assistantSupportService.ts'), 'utf8');

describe('Support product price runtime boundary', () => {
  it('routes price questions to a read-only catalogue lookup before generic RAG', () => {
    expect(assistant).toContain('isProductPriceQuestion(request.content)');
    expect(assistant).toContain("intent: 'product-price-lookup'");
    expect(assistant.indexOf('isProductPriceQuestion(request.content)'))
      .toBeLessThan(assistant.indexOf('isProductDiscoveryQuestion(request.content)'));
    expect(endpoint.indexOf('if (productPriceLookup)'))
      .toBeLessThan(endpoint.indexOf("const apiKey = Deno.env.get('OPENAI_API_KEY')"));
  });

  it('enforces can_view_prices in support-chat and strips prices when denied', () => {
    expect(endpoint).toContain('portal_role, can_view_prices, dealer_number');
    expect(endpoint).toContain('const maySeePrices = priceAllowed(actor)');
    expect(endpoint).toContain('price_dkk: maySeePrices ?');
    expect(endpoint).toContain("confidenceReason = noAnswer ? 'CANONICAL_PRODUCT_NOT_FOUND'");
    expect(endpoint).toContain("'PRICE_PERMISSION_DENIED'");
  });

  it('keeps published data as an overlay and never uses document RAG as price authority', () => {
    expect(actionEndpoint).toContain('identity_aliases, price_dkk, price_eur, price_sek, published_at');
    expect(endpoint).toContain("label: 'Timan produktdata / Configurator'");
    expect(endpoint).toContain("model_name: 'canonical-configurator'");
    expect(endpoint).not.toMatch(/AUTHORIZED RETRIEVED KNOWLEDGE[^\n]+price_dkk/);
  });

  it('only offers the existing quote handoff and does not create a workflow', () => {
    expect(endpoint).toContain("suggest_quote_workflow: productPriceLookup.lookup_status === 'MATCHED' && productPriceLookup.price_access_allowed");
    expect(assistant).not.toMatch(/productPriceLookup[\s\S]{0,300}create_configuration_draft/);
  });
});
