/**
 * Single source of truth for Timan Messe / exhibition mode + role preview.
 *
 * Replaces the previous tangle of guards/caches/localStorage probes spread
 * across ExhibitionRedirector, ExhibitionGuard, PortalHeader, MesseHomePage,
 * MesseNewsPage, MesseVideoPage and MiscPageShell.
 *
 * Concepts:
 *  - realUser            — the real authenticated Timan Backend / Service
 *                          user. NEVER overwritten by the synthetic
 *                          exhibition_user.
 *  - activePreviewRole   — selected "Vis som" preview (backend / seller
 *                          initials / role:* including role:exhibition_user).
 *  - isPublicMesseVisitor — true only when there is no realUser and route is
 *                          /messe (public QR booth visit).
 *
 * Derived booleans:
 *  - isExhibitionPreview      — activePreviewRole === 'role:exhibition_user'
 *  - shouldRenderMesseLayout  — on /messe AND (exhibition preview OR public)
 *  - shouldRenderPortalHeader — there is a realUser to show controls for
 *  - redirectTarget           — where the route guard must navigate to, or null
 *
 * One function to switch preview role + route consistently:
 *  - switchPreviewRole(email, mode)
 */
import { useSyncExternalStore } from 'react';
import {
  getActiveMode,
  setActiveMode,
  type ActiveMode,
} from './activeMode';
import {
  enterExhibitionMode,
  leaveExhibitionMode,
} from './exhibitionMode';
import {
  getCachedRealBackendUser,
  getRealBackendUserFromAppUser,
} from './cachedRealUser';
import type { SessionUser } from '@/context/AppUserContext';

export type { ActiveMode };

let version = 0;
function subscribe(cb: () => void) {
  const h = () => { version += 1; cb(); };
  window.addEventListener('storage', h);
  window.addEventListener('timan:active-mode-changed', h);
  window.addEventListener('timan:exhibition-mode-changed', h);
  return () => {
    window.removeEventListener('storage', h);
    window.removeEventListener('timan:active-mode-changed', h);
    window.removeEventListener('timan:exhibition-mode-changed', h);
  };
}

export interface MesseModeState {
  realUser: SessionUser | null;
  activePreviewRole: ActiveMode;
  isExhibitionPreview: boolean;
  isPublicMesseVisitor: boolean;
  shouldRenderMesseLayout: boolean;
  shouldRenderPortalHeader: boolean;
  /** Non-null when current route conflicts with selected mode. */
  redirectTarget: string | null;
}

function portalDestinationFor(realUser: SessionUser | null, mode: ActiveMode): string {
  if (mode === 'backend' && (realUser?.portal_role || '').toLowerCase() === 'timan_backend') {
    return '/portal/backend';
  }
  return '/portal';
}

export function computeMesseMode(
  appUser: SessionUser | null,
  pathname: string,
): MesseModeState {
  const onMesse = pathname.startsWith('/messe');
  const realUser =
    getRealBackendUserFromAppUser(appUser) || getCachedRealBackendUser();
  const activePreviewRole: ActiveMode = realUser?.email
    ? getActiveMode(realUser.email)
    : 'backend';
  const isExhibitionPreview = activePreviewRole === 'role:exhibition_user';
  const isPublicMesseVisitor = !realUser && onMesse;

  const shouldRenderMesseLayout =
    onMesse && (isExhibitionPreview || isPublicMesseVisitor);
  const shouldRenderPortalHeader = !!realUser;

  let redirectTarget: string | null = null;
  if (realUser) {
    if (onMesse && !isExhibitionPreview) {
      redirectTarget = portalDestinationFor(realUser, activePreviewRole);
    } else if (!onMesse && isExhibitionPreview) {
      redirectTarget = '/messe';
    }
  }

  return {
    realUser,
    activePreviewRole,
    isExhibitionPreview,
    isPublicMesseVisitor,
    shouldRenderMesseLayout,
    shouldRenderPortalHeader,
    redirectTarget,
  };
}

export function useMesseMode(
  appUser: SessionUser | null,
  pathname: string,
): MesseModeState {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return computeMesseMode(appUser, pathname);
}

/**
 * Centralized "Vis som rolle" handler. Switch preview role and navigate to
 * the matching route in one place. Restores the real backend user into
 * sessionStorage so the destination page doesn't boot under the synthetic
 * exhibition_user.
 */
export function switchPreviewRole(realUserEmail: string, mode: ActiveMode): void {
  try {
    setActiveMode(realUserEmail, mode);
    Object.keys(sessionStorage).forEach((k) => {
      if (k.startsWith('timan.crm.sellerId.')) sessionStorage.removeItem(k);
    });
  } catch { /* ignore */ }

  if (mode === 'role:exhibition_user') {
    enterExhibitionMode();
    window.location.assign('/messe');
    return;
  }

  leaveExhibitionMode();
  const real = getCachedRealBackendUser();
  if (real) {
    try { sessionStorage.setItem('timan.appUser', JSON.stringify(real)); } catch { /* ignore */ }
  }
  window.location.assign(portalDestinationFor(real, mode));
}
