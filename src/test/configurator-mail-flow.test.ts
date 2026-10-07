import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getC5NavOrderWebhookUrl, getOrderWebhookUrl, getQuoteWebhookUrl } from '@/lib/webhookUrls';

describe('configurator quote/order mail flow', () => {
  it('uses the published Timan n8n quote, order, and C5 webhooks', () => {
    expect(getQuoteWebhookUrl()).toBe('https://timan.app.n8n.cloud/webhook/timan-portal-quote-email');
    expect(getOrderWebhookUrl()).toBe('https://timan.app.n8n.cloud/webhook/timan-portal-order-email');
    expect(getC5NavOrderWebhookUrl()).toBe('https://timan.app.n8n.cloud/webhook/timan-c5-nav-order-export');
  });

  it('keeps quote BCC compatibility while splitting the order attachment sets', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    const mailSource = readFileSync('src/lib/configuratorOrderMail.ts', 'utf8');

    expect(mailSource).toContain("INTERNAL_TIMAN_ORDER_EMAIL = 'sales@timan.dk'");
    expect(source).toContain('buildCustomerOrderMailPayload(baseOrderWebhookPayload, recipients)');
    expect(source).toContain('buildInternalOrderMailPayload(baseOrderWebhookPayload, csv)');
    expect(source).toContain('bcc_recipients: bccRecipients');
    expect(source).toContain('to_addresses: recipients');
    expect(source).toContain("source_action: 'send_order_internal_csv'");
    expect(source).toContain('const c5NavWebhookUrl = getC5NavOrderWebhookUrl()');
    expect(source).toContain('fetch(c5NavWebhookUrl, {');
    expect(source).not.toContain('NB@Timan.dk');
    expect(source).not.toContain('nb@timan.dk');
  });

  it('keeps the Configurator-selected recipient separate from the filler email', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

    expect(source.match(/const recipients = Array\.from\(new Set\(modtagerList\)\);/g)).toHaveLength(2);
    expect(source).not.toContain('[emailUdfylder, ...modtagerList]');
    expect(source).toContain('email_udfylder: emailUdfylder');
    expect(source).toContain('email_modtager: emailModtager');
  });

  it('records each verified Configurator outcome in the canonical mail audit', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

    expect(source).toContain("import { logMailAuditEvent } from '@/lib/mailAuditService'");
    expect(source).toContain("category: 'quote'");
    expect(source).toContain("category: 'order'");
    expect(source).toContain("source_action: 'send_quote'");
    expect(source).toContain("source_action: 'send_order'");
    expect(source).toContain("provider: 'n8n:timan-afsend-tilbud'");
    expect(source).toContain("provider: 'n8n:timan-afsend-ordre'");
    expect(source).toContain("status: delivered ? 'sent' : 'failed'");
    expect(source).toContain('to_addresses: recipients');
    expect(source).toContain('bcc_addresses: bccRecipients');
    expect(source).toContain('related_entity_id: activeCaseId');
  });

  it('generates the internal CSV only after verified order delivery and submission', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');
    const orderStart = source.indexOf("if (effectiveFlowType === 'order')", source.indexOf('// Send webhook for Ordre flow'));
    const delivered = source.indexOf('if (delivered) {', orderStart);
    const submitted = source.indexOf('await markAsOrderSubmitted(activeCaseId', delivered);
    const csv = source.indexOf('const csv = buildSubmittedOrderCsv({', submitted);
    const quoteStart = source.indexOf('// Send webhook for Tilbud (Quote) flow', csv);

    expect(orderStart).toBeGreaterThan(-1);
    expect(delivered).toBeGreaterThan(orderStart);
    expect(submitted).toBeGreaterThan(delivered);
    expect(csv).toBeGreaterThan(submitted);
    expect(source.slice(quoteStart)).not.toContain('buildSubmittedOrderCsv({');
  });
});
