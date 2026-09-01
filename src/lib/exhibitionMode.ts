/**
 * Messe — backend-controlled public-toggle + QR helper.
 *
 * The runtime "exhibition session" model has been removed. Real /messe
 * access now comes from either:
 *   - a real Supabase user with appUser.portal_variant = 'messe', or
 *   - a backend user temporarily previewing Messe via the PortalHeader
 *     role selector (see src/lib/messePreview.ts).
 *
 * This module only retains:
 *   - the backend on/off switch (controls whether QR visitors can land
 *     on /messe at all), and
 *   - the canonical QR URL for printed materials.
 */

const MESSE_ENABLED_KEY = 'timan.messeEnabled';

/** Backend-controlled toggle for public QR access. Default: enabled. */
export function isMesseEnabled(): boolean {
  try {
    const v = localStorage.getItem(MESSE_ENABLED_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export function setMesseEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(MESSE_ENABLED_KEY, enabled ? '1' : '0');
    window.dispatchEvent(new CustomEvent('timan:messe-enabled-changed'));
  } catch { /* ignore */ }
}

export function getMesseUrl(): string {
  // Always point to the production site so printed QR codes work at fairs.
  return 'https://timan-site.lovable.app/portal?redirect=/messe';
}
