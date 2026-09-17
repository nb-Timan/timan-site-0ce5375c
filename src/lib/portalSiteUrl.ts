const LOVABLE_PILOT_FALLBACK_URL = 'https://timan-site.lovable.app';

function validHttpUrl(value: string | undefined | null): string | null {
  if (!value?.trim()) return null;

  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** The active browser origin is correct for Vercel Preview auth and reset flows. */
export function getCurrentPortalOrigin(): string {
  const currentOrigin = typeof window !== 'undefined'
    ? validHttpUrl(window.location.origin)
    : null;

  return currentOrigin
    ?? validHttpUrl(import.meta.env.VITE_PORTAL_SITE_URL)
    ?? validHttpUrl(
      typeof window !== 'undefined'
        ? window.__TIMAN_PUBLIC_CONFIG__?.VITE_PORTAL_SITE_URL
        : null,
    )
    ?? LOVABLE_PILOT_FALLBACK_URL;
}

/**
 * Printed/public links may opt into a configured canonical site URL. During
 * Preview this deliberately falls back to the deployment's current origin.
 */
export function getConfiguredPortalOrigin(): string {
  return validHttpUrl(import.meta.env.VITE_PORTAL_SITE_URL)
    ?? validHttpUrl(typeof window !== 'undefined' ? window.__TIMAN_PUBLIC_CONFIG__?.VITE_PORTAL_SITE_URL : null)
    ?? getCurrentPortalOrigin();
}

export function portalUrl(path: string, options?: { configured?: boolean }): string {
  const origin = options?.configured ? getConfiguredPortalOrigin() : getCurrentPortalOrigin();
  return new URL(path, `${origin}/`).toString();
}

export { LOVABLE_PILOT_FALLBACK_URL };
