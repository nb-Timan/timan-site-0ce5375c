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
    expect(source).toContain('toRecipients: recipients');
    expect(source).toContain('bccRecipients,');
    expect(source).not.toContain('NB@Timan.dk');
    expect(source).not.toContain('nb@timan.dk');
  });
});
