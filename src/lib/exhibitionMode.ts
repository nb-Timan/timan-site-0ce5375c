/**
 * Timan Messe / Exhibition mode.
 *
 * A login-free, public demo session for fair visitors. Activated when a
 * visitor opens /messe. Stored in localStorage so the synthetic session
 * survives a page reload while the visitor is browsing the booth tablet.
 */

const EXHIBITION_FLAG = 'timan.exhibitionMode';
const MESSE_ENABLED_KEY = 'timan.messeEnabled';

export function isExhibitionActive(): boolean {
  try {
    return localStorage.getItem(EXHIBITION_FLAG) === '1';
  } catch {
    return false;
  }
}

export function enterExhibitionMode(): void {
  try {
    localStorage.setItem(EXHIBITION_FLAG, '1');
    window.dispatchEvent(new CustomEvent('timan:exhibition-mode-changed'));
  } catch { /* ignore */ }
}

export function leaveExhibitionMode(): void {
  try {
    localStorage.removeItem(EXHIBITION_FLAG);
    window.dispatchEvent(new CustomEvent('timan:exhibition-mode-changed'));
  } catch { /* ignore */ }
}

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
