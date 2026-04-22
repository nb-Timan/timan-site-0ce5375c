// Environment-aware n8n webhook URLs.
//
// In production (live deployed app) we hit the published n8n webhooks.
// In any non-production environment (Lovable preview, lovable.app preview
// subdomains, localhost, dev builds) we hit the n8n test webhooks so we
// don't have to switch URLs manually between test and live.

const N8N_BASE = 'https://n8n.srv1509152.hstgr.cloud';

const PROD_HOST_SUFFIXES = [
  // Add real production host(s) here. Anything not matching falls back
  // to the test webhooks automatically.
  'timan.dk',
  'timan.com',
];

export type WebhookEnv = 'production' | 'test';

export function getWebhookEnv(): WebhookEnv {
  // SSR / non-browser safety
  if (typeof window === 'undefined') {
    return import.meta.env.PROD ? 'production' : 'test';
  }

  const host = window.location.hostname.toLowerCase();

  // Local dev → always test
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local')
  ) {
    return 'test';
  }

  // Lovable preview/sandbox/staging hosts → always test
  if (
    host.endsWith('lovable.app') ||
    host.endsWith('lovable.dev') ||
    host.endsWith('lovableproject.com') ||
    host.includes('preview') ||
    host.includes('sandbox') ||
    host.includes('staging')
  ) {
    return 'test';
  }

  // Explicit production hosts
  if (PROD_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))) {
    return 'production';
  }

  // Anything else → fall back to Vite mode
  return import.meta.env.PROD ? 'production' : 'test';
}

export function getOrderWebhookUrl(): string {
  return getWebhookEnv() === 'production'
    ? `${N8N_BASE}/webhook/timan-afsend-ordre`
    : `${N8N_BASE}/webhook-test/timan-afsend-ordre`;
}

export function getQuoteWebhookUrl(): string {
  return getWebhookEnv() === 'production'
    ? `${N8N_BASE}/webhook/timan-afsend-tilbud`
    : `${N8N_BASE}/webhook-test/timan-afsend-tilbud`;
}
