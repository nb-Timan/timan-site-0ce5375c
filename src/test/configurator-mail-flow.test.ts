import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getOrderWebhookUrl, getQuoteWebhookUrl } from '@/lib/webhookUrls';

describe('configurator quote/order mail flow', () => {
  it('uses the published n8n quote and order webhooks', () => {
    expect(getQuoteWebhookUrl()).toBe('https://n8n.srv1509152.hstgr.cloud/webhook/timan-afsend-tilbud');
    expect(getOrderWebhookUrl()).toBe('https://n8n.srv1509152.hstgr.cloud/webhook/timan-afsend-ordre');
  });

  it('keeps Timan internal copy on sales BCC and out of visible recipients', () => {
    const source = readFileSync('src/pages/ConfiguratorPage.tsx', 'utf8');

    expect(source).toContain("const INTERNAL_TIMAN_COPY_EMAIL = 'sales@timan.dk'");
    expect(source).toContain('bcc_recipients: bccRecipients');
    expect(source).toContain('bccRecipients,');
    expect(source).toContain('to_addresses: recipients');
    expect(source).toContain('bccRecipients,');
    expect(source).not.toContain('NB@Timan.dk');
    expect(source).not.toContain('nb@timan.dk');
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
});
