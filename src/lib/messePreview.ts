/**
 * Messe preview mode — backend "Vis som Messe" handler.
 *
 * Backend users may temporarily preview the Messe layout from the
 * PortalHeader role/view selector. The selection is stored per-user via the
 * existing `timan.activeMode.<email>` localStorage key (value
 * `role:exhibition_user`). The real Supabase user is never replaced.
 *
 * Single source of truth:
 *   - real `appUser` from AppUserContext
 *   - `appUser.portal_variant === 'messe'` → real Messe user (always /messe)
 *   - `canSwitchMode(appUser)` + `isMessePreviewActive(appUser.email)` → backend preview
 */
import { useSyncExternalStore } from 'react';
import { getActiveMode, setActiveMode, type ActiveMode } from './activeMode';

export const MESSE_PREVIEW_MODE: ActiveMode = 'role:exhibition_user';

export function isMessePreviewActive(email: string | null | undefined): boolean {
  if (!email) return false;
  return getActiveMode(email) === MESSE_PREVIEW_MODE;
}

export function enterMessePreview(email: string): void {
  setActiveMode(email, MESSE_PREVIEW_MODE);
}

export function clearMessePreview(email: string | null | undefined): void {
  if (!email) return;
  setActiveMode(email, 'backend');
}

// Tiny shared external store so route guards can react to localStorage /
// active-mode events. Listeners are installed once and shared between all
// subscribers to avoid render storms.
let version = 0;
const listeners = new Set<() => void>();
function bump() {
  version += 1;
  listeners.forEach((l) => l());
}
let installed = false;
function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('timan:active-mode-changed', bump);
  window.addEventListener('storage', bump);
}
function subscribe(cb: () => void) {
  install();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useMessePreviewVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}
