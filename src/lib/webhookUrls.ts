// n8n webhook URLs.
//
// NOTE: Per user request, ALL environments (including the Lovable preview)
// now hit the n8n PRODUCTION webhooks. The previous test-vs-prod host
// detection has been disabled so we never fall back to /webhook-test/*.
// If you ever need test webhooks again, flip FORCE_ENV back to 'test' or
// restore the host-based detection from git history.

const TIMAN_N8N_BASE = 'https://timan.app.n8n.cloud';
const LEGACY_N8N_BASE = 'https://n8n.srv1509152.hstgr.cloud';

export type WebhookEnv = 'production' | 'test';

const FORCE_ENV: WebhookEnv = 'production';

export function getWebhookEnv(): WebhookEnv {
  return FORCE_ENV;
}

export function getOrderWebhookUrl(): string {
  return `${TIMAN_N8N_BASE}/webhook/timan-portal-order-email`;
}

export function getQuoteWebhookUrl(): string {
  return `${TIMAN_N8N_BASE}/webhook/timan-portal-quote-email`;
}

export function getC5NavOrderWebhookUrl(): string {
  return `${TIMAN_N8N_BASE}/webhook/timan-c5-nav-order-export`;
}

export function getMesseLeadWebhookUrl(): string {
  return `${LEGACY_N8N_BASE}/webhook/timan-messe-lead`;
}
